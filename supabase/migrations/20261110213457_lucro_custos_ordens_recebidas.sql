begin;

-- Uma OS recebida pode aguardar autorização no estado 'orcamento'.
-- O tipo do documento, e não apenas a etapa, define o acesso ao custeio.
-- Mantém a view privada e as permissões existentes das funções financeiras.
create or replace view private.documentos_custeio as
 select o.oficina_id,o.id,o.cliente_id,
 coalesce(nullif(o.dados_cliente->>'nome',''),'Cliente') cliente,
 'OS #'||o.numero titulo,o.data_servico data,o.total_centavos receita,
 o.situacao,true automotivo,o.revisao
 from public.ordens_servico o where o.situacao<>'cancelled'
 union all
 select a.oficina_id,a.id,a.cliente_id,c.nome,
 'OS #'||a.numero||' · '||a.titulo,a.data_servico,a.valor_centavos,
 a.situacao,false,a.revisao
 from public.atendimentos_servicos a
 join public.clientes c on c.oficina_id=a.oficina_id and c.id=a.cliente_id
 where a.situacao<>'cancelado'
 and (a.situacao<>'orcamento' or a.dados->>'documento'='ordem');

commit;
