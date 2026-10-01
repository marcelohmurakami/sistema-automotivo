begin;

-- Apenas a administração do ambiente pode habilitar oficinas de teste.
create table public.oficinas_cobranca_teste (
  oficina_id uuid primary key references public.oficinas(id),
  habilitado boolean not null default false,
  criado_em timestamptz not null default now()
);
create table public.eventos_cobranca_teste (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null references public.oficinas(id),
  chave uuid not null,
  usuario_id uuid not null references auth.users(id),
  acao text not null check (acao in ('aprovar','recusar','atrasar','cancelar')),
  codigo_plano text not null references public.planos(codigo),
  valor_centavos integer not null check(valor_centavos >= 0),
  situacao_anterior text not null,
  situacao_resultante text not null,
  criado_em timestamptz not null default now(),
  unique(oficina_id,chave)
);
create index eventos_cobranca_teste_historico on public.eventos_cobranca_teste(oficina_id,criado_em desc);
alter table public.oficinas_cobranca_teste enable row level security;
alter table public.eventos_cobranca_teste enable row level security;
revoke all on public.oficinas_cobranca_teste,public.eventos_cobranca_teste from anon,authenticated;
grant all on public.oficinas_cobranca_teste,public.eventos_cobranca_teste to service_role;

create function private.exigir_dono_cobranca(p_oficina uuid)
returns uuid language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from public.membros_oficina m join public.oficinas o on o.id=m.oficina_id
    where m.oficina_id=p_oficina and m.usuario_id=auth.uid() and m.ativo and m.perfil='owner' and o.arquivado_em is null) then
    raise exception 'Somente o proprietário pode administrar a assinatura.' using errcode='42501';
  end if;
  return auth.uid();
end $$;

create function public.consultar_cobranca_teste(p_oficina uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform private.exigir_dono_cobranca(p_oficina);
  return jsonb_build_object(
    'habilitado',exists(select 1 from public.oficinas_cobranca_teste where oficina_id=p_oficina and habilitado),
    'precos',jsonb_build_object('basic',4900,'intermediate',9900,'complete',19900),
    'eventos',coalesce((select jsonb_agg(to_jsonb(e) order by e.criado_em desc,e.id) from
      (select id,acao,codigo_plano,valor_centavos,situacao_resultante,criado_em from public.eventos_cobranca_teste
      where oficina_id=p_oficina order by criado_em desc,id limit 50) e),'[]'::jsonb));
end $$;

create function public.simular_cobranca(p_oficina uuid,p_chave uuid,p_acao text,p_plano text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_usuario uuid; v_ass public.assinaturas_oficina; v_evento public.eventos_cobranca_teste;
  v_situacao text; v_valor integer; v_id uuid;
begin
  v_usuario:=private.exigir_dono_cobranca(p_oficina);
  if not exists(select 1 from public.oficinas_cobranca_teste where oficina_id=p_oficina and habilitado) then
    raise exception 'Oficina não habilitada para cobrança de teste.' using errcode='42501';
  end if;
  if p_chave is null or p_acao is null or p_acao not in ('aprovar','recusar','atrasar','cancelar')
    or p_plano is null or p_plano not in ('basic','intermediate','complete') then
    raise exception 'Operação de teste inválida.' using errcode='22023';
  end if;
  select * into v_ass from public.assinaturas_oficina where oficina_id=p_oficina for update;
  if not found then raise exception 'Assinatura não encontrada.' using errcode='P0002'; end if;
  if coalesce(v_ass.provedor_cobranca,'') not in ('','homologacao') or v_ass.assinatura_provedor_id is not null then
    raise exception 'Uma assinatura vinculada a um provedor não pode ser alterada pelo simulador.' using errcode='42501';
  end if;
  select * into v_evento from public.eventos_cobranca_teste where oficina_id=p_oficina and chave=p_chave;
  if found then
    if v_evento.acao<>p_acao or v_evento.codigo_plano<>p_plano then
      raise exception 'Esta operação já foi usada com outros dados.' using errcode='22023';
    end if;
    return v_evento.id;
  end if;
  v_valor:=case p_plano when 'basic' then 4900 when 'intermediate' then 9900 else 19900 end;
  v_situacao:=case p_acao when 'aprovar' then 'active' when 'atrasar' then 'past_due' when 'cancelar' then 'cancelled' else v_ass.situacao end;
  if p_acao<>'recusar' then
    update public.assinaturas_oficina set situacao=v_situacao,
      codigo_plano=case when p_acao='aprovar' then p_plano else codigo_plano end,
      valido_ate=case when p_acao='aprovar' then now()+interval '30 days' else valido_ate end,
      provedor_cobranca='homologacao',atualizado_em=now() where oficina_id=p_oficina;
  end if;
  insert into public.eventos_cobranca_teste(oficina_id,chave,usuario_id,acao,codigo_plano,valor_centavos,situacao_anterior,situacao_resultante)
  values(p_oficina,p_chave,v_usuario,p_acao,p_plano,v_valor,v_ass.situacao,v_situacao) returning id into v_id;
  return v_id;
end $$;
revoke all on function private.exigir_dono_cobranca(uuid) from public,anon,authenticated;
revoke all on function public.consultar_cobranca_teste(uuid),public.simular_cobranca(uuid,uuid,text,text) from public,anon;
grant execute on function public.consultar_cobranca_teste(uuid),public.simular_cobranca(uuid,uuid,text,text) to authenticated;
comment on table public.eventos_cobranca_teste is 'Simulações explícitas: não representa dinheiro recebido, fatura ou pagamento por provedor.';
notify pgrst,'reload schema';
commit;
