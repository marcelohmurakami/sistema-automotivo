begin;
-- Read-only drilldown: the same recognition rules used by consultar_financeiro.
-- Privileged access stays private; the public entry point is SECURITY INVOKER.
create function private.detalhar_indicador_financeiro(
 p_oficina uuid,p_indicador text,p_inicio date,p_fim date,p_busca text default '',
 p_categoria text default '',p_conta text default '',p_pagina integer default 0,
 p_filtrar_vencimento boolean default false
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb; saldos jsonb;begin
 perform private.conferir_operacao(p_oficina,'consultar_financeiro');
 perform private.exigir_financeiro(p_oficina);
 if p_indicador is null or p_indicador not in ('resultado','receitas','custos','entradas','saidas','saldo','receber','pagar') then
  raise exception 'Escolha uma consulta financeira válida.' using errcode='22023';end if;
 if p_inicio is null or p_fim is null or p_inicio>p_fim or p_fim-p_inicio>366 or p_pagina is null or p_pagina<0 or p_pagina>1000000 then
  raise exception 'Selecione um período de até 367 dias e uma página válida.' using errcode='22023';end if;
 with base as materialized (
  select 'titulo:'||t.id id,t.competencia data,case when t.natureza='receber' then 'receita' else 'despesa' end tipo,
   t.descricao,t.pessoa,t.categoria,null::text conta,
   (t.valor_centavos*case when p_indicador='resultado' and t.natureza='pagar' then -1 else 1 end)::bigint valor,
   jsonb_build_object('titulo_id',t.id,'ordem_servico_id',t.ordem_servico_id,'observacao',t.observacoes,'vencimento',t.vencimento,'competencia',t.competencia,'valor_original',t.valor_centavos,'custos_revisados',t.custos_revisados) dados
  from public.titulos_financeiros t
  where p_indicador in ('resultado','receitas','custos') and t.oficina_id=p_oficina and t.cancelado_em is null
   and t.competencia between p_inicio and p_fim and (
    (p_indicador in ('resultado','receitas') and t.natureza='receber' and not t.provisorio and t.categoria in ('servicos','outras_receitas')) or
    (p_indicador in ('resultado','custos') and t.natureza='pagar' and t.categoria not in ('compra_estoque','retirada','saldo_inicial','transferencia')))
  union all
  select 'estoque:'||m.id,(m.criado_em at time zone 'America/Sao_Paulo')::date,'estoque',
   coalesce(c.descricao,'Consumo de estoque'),coalesce(o.dados_cliente->>'nome',''),'estoque_consumido',null,
   (round(-m.quantidade*m.custo_centavos)*case when p_indicador='resultado' then -1 else 1 end)::bigint,
   jsonb_build_object('ordem_servico_id',m.ordem_servico_id,'numero_os',o.numero,'observacao',m.motivo,'quantidade',-m.quantidade,'custo_unitario',m.custo_centavos,'estorno',m.estorno_de is not null)
  from public.movimentacoes_estoque m
  left join public.itens_catalogo c on c.id=m.item_catalogo_id and c.oficina_id=m.oficina_id
  left join public.ordens_servico o on o.id=m.ordem_servico_id and o.oficina_id=m.oficina_id
  where p_indicador in ('resultado','custos') and m.oficina_id=p_oficina and m.ordem_servico_id is not null
   and m.criado_em >= (p_inicio::timestamp at time zone 'America/Sao_Paulo')
   and m.criado_em < ((p_fim+1)::timestamp at time zone 'America/Sao_Paulo')
  union all
  select 'taxa:'||b.id,b.data,'taxa',t.descricao,t.pessoa,'taxas',b.conta,
   (b.taxa_centavos*case when b.estorno_de is null then 1 else -1 end*case when p_indicador='resultado' then -1 else 1 end)::bigint,
   jsonb_build_object('titulo_id',t.id,'ordem_servico_id',t.ordem_servico_id,'forma',b.forma,'observacao',b.observacao,'estorno',b.estorno_de is not null,'bruto',b.valor_centavos,'taxa',b.taxa_centavos)
  from public.baixas_financeiras b join public.titulos_financeiros t on t.id=b.titulo_id and t.oficina_id=b.oficina_id
  where p_indicador in ('resultado','custos') and b.oficina_id=p_oficina and b.data between p_inicio and p_fim and b.taxa_centavos<>0
  union all
  select 'baixa:'||b.id,b.data,case when t.natureza='receber' then 'entrada' else 'saida' end,t.descricao,t.pessoa,t.categoria,b.conta,
   ((case when t.natureza='receber' then b.valor_centavos-b.taxa_centavos else b.valor_centavos end)
    *case when b.estorno_de is null then 1 else -1 end
    *case when p_indicador='saldo' and t.natureza='pagar' then -1 else 1 end)::bigint,
   jsonb_build_object('titulo_id',t.id,'ordem_servico_id',t.ordem_servico_id,'forma',b.forma,'observacao',b.observacao,'estorno',b.estorno_de is not null,'bruto',b.valor_centavos,'taxa',b.taxa_centavos,'competencia',t.competencia,'vencimento',t.vencimento)
  from public.baixas_financeiras b join public.titulos_financeiros t on t.id=b.titulo_id and t.oficina_id=b.oficina_id
  where p_indicador in ('saldo','entradas','saidas') and b.oficina_id=p_oficina and b.data between p_inicio and p_fim
   and (p_indicador='saldo' or t.categoria<>'transferencia')
   and (p_indicador='saldo' or t.natureza=case when p_indicador='entradas' then 'receber' else 'pagar' end)
   and (coalesce(p_conta,'')='' or b.conta=p_conta)
  union all
  select 'pendente:'||t.id,t.vencimento,t.natureza,t.descricao,t.pessoa,t.categoria,null,t.aberto_centavos,
   jsonb_build_object('titulo_id',t.id,'ordem_servico_id',t.ordem_servico_id,'observacao',t.observacoes,'competencia',t.competencia,'vencimento',t.vencimento,'valor_original',t.valor_centavos,'pago',t.baixado_centavos)
  from private.financeiro_saldos t where p_indicador in ('receber','pagar') and t.oficina_id=p_oficina
   and t.natureza=p_indicador and t.cancelado_em is null and t.aberto_centavos>0
   and (not coalesce(p_filtrar_vencimento,false) or t.vencimento between p_inicio and p_fim)
 ), filtrados as materialized (
  select * from base where (coalesce(p_busca,'')='' or concat(descricao,' ',pessoa,' ',dados->>'observacao') ilike '%'||left(p_busca,120)||'%')
   and (coalesce(p_categoria,'')='' or categoria=p_categoria)
 ), pagina as (select * from filtrados order by data desc,id limit 30 offset p_pagina*30)
 select jsonb_build_object(
  'total_centavos',coalesce((select sum(valor) from base),0),'filtrado_centavos',coalesce((select sum(valor) from filtrados),0),
  'quantidade',(select count(*) from filtrados),'quantidade_total',(select count(*) from base),
  'composicao',(select coalesce(jsonb_agg(to_jsonb(x) order by x.tipo),'[]') from (select tipo,sum(valor)::bigint valor,count(*) quantidade from base group by tipo)x),
  'categorias',(select coalesce(jsonb_agg(categoria order by categoria),'[]') from (select distinct categoria from base)x),
  'itens',(select coalesce(jsonb_agg(to_jsonb(x) order by x.data desc,x.id),'[]') from pagina x)
 ) into r;
 if p_indicador='saldo' then
  select jsonb_build_object('atual',coalesce(sum(v.valor),0),
   'anterior',coalesce(sum(v.valor) filter(where v.data<p_inicio),0),
   'final',coalesce(sum(v.valor) filter(where v.data<=p_fim),0)) into saldos
  from (select b.data,(case when b.estorno_de is null then 1 else -1 end)*
   (case when t.natureza='receber' then b.valor_centavos-b.taxa_centavos else -b.valor_centavos end) valor
   from public.baixas_financeiras b join public.titulos_financeiros t on t.id=b.titulo_id and t.oficina_id=b.oficina_id
   where b.oficina_id=p_oficina and (coalesce(p_conta,'')='' or b.conta=p_conta))v;
  r:=r||jsonb_build_object('saldos',saldos);
 end if;
 return r;
end $$;
revoke all on function private.detalhar_indicador_financeiro(uuid,text,date,date,text,text,text,integer,boolean) from public,anon;
grant execute on function private.detalhar_indicador_financeiro(uuid,text,date,date,text,text,text,integer,boolean) to authenticated;
create function public.consultar_detalhe_financeiro(
 p_oficina uuid,p_indicador text,p_inicio date,p_fim date,p_busca text default '',
 p_categoria text default '',p_conta text default '',p_pagina integer default 0,p_filtrar_vencimento boolean default false
) returns jsonb language sql stable security invoker set search_path='' as $$
 select private.detalhar_indicador_financeiro(p_oficina,p_indicador,p_inicio,p_fim,p_busca,p_categoria,p_conta,p_pagina,p_filtrar_vencimento);
$$;
revoke all on function public.consultar_detalhe_financeiro(uuid,text,date,date,text,text,text,integer,boolean) from public,anon;
grant execute on function public.consultar_detalhe_financeiro(uuid,text,date,date,text,text,text,integer,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
