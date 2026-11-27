-- Prazo de execução separado da validade comercial, versionado com a proposta.
alter table public.versoes_orcamento add column entrega_prevista_em timestamptz;

create function public.editar_identificacao_orcamento(
  p_oficina uuid, p_orcamento uuid, p_revisao integer, p_campo text, p_valor text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid; q public.orcamentos; v public.versoes_orcamento; r jsonb; prazo timestamptz;
begin
  perform private.conferir_operacao(p_oficina,'editar_orcamento');
  u := private.exigir_orcamentos(p_oficina);
  perform private.exigir_orcamento_ativo(p_oficina,p_orcamento);
  select * into q from public.orcamentos where oficina_id=p_oficina and id=p_orcamento for update;
  if not found then raise exception 'Orçamento não encontrado.' using errcode='P0002'; end if;
  if q.revisao is distinct from p_revisao then raise exception 'O orçamento mudou. Atualize os dados antes de salvar.' using errcode='PT409'; end if;
  if private.orcamento_edicao_bloqueada(p_oficina,q.id) then
    raise exception 'Este orçamento já autorizou uma OS. Altere o atendimento pela OS vinculada.' using errcode='22023';
  end if;
  if p_campo is null or p_campo not in ('tipo','entrega') then raise exception 'Campo inválido.' using errcode='22023'; end if;
  if p_campo='tipo' and (length(coalesce(p_valor,''))>60 or coalesce(p_valor,'') !~ '^[a-z0-9_]*$') then raise exception 'Ícone inválido.' using errcode='22023'; end if;
  if p_campo='entrega' then
    prazo:=nullif(p_valor,'')::timestamptz;
    if prazo is not null and (not isfinite(prazo) or extract(year from prazo) not between 1000 and 9999) then raise exception 'Data de entrega inválida.' using errcode='22023'; end if;
  end if;
  select * into v from public.versoes_orcamento where oficina_id=p_oficina and id=q.versao_atual_id;
  if (p_campo='tipo' and coalesce(v.tipo_servico,'')=coalesce(p_valor,'')) or
     (p_campo='entrega' and v.entrega_prevista_em is not distinct from prazo) then return private.dados_orcamento(p_oficina,q.id); end if;
  if q.situacao<>'draft' then
    r:=public.revisar_orcamento(p_oficina,q.id,q.revisao);
    select * into q from public.orcamentos where oficina_id=p_oficina and id=q.id;
  end if;
  update public.versoes_orcamento set
    tipo_servico=case when p_campo='tipo' then nullif(p_valor,'') else tipo_servico end,
    entrega_prevista_em=case when p_campo='entrega' then prazo else entrega_prevista_em end
    where oficina_id=p_oficina and id=q.versao_atual_id;
  update public.orcamentos set revisao=revisao+1,atualizado_em=now() where oficina_id=p_oficina and id=q.id returning * into q;
  perform private.evento_orcamento(p_oficina,q.id,q.revisao,'orcamento.identificacao_atualizada',u);
  return private.dados_orcamento(p_oficina,q.id);
exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Data de entrega inválida.' using errcode='22023';
end $$;
revoke all on function public.editar_identificacao_orcamento(uuid,uuid,integer,text,text) from public,anon;
grant execute on function public.editar_identificacao_orcamento(uuid,uuid,integer,text,text) to authenticated;

-- Conserva o prazo ao criar outra versão, inclusive pelo editor completo.
create function private.copiar_prazo_versao_orcamento() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.numero_versao>1 and new.entrega_prevista_em is null then
    select v.entrega_prevista_em into new.entrega_prevista_em from public.orcamentos q
      join public.versoes_orcamento v on v.oficina_id=q.oficina_id and v.id=q.versao_atual_id
      where q.oficina_id=new.oficina_id and q.id=new.orcamento_id;
  end if;
  return new;
end $$;
revoke all on function private.copiar_prazo_versao_orcamento() from public,anon,authenticated;
create trigger copiar_prazo_versao_orcamento before insert on public.versoes_orcamento
  for each row execute function private.copiar_prazo_versao_orcamento();

-- A OS criada a partir do orçamento leva o prazo combinado para o mapa.
create function private.importar_prazo_orcamento_os() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.entrega_prevista_em is null then
    select v.entrega_prevista_em into new.entrega_prevista_em from public.versoes_orcamento v
      where v.oficina_id=new.oficina_id and v.id=coalesce(new.versao_orcamento_origem_id,
        (select q.versao_atual_id from public.orcamentos q where q.oficina_id=new.oficina_id and q.id=new.orcamento_aguardando_id));
  end if;
  return new;
end $$;
revoke all on function private.importar_prazo_orcamento_os() from public,anon,authenticated;
create trigger importar_prazo_orcamento_os before insert or update of versao_orcamento_origem_id,orcamento_aguardando_id on public.ordens_servico
  for each row execute function private.importar_prazo_orcamento_os();

-- Enriquece a consulta paginada já existente, sem uma requisição por card.
do $$ declare codigo text; trecho text := 'v.total_centavos,v.numero_versao,v.expira_em,';
begin
  codigo:=pg_get_functiondef('public.listar_orcamentos_gestao(uuid,text,text,integer,boolean)'::regprocedure);
  if strpos(codigo,trecho)=0 then raise exception 'Consulta de orçamentos incompatível com a migração.'; end if;
  execute replace(codigo,trecho,'v.tipo_servico,v.entrega_prevista_em,'||trecho);
end $$;
notify pgrst,'reload schema';
