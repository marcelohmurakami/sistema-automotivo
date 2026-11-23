-- Cenários fictícios de 08/10/2026 a 06/11/2026 (30 dias), em ambas as oficinas usadas nos testes.
-- Não modificar a data-base na reexecução. IDs estáveis preservam pagamentos e alterações posteriores.
begin;
do $$
declare
 alvo record; oficina uuid; dono uuid; base date:=date '2026-10-07'; fim date:=date '2026-11-06';
 prefixo text:='[TESTE 30D OUT-NOV/26]'; i integer; j integer; k integer; dia date;
 c uuid; v uuid; chave uuid; t uuid; fornecedor uuid; produto uuid; itens jsonb;
 valor bigint; nome text; categoria text; natureza text; resposta jsonb; o public.ordens_servico;
 etapa text; regra record; clientes uuid[]:='{}'; fornecedores uuid[]:='{}'; produtos uuid[]:='{}';
 modelos text[]:=array['Onix 1.0','Gol 1.6','HB20 1.0','Corolla 2.0','Civic 1.8','Fiesta 1.6','Uno 1.0','Sandero 1.6','Prisma 1.4','Palio 1.0'];
 servicos text[]:=array['Troca de óleo e filtros','Revisão de freios','Alinhamento e balanceamento','Revisão preventiva','Diagnóstico elétrico','Revisão de suspensão'];
begin
 for alvo in select * from (values
  ('7d2e8401-b6fc-45b8-9582-e825e7c08681'::uuid,'ef17b401-a899-4a48-9452-99b34f53bf6b'::uuid),
  ('01f25297-5779-41b7-8acb-e0138da4c8e8'::uuid,'59050245-8a3f-4551-a9ef-32fb7007d363'::uuid)
 ) as a(oficina_id,usuario_id) loop
  oficina:=alvo.oficina_id; dono:=alvo.usuario_id;
  if not exists(select 1 from public.membros_oficina where oficina_id=oficina and usuario_id=dono and ativo and perfil='owner') then raise exception 'Oficina/proprietário divergente';end if;
  perform set_config('request.jwt.claim.sub',dono::text,true);
  perform private.exigir_financeiro(oficina);
  clientes:='{}'; fornecedores:='{}'; produtos:='{}';
  for i in 1..15 loop
   nome:=prefixo||' Cliente '||lpad(i::text,2,'0');
   select cl.id into c from public.clientes cl where cl.oficina_id=oficina and cl.nome=prefixo||' Cliente '||lpad(i::text,2,'0') limit 1;
   if c is null then
    resposta:=public.salvar_cliente(oficina,jsonb_build_object('nome',nome,'observacoes','Pessoa fictícia, sem telefone ou e-mail real. Cenários de um mês de testes.'));
    c:=(resposta->>'id')::uuid;
   end if;
   clientes:=array_append(clientes,c);
  end loop;
  for i in 1..30 loop
   dia:=base+i;
   -- Duas despesas e uma venda de balcão por dia, independentes das OS abaixo.
   for j in 1..3 loop
    natureza:=case when j=3 then 'receber' else 'pagar' end;
    categoria:=case when j=3 then 'outras_receitas' when j=2 then 'terceiros' else (array['pecas_externas','outras_despesas','agua_luz','impostos','pessoal'])[1+(i%5)] end;
    nome:=case j when 1 then 'Despesa operacional' when 2 then 'Serviço terceirizado' else 'Venda avulsa de balcão' end;
    valor:=case j when 1 then 7500+i*825 when 2 then 15000+i*550 else 24000+i*1325 end;
    chave:=md5(prefixo||oficina::text||'conta'||i||':'||j)::uuid;
    if not exists(select 1 from public.titulos_financeiros where id=chave) then
     perform public.salvar_titulo_financeiro(oficina,chave,jsonb_build_object('descricao',prefixo||' '||nome||' '||to_char(dia,'DD/MM'),
      'natureza',natureza,'categoria',categoria,'valor_centavos',valor,'competencia',dia,'vencimento',dia,
      'pessoa',prefixo||' '||case when j=3 then 'Cliente balcão ' else 'Fornecedor ' end||i,
      'observacoes','Dado fictício. Vencimento futuro; eventuais antecipações registradas na data-base de teste.'));
     if i%5=0 and j in (1,3) then
      perform public.baixar_titulo_financeiro(oficina,chave,md5(chave::text||'parcial')::uuid,valor/3,0,base,'banco','pix','Antecipação parcial fictícia; saldo restante em aberto.');
     elsif i%7=0 and j=2 then
      perform public.baixar_titulo_financeiro(oficina,chave,md5(chave::text||'quitado')::uuid,valor,0,base,'caixa','dinheiro','Quitação antecipada fictícia: não deve aparecer no sininho.');
     end if;
    end if;
   end loop;
   chave:=md5(prefixo||oficina::text||'os'||i)::uuid;
   if not exists(select 1 from public.ordens_servico where oficina_id=oficina and chave_criacao=chave) then
    c:=clientes[1+((i-1)%15)];
    v:=public.cadastrar_veiculo_orcamento(oficina,c,prefixo||' '||modelos[1+((i-1)%10)]||' · '||lpad(i::text,2,'0'),null);
    resposta:=public.salvar_os_com_itens(oficina,jsonb_build_object('cliente_id',c,'veiculo_id',v,
      'queixa_cliente',prefixo||' '||servicos[1+((i-1)%6)]||' · '||to_char(dia,'DD/MM'),
      'observacoes_internas','OS fictícia, sem contato real. Não consome estoque: itens são serviços para permitir testes de entrega independentes.',
      'entrega_prevista_em',(dia+time '17:00') at time zone 'America/Sao_Paulo',
      'recebido_em',(base+time '09:00') at time zone 'America/Sao_Paulo',
      'itens',jsonb_build_array(
       jsonb_build_object('id',gen_random_uuid(),'descricao',servicos[1+((i-1)%6)],'tipo','service','unidade','serv','quantidade',1,'preco_unitario_centavos',20000+i*1500,'situacao',case when i%4 in (2,3) then 'done' else 'pending' end),
       jsonb_build_object('id',gen_random_uuid(),'descricao','Inspeção complementar fictícia','tipo','service','unidade','serv','quantidade',1,'preco_unitario_centavos',5000,'situacao',case when i%4 in (2,3) then 'done' else 'pending' end)
      )),chave);
    for k in 1..(i%4) loop
     etapa:=(array['in_progress','quality_check','ready'])[k];
     select * into o from public.ordens_servico where id=(resposta->>'id')::uuid;
     perform public.atualizar_mapa_ordem_servico(oficina,o.id,o.revisao,etapa,o.etapa_id,o.local_id,o.entrega_prevista_em,o.recebido_em,null);
    end loop;
    perform public.combinar_pagamento_os(oficina,(resposta->>'id')::uuid,dia);
    if i%5=0 then
     resposta:=public.consultar_financeiro_os(oficina,(resposta->>'id')::uuid);
     perform public.baixar_titulo_financeiro(oficina,(resposta->>'id')::uuid,md5(chave::text||'sinal')::uuid,5000,0,base,'banco','pix','Sinal fictício. Restante combinado para a entrega.');
    end if;
   end if;
  end loop;
  for regra in select * from (values
    ('Energia',8,'agua_luz',38000),('Internet',12,'agua_luz',12990),('Aluguel',15,'aluguel',250000),
    ('Contabilidade',18,'terceiros',45000),('Seguro',22,'outras_despesas',29000),('Folha',25,'pessoal',350000),
    ('Limpeza',28,'terceiros',35000),('Mensalidade de manutenção',31,'outras_receitas',60000)
  ) as r(nome,dia,categoria,valor) loop
   chave:=md5(prefixo||oficina::text||'recorrente'||regra.nome)::uuid;
   if not exists(select 1 from public.contas_recorrentes where id=chave) then
    perform public.salvar_conta_recorrente(oficina,chave,jsonb_build_object('descricao',prefixo||' '||regra.nome,
      'natureza',case when regra.categoria='outras_receitas' then 'receber' else 'pagar' end,
      'categoria',regra.categoria,'valor_centavos',regra.valor,'dia',regra.dia,'inicio',base+1,'fim',fim,'ativa',true),0);
   end if;
  end loop;
  for i in 1..4 loop
   fornecedor:=md5(prefixo||oficina::text||'fornecedor'||i)::uuid;
   if not exists(select 1 from public.fornecedores where id=fornecedor) then
    perform public.salvar_fornecedor(oficina,fornecedor,jsonb_build_object('nome',prefixo||' Distribuidora '||i));
   end if;
   itens:='[]';
   for j in 1..3 loop
    produto:=md5(prefixo||oficina::text||'produto'||i||':'||j)::uuid;
    if not exists(select 1 from public.itens_catalogo where id=produto) then
     perform public.salvar_produto_estoque(oficina,jsonb_build_object('descricao',prefixo||' '||(array['Filtro','Pastilha','Óleo'])[j]||' linha '||i,
       'unidade','un','custo_centavos',1000*j,'preco_padrao_centavos',2500*j),produto);
    end if;
    itens:=itens||jsonb_build_array(jsonb_build_object('produto_id',produto,'quantidade',10+i*2,'custo_centavos',1000*j));
   end loop;
   chave:=md5(prefixo||oficina::text||'compra'||i)::uuid;
   if not exists(select 1 from public.compras_estoque where id=chave) then
    perform public.registrar_compra_estoque(oficina,chave,fornecedor,base,base+i*7,'TESTE30D-'||i,
      'Compra fictícia para testes de estoque e contas a pagar.',itens,case when i=1 then 10000 else 0 end,'banco','pix');
   end if;
  end loop;
 end loop;
end $$;
commit;
select o.nome as oficina,
 (select count(*) from public.clientes c where c.oficina_id=o.id and c.nome like '[TESTE 30D OUT-NOV/26]%') clientes,
 (select count(*) from public.ordens_servico s where s.oficina_id=o.id and s.queixa_cliente like '[TESTE 30D OUT-NOV/26]%') ordens,
 (select count(*) from public.titulos_financeiros t where t.oficina_id=o.id and (
   t.descricao like '[TESTE 30D OUT-NOV/26]%' or exists(select 1 from public.ordens_servico s where s.id=t.ordem_servico_id and s.queixa_cliente like '[TESTE 30D OUT-NOV/26]%') or
   exists(select 1 from public.compras_estoque c join public.fornecedores f on f.id=c.fornecedor_id where c.id=t.compra_id and f.nome like '[TESTE 30D OUT-NOV/26]%'))) contas,
 (select count(*) from public.contas_recorrentes r where r.oficina_id=o.id and r.descricao like '[TESTE 30D OUT-NOV/26]%') recorrencias,
 (select count(*) from public.fornecedores f where f.oficina_id=o.id and f.nome like '[TESTE 30D OUT-NOV/26]%') fornecedores,
 (select count(*) from public.itens_catalogo p where p.oficina_id=o.id and p.descricao like '[TESTE 30D OUT-NOV/26]%') produtos,
 (select count(*) from public.compras_estoque c join public.fornecedores f on f.id=c.fornecedor_id where c.oficina_id=o.id and f.nome like '[TESTE 30D OUT-NOV/26]%') compras
from public.oficinas o where o.id in ('7d2e8401-b6fc-45b8-9582-e825e7c08681','01f25297-5779-41b7-8acb-e0138da4c8e8');
