-- Dados fictícios solicitados para testar alertas. Não altera registros existentes.
-- Reexecutável: IDs/chaves estáveis; não recria contas quitadas ou testes já concluídos.
begin;
do $$
declare
 oficina uuid := '7d2e8401-b6fc-45b8-9582-e825e7c08681';
 dono uuid := 'ef17b401-a899-4a48-9452-99b34f53bf6b';
 prefixo text := '[TESTE ALERTAS 07/10]';
 hoje date := (now() at time zone 'America/Sao_Paulo')::date;
 n text; dias integer; rotulo text; id_titulo uuid; regra record; c uuid; v uuid;
 resposta jsonb; chave uuid; i integer; prazo timestamptz; etapa text; os public.ordens_servico;
begin
 if not exists(select 1 from public.membros_oficina where oficina_id=oficina and usuario_id=dono and perfil='owner' and ativo) then
   raise exception 'Oficina/proprietário divergente. Nenhum teste foi criado.';
 end if;
 perform set_config('request.jwt.claim.sub',dono::text,true);
 perform private.exigir_financeiro(oficina);
 for n in select unnest(array['pagar','receber']) loop
  foreach dias in array array[-5,-1,0,1,5,10,30,60,90] loop
   rotulo:=case when dias<0 then 'vence em '||abs(dias)||' dia(s)' when dias=0 then 'vence hoje' else 'atraso de '||dias||' dia(s)' end;
   id_titulo:=md5(prefixo||oficina::text||n||dias::text)::uuid;
   perform public.salvar_titulo_financeiro(oficina,id_titulo,jsonb_build_object(
     'natureza',n,'descricao',prefixo||' '||case n when 'pagar' then 'Despesa' else 'Receita' end||' · '||rotulo,
     'categoria',case n when 'pagar' then 'outras_despesas' else 'outras_receitas' end,
     'valor_centavos',case n when 'pagar' then 12550 else 25000 end,
     'competencia',hoje,'vencimento',hoje-dias,'pessoa','Pessoa fictícia para testes',
     'observacoes','Dado fictício criado a pedido do usuário. Pode ser usado para testar pagamento parcial, quitação e mudança de vencimento.'
   ));
  end loop;
 end loop;
 for regra in select * from (values ('Água',10,'agua_luz',15000),('Impostos',20,'impostos',45000),('Equipe',5,'pessoal',200000)) as r(nome,dia,categoria,valor) loop
   chave:=md5(prefixo||oficina::text||'recorrencia'||regra.nome)::uuid;
   if not exists(select 1 from public.contas_recorrentes where id=chave) then
    perform public.salvar_conta_recorrente(oficina,chave,jsonb_build_object('descricao',prefixo||' '||regra.nome,'natureza','pagar','categoria',regra.categoria,
      'valor_centavos',regra.valor,'dia',regra.dia,'inicio',date_trunc('month',hoje)::date,'fim',null,'ativa',true),0);
   end if;
 end loop;
 select id into c from public.clientes where oficina_id=oficina and nome=prefixo||' Cliente fictício' limit 1;
 if c is null then
  resposta:=public.salvar_cliente(oficina,jsonb_build_object('nome',prefixo||' Cliente fictício','observacoes','Cadastro fictício, sem contato real. Testes de entregas e alertas.'));
  c:=(resposta->>'id')::uuid;
 end if;
 for i in 1..4 loop
   chave:=md5(prefixo||oficina::text||'veiculo'||i::text)::uuid;
   if exists(select 1 from public.ordens_servico where oficina_id=oficina and chave_criacao=chave) then continue;end if;
   rotulo:=case i when 1 then 'Entrega em 5 dias' when 2 then 'Entrega hoje' when 3 then 'Entrega atrasada 1 dia' else 'Pronto para retirada' end;
   v:=public.cadastrar_veiculo_orcamento(oficina,c,prefixo||' '||rotulo,null);
   prazo:=case when i=4 then null else ((hoje+case i when 1 then 5 when 2 then 0 else -1 end)+time '17:00') at time zone 'America/Sao_Paulo' end;
   resposta:=public.salvar_os_com_itens(oficina,jsonb_build_object(
     'cliente_id',c,'veiculo_id',v,'queixa_cliente',prefixo||' '||rotulo,'observacoes_internas','OS fictícia para testes. Sem peças de estoque, sem contato real.',
     'entrega_prevista_em',prazo,'recebido_em',now()-interval '2 days',
     'itens',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'descricao','Serviço fictício de teste','tipo','service','unidade','serv','quantidade',1,'preco_unitario_centavos',10000,'situacao','done'))
   ),chave);
   if i=4 then
    foreach etapa in array array['in_progress','quality_check','ready'] loop
     select * into os from public.ordens_servico where id=(resposta->>'id')::uuid and oficina_id=oficina;
     perform public.atualizar_mapa_ordem_servico(oficina,os.id,os.revisao,etapa,os.etapa_id,os.local_id,os.entrega_prevista_em,os.recebido_em,null);
    end loop;
   end if;
 end loop;
end $$;
commit;
select 'Contas de teste' as tipo,count(*) as quantidade from public.titulos_financeiros where oficina_id='7d2e8401-b6fc-45b8-9582-e825e7c08681' and descricao like '[TESTE ALERTAS 07/10]%'
union all select 'Recorrências de teste',count(*) from public.contas_recorrentes where oficina_id='7d2e8401-b6fc-45b8-9582-e825e7c08681' and descricao like '[TESTE ALERTAS 07/10]%'
union all select 'Ordens de teste',count(*) from public.ordens_servico where oficina_id='7d2e8401-b6fc-45b8-9582-e825e7c08681' and queixa_cliente like '[TESTE ALERTAS 07/10]%';
