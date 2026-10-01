-- Expansao: planos, notas simples, OS, producao, portal, pedidos e IA.
-- Depende de 20260928000100_quote_foundation.sql. Nao faz cobrancas ou envios.
begin;

create table public.saas_plans (
  code text primary key check (code in ('basic','intermediate','complete')),
  name text not null,
  active boolean not null default true
);
create table public.saas_features (
  code text primary key,
  description text not null
);
create table public.saas_plan_features (
  plan_code text not null references public.saas_plans(code),
  feature_code text not null references public.saas_features(code),
  enabled boolean not null default true,
  primary key (plan_code, feature_code)
);
create table public.workshop_subscriptions (
  workshop_id uuid primary key references public.workshops(id),
  plan_code text not null references public.saas_plans(code),
  status text not null default 'active' check (status in ('trialing','active','past_due','cancelled','suspended')),
  valid_until timestamptz,
  billing_provider text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (billing_provider, provider_subscription_id)
);
insert into public.saas_plans(code,name) values
  ('basic','Basico'),('intermediate','Intermediario'),('complete','Completo');
insert into public.saas_features(code,description) values
  ('customers','Clientes e veiculos'),('catalog','Servicos e produtos'),
  ('simple_notes','Notas de atendimento nao fiscais'),('quotes','Orcamentos e aprovacao'),
  ('work_orders','Ordens de servico'),('production_board','Mapa da oficina'),
  ('service_media','Fotos e checklists'),('website','Site da oficina'),
  ('customer_portal','Area do cliente'),('parts_requests','Pedidos de pecas'),
  ('automations','Automacoes externas'),('ai','Assistente de IA');
insert into public.saas_plan_features(plan_code,feature_code)
select p.code,f.code from public.saas_plans p cross join public.saas_features f
where p.code='complete'
  or (p.code='intermediate' and f.code in ('customers','catalog','simple_notes','quotes','work_orders','production_board','service_media'))
  or (p.code='basic' and f.code in ('customers','catalog','simple_notes'));
insert into public.workshop_subscriptions(workshop_id,plan_code)
select id,'basic' from public.workshops;

create function private.has_feature(p_workshop_id uuid,p_feature text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.workshop_subscriptions s
    join public.saas_plan_features f on f.plan_code=s.plan_code
    join public.saas_plans p on p.code=s.plan_code
    where s.workshop_id=p_workshop_id and s.status in ('active','trialing')
      and (s.valid_until is null or s.valid_until>now()) and p.active
      and f.feature_code=p_feature and f.enabled);
$$;
revoke all on function private.has_feature(uuid,text) from public;
grant execute on function private.has_feature(uuid,text) to authenticated, service_role;

alter table public.workshops
  add column next_work_order_number bigint not null default 1 check (next_work_order_number>0),
  add column next_note_number bigint not null default 1 check (next_note_number>0),
  add column address jsonb not null default '{}' check (jsonb_typeof(address)='object');

create table public.service_notes (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id),
  number bigint not null check (number>0),
  customer_id uuid,
  vehicle_id uuid,
  status text not null default 'draft' check (status in ('draft','issued','cancelled')),
  customer_snapshot jsonb not null default '{}' check (jsonb_typeof(customer_snapshot)='object'),
  vehicle_snapshot jsonb not null default '{}' check (jsonb_typeof(vehicle_snapshot)='object'),
  workshop_snapshot jsonb not null default '{}' check (jsonb_typeof(workshop_snapshot)='object'),
  notes text,
  subtotal_cents bigint not null default 0 check (subtotal_cents>=0),
  discount_cents bigint not null default 0 check (discount_cents between 0 and subtotal_cents),
  total_cents bigint generated always as (subtotal_cents-discount_cents) stored,
  issued_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workshop_id,id), unique (workshop_id,number),
  foreign key (workshop_id,customer_id) references public.customers(workshop_id,id),
  foreign key (workshop_id,vehicle_id) references public.vehicles(workshop_id,id),
  check (status<>'issued' or issued_at is not null)
);
comment on table public.service_notes is 'Nota simples de atendimento. Nao e documento fiscal nem prova automatica de pagamento.';
create table public.service_note_items (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  note_id uuid not null,
  catalog_item_id uuid,
  position integer not null check (position>=0),
  kind text not null check (kind in ('service','part')),
  description text not null check (length(trim(description))>0),
  quantity numeric(12,3) not null check (quantity>0),
  unit text not null default 'un',
  unit_price_cents bigint not null check (unit_price_cents>=0),
  line_total_cents bigint generated always as (round(quantity*unit_price_cents)::bigint) stored,
  unique (workshop_id,note_id,position),
  foreign key (workshop_id,note_id) references public.service_notes(workshop_id,id),
  foreign key (workshop_id,catalog_item_id) references public.catalog_items(workshop_id,id)
);

create table public.production_stages (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id),
  name text not null,
  position integer not null check (position>=0),
  color text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  active boolean not null default true,
  unique (workshop_id,id), unique (workshop_id,name)
);
create table public.workshop_bays (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id),
  name text not null,
  kind text not null default 'bay' check (kind in ('bay','lift','paint','parking','other')),
  map_x numeric(8,3), map_y numeric(8,3),
  active boolean not null default true,
  unique (workshop_id,id), unique (workshop_id,name)
);
create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id),
  number bigint not null check (number>0),
  customer_id uuid not null,
  vehicle_id uuid not null,
  source_quote_id uuid,
  source_quote_version_id uuid,
  status text not null default 'open'
    check (status in ('open','in_progress','quality_check','ready','delivered','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  stage_id uuid,
  bay_id uuid,
  customer_snapshot jsonb not null default '{}' check (jsonb_typeof(customer_snapshot)='object'),
  vehicle_snapshot jsonb not null default '{}' check (jsonb_typeof(vehicle_snapshot)='object'),
  complaint text,
  diagnosis text,
  internal_notes text,
  customer_summary text,
  mileage_in integer check (mileage_in>=0),
  mileage_out integer check (mileage_out>=mileage_in),
  fuel_percent smallint check (fuel_percent between 0 and 100),
  belongings text,
  received_at timestamptz,
  promised_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  warranty_terms text,
  warranty_until date,
  subtotal_cents bigint not null default 0 check (subtotal_cents>=0),
  discount_cents bigint not null default 0 check (discount_cents between 0 and subtotal_cents),
  total_cents bigint generated always as (subtotal_cents-discount_cents) stored,
  lock_version integer not null default 1 check (lock_version>0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workshop_id,id), unique (workshop_id,number), unique (workshop_id,source_quote_id),
  foreign key (workshop_id,customer_id) references public.customers(workshop_id,id),
  foreign key (workshop_id,vehicle_id) references public.vehicles(workshop_id,id),
  foreign key (workshop_id,source_quote_id,source_quote_version_id)
    references public.quote_versions(workshop_id,quote_id,id),
  foreign key (workshop_id,stage_id) references public.production_stages(workshop_id,id),
  foreign key (workshop_id,bay_id) references public.workshop_bays(workshop_id,id),
  check ((source_quote_id is null)=(source_quote_version_id is null)),
  check (status<>'delivered' or delivered_at is not null),
  check (status<>'cancelled' or (cancelled_at is not null and cancellation_reason is not null and length(trim(cancellation_reason))>0)),
  check (delivered_at is null or received_at is null or delivered_at>=received_at),
  check (mileage_out is null or mileage_out>=0)
);
-- Um box modela uma vaga; estacionamento com varias vagas usa varios registros.
create unique index work_orders_occupied_bay_idx on public.work_orders(workshop_id,bay_id)
  where bay_id is not null and received_at is not null and status not in ('delivered','cancelled');
create unique index work_orders_vehicle_in_shop_idx on public.work_orders(workshop_id,vehicle_id)
  where received_at is not null and status not in ('delivered','cancelled');
create index work_orders_board_idx on public.work_orders(workshop_id,status,promised_at);
create index work_orders_customer_idx on public.work_orders(workshop_id,customer_id,created_at desc);

create table public.work_order_items (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  work_order_id uuid not null,
  catalog_item_id uuid,
  source_quote_item_id uuid,
  position integer not null check (position>=0),
  kind text not null check (kind in ('service','part')),
  description text not null check (length(trim(description))>0),
  unit text not null default 'un',
  quantity numeric(12,3) not null check (quantity>0),
  unit_price_cents bigint not null check (unit_price_cents>=0),
  line_total_cents bigint generated always as (round(quantity*unit_price_cents)::bigint) stored,
  status text not null default 'pending' check (status in ('pending','in_progress','done','cancelled')),
  completed_at timestamptz,
  unique (workshop_id,id), unique (workshop_id,work_order_id,position),
  foreign key (workshop_id,work_order_id) references public.work_orders(workshop_id,id),
  foreign key (workshop_id,catalog_item_id) references public.catalog_items(workshop_id,id),
  foreign key (workshop_id,source_quote_item_id) references public.quote_items(workshop_id,id)
);
create table public.work_order_assignments (
  workshop_id uuid not null,
  work_order_id uuid not null,
  user_id uuid not null,
  is_lead boolean not null default false,
  assigned_at timestamptz not null default now(),
  primary key (workshop_id,work_order_id,user_id),
  foreign key (workshop_id,work_order_id) references public.work_orders(workshop_id,id),
  foreign key (workshop_id,user_id) references public.workshop_members(workshop_id,user_id)
);
create unique index work_order_one_lead_idx on public.work_order_assignments(workshop_id,work_order_id) where is_lead;
create table public.work_order_events (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  work_order_id uuid not null,
  event_type text not null,
  actor_user_id uuid references auth.users(id),
  actor_kind text not null default 'user' check (actor_kind in ('user','system','integration')),
  description text not null,
  visible_to_customer boolean not null default false,
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata)='object'),
  occurred_at timestamptz not null default now(),
  foreign key (workshop_id,work_order_id) references public.work_orders(workshop_id,id)
);
create index work_order_events_timeline_idx on public.work_order_events(workshop_id,work_order_id,occurred_at);
create table public.work_order_blocks (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  work_order_id uuid not null,
  reason text not null check (reason in ('parts','approval','third_party','capacity','diagnosis','other')),
  details text not null check (length(trim(details))>0),
  expected_resolution_at timestamptz,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid not null references auth.users(id),
  resolved_by uuid references auth.users(id),
  foreign key (workshop_id,work_order_id) references public.work_orders(workshop_id,id),
  check (ended_at is null or ended_at>=started_at)
);
create index work_order_blocks_open_idx on public.work_order_blocks(workshop_id,work_order_id) where ended_at is null;
create table public.work_order_attachments (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  work_order_id uuid not null,
  file_asset_id uuid not null,
  phase text not null check (phase in ('before','during','after','document')),
  caption text,
  visible_to_customer boolean not null default false,
  captured_at timestamptz not null default now(),
  uploaded_by uuid references auth.users(id),
  unique (workshop_id,work_order_id,file_asset_id),
  foreign key (workshop_id,work_order_id) references public.work_orders(workshop_id,id),
  foreign key (workshop_id,file_asset_id) references public.file_assets(workshop_id,id)
);
create table public.work_order_checklist_items (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  work_order_id uuid not null,
  phase text not null check (phase in ('intake','quality','delivery')),
  label text not null,
  position integer not null default 0 check (position>=0),
  result text not null default 'pending' check (result in ('pending','ok','issue','not_applicable')),
  notes text,
  checked_by uuid references auth.users(id),
  checked_at timestamptz,
  foreign key (workshop_id,work_order_id) references public.work_orders(workshop_id,id)
);

create table public.workshop_sites (
  workshop_id uuid primary key references public.workshops(id),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  custom_domain text unique,
  domain_verified_at timestamptz,
  title text not null,
  description text,
  published boolean not null default false,
  portal_enabled boolean not null default false,
  parts_requests_enabled boolean not null default false,
  theme jsonb not null default '{}' check (jsonb_typeof(theme)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not parts_requests_enabled or portal_enabled)
);
create table public.customer_portal_access (
  workshop_id uuid not null,
  customer_id uuid not null,
  user_id uuid not null references auth.users(id),
  verified_at timestamptz not null default now(),
  granted_by uuid references auth.users(id),
  revoked_at timestamptz,
  primary key (workshop_id,customer_id,user_id),
  foreign key (workshop_id,customer_id) references public.customers(workshop_id,id)
);
create index customer_portal_access_user_idx on public.customer_portal_access(user_id,workshop_id) where revoked_at is null;
create table public.site_products (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshop_sites(workshop_id),
  catalog_item_id uuid not null,
  title text not null,
  description text,
  visible boolean not null default false,
  displayed_price_cents bigint check (displayed_price_cents>=0),
  image_asset_id uuid,
  unique (workshop_id,id), unique (workshop_id,catalog_item_id),
  foreign key (workshop_id,catalog_item_id) references public.catalog_items(workshop_id,id),
  foreign key (workshop_id,image_asset_id) references public.file_assets(workshop_id,id)
);
create table public.part_requests (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  customer_id uuid not null,
  requested_by uuid not null references auth.users(id),
  idempotency_key uuid not null,
  status text not null default 'requested'
    check (status in ('requested','reviewing','quoted','confirmed','ready','fulfilled','cancelled')),
  customer_notes text,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workshop_id,id), unique (workshop_id,requested_by,idempotency_key),
  foreign key (workshop_id,customer_id) references public.customers(workshop_id,id)
);
create table public.part_request_items (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  request_id uuid not null,
  site_product_id uuid,
  description text not null check (length(trim(description))>0),
  quantity numeric(12,3) not null check (quantity>0),
  quoted_unit_price_cents bigint check (quoted_unit_price_cents>=0),
  foreign key (workshop_id,request_id) references public.part_requests(workshop_id,id),
  foreign key (workshop_id,site_product_id) references public.site_products(workshop_id,id)
);
comment on table public.part_requests is 'Solicitacao de peca para avaliacao da oficina; nao reserva estoque nem cobra pagamento.';

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id),
  requested_by uuid not null references auth.users(id),
  work_order_id uuid,
  task_type text not null,
  model text not null,
  prompt_template_version text not null,
  idempotency_key uuid not null,
  status text not null default 'pending' check (status in ('pending','running','succeeded','failed','cancelled')),
  input_tokens integer check (input_tokens>=0),
  output_tokens integer check (output_tokens>=0),
  result jsonb,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (workshop_id,idempotency_key),
  foreign key (workshop_id,work_order_id) references public.work_orders(workshop_id,id)
);

-- Provisionamento local; nao contrata plano pago e nao cria dominio externo.
create function private.initialize_workshop() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.workshop_subscriptions(workshop_id,plan_code) values (new.id,'basic');
  insert into public.production_stages(workshop_id,name,position) values
    (new.id,'Recepcao',0),(new.id,'Diagnostico',1),(new.id,'Execucao',2),
    (new.id,'Conferencia',3),(new.id,'Pronto para entrega',4);
  return new;
end;
$$;
revoke all on function private.initialize_workshop() from public;
create trigger initialize_workshop after insert on public.workshops
for each row execute function private.initialize_workshop();
insert into public.production_stages(workshop_id,name,position)
select w.id,s.name,s.position from public.workshops w cross join
  (values ('Recepcao',0),('Diagnostico',1),('Execucao',2),('Conferencia',3),('Pronto para entrega',4)) s(name,position);

create trigger work_order_events_append_only before update or delete on public.work_order_events
for each row execute function private.reject_mutation();

-- Dados de notas emitidas ficam congelados; cancelamento preserva o documento.
create function private.guard_service_note() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.issued_at is not null then
    if tg_op='DELETE' then raise exception 'Issued note cannot be deleted' using errcode='23514'; end if;
    if (to_jsonb(new)-'status'-'updated_at'-'total_cents') is distinct from (to_jsonb(old)-'status'-'updated_at'-'total_cents')
      or new.status not in ('issued','cancelled') or (old.status='cancelled' and new.status<>'cancelled') then
      raise exception 'Issued note content is immutable' using errcode='23514';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger service_note_guard before update or delete on public.service_notes
for each row execute function private.guard_service_note();
create function private.guard_note_item() returns trigger
language plpgsql set search_path='' as $$
declare issued timestamptz;
begin
  if tg_op<>'INSERT' then
    select issued_at into issued from public.service_notes where workshop_id=old.workshop_id and id=old.note_id for update;
    if issued is not null then raise exception 'Issued note item is immutable' using errcode='23514'; end if;
  end if;
  if tg_op<>'DELETE' then
    select issued_at into issued from public.service_notes where workshop_id=new.workshop_id and id=new.note_id for update;
    if issued is not null then raise exception 'Issued note item is immutable' using errcode='23514'; end if;
    return new;
  end if;
  return old;
end;
$$;
create trigger service_note_items_guard before insert or update or delete on public.service_note_items
for each row execute function private.guard_note_item();

-- RLS: equipe le dados da propria oficina. Portal usa RPCs com projecao minima.
do $$ declare t text; begin
  foreach t in array array['saas_plans','saas_features','saas_plan_features','workshop_subscriptions',
    'service_notes','service_note_items','production_stages','workshop_bays','work_orders',
    'work_order_items','work_order_assignments','work_order_events','work_order_blocks',
    'work_order_attachments','work_order_checklist_items','workshop_sites','customer_portal_access',
    'site_products','part_requests','part_request_items','ai_runs'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update,delete on public.%I to service_role',t);
  end loop;
  foreach t in array array['saas_plans','saas_features','saas_plan_features'] loop
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy plan_catalog_read on public.%I for select to authenticated using (true)',t);
  end loop;
  foreach t in array array['workshop_subscriptions','service_notes','service_note_items','production_stages',
    'workshop_bays','work_orders','work_order_items','work_order_assignments','work_order_events',
    'work_order_blocks','work_order_attachments','work_order_checklist_items','workshop_sites',
    'site_products','part_requests','part_request_items'] loop
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy tenant_read on public.%I for select to authenticated using (private.is_workshop_member(workshop_id))',t);
  end loop;
  foreach t in array array['workshop_subscriptions','service_notes','work_orders','workshop_sites','part_requests'] loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()',t);
  end loop;
end $$;

-- Restricao de escrita pelo plano, inclusive para backend (billing e leitura nao dependem dela).
-- TG_ARGV[0] e sempre configurado pela migration, nunca pelo usuario.
create function private.require_table_feature() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not private.has_feature(new.workshop_id,tg_argv[0]) then
    raise exception 'Feature % unavailable for this workshop',tg_argv[0] using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function private.require_table_feature() from public;
create trigger work_order_plan before insert on public.work_orders for each row execute function private.require_table_feature('work_orders');
create trigger quotes_plan before insert on public.quotes for each row execute function private.require_table_feature('quotes');
create trigger site_plan before insert on public.workshop_sites for each row execute function private.require_table_feature('website');
create trigger ai_plan before insert on public.ai_runs for each row execute function private.require_table_feature('ai');
create trigger parts_plan before insert on public.part_requests for each row execute function private.require_table_feature('parts_requests');
create trigger automation_plan before insert on public.integration_connections for each row execute function private.require_table_feature('automations');

-- Consulta do quadro deriva a situacao real, sem duplicar o estado em outra tabela.
create view public.workshop_board with (security_invoker=true) as
select w.id,w.workshop_id,w.number,w.status,w.priority,w.stage_id,s.name as stage_name,
  w.bay_id,b.name as bay_name,w.customer_id,w.vehicle_id,
  w.vehicle_snapshot->>'plate' as plate,w.vehicle_snapshot->>'model' as vehicle_model,
  w.received_at,w.promised_at,w.customer_summary,w.lock_version,
  (w.promised_at<now() and w.status not in ('delivered','cancelled')) as overdue,
  (w.received_at is not null and w.status not in ('delivered','cancelled')) as physically_in_shop,
  coalesce(bl.reasons,'[]'::jsonb) as open_blocks,coalesce(bl.block_count,0) as block_count,
  coalesce(a.members,'[]'::jsonb) as assigned_members
from public.work_orders w
left join public.production_stages s on s.workshop_id=w.workshop_id and s.id=w.stage_id
left join public.workshop_bays b on b.workshop_id=w.workshop_id and b.id=w.bay_id
left join lateral (
  select count(*)::integer as block_count,jsonb_agg(jsonb_build_object('id',x.id,'reason',x.reason,
    'details',x.details,'since',x.started_at,'expected_resolution_at',x.expected_resolution_at)) as reasons
  from public.work_order_blocks x where x.workshop_id=w.workshop_id and x.work_order_id=w.id and x.ended_at is null
) bl on true
left join lateral (
  select jsonb_agg(jsonb_build_object('user_id',x.user_id,'is_lead',x.is_lead)) as members
  from public.work_order_assignments x where x.workshop_id=w.workshop_id and x.work_order_id=w.id
) a on true;
revoke all on public.workshop_board from public,anon,authenticated;
grant select on public.workshop_board to authenticated,service_role;

commit;
