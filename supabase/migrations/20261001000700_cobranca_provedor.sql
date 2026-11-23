begin;
create table public.contas_cobranca (
  oficina_id uuid primary key references public.oficinas(id),
  cliente_provedor_id text unique,
  assinatura_provedor_id text unique,
  situacao_provedor text,
  cancelar_no_fim boolean not null default false,
  periodo_final timestamptz,
  reserva uuid,
  reserva_ate timestamptz,
  checkout_chave uuid,
  checkout_plano text references public.planos(codigo),
  checkout_expira_em timestamptz,
  atualizado_em timestamptz not null default now()
);
create table public.eventos_cobranca_provedor (
  id text primary key,
  oficina_id uuid not null references public.oficinas(id),
  tipo text not null,
  assinatura_provedor_id text not null,
  codigo_plano text not null references public.planos(codigo),
  situacao text not null,
  criado_em timestamptz not null default now()
);
create index eventos_cobranca_provedor_oficina on public.eventos_cobranca_provedor(oficina_id,criado_em desc);
alter table public.contas_cobranca enable row level security;
alter table public.eventos_cobranca_provedor enable row level security;
revoke all on public.contas_cobranca,public.eventos_cobranca_provedor from public,anon,authenticated;
grant all on public.contas_cobranca,public.eventos_cobranca_provedor to service_role;

create function public.consultar_cobranca(p_oficina uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform private.exigir_dono_cobranca(p_oficina);
  return jsonb_build_object('vinculada',exists(select 1 from public.contas_cobranca where oficina_id=p_oficina and cliente_provedor_id is not null),
    'assinatura',(select jsonb_build_object('situacao',situacao_provedor,'cancelar_no_fim',cancelar_no_fim,'periodo_final',periodo_final) from public.contas_cobranca where oficina_id=p_oficina),
    'eventos',coalesce((select jsonb_agg(to_jsonb(e) order by e.criado_em desc) from
      (select tipo,codigo_plano,situacao,criado_em from public.eventos_cobranca_provedor where oficina_id=p_oficina order by criado_em desc limit 30)e),'[]'::jsonb));
end $$;

-- A trava permanece válida durante a consulta ao provedor. O token de reserva
-- impede um worker atrasado de gravar depois que outra execução assumiu o trabalho.
create function public.reservar_operacao_cobranca(p_oficina uuid,p_usuario uuid default null,p_plano text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.contas_cobranca; token uuid:=gen_random_uuid();
begin
  if not exists(select 1 from public.oficinas where id=p_oficina and arquivado_em is null) then raise exception 'Oficina indisponível' using errcode='42501'; end if;
  if p_usuario is not null and not exists(select 1 from public.membros_oficina where oficina_id=p_oficina and usuario_id=p_usuario and ativo and perfil='owner') then
    raise exception 'Somente o proprietário pode administrar a assinatura.' using errcode='42501';
  end if;
  if p_plano is not null and p_plano not in ('basic','intermediate','complete') then raise exception 'Plano inválido' using errcode='22023'; end if;
  if exists(select 1 from public.assinaturas_oficina where oficina_id=p_oficina and coalesce(provedor_cobranca,'') not in ('','homologacao','stripe_test')) then
    raise exception 'Assinatura vinculada a outro ambiente ou provedor.' using errcode='42501';
  end if;
  insert into public.contas_cobranca(oficina_id) values(p_oficina) on conflict do nothing;
  select * into v from public.contas_cobranca where oficina_id=p_oficina for update;
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
    checkout_plano=v.checkout_plano,checkout_expira_em=v.checkout_expira_em where oficina_id=p_oficina;
  return to_jsonb(v)||jsonb_build_object('reserva',token);
end $$;
create function public.vincular_cliente_cobranca(p_oficina uuid,p_reserva uuid,p_cliente text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_cliente is null or p_cliente !~ '^cus_[A-Za-z0-9]+$' then raise exception 'Cliente do provedor inválido' using errcode='22023'; end if;
  update public.contas_cobranca set cliente_provedor_id=p_cliente,atualizado_em=now()
    where oficina_id=p_oficina and reserva=p_reserva and reserva_ate>now() and (cliente_provedor_id is null or cliente_provedor_id=p_cliente);
  if not found then raise exception 'Reserva expirada ou vínculo divergente' using errcode='PT409'; end if;
end $$;
create function public.liberar_operacao_cobranca(p_oficina uuid,p_reserva uuid)
returns void language sql security definer set search_path='' as $$
  update public.contas_cobranca set reserva=null,reserva_ate=null where oficina_id=p_oficina and reserva=p_reserva;
$$;

create function public.aplicar_assinatura_provedor(p_oficina uuid,p_reserva uuid,p_evento text,p_tipo text,p_cliente text,p_assinatura text,p_plano text,p_situacao text,p_periodo_final timestamptz,p_cancelar_no_fim boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare v public.contas_cobranca; estado text;
begin
  select * into v from public.contas_cobranca where oficina_id=p_oficina for update;
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
    provedor_cobranca='stripe_test',assinatura_provedor_id=p_assinatura,atualizado_em=now() where oficina_id=p_oficina;
  if not found then raise exception 'Assinatura local inexistente' using errcode='P0002'; end if;
  update public.contas_cobranca set assinatura_provedor_id=p_assinatura,situacao_provedor=p_situacao,cancelar_no_fim=p_cancelar_no_fim,
    periodo_final=p_periodo_final,atualizado_em=now() where oficina_id=p_oficina;
  update public.oficinas_cobranca_teste set habilitado=false where oficina_id=p_oficina;
  insert into public.eventos_cobranca_provedor(id,oficina_id,tipo,assinatura_provedor_id,codigo_plano,situacao)
    values(p_evento,p_oficina,p_tipo,p_assinatura,p_plano,estado);
  return true;
end $$;

revoke all on function public.consultar_cobranca(uuid) from public,anon;
grant execute on function public.consultar_cobranca(uuid) to authenticated;
revoke all on function public.reservar_operacao_cobranca(uuid,uuid,text),public.vincular_cliente_cobranca(uuid,uuid,text),public.liberar_operacao_cobranca(uuid,uuid),public.aplicar_assinatura_provedor(uuid,uuid,text,text,text,text,text,text,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.reservar_operacao_cobranca(uuid,uuid,text),public.vincular_cliente_cobranca(uuid,uuid,text),public.liberar_operacao_cobranca(uuid,uuid),public.aplicar_assinatura_provedor(uuid,uuid,text,text,text,text,text,text,timestamptz,boolean) to service_role;
comment on table public.contas_cobranca is 'Integração Stripe exclusivamente no ambiente de teste. Segredos ficam nas Edge Functions.';
notify pgrst,'reload schema';
commit;
