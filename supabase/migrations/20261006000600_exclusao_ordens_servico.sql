begin;

alter table public.ordens_servico
  add column arquivado_em timestamptz,
  add column motivo_exclusao text check(length(btrim(motivo_exclusao)) between 3 and 1000),
  add column excluido_por uuid references auth.users(id),
  add constraint os_excluida_encerrada check(arquivado_em is null or (situacao in ('delivered','cancelled') and motivo_exclusao is not null and excluido_por is not null));
comment on column public.ordens_servico.arquivado_em is 'Exclusão reversível da listagem. Preserva histórico, fotos, itens, pagamentos e movimentações de estoque.';
create index os_lista_ativas on public.ordens_servico(oficina_id,criado_em desc,id) where arquivado_em is null;

create function public.listar_ordens_servico_gestao(p_oficina uuid,p_busca text default '',p_situacao text default '',p_pagina integer default 0,p_excluidos boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare itens jsonb; total bigint;
begin
  perform private.exigir_os(p_oficina);
  if p_pagina is null or p_pagina<0 or p_pagina>100000 or p_excluidos is null or length(coalesce(p_busca,''))>200
    or coalesce(p_situacao,'') not in ('','open','in_progress','quality_check','ready','delivered','cancelled') then
    raise exception 'Filtro inválido.' using errcode='22023';
  end if;
  with filtrados as (
    select w.*,(select count(*) from public.paradas_ordem_servico b where b.oficina_id=w.oficina_id and b.ordem_servico_id=w.id and b.encerrado_em is null) as paradas_abertas
    from public.ordens_servico w where w.oficina_id=p_oficina and (w.arquivado_em is not null)=p_excluidos
      and (coalesce(p_situacao,'')='' or w.situacao=p_situacao)
      and strpos(lower(concat_ws(' ',w.numero,w.dados_cliente->>'nome',w.dados_veiculo->>'modelo',w.dados_veiculo->>'placa')),lower(trim(coalesce(p_busca,''))))>0
  ), pagina as (select * from filtrados order by criado_em desc,id limit 24 offset p_pagina*24)
  select (select count(*) from filtrados),coalesce(jsonb_agg(to_jsonb(pagina) order by criado_em desc,id),'[]') into total,itens from pagina;
  return jsonb_build_object('itens',itens,'total',total);
end $$;

-- Clientes antigos da API também deixam de exibir as OS excluídas.
create or replace function public.listar_ordens_servico(p_oficina uuid,p_busca text default '',p_situacao text default '',p_pagina integer default 0)
returns jsonb language sql stable security definer set search_path='' as $$
  select public.listar_ordens_servico_gestao(p_oficina,p_busca,p_situacao,p_pagina,false);
$$;

create function public.excluir_ordem_servico(p_oficina uuid,p_os uuid,p_revisao integer,p_motivo text)
returns void language plpgsql security definer set search_path='' as $$
declare u uuid; w public.ordens_servico; motivo text:=btrim(coalesce(p_motivo,''));
begin
  u:=private.exigir_os(p_oficina);
  if length(motivo) not between 3 and 1000 then
    raise exception 'Informe o motivo da exclusão, entre 3 e 1.000 caracteres.' using errcode='22023';
  end if;
  -- Mesma ordem de bloqueio usada nos pagamentos e nas mudanças do mapa.
  perform pg_advisory_xact_lock(hashtextextended('financeiro-os:'||p_oficina||':'||p_os,0));
  select * into w from public.ordens_servico where oficina_id=p_oficina and id=p_os for update;
  if not found then raise exception 'OS não encontrada.' using errcode='P0002'; end if;
  if w.arquivado_em is not null then return; end if;
  if w.revisao is distinct from p_revisao then
    raise exception 'A OS foi alterada. Atualize a lista antes de excluir.' using errcode='40001';
  end if;
  -- O cancelamento existente encerra os cronômetros, atualiza comissões e títulos
  -- provisórios, e impede excluir um atendimento ativo com valores recebidos.
  if w.situacao not in ('delivered','cancelled') then
    perform public.atualizar_mapa_ordem_servico(p_oficina,w.id,w.revisao,'cancelled',w.etapa_id,w.local_id,w.entrega_prevista_em,w.recebido_em,motivo);
  end if;
  update public.ordens_servico set arquivado_em=now(),motivo_exclusao=motivo,excluido_por=u,atualizado_em=now() where id=w.id;
  update public.avisos_automaticos set situacao='cancelado' where oficina_id=p_oficina and ordem_servico_id=w.id and situacao in ('revisao','aprovado');
  perform private.evento_os(p_oficina,w.id,'OS excluída da listagem. Motivo: '||motivo,jsonb_build_object('acao','exclusao','motivo',motivo,'situacao_anterior',w.situacao));
  insert into public.registros_auditoria(oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,correlacao_id,metadados)
    values(p_oficina,u,'user','os.excluida','ordem_servico',w.id,gen_random_uuid(),jsonb_build_object('motivo',motivo,'situacao_anterior',w.situacao));
end $$;

create function public.restaurar_ordem_servico(p_oficina uuid,p_os uuid,p_revisao integer)
returns void language plpgsql security definer set search_path='' as $$
declare u uuid; w public.ordens_servico;
begin
  u:=private.exigir_os(p_oficina);
  select * into w from public.ordens_servico where oficina_id=p_oficina and id=p_os for update;
  if not found then raise exception 'OS não encontrada.' using errcode='P0002'; end if;
  if w.arquivado_em is null then return; end if;
  if w.revisao is distinct from p_revisao then raise exception 'A OS foi alterada. Atualize a lista.' using errcode='40001'; end if;
  -- Restaurar recupera o registro, sem reabrir execução nem gerar novas baixas.
  update public.ordens_servico set arquivado_em=null,atualizado_em=now() where id=w.id;
  perform private.evento_os(p_oficina,w.id,'OS restaurada na listagem. Situação preservada.',jsonb_build_object('acao','restauracao'));
  insert into public.registros_auditoria(oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,correlacao_id)
    values(p_oficina,u,'user','os.restaurada','ordem_servico',w.id,gen_random_uuid());
end $$;

revoke all on function public.listar_ordens_servico_gestao(uuid,text,text,integer,boolean),public.excluir_ordem_servico(uuid,uuid,integer,text),public.restaurar_ordem_servico(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.listar_ordens_servico_gestao(uuid,text,text,integer,boolean),public.excluir_ordem_servico(uuid,uuid,integer,text),public.restaurar_ordem_servico(uuid,uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
