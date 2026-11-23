begin;
-- Posição atual: não restringir por competência, para não esconder dívidas antigas.
-- O saldo canônico inclui pagamentos parciais, estornos e baixas importadas.
create function public.consultar_contas_clientes(p_oficina uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare resultado jsonb; hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
 perform private.exigir_gestao(p_oficina,'reports');
 perform private.exigir_financeiro(p_oficina);
 with titulos as materialized (
   select t.* from private.financeiro_saldos t
   where t.oficina_id=p_oficina and t.natureza='receber' and t.cancelado_em is null
     and t.transferencia_id is null and not t.provisorio and t.ordem_servico_id is not null
 ), saldos as (
   select ordem_servico_id,
     sum(valor_centavos)::bigint total_centavos,
     sum(baixado_centavos)::bigint pago_centavos,
     sum(greatest(aberto_centavos,0))::bigint aberto_centavos,
     sum(case when vencimento<hoje then greatest(aberto_centavos,0) else 0 end)::bigint vencido_centavos,
     min(vencimento) filter(where aberto_centavos>0) vencimento,
     jsonb_agg(jsonb_build_object('id',id,'descricao',descricao,'vencimento',vencimento,
       'total_centavos',valor_centavos,'pago_centavos',baixado_centavos,'aberto_centavos',greatest(aberto_centavos,0))
       order by vencimento,id) titulos
   from titulos group by ordem_servico_id having sum(greatest(aberto_centavos,0))>0
 ), ordens as (
   select o.id,o.numero,o.cliente_id,
     case when o.cliente_id is not null then 'cliente:'||o.cliente_id else 'os:'||o.id end chave_cliente,
     coalesce(nullif(c.nome,''),nullif(o.dados_cliente->>'nome',''),'Cliente não informado') cliente,
     coalesce(nullif(c.telefone_e164,''),o.dados_cliente->>'telefone_e164','') telefone,
     coalesce(o.data_servico,(o.recebido_em at time zone 'America/Sao_Paulo')::date,(o.criado_em at time zone 'America/Sao_Paulo')::date) data,
     o.situacao,coalesce(o.dados_veiculo->>'modelo','') veiculo,coalesce(o.dados_veiculo->>'placa','') placa,
     coalesce((select string_agg(i.descricao,'; ' order by i.posicao,i.id)
       from public.itens_ordem_servico i where i.oficina_id=p_oficina and i.ordem_servico_id=o.id
         and i.tipo='service' and i.situacao<>'cancelled' and i.removido_em is null),'') servicos,
     s.total_centavos,s.pago_centavos,s.aberto_centavos,s.vencido_centavos,s.vencimento,s.titulos
   from public.ordens_servico o join saldos s on s.ordem_servico_id=o.id
   left join public.clientes c on c.oficina_id=p_oficina and c.id=o.cliente_id
   where o.oficina_id=p_oficina and o.situacao<>'cancelled'
 )
 select jsonb_build_object('consultado_em',now(),'hoje',hoje,
   'ordens',coalesce(jsonb_agg(to_jsonb(o) order by o.data,o.numero,o.id),'[]'::jsonb)) into resultado from ordens o;
 return resultado;
end $$;
revoke all on function public.consultar_contas_clientes(uuid) from public,anon;
grant execute on function public.consultar_contas_clientes(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
