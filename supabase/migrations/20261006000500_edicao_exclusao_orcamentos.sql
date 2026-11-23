begin;

alter table public.orcamentos
  add column motivo_exclusao text check(length(motivo_exclusao) between 3 and 1000),
  add column excluido_por uuid references auth.users(id);
comment on column public.orcamentos.arquivado_em is 'Exclusão reversível. Preserva versões, aprovações e OS vinculadas.';

create function private.orcamento_edicao_bloqueada(p_oficina uuid,p_orcamento uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.ordens_servico where oficina_id=p_oficina and orcamento_origem_id=p_orcamento)
    or exists(select 1 from public.complementos_ordem_servico where oficina_id=p_oficina and orcamento_id=p_orcamento and aplicado_em is not null);
$$;

create function public.listar_orcamentos_gestao(p_oficina uuid,p_busca text default '',p_situacao text default '',p_pagina integer default 0,p_excluidos boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare itens jsonb; total bigint;
begin
  perform private.exigir_orcamentos(p_oficina);
  if p_pagina is null or p_pagina<0 or p_excluidos is null or length(coalesce(p_busca,''))>200 or p_situacao not in ('','draft','awaiting_approval','approved','declined','expired','cancelled') then
    raise exception 'Filtro inválido.' using errcode='22023'; end if;
  with base as (
    select q.id,q.numero,q.criado_em,q.revisao,q.arquivado_em,q.motivo_exclusao,
      private.orcamento_edicao_bloqueada(q.oficina_id,q.id) as edicao_bloqueada,
      v.total_centavos,v.numero_versao,v.expira_em,v.dados_cliente->>'nome' as cliente,v.dados_veiculo->>'modelo' as veiculo,v.dados_veiculo->>'placa' as placa,
      (select a.total_aprovado_centavos from public.aprovacoes_orcamento a where a.oficina_id=q.oficina_id and a.versao_orcamento_id=v.id and a.decisao='approved') as total_aprovado_centavos,
      case when q.situacao='awaiting_approval' and v.expira_em<=now() then 'expired' else q.situacao end as situacao
    from public.orcamentos q join public.versoes_orcamento v on v.oficina_id=q.oficina_id and v.id=q.versao_atual_id
    where q.oficina_id=p_oficina and (q.arquivado_em is not null)=p_excluidos
  ), filtrados as (select * from base where (coalesce(p_situacao,'')='' or situacao=p_situacao) and strpos(lower(concat_ws(' ',numero,cliente,veiculo,placa)),lower(trim(coalesce(p_busca,''))))>0),
  pagina as (select * from filtrados order by numero desc limit 24 offset p_pagina*24)
  select (select count(*) from filtrados),coalesce(jsonb_agg(to_jsonb(pagina) order by numero desc),'[]') into total,itens from pagina;
  return jsonb_build_object('itens',itens,'total',total);
end $$;

-- O formulário abre sem escrever no banco. Revisar e salvar acontecem na mesma transação.
create function public.editar_orcamento(p_oficina uuid,p_dados jsonb,p_chave uuid,p_orcamento uuid,p_revisao integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q public.orcamentos; r jsonb; os public.ordens_servico;
begin
  perform private.exigir_orcamentos(p_oficina);
  select * into q from public.orcamentos where oficina_id=p_oficina and id=p_orcamento for update;
  if not found then raise exception 'Orçamento não encontrado.' using errcode='P0002'; end if;
  if q.arquivado_em is not null then raise exception 'Restaure o orçamento antes de editar.' using errcode='22023'; end if;
  if q.revisao is distinct from p_revisao then raise exception 'O orçamento mudou. Feche e abra a edição novamente.' using errcode='40001'; end if;
  if private.orcamento_edicao_bloqueada(p_oficina,q.id) then raise exception 'Este orçamento já autorizou uma OS. Crie um orçamento adicional na OS.' using errcode='22023'; end if;
  if q.situacao<>'draft' then
    r:=public.revisar_orcamento(p_oficina,q.id,q.revisao);
    q.revisao:=(r->>'revisao')::integer;
  end if;
  r:=public.salvar_orcamento(p_oficina,p_dados,p_chave,q.id,q.revisao);
  -- A OS de entrada continua parada, mas acompanha correções do cliente/veículo.
  select * into os from public.ordens_servico where oficina_id=p_oficina and orcamento_aguardando_id=q.id and situacao<>'cancelled' for update;
  if found then
    update public.ordens_servico set cliente_id=(r->>'cliente_id')::uuid,veiculo_id=(r->>'veiculo_id')::uuid,
      dados_cliente=r->'versao'->'dados_cliente',dados_veiculo=r->'versao'->'dados_veiculo',revisao=revisao+1,atualizado_em=now()
      where oficina_id=p_oficina and id=os.id;
    perform private.evento_os(p_oficina,os.id,'Orçamento atualizado. OS continua aguardando aprovação.',jsonb_build_object('orcamento_id',q.id));
  end if;
  return r;
end $$;

create function public.excluir_orcamento(p_oficina uuid,p_orcamento uuid,p_revisao integer,p_motivo text) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid; q public.orcamentos; numero_os bigint; motivo text:=btrim(coalesce(p_motivo,'')); corr uuid:=gen_random_uuid();
begin
  u:=private.exigir_orcamentos(p_oficina);
  if length(motivo) not between 3 and 1000 then raise exception 'Informe o motivo da exclusão, entre 3 e 1.000 caracteres.' using errcode='22023'; end if;
  select * into q from public.orcamentos where oficina_id=p_oficina and id=p_orcamento for update;
  if not found then raise exception 'Orçamento não encontrado.' using errcode='P0002'; end if;
  if q.arquivado_em is not null then return; end if;
  if q.revisao is distinct from p_revisao then raise exception 'O orçamento mudou. Atualize a lista antes de excluir.' using errcode='40001'; end if;
  select numero into numero_os from public.ordens_servico where oficina_id=p_oficina and orcamento_aguardando_id=q.id and situacao<>'cancelled' for update;
  if found then raise exception 'A OS #% aguarda este orçamento. Cancele essa OS antes de excluir o orçamento.',numero_os using errcode='22023'; end if;
  update public.tokens_acesso_orcamento set revogado_em=now() where oficina_id=p_oficina and revogado_em is null and versao_orcamento_id in(select id from public.versoes_orcamento where oficina_id=p_oficina and orcamento_id=q.id);
  update public.avisos_automaticos set situacao='cancelado' where oficina_id=p_oficina and situacao in ('revisao','aprovado') and versao_orcamento_id in(select id from public.versoes_orcamento where oficina_id=p_oficina and orcamento_id=q.id);
  update public.orcamentos set arquivado_em=now(),motivo_exclusao=motivo,excluido_por=u,revisao=revisao+1,atualizado_em=now() where id=q.id returning * into q;
  insert into public.eventos_negocio(oficina_id,tipo_evento,tipo_agregado,agregado_id,versao_agregado,correlacao_id,chave_deduplicacao,dados)
    values(p_oficina,'orcamento.excluido','orcamento',q.id,q.revisao,corr,'orcamento:'||q.id||':'||q.revisao||':orcamento.excluido',jsonb_build_object('orcamento_id',q.id,'motivo',motivo));
  insert into public.registros_auditoria(oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,correlacao_id,metadados)
    values(p_oficina,u,'user','orcamento.excluido','orcamento',q.id,corr,jsonb_build_object('motivo',motivo));
end $$;

create function public.restaurar_orcamento(p_oficina uuid,p_orcamento uuid,p_revisao integer) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid; q public.orcamentos;
begin
  u:=private.exigir_orcamentos(p_oficina);
  select * into q from public.orcamentos where oficina_id=p_oficina and id=p_orcamento for update;
  if not found then raise exception 'Orçamento não encontrado.' using errcode='P0002'; end if;
  if q.arquivado_em is null then return; end if;
  if q.revisao is distinct from p_revisao then raise exception 'O orçamento mudou. Atualize a lista.' using errcode='40001'; end if;
  update public.orcamentos set arquivado_em=null,revisao=revisao+1,atualizado_em=now() where id=q.id returning * into q;
  perform private.evento_orcamento(p_oficina,q.id,q.revisao,'orcamento.restaurado',u);
end $$;

create function private.exigir_orcamento_ativo(p_oficina uuid,p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare excluido timestamptz;
begin
  perform private.exigir_orcamentos(p_oficina);
  select arquivado_em into excluido from public.orcamentos where oficina_id=p_oficina and id=p_id for update;
  if excluido is not null then
    raise exception 'Orçamento excluído. Restaure-o antes de continuar.' using errcode='22023'; end if;
end $$;

-- Mantém bloqueado o acesso por RPCs antigas, inclusive com uma tela desatualizada.
do $$declare nome text; assinatura text; s text; trecho text; begin
  foreach assinatura in array array[
    'public.salvar_orcamento(uuid,jsonb,uuid,uuid,integer)',
    'public.revisar_orcamento(uuid,uuid,integer)',
    'public.cancelar_orcamento(uuid,uuid,integer)',
    'public.emitir_orcamento(uuid,uuid,integer,integer,text)',
    'public.gerar_link_orcamento(uuid,uuid,text)',
    'public.converter_orcamento_em_os(uuid,uuid)',
    'public.criar_os_aguardando_orcamento(uuid,uuid)'
  ] loop
    s:=pg_get_functiondef(assinatura::regprocedure);
    trecho:=substring(s from '(?i)begin');
    if trecho is null then raise exception 'RPC incompatível: %',assinatura; end if;
    s:=regexp_replace(s,'(?i)begin','begin perform private.exigir_orcamento_ativo(p_oficina,p_orcamento);');
    execute s;
  end loop;
  s:=pg_get_functiondef('private.dados_orcamento(uuid,uuid,uuid)'::regprocedure);
  if strpos(s,'to_jsonb(q)||jsonb_build_object(')=0 then raise exception 'Consulta interna incompatível.';end if;
  execute replace(s,'to_jsonb(q)||jsonb_build_object(', 'to_jsonb(q)||jsonb_build_object(''edicao_bloqueada'',private.orcamento_edicao_bloqueada(q.oficina_id,q.id),');
  s:=pg_get_functiondef('public.processar_lembretes_automaticos()'::regprocedure);
  if strpos(s,'q.situacao=''awaiting_approval''')=0 then raise exception 'Lembretes incompatíveis.';end if;
  execute replace(s,'q.situacao=''awaiting_approval''','q.arquivado_em is null and q.situacao=''awaiting_approval''');
end $$;

revoke all on function private.orcamento_edicao_bloqueada(uuid,uuid),private.exigir_orcamento_ativo(uuid,uuid),public.listar_orcamentos_gestao(uuid,text,text,integer,boolean),public.editar_orcamento(uuid,jsonb,uuid,uuid,integer),public.excluir_orcamento(uuid,uuid,integer,text),public.restaurar_orcamento(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.listar_orcamentos_gestao(uuid,text,text,integer,boolean),public.editar_orcamento(uuid,jsonb,uuid,uuid,integer),public.excluir_orcamento(uuid,uuid,integer,text),public.restaurar_orcamento(uuid,uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
