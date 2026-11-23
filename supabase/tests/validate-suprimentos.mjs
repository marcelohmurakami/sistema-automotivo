import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {criarCenarioSubsistemas} from './subsistemas-fixture.mjs';
process.env.DB_VALIDATION_RUNTIME ||= resolve('node_modules/@electric-sql/pglite/dist/index.js');
process.env.DB_VALIDATION_MIGRATION_LIMIT ||= '20261029001100';
const {db,ids,registros,login}=await criarCenarioSubsistemas();let n=0;const casos=[];
const one=async(sql,a=[])=>Object.values((await db.query(sql,a)).rows[0])[0];
const call=(fn,a)=>one(`select public.${fn}(${a.map((_,i)=>'$'+(i+1)).join(',')})`,a.map((v,i)=>fn==='reservar_estoque_atendimento'&&i===6?'{'+v.join(',')+'}':v&&typeof v==='object'?JSON.stringify(v):v));
const ok=(v,msg)=>{assert.ok(v,msg);n++};
const fail=async(fn,msg)=>{await assert.rejects(fn);n++;};
try {
for(const [perfil,r] of Object.entries(registros)) {
 const inicio=n,{w,produto,hoje}=r;await login(ids[perfil]);
 const estoque=()=>call('listar_estoque',[w]);const prod=async()=> (await estoque()).itens.find(p=>p.id===produto);
 let doc=r.atendimento,ramo='atendimento';
 if(!doc){ramo='os';const x=await call('salvar_ordem_servico',[w,{cliente_id:r.cliente,veiculo_id:r.objeto},uuid()]);doc=x.id;await call('adicionar_peca_estoque_os',[w,doc,produto,2,x.revisao]);}
 let reservas=await call('consultar_reservas_atendimento',[w,doc,ramo]);let item=reservas.itens[0];
 ok(item?.produto_id===produto,perfil+' material identificado');
 await call('reservar_estoque_atendimento',[w,doc,ramo,item.item_id,item.quantidade,reservas.revisao]);
 ok((await prod()).reservado===item.quantidade,perfil+' reserva física');
 await fail(async()=>call('movimentar_estoque',[w,produto,'saida',10,'Consumo concorrente',uuid(),(await prod()).revisao]),'protege saldo reservado');
 ok((await prod()).saldo===10,'rollback saldo');
 await fail(()=>call('reservar_estoque_atendimento',[w,doc,ramo,item.item_id,1,reservas.revisao]),'conflito de revisão reserva');
 reservas=await call('consultar_reservas_atendimento',[w,doc,ramo]);item=reservas.itens[0];
 await call('reservar_estoque_atendimento',[w,doc,ramo,item.item_id,0,reservas.revisao,[],item.reserva_revisao]);ok((await prod()).reservado===0,'libera saldo');
 // Pedido: entrega parcial, recusa, devolução para reposição e repetição segura.
 const fornecedor=await call('salvar_fornecedor',[w,uuid(),{nome:'Fornecedor QA '+perfil}]);const pedido=uuid();
 const dados={fornecedor_id:fornecedor,referencia:'Pedido QA '+perfil,previsao:hoje,condicoes:'30 dias'};
 const lines=[{produto_id:produto,quantidade:5,custo_centavos:2000}];
 await call('salvar_pedido_compra',[w,pedido,dados,lines]);ok(await call('salvar_pedido_compra',[w,pedido,dados,lines])===pedido,'pedido idempotente');
 let p=await call('consultar_pedidos_compra',[w,'',0,pedido]);ok(p.itens[0].pendente===5,'pedido não recebe sozinho');
 const receber=async(tipo,q,recusado=0)=>{p=await call('consultar_pedidos_compra',[w,'',0,pedido]);const args=[w,pedido,uuid(),p.revisao,tipo,hoje,hoje,'QA-'+uuid(),[{item_id:p.itens[0].id,quantidade:q,recusado}],recusado||tipo==='devolucao'?'Avaria na entrega':''];const v=await call('receber_pedido_compra',args);ok(await call('receber_pedido_compra',args)===v,'recebimento idempotente');return v;};
 await receber('compra',2,1);p=await call('consultar_pedidos_compra',[w,'',0,pedido]);ok(p.itens[0].pendente===3&&(await prod()).saldo===12,'recusa não dá entrada');
 await fail(()=>receber('compra',4),'não recebe além do pedido');
 await receber('devolucao',1);p=await call('consultar_pedidos_compra',[w,'',0,pedido]);ok(p.itens[0].pendente===4&&(await prod()).saldo===11,'devolução reabre pendência');
 const rep=await receber('reposicao',1);p=await call('consultar_pedidos_compra',[w,'',0,pedido]);ok(p.itens[0].pendente===3&&(await prod()).saldo===12,'reposição atende pendência');
 ok(p.entregas.find(e=>e.id===rep).compra_id===null,'reposição não cobra novamente');
 await receber('compra',3);p=await call('consultar_pedidos_compra',[w,'',0,pedido]);ok(p.itens[0].pendente===0&&(await prod()).saldo===15,'conclusão integral');
 await fail(()=>receber('reposicao',1),'sem duplicar reposição');
 // Reposição automática considera reservas, consumo, prazo e pedidos já abertos.
 let e=await prod();await call('configurar_planejamento_estoque',[w,produto,e.revisao,{prazo_reposicao_dias:7,cobertura_dias:30,seguranca:20,fornecedor_id:fornecedor}]);
 let sugestao=(await call('sugerir_compras_estoque',[w,'',0,90])).itens.find(i=>i.item_catalogo_id===produto);
 ok(sugestao.sugerido===5,'segurança mínima');
 const p2=uuid();await call('salvar_pedido_compra',[w,p2,{...dados,referencia:'Reposição planejada'},lines]);
 sugestao=(await call('sugerir_compras_estoque',[w,'',0,90])).itens.find(i=>i.item_catalogo_id===produto);ok(sugestao.sugerido===0&&sugestao.em_pedidos===5,'não compra duplicado');
 await call('encerrar_pedido_compra',[w,p2,1,'Cancelamento QA']);sugestao=(await call('sugerir_compras_estoque',[w,'',0,90])).itens.find(i=>i.item_catalogo_id===produto);ok(sugestao.sugerido===5,'cancelamento libera reposição');
 // Cotação compara o mesmo escopo e preserva versões.
 const cot=uuid();await call('criar_cotacao_compra',[w,cot,'Cotação QA',lines]);const prop1=uuid();
 await call('registrar_proposta_compra',[w,cot,prop1,1,{fornecedor_id:fornecedor,previsao:hoje,validade:hoje,condicoes:'30 dias'},lines]);
 const f2=await call('salvar_fornecedor',[w,uuid(),{nome:'Fornecedor alternativo'}]);const prop2=uuid();
 await call('registrar_proposta_compra',[w,cot,prop2,2,{fornecedor_id:f2,previsao:hoje,validade:hoje,condicoes:'À vista'},[{...lines[0],custo_centavos:2100}]]);
 let c=await call('consultar_cotacoes_compra',[w,'',0,cot]);ok(c.propostas[0].total_centavos===10000&&c.propostas.length===2,'comparação por total');
 await fail(()=>call('escolher_proposta_compra',[w,cot,prop2,c.revisao,'']),'justifica maior custo');
 const eleito=await call('escolher_proposta_compra',[w,cot,prop2,c.revisao,'Entrega prioritária']);ok(await call('escolher_proposta_compra',[w,cot,prop2,c.revisao,'Entrega prioritária'])===eleito,'escolha idempotente');
 ok((await call('consultar_pedidos_compra',[w,'',0,eleito])).itens[0].custo_centavos===2100,'pedido preserva proposta');
 // Unidades individualizadas: recebimento, série repetida, saída e estorno.
 const serial=uuid();await call('salvar_produto_estoque',[w,{descricao:'Unidade rastreada QA',unidade:'un',custo_centavos:1000},serial]);
 await call('configurar_planejamento_estoque',[w,serial,1,{rastreado:true}]);
 const entrada=await call('movimentar_unidades_estoque',[w,serial,2,uuid(),'entrada',[{serie:'SERIE-A'},{serie:'SERIE-B',imei:'123456789012345'}],'Entrada QA']);
 let unidades=await call('consultar_unidades_estoque',[w,serial]);ok(unidades.total===2,'duas unidades rastreadas');
 let sp=(await estoque()).itens.find(p=>p.id===serial);
 await fail(()=>call('movimentar_unidades_estoque',[w,serial,sp.revisao,uuid(),'entrada',[{serie:'SERIE-A'}],'Duplicada QA']),'série duplicada');
 await fail(()=>call('movimentar_estoque',[w,serial,'entrada',1,'Sem série',uuid(),sp.revisao]),'entrada genérica sem série bloqueada');
 const saida=await call('movimentar_unidades_estoque',[w,serial,sp.revisao,uuid(),'saida',[unidades.itens[0].id],'Saída QA']);
 await fail(()=>call('estornar_movimentacao_estoque',[w,entrada,'Estorno impossível']),'entrada com unidade usada protegida');
 await call('estornar_movimentacao_estoque',[w,saida,'Devolução QA']);unidades=await call('consultar_unidades_estoque',[w,serial]);ok(unidades.itens.every(u=>u.estado==='estoque'),'estorno restaura unidade');
 // Reserva serializada até o consumo e a devolução, passando pelas RPCs dos atendimentos.
 if(ramo==='os') {
  let os=await call('consultar_ordem_servico',[w,doc]);await call('adicionar_peca_estoque_os',[w,doc,serial,1,os.revisao]);
 } else {
  const d=await call('consultar_detalhes_atendimento',[w,doc]);await call('salvar_itens_atendimento',[w,doc,d.atendimento.revisao,[{id:uuid(),tipo:'material',descricao:'Unidade rastreada QA',quantidade:1,unidade:'un',preco_centavos:5000,origem:'estoque',produto_id:serial}],0,0,'']);
 }
 reservas=await call('consultar_reservas_atendimento',[w,doc,ramo]);const si=reservas.itens.find(i=>i.produto_id===serial),uid=unidades.itens[0].id;
 await call('reservar_estoque_atendimento',[w,doc,ramo,si.item_id,1,reservas.revisao,[uid]]);
 unidades=await call('consultar_unidades_estoque',[w,serial]);ok(!!unidades.itens.find(u=>u.id===uid).reserva_id,'unidade separada');
 await fail(async()=>call('movimentar_unidades_estoque',[w,serial,(await estoque()).itens.find(p=>p.id===serial).revisao,uuid(),'saida',[uid],'Tentativa concorrente']),'unidade reservada não sai avulsa');
 if(ramo==='os') {
  let os=await call('consultar_ordem_servico',[w,doc]);await call('vincular_estoque_item_os',[w,doc,si.item_id,null,'cliente',os.revisao]);
  ok((await call('consultar_produto_estoque',[w,serial])).reservado===0,'origem cliente libera reserva');
  os=await call('consultar_ordem_servico',[w,doc]);await call('vincular_estoque_item_os',[w,doc,si.item_id,serial,'estoque',os.revisao]);
 } else {
  let d=await call('consultar_detalhes_atendimento',[w,doc]);await call('salvar_itens_atendimento',[w,doc,d.atendimento.revisao,d.itens,0,0,'']);
  ok((await call('consultar_produto_estoque',[w,serial])).reservado===1,'salvar mesma lista preserva reserva');
  d=await call('consultar_detalhes_atendimento',[w,doc]);await call('salvar_itens_atendimento',[w,doc,d.atendimento.revisao,d.itens.map(i=>({...i,origem:'externa',produto_id:null})),0,0,'']);
  ok((await call('consultar_produto_estoque',[w,serial])).reservado===0,'origem externa libera reserva');
  d=await call('consultar_detalhes_atendimento',[w,doc]);await call('salvar_itens_atendimento',[w,doc,d.atendimento.revisao,d.itens.map(i=>({...i,origem:'estoque',produto_id:serial})),0,0,'']);
 }
 reservas=await call('consultar_reservas_atendimento',[w,doc,ramo]);await call('reservar_estoque_atendimento',[w,doc,ramo,si.item_id,1,reservas.revisao,[uid]]);
 if(ramo==='os') {
  let os=await call('consultar_ordem_servico',[w,doc]);for(const i of os.itens){await call('salvar_item_os',[w,doc,os.revisao,{situacao:'done'},i.id]);os=await call('consultar_ordem_servico',[w,doc]);}
  for(const status of ['in_progress','quality_check','ready','delivered']){os=await call('consultar_ordem_servico',[w,doc]);await call('atualizar_mapa_ordem_servico',[w,doc,os.revisao,status,null,null,null,os.recebido_em]);}
  unidades=await call('consultar_unidades_estoque',[w,serial]);const u=unidades.itens.find(u=>u.id===uid);ok(u.estado==='utilizado'&&!u.reserva_id,'entrega consome unidade reservada');
  await call('estornar_movimentacao_estoque',[w,u.movimento_id,'Devolução da unidade QA']);
 } else {
  for(const status of ['aprovado','concluido']){const d=await call('consultar_detalhes_atendimento',[w,doc]);await call('salvar_atendimento_servico',[w,doc,{...d.atendimento,situacao:status},d.atendimento.revisao]);}
  unidades=await call('consultar_unidades_estoque',[w,serial]);ok(unidades.itens.find(u=>u.id===uid).estado==='utilizado','conclusão consome unidade');
  const d=await call('consultar_detalhes_atendimento',[w,doc]);await call('reabrir_atendimento_servico',[w,doc,d.atendimento.revisao,'Reabertura de conferência QA']);
 }
 unidades=await call('consultar_unidades_estoque',[w,serial]);ok(unidades.itens.find(u=>u.id===uid).estado==='estoque','retorno restaura identidade e saldo');
 // Cancelar a última entrega reabre exatamente o saldo recebido.
 const ultimo=await receber('compra',0,0).catch(()=>null);ok(ultimo===null,'entrega vazia bloqueada');
 const pedidoCancelavel=uuid();await call('salvar_pedido_compra',[w,pedidoCancelavel,dados,[{...lines[0],quantidade:1}]]);let pc=await call('consultar_pedidos_compra',[w,'',0,pedidoCancelavel]);const rc=uuid();
 await call('receber_pedido_compra',[w,pedidoCancelavel,rc,pc.revisao,'compra',hoje,hoje,'Cancelável-'+uuid(),[{item_id:pc.itens[0].id,quantidade:1}], '']);
 await call('cancelar_compra_estoque',[w,rc,'Conferência de cancelamento']);pc=await call('consultar_pedidos_compra',[w,'',0,pedidoCancelavel]);ok(pc.itens[0].pendente===1&&pc.entregas[0].cancelado,'cancelar compra restaura pendência');
 const ps=uuid();await call('salvar_pedido_compra',[w,ps,{...dados,referencia:'Pedido serializado'},[{produto_id:serial,quantidade:1,custo_centavos:3000}]]);let sr=await call('consultar_pedidos_compra',[w,'',0,ps]);
 await call('receber_pedido_compra',[w,ps,uuid(),sr.revisao,'compra',hoje,hoje,'S-'+uuid(),[{item_id:sr.itens[0].id,quantidade:1,unidades:[{serie:'REPOSICAO-MESMA-SERIE'}]}],'']);
 let un=(await call('consultar_unidades_estoque',[w,serial])).itens.find(x=>x.serie==='REPOSICAO-MESMA-SERIE');ok(!!un,'entrega registra série');
 sr=await call('consultar_pedidos_compra',[w,'',0,ps]);await call('receber_pedido_compra',[w,ps,uuid(),sr.revisao,'devolucao',hoje,hoje,'D-'+uuid(),[{item_id:sr.itens[0].id,quantidade:1,unidades:[un.id]}],'Unidade com defeito']);
 sr=await call('consultar_pedidos_compra',[w,'',0,ps]);await call('receber_pedido_compra',[w,ps,uuid(),sr.revisao,'reposicao',hoje,hoje,'R-'+uuid(),[{item_id:sr.itens[0].id,quantidade:1,unidades:[{serie:'REPOSICAO-MESMA-SERIE'}]}],'']);
 const reparada=(await call('consultar_unidades_estoque',[w,serial])).itens.find(x=>x.serie==='REPOSICAO-MESMA-SERIE');ok(reparada.id===un.id&&reparada.estado==='estoque','mesma série reparada retorna sem duplicar identidade');
 const historia=await call('consultar_unidades_estoque',[w,null,'',0,uid]);ok(historia.historico.some(h=>h.dados.documento_id===doc),'histórico permite rastrear atendimento');
 const dividido=uuid(),nota='NF-ENTREGAS-PARCIAIS';await call('salvar_pedido_compra',[w,dividido,{...dados,referencia:'Duas entregas da mesma nota'},[{...lines[0],quantidade:2}]]);
 for(let v=0;v<2;v++){const d=await call('consultar_pedidos_compra',[w,'',0,dividido]);await call('receber_pedido_compra',[w,dividido,uuid(),d.revisao,'compra',hoje,hoje,nota,[{item_id:d.itens[0].id,quantidade:1}],'']);}
 const divididoFinal=await call('consultar_pedidos_compra',[w,'',0,dividido]);ok(divididoFinal.itens[0].pendente===0&&divididoFinal.entregas.every(e=>e.documento===nota),'mesma nota permite entregas separadas no mesmo pedido');
 const estrangeiro=uuid();await call('salvar_pedido_compra',[w,estrangeiro,{...dados,referencia:'Outra compra'},lines]);const outro=await call('consultar_pedidos_compra',[w,'',0,estrangeiro]);
 await fail(()=>call('receber_pedido_compra',[w,estrangeiro,uuid(),outro.revisao,'compra',hoje,hoje,nota,[{item_id:outro.itens[0].id,quantidade:1}],'']),'nota não duplica em outro pedido');
 await login(ids.stranger);await fail(()=>call('consultar_pedidos_compra',[w]),'isolamento pedido');await fail(()=>call('consultar_unidades_estoque',[w,serial]),'isolamento série');await fail(()=>call('consultar_cotacoes_compra',[w]),'isolamento cotações');
 casos.push({perfil,verificacoes:n-inicio});console.log('PASS',perfil,n-inicio);
}
await mkdir('output/logistica-estoque-20261029/regressao',{recursive:true});await writeFile('output/logistica-estoque-20261029/regressao/banco.json',JSON.stringify({verificacoes:n,casos},null,2));console.log(n,'verificações aprovadas');
} catch(e){console.error(e.message,e.code,e.where||'',e.stack);process.exitCode=1;}finally{await db.close()}
