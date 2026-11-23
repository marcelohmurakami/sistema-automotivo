begin;
-- Conta de um único cliente: reutiliza o saldo financeiro canônico, sem depender
-- do plano de relatórios e sem carregar contas de toda a empresa no navegador.
create function public.consultar_conta_financeira_cliente(
 p_oficina uuid,p_cliente uuid,p_pagina integer default 0,p_ids uuid[] default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare hoje date:=(now() at time zone 'America/Sao_Paulo')::date;resultado jsonb;identidade jsonb;
begin
 perform private.exigir_financeiro(p_oficina);
 perform private.conferir_operacao(p_oficina,'consultar_conta_financeira_cliente');
 perform private.conferir_operacao(p_oficina,'consultar_cliente');
 perform private.conferir_operacao(p_oficina,'consultar_ordem_servico');
 if not exists(select 1 from public.clientes where oficina_id=p_oficina and id=p_cliente) then
  raise exception 'Cliente indisponível nesta empresa.' using errcode='42501';
 end if;
 if p_pagina is null or p_pagina<0 or p_pagina>100000 or (p_ids is not null and (cardinality(p_ids)<1 or cardinality(p_ids)>500 or array_position(p_ids,null) is not null)) then
  raise exception 'Confira a página e selecione até 500 OS por documento.' using errcode='22023';
 end if;
 select identidade_documentos||jsonb_build_object('nome',nome,'telefone',telefone_e164,'endereco',endereco,'especialidade',especialidade)
 into identidade from public.oficinas where id=p_oficina;
 with documentos as materialized (
  select o.id,o.numero,o.cliente_id,'os'::text tipo,
   coalesce(o.data_servico,(o.recebido_em at time zone 'America/Sao_Paulo')::date,(o.criado_em at time zone 'America/Sao_Paulo')::date) data,
   o.situacao::text,coalesce(o.dados_veiculo->>'modelo','') veiculo,coalesce(o.dados_veiculo->>'placa','') placa
  from public.ordens_servico o where o.oficina_id=p_oficina and o.cliente_id=p_cliente and o.situacao<>'cancelled' and (p_ids is null or o.id=any(p_ids))
  union all
  select a.id,a.numero,a.cliente_id,'atendimento',a.data_servico,a.situacao,coalesce(obj.nome,a.titulo,''),''
  from public.atendimentos_servicos a left join public.objetos_atendimento obj on obj.oficina_id=a.oficina_id and obj.id=a.objeto_id
  where a.oficina_id=p_oficina and a.cliente_id=p_cliente and a.situacao<>'cancelado' and coalesce(a.dados->>'documento','ordem')='ordem' and (p_ids is null or a.id=any(p_ids))
 ), vinculos as (
  select d.id documento,t.id titulo from documentos d join public.titulos_financeiros t on t.oficina_id=p_oficina and t.ordem_servico_id=d.id where d.tipo='os'
  union
  select d.id,c.titulo_id from documentos d join public.cobrancas_atendimento c on c.oficina_id=p_oficina and c.atendimento_id=d.id where d.tipo='atendimento'
 ), saldos as materialized (
  select v.documento,sum(t.valor_centavos)::bigint total_centavos,sum(t.baixado_centavos)::bigint pago_centavos,
   sum(greatest(t.aberto_centavos,0))::bigint aberto_centavos,
   sum(case when t.vencimento<hoje then greatest(t.aberto_centavos,0) else 0 end)::bigint vencido_centavos,
   min(t.vencimento) filter(where t.aberto_centavos>0) vencimento,
   jsonb_agg(jsonb_build_object('id',t.id,'descricao',t.descricao,'vencimento',t.vencimento,'total_centavos',t.valor_centavos,'pago_centavos',t.baixado_centavos,'aberto_centavos',greatest(t.aberto_centavos,0)) order by t.vencimento,t.id) titulos
  from vinculos v join private.financeiro_saldos t on t.oficina_id=p_oficina and t.id=v.titulo
  where t.natureza='receber' and t.cancelado_em is null and t.transferencia_id is null and not t.provisorio
  group by v.documento having sum(greatest(t.aberto_centavos,0))>0
 ), elegiveis as materialized (
  select d.*,s.total_centavos,s.pago_centavos,s.aberto_centavos,s.vencido_centavos,s.vencimento,s.titulos
  from documentos d join saldos s on s.documento=d.id
 ), pagina as (
  select * from elegiveis order by data,numero,id limit case when p_ids is null then 50 else 500 end offset case when p_ids is null then p_pagina*50 else 0 end
 ), ordens as (
  select p.*,'cliente:'||p_cliente chave_cliente,c.nome cliente,coalesce(c.telefone_e164,'') telefone,
   case when p.tipo='os' then coalesce((select string_agg(i.descricao,'; ' order by i.posicao,i.id) from public.itens_ordem_servico i where i.oficina_id=p_oficina and i.ordem_servico_id=p.id and i.tipo='service' and i.situacao<>'cancelled' and i.removido_em is null),'')
   else coalesce((select string_agg(i.descricao,'; ' order by i.id) from public.itens_atendimento_servico i where i.oficina_id=p_oficina and i.atendimento_id=p.id and i.tipo='servico'),'') end servicos
  from pagina p join public.clientes c on c.oficina_id=p_oficina and c.id=p_cliente
 )
 select jsonb_build_object('consultado_em',now(),'hoje',hoje,'identidade',identidade,'total',(select count(*) from elegiveis),'ordens',coalesce((select jsonb_agg(to_jsonb(o) order by data,numero,id) from ordens o),'[]'::jsonb)) into resultado;
 return resultado;
end $$;
revoke all on function public.consultar_conta_financeira_cliente(uuid,uuid,integer,uuid[]) from public,anon;
grant execute on function public.consultar_conta_financeira_cliente(uuid,uuid,integer,uuid[]) to authenticated;
notify pgrst,'reload schema';
commit;
