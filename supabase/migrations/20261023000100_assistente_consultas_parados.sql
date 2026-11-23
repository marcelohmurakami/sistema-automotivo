begin;
-- Mantém a consulta do assistente coerente com o painel e com os filtros informados.
-- Apenas substitui a leitura: não altera dados, permissões ou confirmação de ações.
create or replace function public.consultar_assistente(p_oficina uuid,p_tipo text,p_busca text default '',p_id uuid default null,p_cliente uuid default null,p_inicio date default null,p_fim date default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
<<consulta>>
declare r jsonb;auto boolean;inicio date:=coalesce(p_inicio,date_trunc('month',now() at time zone 'America/Sao_Paulo')::date);fim date:=coalesce(p_fim,(now() at time zone 'America/Sao_Paulo')::date);busca text:=private.padrao_busca(coalesce(p_busca,''));begin
 perform private.exigir_assistente(p_oficina);
 select ramo='automotivo' into auto from public.oficinas where id=p_oficina;
 if length(coalesce(p_busca,''))>200 or fim<inicio or fim>inicio+366 then raise exception 'Use uma busca curta e um período de até um ano.' using errcode='22023';end if;
 if p_tipo in ('clientes','catalogo') then
  r:=public.buscar_cadastros_operacao(p_oficina,p_tipo,coalesce(p_busca,''),p_cliente,p_id,'');
  -- Contato completo não é necessário para interpretar pedidos.
  if p_tipo='clientes' then select coalesce(jsonb_agg(x-'email'-'telefone_e164'),'[]') into r from jsonb_array_elements(r) x;end if;
 elsif p_tipo='objetos' then
  if auto then r:=public.buscar_cadastros_operacao(p_oficina,'veiculos',coalesce(p_busca,''),p_cliente,p_id,'');
  else select coalesce(jsonb_agg(x-'dados'-'oficina_id'),'[]') into r from jsonb_array_elements(public.buscar_selecao_servicos(p_oficina,'objetos',coalesce(p_busca,''),p_cliente,p_id)) x;end if;
 elsif p_tipo in ('servicos','parados') then
  if not private.has_feature(p_oficina,'work_orders') then raise exception 'Ordens de serviço indisponíveis no plano.' using errcode='42501';end if;
  if auto then
   select coalesce(jsonb_agg(to_jsonb(x)),'[]') into r from (
    select o.id,o.numero,o.cliente_id,o.veiculo_id objeto_id,o.revisao,o.situacao,o.dados_cliente->>'nome' cliente,o.dados_veiculo->>'modelo' identificacao,o.total_centavos,o.data_servico,
      (select string_agg(p.motivo||': '||coalesce(p.detalhes,''),'; ') from public.paradas_ordem_servico p where p.oficina_id=p_oficina and p.ordem_servico_id=o.id and p.encerrado_em is null) motivo
    from public.ordens_servico o where o.oficina_id=p_oficina and o.arquivado_em is null and (p_id is null or o.id=p_id) and (p_cliente is null or o.cliente_id=p_cliente)
    and private.texto_busca(o.numero::text||' '||coalesce(o.dados_cliente->>'nome','')||' '||coalesce(o.dados_veiculo->>'modelo','')) like busca
    and ((p_inicio is null and p_fim is null) or o.data_servico between consulta.inicio and consulta.fim)
    and (p_tipo<>'parados' or exists(select 1 from public.paradas_ordem_servico p where p.oficina_id=p_oficina and p.ordem_servico_id=o.id and p.encerrado_em is null))
    order by o.criado_em desc,o.id limit 30
   ) x;
  else
   select coalesce(jsonb_agg(to_jsonb(x)),'[]') into r from (
    select a.id,a.numero,a.cliente_id,a.objeto_id,a.revisao,a.situacao,c.nome cliente,o.nome identificacao,a.titulo,a.valor_centavos total_centavos,a.data_servico,coalesce(nullif(trim(a.ficha_especialidade->'campos'->>'pendencia'),''),
      nullif(nullif(trim(a.ficha_especialidade->'campos'->>'motivo_espera'),''),'Sem pendência'),
      nullif(trim(a.dados->>'motivo_parada'),''),nullif(trim(a.dados->>'motivo_espera'),''),
      case when a.situacao='orcamento' and coalesce(a.dados->>'orcamento_enviado','sim')<>'nao' then 'Aguardando aprovação do orçamento' end,'') motivo
    from public.atendimentos_servicos a join public.clientes c on c.oficina_id=a.oficina_id and c.id=a.cliente_id join public.objetos_atendimento o on o.oficina_id=a.oficina_id and o.id=a.objeto_id
    where a.oficina_id=p_oficina and (p_id is null or a.id=p_id) and (p_cliente is null or a.cliente_id=p_cliente) and (p_tipo<>'parados' or private.etapa_painel_assistencia(a.situacao,a.dados,a.ficha_especialidade) in ('parados','aprovacao'))
    and ((p_inicio is null and p_fim is null) or a.data_servico between consulta.inicio and consulta.fim)
    and private.texto_busca(a.numero::text||' '||a.titulo||' '||c.nome||' '||o.nome) like busca order by a.criado_em desc,a.id limit 30
   ) x;
  end if;
 elsif p_tipo='estoque' then
  if not private.has_feature(p_oficina,'inventory') then raise exception 'Estoque indisponível no plano.' using errcode='42501';end if;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into r from (
   select e.item_catalogo_id id,e.item_catalogo_id,c.descricao,e.codigo,e.saldo quantidade,e.minimo estoque_minimo,c.preco_padrao_centavos from public.estoque_produtos e join public.itens_catalogo c on c.oficina_id=e.oficina_id and c.id=e.item_catalogo_id
   where e.oficina_id=p_oficina and c.arquivado_em is null and (p_id is null or e.item_catalogo_id=p_id) and private.texto_busca(c.descricao||' '||coalesce(e.codigo,'')) like busca order by c.descricao,e.item_catalogo_id limit 30
  ) x;
 elsif p_tipo in ('contas','devedores','financeiro') then
  perform private.exigir_financeiro(p_oficina);
  if p_tipo='financeiro' then
   r:=jsonb_build_array(jsonb_build_object('inicio',inicio,'fim',fim,'base','Competência para receitas/despesas; data da baixa para dinheiro recebido. Contas canceladas, provisórias e transferências excluídas.',
    'receitas_centavos',(select coalesce(sum(t.valor_centavos),0) from public.titulos_financeiros t where t.oficina_id=p_oficina and t.natureza='receber' and t.categoria in ('servicos','outras_receitas') and t.cancelado_em is null and not t.provisorio and t.transferencia_id is null and t.competencia between consulta.inicio and consulta.fim),
    'despesas_centavos',(select coalesce(sum(t.valor_centavos),0) from public.titulos_financeiros t where t.oficina_id=p_oficina and t.natureza='pagar' and t.categoria not in ('transferencia','retirada','saldo_inicial') and t.cancelado_em is null and not t.provisorio and t.transferencia_id is null and t.competencia between consulta.inicio and consulta.fim),
    'recebido_centavos',(select coalesce(sum(case when b.estorno_de is null then b.valor_centavos else -b.valor_centavos end),0) from public.baixas_financeiras b join public.titulos_financeiros t on t.oficina_id=b.oficina_id and t.id=b.titulo_id where b.oficina_id=p_oficina and t.natureza='receber' and t.categoria in ('servicos','outras_receitas') and t.cancelado_em is null and not t.provisorio and t.transferencia_id is null and b.data between consulta.inicio and consulta.fim)));
  else
   with dividas as (
    select t.id,t.descricao,t.pessoa,t.vencimento,t.valor_centavos,t.baixado_centavos,t.aberto_centavos,t.revisao,
      coalesce(o.cliente_id,a.cliente_id) cliente_id,coalesce(o.id,a.id) servico_id,coalesce(o.numero,a.numero) numero,coalesce(o.data_servico,a.data_servico) data_servico,coalesce(o.dados_veiculo->>'modelo',a.titulo) identificacao,
      coalesce(c.nome,t.pessoa) cliente
    from private.financeiro_saldos t left join public.ordens_servico o on o.oficina_id=t.oficina_id and o.id=t.ordem_servico_id
    left join public.cobrancas_atendimento ca on ca.oficina_id=t.oficina_id and ca.titulo_id=t.id
    left join public.atendimentos_servicos a on a.oficina_id=ca.oficina_id and a.id=ca.atendimento_id
    left join public.clientes c on c.oficina_id=t.oficina_id and c.id=coalesce(o.cliente_id,a.cliente_id)
    where t.oficina_id=p_oficina and t.natureza='receber' and t.cancelado_em is null and not t.provisorio and t.transferencia_id is null and t.aberto_centavos>0
    and (p_id is null or t.id=p_id or o.id=p_id or a.id=p_id) and (p_cliente is null or coalesce(o.cliente_id,a.cliente_id)=p_cliente)
    and private.texto_busca(coalesce(c.nome,t.pessoa,'')||' '||t.descricao) like busca
   ), linhas as (
    select to_jsonb(d) valor,d.aberto_centavos ordem from dividas d where p_tipo='contas'
    union all
    select jsonb_build_object('cliente_id',cliente_id,'cliente',cliente,'aberto_centavos',sum(aberto_centavos),'titulos',count(*),'sem_cadastro',cliente_id is null),sum(aberto_centavos) from dividas where p_tipo='devedores' group by cliente_id,cliente,case when cliente_id is null then id end
   ) select coalesce(jsonb_agg(valor order by ordem desc),'[]') into r from (select * from linhas order by ordem desc limit 30) x;
  end if;
 elsif p_tipo='recursos' then
  if not private.has_feature(p_oficina,'work_orders') then raise exception 'Agenda indisponível no plano.' using errcode='42501';end if;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into r from (select id,nome from public.recursos_agenda where oficina_id=p_oficina and ativo and private.texto_busca(nome) like busca order by nome limit 30) x;
 elsif p_tipo='agenda' then
  if not private.has_feature(p_oficina,'work_orders') then raise exception 'Agenda indisponível no plano.' using errcode='42501';end if;
  if auto then
   select coalesce(jsonb_agg(to_jsonb(x)),'[]') into r from (select g.id,g.inicio,g.fim,g.servico,g.recurso,g.situacao,c.nome cliente from public.agenda_atendimentos g join public.clientes c on c.oficina_id=g.oficina_id and c.id=g.cliente_id where g.oficina_id=p_oficina and (g.inicio at time zone 'America/Sao_Paulo')::date between consulta.inicio and consulta.fim and g.situacao<>'cancelado' order by g.inicio limit 30) x;
  else
   select coalesce(jsonb_agg(to_jsonb(x)),'[]') into r from (select g.id,g.inicio,g.fim,g.visita,g.deslocamento_minutos,g.situacao,r.nome recurso,a.titulo,c.nome cliente from public.agenda_servicos g join public.recursos_agenda r on r.oficina_id=g.oficina_id and r.id=g.recurso_id join public.atendimentos_servicos a on a.oficina_id=g.oficina_id and a.id=g.atendimento_id join public.clientes c on c.oficina_id=a.oficina_id and c.id=a.cliente_id where g.oficina_id=p_oficina and (g.inicio at time zone 'America/Sao_Paulo')::date between consulta.inicio and consulta.fim and g.situacao<>'cancelado' order by g.inicio limit 30) x;
  end if;
 else raise exception 'Consulta não permitida.' using errcode='22023';end if;
 return jsonb_build_object('tipo',p_tipo,'linhas',r,'limite',30,'pode_haver_mais',jsonb_array_length(r)>=30,'consultado_em',now(),'inicio',case when p_tipo in ('financeiro','agenda') or (p_tipo in ('servicos','parados') and (p_inicio is not null or p_fim is not null)) then inicio end,
  'fim',case when p_tipo in ('financeiro','agenda') or (p_tipo in ('servicos','parados') and (p_inicio is not null or p_fim is not null)) then fim end,
  'base',case when p_tipo in ('servicos','parados') then case when p_inicio is not null or p_fim is not null then 'Data do serviço; situação atual.' else 'Situação atual, sem filtro por data.' end else null end);
end $$;
commit;
