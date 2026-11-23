import assert from 'node:assert/strict';
import {randomUUID as uuid,randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {criarCenarioSubsistemas} from './subsistemas-fixture.mjs';
process.env.DB_VALIDATION_RUNTIME=resolve('node_modules/@electric-sql/pglite/dist/index.js');
process.env.DB_VALIDATION_MIGRATION_LIMIT='99999999999999';
let db;const resultados=[];
try {
 const c=await criarCenarioSubsistemas();db=c.db;
 const call=async(n,a)=>{try{return Object.values((await db.query(`select public.${n}(${a.map((_,i)=>'$'+(i+1)).join(',')})`,a)).rows[0])[0];}catch(e){e.message=n+': '+e.message;throw e;}};
 for(const [perfil,r] of Object.entries(c.registros)){
  await c.login(c.ids[perfil]);const w=r.w,checks=[];
  const cat=uuid();await call('salvar_item_catalogo',[w,cat,{tipo:'service',descricao:'Serviço com insumos QA',unidade:'un',preco_padrao_centavos:10000,custo_centavos:3000}]);
  let lista=await call('listar_catalogo_paginado',[w,'Serviço com insumos QA']);assert.equal(lista.itens[0].custo_centavos,3000);
  const busca=await call('buscar_cadastros_operacao',[w,'catalogo','Serviço com insumos QA']);assert.equal(busca[0].custo_centavos,3000);checks.push('custo padrão persistido e recuperado no catálogo e seleção');
  let id;const si=uuid(),pi=uuid();
  if(r.proposta){
    const os=await call('salvar_os_com_itens',[w,{cliente_id:r.cliente,veiculo_id:r.objeto,data_servico:r.hoje,desconto_centavos:2500,itens:[{id:si,tipo:'service',descricao:'Serviço QA',unidade:'un',quantidade:2,preco_unitario_centavos:10000,item_catalogo_id:cat,situacao:'pending'},{id:pi,tipo:'part',descricao:'Insumo externo QA',unidade:'un',quantidade:1,preco_unitario_centavos:5000,custo_unitario_previsto_centavos:1000,situacao:'pending'}]},uuid()]);id=os.id;
    assert.equal(os.itens.find(i=>i.id===si).custo_unitario_previsto_centavos,3000);
  } else {
    id=r.atendimento;let d=await call('consultar_detalhes_atendimento',[w,id]);
    await call('salvar_itens_atendimento',[w,id,d.atendimento.revisao,[{id:si,tipo:'servico',descricao:'Serviço QA',unidade:'un',quantidade:2,preco_centavos:10000,custo_centavos:3000,custo_informado:true,origem:'externa'},{id:pi,tipo:'material',descricao:'Insumo externo QA',unidade:'un',quantidade:1,preco_centavos:5000,custo_centavos:1000,custo_informado:true,origem:'externa'}],2500]);
    await assert.rejects(()=>call('consultar_lucro_documento',[w,id]),e=>e.code==='42501');
    d=await call('consultar_detalhes_atendimento',[w,id]);
    await call('salvar_atendimento_servico',[w,id,{...d.atendimento,dados:{...d.atendimento.dados,documento:'ordem'}},d.atendimento.revisao]);
    let recebida=await call('consultar_lucro_documento',[w,id]);
    assert.equal(recebida.receita,22500);assert.equal(recebida.custo,7000);assert.equal(recebida.margem,15500);assert.equal(recebida.pago,0);
    await call('salvar_custo_item_documento',[w,id,si,recebida.revisao,3500]);
    recebida=await call('consultar_lucro_documento',[w,id]);assert.equal(recebida.custo,8000);assert.equal(recebida.margem,14500);
    await call('salvar_custo_item_documento',[w,id,si,recebida.revisao,3000]);
    d=await call('consultar_detalhes_atendimento',[w,id]);
    await call('salvar_atendimento_servico',[w,id,{...d.atendimento,dados:{...d.atendimento.dados,orcamento_enviado:'sim'}},d.atendimento.revisao]);
    recebida=await call('consultar_lucro_documento',[w,id]);assert.equal(recebida.margem,15500);assert.equal(recebida.pago,0);
    const titulos=await db.query('select count(*)::int n from public.titulos_financeiros where oficina_id=$1',[w]);assert.equal(titulos.rows[0].n,0);
    await assert.rejects(()=>call('consultar_lucro_documento',[Object.values(c.registros).find(x=>x.w!==w).w,id]),e=>e.code==='42501');
    checks.push('orçamento separado de OS recebida; custos editáveis antes da autorização, sem gerar cobrança/pagamento e com isolamento');
    d=await call('consultar_detalhes_atendimento',[w,id]);await call('salvar_atendimento_servico',[w,id,{...d.atendimento,situacao:'aprovado'},d.atendimento.revisao]);
  }
  let d=await call('consultar_lucro_documento',[w,id]);
  assert.equal(d.bruto,25000);assert.equal(d.desconto,2500);assert.equal(d.receita,22500);assert.equal(d.custo,7000);assert.equal(d.margem,15500);
  assert.equal(d.itens.reduce((s,i)=>s+i.receita,0),22500);assert.equal(d.itens.find(i=>i.id===si).margem,12000);checks.push('custo por unidade × quantidade; desconto proporcional e margem por item/OS');
  await call('salvar_item_catalogo',[w,cat,{...lista.itens[0],custo_centavos:9000},lista.itens[0].revisao]);
  assert.equal((await call('consultar_lucro_documento',[w,id])).custo,7000);checks.push('alterar catálogo não reescreve o custo de OS existente');
  for(const [categoria,valor] of [['comissoes',1500],['impostos',300],['deslocamento',200]]) await call('registrar_custo_servico',[w,id,uuid(),{categoria,valor,descricao:'Despesa QA '+categoria,data:r.hoje,vencimento:r.hoje}]);
  d=await call('consultar_lucro_documento',[w,id]);assert.equal(d.custo,9000);assert.equal(d.margem,13500);checks.push('comissões, impostos e deslocamento descontados uma vez');
  await call('salvar_custo_item_documento',[w,id,si,d.revisao,4000]);let novo=await call('consultar_lucro_documento',[w,id]);assert.equal(novo.custo,11000);assert.equal(novo.receita,d.receita);assert.equal(novo.margem,11500);
  assert.equal((await call('listar_catalogo_paginado',[w,'Serviço com insumos QA'])).itens[0].custo_centavos,9000);checks.push('ajuste apenas na OS, sem alterar venda ou catálogo');
  await assert.rejects(()=>call('salvar_custo_item_documento',[w,id,si,d.revisao,5000]),e=>e.code==='PT409');checks.push('revisão antiga bloqueada');
  await call('salvar_custo_item_documento',[w,id,si,novo.revisao,0]);novo=await call('consultar_lucro_documento',[w,id]);assert.equal(novo.itens.find(i=>i.id===si).custo,0);assert.equal(novo.fontes.find(f=>f.chave==='item:'+si).pendente,false);
  await call('salvar_custo_item_documento',[w,id,si,novo.revisao,null]);novo=await call('consultar_lucro_documento',[w,id]);assert.equal(novo.itens.find(i=>i.id===si).margem,null);assert.equal(novo.fontes.find(f=>f.chave==='item:'+si).pendente,true);checks.push('zero explícito distinto de custo desconhecido');
  await call('salvar_custo_item_documento',[w,id,si,novo.revisao,4000]);
  await assert.rejects(()=>call('consultar_lucro_documento',[Object.values(c.registros).find(x=>x.w!==w).w,id]),e=>e.code==='42501');
  novo=await call('consultar_lucro_documento',[w,id]);await assert.rejects(()=>call('salvar_custo_item_documento',[w,id,uuid(),novo.revisao,100]),e=>e.code==='42501');await assert.rejects(()=>call('salvar_custo_item_documento',[w,id,si,novo.revisao,-1]),e=>e.code==='22023');checks.push('isolamento entre empresas/itens e validação de valores');
  // O encerramento abaixo prepara somente o estado do relatório; não é teste do fluxo de entrega.
  await db.exec('reset role');
  if(r.proposta){await db.query("update public.itens_ordem_servico set origem_peca='externa',situacao='done' where oficina_id=$1 and ordem_servico_id=$2",[w,id]);await db.query("update public.ordens_servico set situacao='delivered',entregue_em=now() where oficina_id=$1 and id=$2",[w,id]);}
  else await db.query("update public.atendimentos_servicos set situacao='concluido',concluido_em=now() where oficina_id=$1 and id=$2",[w,id]);
  await c.login(c.ids[perfil]);
  const cl=await call('consultar_lucro_cliente',[w,r.cliente]);assert.equal(cl.quantidade,1);assert.equal(cl.ticket_medio,22500);assert.equal(cl.lucro_medio,11500);assert.equal(cl.pendentes,1);
  const ficha=await call('consultar_ficha_cliente',[w,r.cliente]);assert.equal(ficha.resumo.ticket_medio_centavos,22500);assert(ficha.historico.itens.some(x=>x.id===id));checks.push('lucro médio e histórico na ficha em todos os ramos');
  let titulo;
  if(r.proposta){await call('preparar_financeiro_os',[w,id]);titulo=(await call('consultar_financeiro_os',[w,id])).id;}
  else titulo=await call('faturar_atendimento_servico',[w,id]);
  const baixa=await call('baixar_titulo_financeiro',[w,titulo,uuid(),5000,100,r.hoje,'caixa','pix','Recebimento parcial QA']);
  novo=await call('consultar_lucro_documento',[w,id]);assert.equal(novo.pago,5000);assert.equal(novo.aberto,17500);assert.equal(novo.receita,22500);assert.equal(novo.margem,11400);
  await call('estornar_baixa_financeira',[w,baixa,r.hoje,'Teste de estorno']);novo=await call('consultar_lucro_documento',[w,id]);assert.equal(novo.pago,0);assert.equal(novo.margem,11500);checks.push('pagamento parcial separado da venda; taxa e estorno reconciliados');
  // Movimentações fictícias para conferir custeio após consumo e devolução.
  await db.exec('reset role');
  if(r.proposta){
    await db.query("update public.itens_ordem_servico set origem_peca='estoque',produto_estoque_id=$3 where oficina_id=$1 and id=$2",[w,pi,r.produto]);
    await db.query("update public.ordens_servico set situacao='ready' where oficina_id=$1 and id=$2",[w,id]);
    await db.query("update public.ordens_servico set situacao='delivered' where oficina_id=$1 and id=$2",[w,id]);
  }else{
    await db.query("update public.itens_atendimento_servico set origem='estoque',produto_id=$3,custo_centavos=2000 where oficina_id=$1 and id=$2",[w,pi,r.produto]);
    await db.query('select private.concluir_materiais_servico($1,$2)',[w,id]);
  }
  const mov=(await db.query('select id from public.movimentacoes_estoque where oficina_id=$1 and (ordem_servico_id=$2 or atendimento_id=$2) and quantidade<0',[w,id])).rows[0].id;
  await c.login(c.ids[perfil]);novo=await call('consultar_lucro_documento',[w,id]);assert.equal(novo.custo,12000);assert.equal(novo.itens.find(x=>x.id===pi).custo,2000);
  await call('salvar_custo_item_documento',[w,id,pi,novo.revisao,2500]);novo=await call('consultar_lucro_documento',[w,id]);assert.equal(novo.custo,12500);assert.equal(novo.itens.find(x=>x.id===pi).custo,2500);
  await call('salvar_custo_item_documento',[w,id,pi,novo.revisao,null]);novo=await call('consultar_lucro_documento',[w,id]);assert.equal(novo.custo,12000);assert.equal(novo.itens.find(x=>x.id===pi).custo,2000);checks.push('estoque real substitui referência; ajuste da peça na OS sem duplicação e reversível');
  if(r.proposta)await call('estornar_movimentacao_estoque',[w,mov,'Devolução fictícia QA']);
  else await call('reabrir_atendimento_servico',[w,id,novo.revisao,'Reabertura QA para devolução']);
  await c.login(c.ids[perfil]);novo=await call('consultar_lucro_documento',[w,id]);assert.equal(novo.custo,10000);assert.equal(novo.itens.find(x=>x.id===pi).custo,0);checks.push('devolução retira custo do material sem apagar movimentações');
  await db.exec('reset role');await db.query("update public.membros_oficina set perfil='staff' where oficina_id=$1 and usuario_id=$2",[w,c.ids[perfil]]);await c.login(c.ids[perfil]);
  for(const [fn,args]of [['consultar_lucro_documento',[w,id]],['consultar_lucro_cliente',[w,r.cliente]],['salvar_custo_item_documento',[w,id,si,novo.revisao,10]]])await assert.rejects(()=>call(fn,args),e=>e.code==='42501');
  await db.exec('reset role');await db.query("update public.membros_oficina set perfil='owner' where oficina_id=$1 and usuario_id=$2",[w,c.ids[perfil]]);await c.login(c.ids[perfil]);checks.push('funcionário sem permissão não consulta lucro nem altera custos');
  if(perfil==='mecanica'){
    const q=await call('salvar_orcamento',[w,{cliente_id:r.cliente,veiculo_id:r.objeto,desconto_centavos:0,itens:[{tipo:'service',descricao:'Custo aprovado QA',unidade:'un',quantidade:1,preco_unitario_centavos:10000,custo_unitario_previsto_centavos:1500}]},uuid()]);
    const enviada=await call('emitir_orcamento',[w,q.id,q.revisao,7,randomBytes(32).toString('hex')]);await call('aprovar_orcamento_interno',[w,enviada.id,enviada.revisao,enviada.versao.id]);const convertida=await call('converter_orcamento_em_os',[w,q.id]);
    assert.equal((await call('consultar_lucro_documento',[w,convertida])).custo,1500);checks.push('custo do orçamento aprovado preservado na conversão em OS');
    const outro=await call('cadastrar_veiculo_orcamento',[w,r.cliente,'Veículo QA atalho',null]);const os=await call('salvar_os_com_itens',[w,{cliente_id:r.cliente,veiculo_id:outro,itens:[]},uuid()]);
    await call('adicionar_servico_catalogo_os',[w,os.id,os.revisao,cat]);assert.equal((await call('consultar_lucro_documento',[w,os.id])).custo,9000);checks.push('atalho de catálogo na OS também herda o custo');
  }
  resultados.push({perfil,checks});console.log('PASS',perfil,checks.length);
 }
 const pasta=process.env.QA_OUTPUT||'output/custos-itens-20261103';await mkdir(pasta,{recursive:true});await writeFile(resolve(pasta,'banco-26.json'),JSON.stringify({sucesso:true,resultados},null,2));
}catch(e){console.error('FAIL',e.message,e.code,e.where||'');process.exitCode=1;}finally{await db?.close();}
