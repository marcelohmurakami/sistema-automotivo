begin;
-- Agregados completos: a paginação das contas não limita os relatórios.
create function public.consultar_relatorio_financeiro(p_oficina uuid,p_inicio date,p_fim date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare atual jsonb; anterior jsonb; detalhes jsonb; inicio_anterior date; hoje date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 perform private.exigir_gestao(p_oficina,'reports');
 perform private.exigir_financeiro(p_oficina);
 if p_inicio is null or p_fim is null or p_inicio>p_fim or p_fim-p_inicio>366 then
   raise exception 'Escolha um período válido de até 367 dias.' using errcode='22023';
 end if;
 inicio_anterior:=p_inicio-(p_fim-p_inicio+1);
 atual:=public.consultar_financeiro(p_oficina,p_inicio,p_fim);
 anterior:=public.consultar_financeiro(p_oficina,inicio_anterior,p_inicio-1);
 with t as materialized(select * from private.financeiro_saldos where oficina_id=p_oficina),
 b as materialized(
   select x.*,t.natureza,t.categoria,case when x.estorno_de is null then 1 else -1 end sinal
   from public.baixas_financeiras x join t on t.id=x.titulo_id where x.oficina_id=p_oficina
 ),
 lancamentos as materialized(
   select competencia data,natureza,categoria,valor_centavos valor from t
   where cancelado_em is null and competencia between p_inicio and p_fim
     and ((natureza='receber' and not provisorio and categoria in ('servicos','outras_receitas'))
       or (natureza='pagar' and categoria not in ('compra_estoque','retirada','saldo_inicial','transferencia')))
 ),
 custos_pecas as materialized(
   select (m.criado_em at time zone 'America/Sao_Paulo')::date data,round(-m.quantidade*m.custo_centavos)::bigint valor
   from public.movimentacoes_estoque m where m.oficina_id=p_oficina and m.ordem_servico_id is not null
   and (m.criado_em at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
 ),
 fatos as (
   select data,case when natureza='receber' then valor else 0 end receitas,case when natureza='pagar' then valor else 0 end custos,0::bigint entradas,0::bigint saidas from lancamentos
   union all select data,0,valor,0,0 from custos_pecas
   union all select data,0,sinal*taxa_centavos,
     case when natureza='receber' and categoria<>'transferencia' then sinal*(valor_centavos-taxa_centavos) else 0 end,
     case when natureza='pagar' and categoria<>'transferencia' then sinal*valor_centavos else 0 end
   from b where data between p_inicio and p_fim
 ),
 dias as (select p_inicio+generate_series(0,p_fim-p_inicio) data),
 serie as (select d.data,coalesce(sum(f.receitas),0)::bigint receitas,coalesce(sum(f.custos),0)::bigint custos,
   coalesce(sum(f.entradas),0)::bigint entradas,coalesce(sum(f.saidas),0)::bigint saidas
   from dias d left join fatos f using(data) group by d.data),
 categorias as (
   select natureza,categoria,sum(valor)::bigint valor from lancamentos group by natureza,categoria
   union all select 'pagar','pecas_estoque',coalesce(sum(valor),0)::bigint from custos_pecas
   union all select 'pagar','taxas',coalesce(sum(sinal*taxa_centavos),0)::bigint from b where data between p_inicio and p_fim
 ),
 caixa_categorias as (
   select natureza,categoria,sum(sinal*(valor_centavos-case when natureza='receber' then taxa_centavos else 0 end))::bigint valor
   from b where data between p_inicio and p_fim and categoria<>'transferencia' group by natureza,categoria
 ),
 formas as (
   select forma,sum(sinal*valor_centavos)::bigint bruto,sum(sinal*taxa_centavos)::bigint taxas,sum(sinal*(valor_centavos-taxa_centavos))::bigint liquido
   from b where natureza='receber' and categoria<>'transferencia' and data between p_inicio and p_fim group by forma
 ),
 abertos as materialized(select * from t where cancelado_em is null and aberto_centavos>0),
 faixas as (select generate_series(0,5) faixa),
 vencimentos as (
   select f.faixa,coalesce(sum(a.aberto_centavos) filter(where a.natureza='receber'),0)::bigint receber,
     coalesce(sum(a.aberto_centavos) filter(where a.natureza='pagar'),0)::bigint pagar,count(a.id)::integer quantidade
   from faixas f left join abertos a on f.faixa=case when a.vencimento<hoje then 0 when a.vencimento=hoje then 1
     when a.vencimento<=hoje+7 then 2 when a.vencimento<=hoje+15 then 3 when a.vencimento<=hoje+30 then 4 else 5 end group by f.faixa
 ),
 atrasos as (
   select f.faixa,coalesce(sum(a.aberto_centavos) filter(where a.natureza='receber'),0)::bigint receber,
     coalesce(sum(a.aberto_centavos) filter(where a.natureza='pagar'),0)::bigint pagar
   from generate_series(0,3) f(faixa) left join abertos a on a.vencimento<hoje and f.faixa=
     case when hoje-a.vencimento<=7 then 0 when hoje-a.vencimento<=30 then 1 when hoje-a.vencimento<=60 then 2 else 3 end group by f.faixa
 ),
 pendencias as (
   select id,descricao,pessoa,natureza,vencimento,aberto_centavos,valor_variavel,valor_confirmado_em,
     row_number() over(partition by natureza order by vencimento,aberto_centavos desc,id) posicao
   from abertos where vencimento<=hoje+30
 )
 select jsonb_build_object(
   'serie',coalesce((select jsonb_agg(to_jsonb(s) order by data) from serie s),'[]'::jsonb),
   'categorias',coalesce((select jsonb_agg(to_jsonb(c) order by natureza,valor desc,categoria) from categorias c where valor<>0),'[]'::jsonb),
   'caixa_categorias',coalesce((select jsonb_agg(to_jsonb(c) order by natureza,valor desc,categoria) from caixa_categorias c where valor<>0),'[]'::jsonb),
   'formas',coalesce((select jsonb_agg(to_jsonb(f) order by liquido desc,forma) from formas f),'[]'::jsonb),
   'vencimentos',(select jsonb_agg(to_jsonb(v) order by faixa) from vencimentos v),
   'atrasos',(select jsonb_agg(to_jsonb(v) order by faixa) from atrasos v),
   'pendencias',coalesce((select jsonb_agg(to_jsonb(p)-'posicao' order by natureza,posicao) from pendencias p where posicao<=8),'[]'::jsonb),
   'saldo_inicial',coalesce((select sum(sinal*case when natureza='receber' then valor_centavos-taxa_centavos else -valor_centavos end) from b where data<p_inicio),0),
   'saldo_final',coalesce((select sum(sinal*case when natureza='receber' then valor_centavos-taxa_centavos else -valor_centavos end) from b where data<=p_fim),0),
   'variaveis_pendentes',(select count(*) from t where cancelado_em is null and valor_variavel and valor_confirmado_em is null and (competencia between p_inicio and p_fim or aberto_centavos>0)),
   'data_referencia',hoje
 ) into detalhes;
 return detalhes||jsonb_build_object('resumo',atual->'resumo','contas',atual->'contas','anterior',anterior->'resumo','inicio_anterior',inicio_anterior,'fim_anterior',p_inicio-1);
end $$;
revoke all on function public.consultar_relatorio_financeiro(uuid,date,date) from public,anon;
grant execute on function public.consultar_relatorio_financeiro(uuid,date,date) to authenticated;
notify pgrst,'reload schema';
commit;
