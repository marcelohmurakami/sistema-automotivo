begin;

create index os_historico_cliente on public.ordens_servico(oficina_id,cliente_id,criado_em desc,id) where arquivado_em is null;
create index notas_historico_cliente on public.notas_atendimento(oficina_id,cliente_id,criado_em desc,id);

-- Notinhas são atendimentos independentes; imprimir uma OS não cria uma notinha.
create view private.atendimentos_cliente as
select o.oficina_id,o.cliente_id,o.id,'os'::text tipo,o.numero,o.situacao,
  coalesce(o.entregue_em,o.recebido_em,o.criado_em) data,o.criado_em,
  o.situacao='delivered' concluido,o.total_centavos,o.dados_veiculo,
  coalesce(nullif(o.resumo_cliente,''),nullif(o.diagnostico,''),o.queixa_cliente,'') resumo
from public.ordens_servico o where o.arquivado_em is null
union all
select n.oficina_id,n.cliente_id,n.id,'nota',n.numero,n.situacao,
  coalesce(n.emitido_em,n.criado_em),n.criado_em,n.situacao='issued',n.total_centavos,n.dados_veiculo,coalesce(n.observacoes,'')
from public.notas_atendimento n;
revoke all on private.atendimentos_cliente from public,anon,authenticated;

create function public.consultar_ficha_cliente(p_oficina uuid,p_cliente uuid,p_pagina integer default 0,p_filtro text default 'todos')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  u uuid; c public.clientes; gerencia boolean; permite_os boolean; permite_notas boolean; permite_financeiro boolean;
  resumo jsonb; financeiro jsonb:=null; veiculos jsonb; historico jsonb; quantidade bigint;
begin
  u:=private.exigir_clientes(p_oficina);
  if p_pagina is null or p_pagina not between 0 and 100000 or p_filtro is null or p_filtro not in ('todos','concluidos','andamento','cancelados') then
    raise exception 'Filtro de histórico inválido.' using errcode='22023';
  end if;
  gerencia:=exists(select 1 from public.membros_oficina where oficina_id=p_oficina and usuario_id=u and ativo and perfil in ('owner','manager'));
  select * into c from public.clientes where oficina_id=p_oficina and id=p_cliente and (arquivado_em is null or gerencia);
  if not found then raise exception 'Cliente não encontrado nesta oficina.' using errcode='P0002'; end if;
  permite_os:=private.has_feature(p_oficina,'work_orders');
  permite_notas:=private.has_feature(p_oficina,'simple_notes');
  permite_financeiro:=permite_os and gerencia and private.has_feature(p_oficina,'finance');

  select jsonb_build_object(
    'atendimentos_concluidos',count(*) filter(where a.concluido),
    'total_servicos_centavos',coalesce(sum(a.total_centavos) filter(where a.concluido),0),
    'ticket_medio_centavos',round(avg(a.total_centavos) filter(where a.concluido)),
    'em_andamento',count(*) filter(where not a.concluido and a.situacao<>'cancelled'),
    'ultimo_atendimento_em',max(a.data) filter(where a.concluido)
  ) into resumo from private.atendimentos_cliente a
  where a.oficina_id=p_oficina and a.cliente_id=p_cliente and ((a.tipo='os' and permite_os) or (a.tipo='nota' and permite_notas));

  if permite_financeiro then
    select jsonb_build_object('pago_centavos',coalesce(sum(t.baixado_centavos),0),
      'aberto_centavos',coalesce(sum(t.aberto_centavos),0)) into financeiro
    from private.financeiro_saldos t join public.ordens_servico o on o.oficina_id=t.oficina_id and o.id=t.ordem_servico_id
    where t.oficina_id=p_oficina and o.cliente_id=p_cliente and o.arquivado_em is null and o.situacao<>'cancelled'
      and t.natureza='receber' and t.cancelado_em is null and t.transferencia_id is null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'modelo',v.modelo,'marca',v.marca,'placa',v.placa,
    'ano_modelo',v.ano_modelo,'vinculo',cv.vinculo,'encerrado_em',cv.encerrado_em,'arquivado_em',v.arquivado_em)
    order by cv.encerrado_em nulls first,v.modelo,v.id),'[]') into veiculos
  from public.clientes_veiculos cv join public.veiculos v on v.oficina_id=cv.oficina_id and v.id=cv.veiculo_id
  where cv.oficina_id=p_oficina and cv.cliente_id=p_cliente;

  with filtrados as (
    select a.* from private.atendimentos_cliente a where a.oficina_id=p_oficina and a.cliente_id=p_cliente
      and ((a.tipo='os' and permite_os) or (a.tipo='nota' and permite_notas))
      and (p_filtro='todos' or (p_filtro='concluidos' and a.concluido) or (p_filtro='cancelados' and a.situacao='cancelled')
        or (p_filtro='andamento' and not a.concluido and a.situacao<>'cancelled'))
  ), pagina as (select * from filtrados order by data desc,id desc limit 20 offset p_pagina*20)
  select (select count(*) from filtrados),coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'tipo',a.tipo,'numero',a.numero,'situacao',a.situacao,'data',a.data,
    'total_centavos',a.total_centavos,'veiculo',a.dados_veiculo,'resumo',a.resumo,
    'itens',case when a.tipo='os' then (select coalesce(jsonb_agg(jsonb_build_object(
      'descricao',i.descricao,'tipo',i.tipo,'quantidade',i.quantidade,'unidade',i.unidade,
      'total_centavos',i.total_item_centavos,'situacao',i.situacao) order by i.posicao),'[]')
      from public.itens_ordem_servico i where i.oficina_id=p_oficina and i.ordem_servico_id=a.id and i.removido_em is null and i.situacao<>'cancelled')
    else (select coalesce(jsonb_agg(jsonb_build_object('descricao',i.descricao,'tipo',i.tipo,'quantidade',i.quantidade,
      'unidade',i.unidade,'total_centavos',i.total_item_centavos,'situacao',case when a.concluido then 'done' else 'pending' end) order by i.posicao),'[]')
      from public.itens_nota_atendimento i where i.oficina_id=p_oficina and i.nota_id=a.id) end
  ) order by a.data desc,a.id desc),'[]') into quantidade,historico from pagina a;

  return jsonb_build_object('cliente',to_jsonb(c),'resumo',resumo,'financeiro',financeiro,'veiculos',veiculos,
    'historico',jsonb_build_object('itens',historico,'total',quantidade),
    'recursos',jsonb_build_object('ordens',permite_os,'notinhas',permite_notas));
end $$;
revoke all on function public.consultar_ficha_cliente(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.consultar_ficha_cliente(uuid,uuid,integer,text) to authenticated;
notify pgrst,'reload schema';
commit;
