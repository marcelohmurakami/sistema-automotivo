begin;
alter table public.contas_cobranca add column ambiente text not null default 'teste' check(ambiente in ('teste','producao'));
alter table public.contas_cobranca drop constraint contas_cobranca_pkey;
alter table public.contas_cobranca add primary key(oficina_id,ambiente);
alter table public.eventos_cobranca_provedor add column ambiente text not null default 'teste' check(ambiente in ('teste','producao'));
drop function public.consultar_cobranca(uuid);
create function public.consultar_cobranca(p_oficina uuid,p_ambiente text default 'teste')
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if p_ambiente not in ('teste','producao') or p_ambiente is null then raise exception 'Ambiente inválido' using errcode='22023'; end if;
  perform private.exigir_dono_cobranca(p_oficina);
  return jsonb_build_object('ambiente',p_ambiente,'vinculada',exists(select 1 from public.contas_cobranca where oficina_id=p_oficina and ambiente=p_ambiente and cliente_provedor_id is not null),
    'assinatura',(select jsonb_build_object('situacao',situacao_provedor,'cancelar_no_fim',cancelar_no_fim,'periodo_final',periodo_final) from public.contas_cobranca where oficina_id=p_oficina and ambiente=p_ambiente),
    'eventos',coalesce((select jsonb_agg(to_jsonb(e) order by e.criado_em desc) from
      (select tipo,codigo_plano,situacao,criado_em from public.eventos_cobranca_provedor where oficina_id=p_oficina and ambiente=p_ambiente order by criado_em desc limit 30)e),'[]'::jsonb));
end $$;
revoke all on function public.consultar_cobranca(uuid,text) from public,anon,authenticated;
grant execute on function public.consultar_cobranca(uuid,text) to authenticated;
drop function public.reservar_operacao_cobranca(uuid,uuid,text);
create function public.reservar_operacao_cobranca(p_oficina uuid,p_usuario uuid default null,p_plano text default null,p_ambiente text default 'teste')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.contas_cobranca; token uuid:=gen_random_uuid();
begin
  if p_ambiente not in ('teste','producao') or p_ambiente is null then raise exception 'Ambiente inválido' using errcode='22023'; end if;
  if not exists(select 1 from public.oficinas where id=p_oficina and arquivado_em is null) then raise exception 'Oficina indisponível' using errcode='42501'; end if;
  if p_usuario is not null and not exists(select 1 from public.membros_oficina where oficina_id=p_oficina and usuario_id=p_usuario and ativo and perfil='owner') then
    raise exception 'Somente o proprietário pode administrar a assinatura.' using errcode='42501';
  end if;
  if p_plano is not null and p_plano not in ('basic','intermediate','complete') then raise exception 'Plano inválido' using errcode='22023'; end if;
  if exists(select 1 from public.assinaturas_oficina where oficina_id=p_oficina and (coalesce(provedor_cobranca,'') not in ('','homologacao','stripe_test','stripe') or (p_ambiente='teste' and provedor_cobranca='stripe'))) then
    raise exception 'Assinatura vinculada a outro ambiente ou provedor.' using errcode='42501';
  end if;
  insert into public.contas_cobranca(oficina_id,ambiente) values(p_oficina,p_ambiente) on conflict do nothing;
  select * into v from public.contas_cobranca where oficina_id=p_oficina and ambiente=p_ambiente for update;
  if v.reserva_ate>now() then raise exception 'Outra operação está em andamento. Tente novamente em instantes.' using errcode='PT409'; end if;
  if p_plano is not null then
    if v.checkout_expira_em>now() and v.checkout_plano<>p_plano then
      raise exception 'Há um checkout aberto para outro plano. Retome o plano escolhido ou aguarde até 45 minutos para iniciar outro.' using errcode='PT409';
    end if;
    if v.checkout_chave is null or v.checkout_expira_em<=now() then
      v.checkout_chave:=gen_random_uuid(); v.checkout_plano:=p_plano; v.checkout_expira_em:=now()+interval '45 minutes';
    end if;
  end if;
  update public.contas_cobranca set reserva=token,reserva_ate=now()+interval '2 minutes',checkout_chave=v.checkout_chave,
    checkout_plano=v.checkout_plano,checkout_expira_em=v.checkout_expira_em where oficina_id=p_oficina and ambiente=p_ambiente;
  return to_jsonb(v)||jsonb_build_object('reserva',token);
end $$;
revoke all on function public.reservar_operacao_cobranca(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.reservar_operacao_cobranca(uuid,uuid,text,text) to service_role;
drop function public.vincular_cliente_cobranca(uuid,uuid,text);
create function public.vincular_cliente_cobranca(p_oficina uuid,p_reserva uuid,p_cliente text,p_ambiente text default 'teste')
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_ambiente not in ('teste','producao') or p_ambiente is null then raise exception 'Ambiente inválido' using errcode='22023'; end if;
  if p_cliente is null or p_cliente !~ '^cus_[A-Za-z0-9]+$' then raise exception 'Cliente do provedor inválido' using errcode='22023'; end if;
  update public.contas_cobranca set cliente_provedor_id=p_cliente,atualizado_em=now()
    where oficina_id=p_oficina and ambiente=p_ambiente and reserva=p_reserva and reserva_ate>now() and (cliente_provedor_id is null or cliente_provedor_id=p_cliente);
  if not found then raise exception 'Reserva expirada ou vínculo divergente' using errcode='PT409'; end if;
end $$;
revoke all on function public.vincular_cliente_cobranca(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.vincular_cliente_cobranca(uuid,uuid,text,text) to service_role;
drop function public.liberar_operacao_cobranca(uuid,uuid);
create function public.liberar_operacao_cobranca(p_oficina uuid,p_reserva uuid,p_ambiente text default 'teste')
returns void language sql security definer set search_path='' as $$
  update public.contas_cobranca set reserva=null,reserva_ate=null where oficina_id=p_oficina and ambiente=p_ambiente and reserva=p_reserva;
$$;
revoke all on function public.liberar_operacao_cobranca(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.liberar_operacao_cobranca(uuid,uuid,text) to service_role;
drop function public.aplicar_assinatura_provedor(uuid,uuid,text,text,text,text,text,text,timestamptz,boolean);
create function public.aplicar_assinatura_provedor(p_oficina uuid,p_reserva uuid,p_evento text,p_tipo text,p_cliente text,p_assinatura text,p_plano text,p_situacao text,p_periodo_final timestamptz,p_cancelar_no_fim boolean,p_ambiente text default 'teste')
returns boolean language plpgsql security definer set search_path='' as $$
declare v public.contas_cobranca; estado text;
begin
  if p_ambiente not in ('teste','producao') or p_ambiente is null then raise exception 'Ambiente inválido' using errcode='22023'; end if;
  perform 1 from public.assinaturas_oficina where oficina_id=p_oficina for update;
  if p_ambiente='teste' and exists(select 1 from public.assinaturas_oficina where oficina_id=p_oficina and provedor_cobranca='stripe') then raise exception 'Assinatura comercial protegida contra eventos de teste' using errcode='42501'; end if;
  select * into v from public.contas_cobranca where oficina_id=p_oficina and ambiente=p_ambiente for update;
  if not found or v.reserva is distinct from p_reserva or v.reserva_ate<=now() or p_reserva is null or v.cliente_provedor_id is distinct from p_cliente then
    raise exception 'Reserva ou cliente inválido' using errcode='PT409';
  end if;
  if p_evento is null or p_evento !~ '^evt_[A-Za-z0-9]+$' or p_tipo is null or length(p_tipo)>100
    or p_assinatura is null or p_assinatura !~ '^sub_[A-Za-z0-9]+$' or p_plano is null or p_plano not in ('basic','intermediate','complete')
    or p_situacao is null or p_situacao not in ('active','trialing','past_due','canceled','unpaid','incomplete','incomplete_expired','paused')
    or p_cancelar_no_fim is null or p_periodo_final is null then raise exception 'Evento de cobrança inválido' using errcode='22023'; end if;
  if exists(select 1 from public.eventos_cobranca_provedor where id=p_evento) then return false; end if;
  -- Não permitir que um evento atrasado de uma assinatura antiga substitua a nova.
  if v.assinatura_provedor_id is not null and v.assinatura_provedor_id<>p_assinatura and v.situacao_provedor not in ('canceled','incomplete_expired') then
    raise exception 'Outra assinatura já está vinculada à oficina' using errcode='PT409';
  end if;
  estado:=case p_situacao when 'active' then 'active' when 'trialing' then 'trialing' when 'past_due' then 'past_due' when 'canceled' then 'cancelled' else 'suspended' end;
  update public.assinaturas_oficina set codigo_plano=p_plano,situacao=estado,valido_ate=p_periodo_final,
    provedor_cobranca=case when p_ambiente='producao' then 'stripe' else 'stripe_test' end,assinatura_provedor_id=p_assinatura,atualizado_em=now() where oficina_id=p_oficina;
  if not found then raise exception 'Assinatura local inexistente' using errcode='P0002'; end if;
  update public.contas_cobranca set assinatura_provedor_id=p_assinatura,situacao_provedor=p_situacao,cancelar_no_fim=p_cancelar_no_fim,
    periodo_final=p_periodo_final,atualizado_em=now() where oficina_id=p_oficina and ambiente=p_ambiente;
  update public.oficinas_cobranca_teste set habilitado=false where oficina_id=p_oficina;
  insert into public.eventos_cobranca_provedor(id,oficina_id,tipo,assinatura_provedor_id,codigo_plano,situacao,ambiente)
    values(p_evento,p_oficina,p_tipo,p_assinatura,p_plano,estado,p_ambiente);
  return true;
end $$;
revoke all on function public.aplicar_assinatura_provedor(uuid,uuid,text,text,text,text,text,text,timestamptz,boolean,text) from public,anon,authenticated;
grant execute on function public.aplicar_assinatura_provedor(uuid,uuid,text,text,text,text,text,text,timestamptz,boolean,text) to service_role;
comment on table public.contas_cobranca is 'Contas Stripe isoladas por ambiente. Ativação comercial explícita nas Edge Functions.';
notify pgrst,'reload schema';
commit;
