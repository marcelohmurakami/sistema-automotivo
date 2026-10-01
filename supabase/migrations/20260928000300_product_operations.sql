-- Operacoes principais com autorizacao, isolamento e outbox na mesma transacao.
begin;

create function private.require_staff(p_workshop uuid) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare u uuid := auth.uid();
begin
  if u is null or not private.is_workshop_member(p_workshop) then
    raise exception 'Workshop access denied' using errcode='42501';
  end if;
  return u;
end;
$$;
revoke all on function private.require_staff(uuid) from public;

create function public.create_workshop(p_name text,p_phone text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); w uuid;
begin
  if u is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if length(trim(p_name)) not between 1 and 120 then raise exception 'Invalid workshop name'; end if;
  insert into public.workshops(name,phone_e164) values(trim(p_name),p_phone) returning id into w;
  insert into public.workshop_members(workshop_id,user_id,role) values(w,u,'owner');
  return w;
end;
$$;

create function public.convert_quote_to_work_order(p_workshop uuid,p_quote uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  u uuid; q public.quotes%rowtype; v public.quote_versions%rowtype;
  result_id uuid; next_number bigint; first_stage uuid; copied_total bigint; corr uuid:=gen_random_uuid();
begin
  u:=private.require_staff(p_workshop);
  if not private.has_feature(p_workshop,'work_orders') then
    raise exception 'Work orders unavailable on current plan' using errcode='42501';
  end if;
  select * into q from public.quotes where workshop_id=p_workshop and id=p_quote for update;
  if not found then raise exception 'Quote not found' using errcode='P0002'; end if;
  select id into result_id from public.work_orders where workshop_id=p_workshop and source_quote_id=q.id;
  if found then return result_id; end if;
  select * into v from public.quote_versions where workshop_id=p_workshop and id=q.current_version_id for update;
  if not found or v.published_at is null or q.status<>'approved' or q.customer_id is null or q.vehicle_id is null then
    raise exception 'A published, approved quote with customer and vehicle is required' using errcode='23514';
  end if;
  if not exists(select 1 from public.quote_approvals where workshop_id=p_workshop and quote_version_id=v.id and decision='approved') then
    raise exception 'Missing approval of current version' using errcode='23514';
  end if;
  select sum(line_total_cents) into copied_total from public.quote_items where workshop_id=p_workshop and quote_version_id=v.id;
  if copied_total is null or copied_total<>v.subtotal_cents then
    raise exception 'Quote totals do not match items' using errcode='23514';
  end if;
  update public.workshops set next_work_order_number=next_work_order_number+1 where id=p_workshop
    returning next_work_order_number-1 into next_number;
  select id into first_stage from public.production_stages where workshop_id=p_workshop and active order by position,id limit 1;
  insert into public.work_orders(workshop_id,number,customer_id,vehicle_id,source_quote_id,source_quote_version_id,
    stage_id,customer_snapshot,vehicle_snapshot,subtotal_cents,discount_cents,created_by)
  values(p_workshop,next_number,q.customer_id,q.vehicle_id,q.id,v.id,first_stage,
    v.customer_snapshot,v.vehicle_snapshot,v.subtotal_cents,v.discount_cents,u) returning id into result_id;
  insert into public.work_order_items(workshop_id,work_order_id,catalog_item_id,source_quote_item_id,position,
    kind,description,unit,quantity,unit_price_cents)
  select workshop_id,result_id,catalog_item_id,id,position,kind,description,unit,quantity,unit_price_cents
    from public.quote_items where workshop_id=p_workshop and quote_version_id=v.id;
  insert into public.work_order_events(workshop_id,work_order_id,event_type,actor_user_id,description,visible_to_customer)
    values(p_workshop,result_id,'created',u,'Ordem de servico criada a partir do orcamento aprovado.',true);
  insert into public.domain_events(workshop_id,event_type,aggregate_type,aggregate_id,aggregate_version,
    correlation_id,deduplication_key,payload)
  values(p_workshop,'work_order.created','work_order',result_id,1,corr,'work_order:'||result_id||':created',
    jsonb_build_object('work_order_id',result_id,'quote_version_id',v.id));
  insert into public.audit_logs(workshop_id,actor_user_id,actor_type,action,entity_type,entity_id,correlation_id)
    values(p_workshop,u,'user','convert_quote','work_order',result_id,corr);
  return result_id;
end;
$$;

-- Revisao esperada obrigatoria: resposta atrasada do celular nao sobrescreve edicao nova.
create function public.update_work_order_board(
  p_workshop uuid,p_work_order uuid,p_expected_revision integer,p_status text,
  p_stage uuid,p_bay uuid,p_promised_at timestamptz,p_received_at timestamptz,
  p_cancellation_reason text default null
) returns integer
language plpgsql security definer set search_path='' as $$
declare u uuid; w public.work_orders%rowtype; next_revision integer; corr uuid:=gen_random_uuid();
begin
  u:=private.require_staff(p_workshop);
  if not private.has_feature(p_workshop,'production_board') then raise exception 'Feature unavailable' using errcode='42501'; end if;
  select * into w from public.work_orders where workshop_id=p_workshop and id=p_work_order for update;
  if not found then raise exception 'Work order not found' using errcode='P0002'; end if;
  if p_expected_revision is null or w.lock_version<>p_expected_revision then raise exception 'Stale revision' using errcode='40001'; end if;
  if w.status in ('delivered','cancelled') then raise exception 'Closed work order' using errcode='23514'; end if;
  if p_status is null or (p_status<>w.status and not (
    (w.status='open' and p_status in ('in_progress','cancelled')) or
    (w.status='in_progress' and p_status in ('quality_check','cancelled')) or
    (w.status='quality_check' and p_status in ('in_progress','ready','cancelled')) or
    (w.status='ready' and p_status in ('in_progress','delivered','cancelled'))
  )) then raise exception 'Invalid status transition' using errcode='23514'; end if;
  if p_stage is not null and not exists(select 1 from public.production_stages where workshop_id=p_workshop and id=p_stage and active) then
    raise exception 'Invalid stage' using errcode='23514'; end if;
  if p_bay is not null and not exists(select 1 from public.workshop_bays where workshop_id=p_workshop and id=p_bay and active) then
    raise exception 'Invalid bay' using errcode='23514'; end if;
  if p_status in ('ready','delivered') and exists(select 1 from public.work_order_blocks where workshop_id=p_workshop and work_order_id=w.id and ended_at is null) then
    raise exception 'Resolve open blocks first' using errcode='23514'; end if;
  if p_status='delivered' and p_received_at is null then raise exception 'Vehicle was not checked in' using errcode='23514'; end if;
  update public.work_orders set status=p_status,stage_id=p_stage,bay_id=p_bay,promised_at=p_promised_at,
    received_at=p_received_at,lock_version=lock_version+1,
    started_at=case when p_status='in_progress' then coalesce(started_at,now()) else started_at end,
    completed_at=case when p_status='ready' then now() when p_status='in_progress' then null else completed_at end,
    delivered_at=case when p_status='delivered' then now() else delivered_at end,
    cancelled_at=case when p_status='cancelled' then now() else cancelled_at end,
    cancellation_reason=case when p_status='cancelled' then p_cancellation_reason else cancellation_reason end
  where id=w.id returning lock_version into next_revision;
  insert into public.work_order_events(workshop_id,work_order_id,event_type,actor_user_id,description,visible_to_customer,metadata)
    values(p_workshop,w.id,'board_updated',u,'Andamento do servico atualizado.',true,
      jsonb_build_object('old_status',w.status,'new_status',p_status,'old_stage_id',w.stage_id,'new_stage_id',p_stage,
        'old_bay_id',w.bay_id,'new_bay_id',p_bay,'old_promised_at',w.promised_at,'new_promised_at',p_promised_at));
  insert into public.domain_events(workshop_id,event_type,aggregate_type,aggregate_id,aggregate_version,correlation_id,deduplication_key,payload)
    values(p_workshop,'work_order.updated','work_order',w.id,next_revision,corr,'work_order:'||w.id||':revision:'||next_revision,
      jsonb_build_object('work_order_id',w.id,'status',p_status));
  return next_revision;
end;
$$;

create function public.set_work_order_block(p_workshop uuid,p_work_order uuid,p_reason text,p_details text,p_expected_at timestamptz default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid; w public.work_orders%rowtype; block_id uuid; rev integer;
begin
  u:=private.require_staff(p_workshop);
  if not private.has_feature(p_workshop,'production_board') then raise exception 'Feature unavailable' using errcode='42501'; end if;
  select * into w from public.work_orders where workshop_id=p_workshop and id=p_work_order for update;
  if not found or w.status in ('ready','delivered','cancelled') then raise exception 'Work order cannot be blocked' using errcode='23514'; end if;
  insert into public.work_order_blocks(workshop_id,work_order_id,reason,details,expected_resolution_at,created_by)
    values(p_workshop,w.id,p_reason,p_details,p_expected_at,u) returning id into block_id;
  update public.work_orders set lock_version=lock_version+1 where id=w.id returning lock_version into rev;
  insert into public.work_order_events(workshop_id,work_order_id,event_type,actor_user_id,description,metadata)
    values(p_workshop,w.id,'blocked',u,p_details,jsonb_build_object('reason',p_reason,'block_id',block_id));
  insert into public.domain_events(workshop_id,event_type,aggregate_type,aggregate_id,aggregate_version,deduplication_key,payload)
    values(p_workshop,'work_order.blocked','work_order',w.id,rev,'block:'||block_id||':created',jsonb_build_object('work_order_id',w.id,'block_id',block_id));
  return block_id;
end;
$$;
create function public.resolve_work_order_block(p_workshop uuid,p_work_order uuid,p_block uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid; w public.work_orders%rowtype; rev integer;
begin
  u:=private.require_staff(p_workshop);
  if not private.has_feature(p_workshop,'production_board') then raise exception 'Feature unavailable' using errcode='42501'; end if;
  select * into w from public.work_orders where workshop_id=p_workshop and id=p_work_order for update;
  if not found then raise exception 'Work order not found' using errcode='P0002'; end if;
  update public.work_order_blocks set ended_at=now(),resolved_by=u
    where workshop_id=p_workshop and work_order_id=w.id and id=p_block and ended_at is null;
  if not found then return; end if;
  update public.work_orders set lock_version=lock_version+1 where id=w.id returning lock_version into rev;
  insert into public.work_order_events(workshop_id,work_order_id,event_type,actor_user_id,description)
    values(p_workshop,w.id,'unblocked',u,'Motivo de parada resolvido.');
  insert into public.domain_events(workshop_id,event_type,aggregate_type,aggregate_id,aggregate_version,deduplication_key,payload)
    values(p_workshop,'work_order.unblocked','work_order',w.id,rev,'block:'||p_block||':resolved',jsonb_build_object('work_order_id',w.id,'block_id',p_block));
end;
$$;

create function private.has_portal_access(p_workshop uuid,p_customer uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select private.has_feature(p_workshop,'customer_portal') and exists (
    select 1 from public.customer_portal_access a join public.workshop_sites s on s.workshop_id=a.workshop_id
    where a.workshop_id=p_workshop and a.customer_id=p_customer and a.user_id=(select auth.uid())
      and a.revoked_at is null and s.published and s.portal_enabled);
$$;
revoke all on function private.has_portal_access(uuid,uuid) from public;

-- Retorna somente projecao do proprio cliente; nenhuma policy ampla e adicionada.
create function public.get_my_work_orders(p_workshop uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'number',w.number,'status',w.status,
    'vehicle',jsonb_build_object('plate',w.vehicle_snapshot->>'plate','model',w.vehicle_snapshot->>'model',
      'model_year',w.vehicle_snapshot->>'model_year'),'promised_at',w.promised_at,'summary',w.customer_summary,
    'received_at',w.received_at,'delivered_at',w.delivered_at) order by w.created_at desc),'[]'::jsonb)
  from public.work_orders w where w.workshop_id=p_workshop and private.has_portal_access(w.workshop_id,w.customer_id);
$$;
create function public.get_my_work_order_history(p_workshop uuid,p_work_order uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'description',e.description,'occurred_at',e.occurred_at)
    order by e.occurred_at),'[]'::jsonb)
  from public.work_order_events e join public.work_orders w on w.workshop_id=e.workshop_id and w.id=e.work_order_id
  where w.workshop_id=p_workshop and w.id=p_work_order and e.visible_to_customer
    and private.has_portal_access(w.workshop_id,w.customer_id);
$$;

alter table public.part_requests add column request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$');
create function public.request_parts(p_workshop uuid,p_customer uuid,p_key uuid,p_items jsonb,p_notes text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); item jsonb; product public.site_products%rowtype;
  existing public.part_requests%rowtype; r uuid; fingerprint text; qty numeric(12,3);
begin
  if not private.has_portal_access(p_workshop,p_customer) or not private.has_feature(p_workshop,'parts_requests')
    or not exists(select 1 from public.workshop_sites where workshop_id=p_workshop and parts_requests_enabled) then
    raise exception 'Parts requests unavailable' using errcode='42501'; end if;
  if p_key is null or p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Invalid items'; end if;
  if jsonb_array_length(p_items) not between 1 and 30 or length(coalesce(p_notes,''))>2000 then raise exception 'Invalid request size'; end if;
  fingerprint:=encode(sha256(convert_to(jsonb_build_object('customer_id',p_customer,'items',p_items,'notes',p_notes)::text,'UTF8')),'hex');
  -- Serializa apenas reenvios da mesma chave. A constraint continua sendo a garantia final.
  perform pg_advisory_xact_lock(hashtextextended(p_workshop::text||u::text||p_key::text,0));
  select * into existing from public.part_requests where workshop_id=p_workshop and requested_by=u and idempotency_key=p_key;
  if found then
    if existing.request_hash<>fingerprint then raise exception 'Idempotency key reused with different payload' using errcode='23514'; end if;
    return existing.id;
  end if;
  insert into public.part_requests(workshop_id,customer_id,requested_by,idempotency_key,customer_notes,request_hash)
    values(p_workshop,p_customer,u,p_key,p_notes,fingerprint) returning id into r;
  for item in select value from jsonb_array_elements(p_items) loop
    qty:=(item->>'quantity')::numeric;
    if qty is null or qty<=0 or qty>10000 then raise exception 'Invalid quantity'; end if;
    select * into product from public.site_products where workshop_id=p_workshop and id=(item->>'product_id')::uuid and visible;
    if not found then raise exception 'Product unavailable' using errcode='23514'; end if;
    insert into public.part_request_items(workshop_id,request_id,site_product_id,description,quantity)
      values(p_workshop,r,product.id,product.title,qty);
  end loop;
  insert into public.domain_events(workshop_id,event_type,aggregate_type,aggregate_id,aggregate_version,deduplication_key,payload)
    values(p_workshop,'parts.requested','part_request',r,1,'part_request:'||r||':created',jsonb_build_object('request_id',r));
  return r;
end;
$$;

-- Publicacao do site nao expoe catalogo interno, clientes, custos ou segredos.
create function public.get_published_workshop_site(p_slug text) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('title',s.title,'description',s.description,'slug',s.slug,'theme',s.theme,
    'phone',w.phone_e164,'parts_requests_enabled',s.parts_requests_enabled,
    'products',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'description',p.description,
      'price_cents',p.displayed_price_cents)) from public.site_products p where p.workshop_id=s.workshop_id and p.visible),'[]'::jsonb))
  from public.workshop_sites s join public.workshops w on w.id=s.workshop_id
  where s.slug=p_slug and s.published and private.has_feature(s.workshop_id,'website');
$$;

-- Nenhuma RPC fica com EXECUTE PUBLIC por padrao.
revoke all on function public.create_workshop(text,text) from public,anon;
revoke all on function public.convert_quote_to_work_order(uuid,uuid) from public,anon;
revoke all on function public.update_work_order_board(uuid,uuid,integer,text,uuid,uuid,timestamptz,timestamptz,text) from public,anon;
revoke all on function public.set_work_order_block(uuid,uuid,text,text,timestamptz) from public,anon;
revoke all on function public.resolve_work_order_block(uuid,uuid,uuid) from public,anon;
revoke all on function public.get_my_work_orders(uuid) from public,anon;
revoke all on function public.get_my_work_order_history(uuid,uuid) from public,anon;
revoke all on function public.request_parts(uuid,uuid,uuid,jsonb,text) from public,anon;
revoke all on function public.get_published_workshop_site(text) from public;
grant execute on function public.create_workshop(text,text),public.convert_quote_to_work_order(uuid,uuid),
  public.update_work_order_board(uuid,uuid,integer,text,uuid,uuid,timestamptz,timestamptz,text),
  public.set_work_order_block(uuid,uuid,text,text,timestamptz),public.resolve_work_order_block(uuid,uuid,uuid),
  public.get_my_work_orders(uuid),public.get_my_work_order_history(uuid,uuid),
  public.request_parts(uuid,uuid,uuid,jsonb,text) to authenticated;
grant execute on function public.get_published_workshop_site(text) to anon,authenticated;

commit;
