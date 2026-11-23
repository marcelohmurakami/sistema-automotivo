import assert from 'node:assert/strict';import {randomUUID as uuid} from 'node:crypto';import {resolve} from 'node:path';import {mkdir,writeFile} from 'node:fs/promises';import {criarCenarioSubsistemas} from './subsistemas-fixture.mjs';
process.env.DB_VALIDATION_RUNTIME ||= resolve('node_modules/@electric-sql/pglite/dist/index.js');process.env.DB_VALIDATION_MIGRATION_LIMIT ||= '99999999999999';
let db;const resultados=[];try{const c=await criarCenarioSubsistemas();db=c.db;
const one=async(s,a=[])=>Object.values((await db.query(s,a)).rows[0])[0],call=(n,a)=>one(`select public.${n}(${a.map((_,i)=>'$'+(i+1)).join(',')})`,a);
for(const [perfil,r] of Object.entries(c.registros)){
 await c.login(c.ids[perfil]);const checks=[],eq=(a,b,m)=>{assert.deepEqual(a,b,perfil+': '+m);checks.push(m);};
 const no=async(fn,m)=>{await assert.rejects(fn);checks.push(m);};
 const f=await call('salvar_fornecedor',[r.w,uuid(),{nome:'Fornecedor parcelamento QA'}]);
 const produto=uuid();await call('salvar_produto_estoque',[r.w,{descricao:'Peça pagamento QA',unidade:'un',custo_centavos:10001},produto]);
 const plano={modo:'prazo',forma:'boleto',conta:'banco',data:'',parcelas:[{valor_centavos:3334,vencimento:r.hoje},{valor_centavos:3334,vencimento:'2027-01-15'},{valor_centavos:3333,vencimento:'2027-02-20'}]};
 const d={id:uuid(),fornecedor_id:f,data:r.hoje,documento:'',observacoes:'',itens:[{produto_id:produto,quantidade:1,custo_centavos:10001}],pagamento:plano};
 const save=(x)=>call('registrar_compra_com_pagamento',[r.w,x]);await save(d);
 let compra=await call('consultar_compra_estoque',[r.w,d.id]);eq(compra.titulos.map(t=>t.valor_centavos),[3334,3334,3333],'parcelas preservam todos os centavos');eq(compra.titulos.map(t=>t.vencimento),plano.parcelas.map(p=>p.vencimento),'datas individuais preservadas');eq(compra.titulos.reduce((n,t)=>n+t.baixado_centavos,0),0,'prazo não sai do caixa');
 await save(d);eq((await call('consultar_compra_estoque',[r.w,d.id])).titulos.length,3,'reenvio não duplica parcelas');
 await no(()=>save({...d,pagamento:{...plano,forma:'pix'}}),'reenvio com outra forma bloqueado');
 const lista=await call('listar_compras_estoque',[r.w,'Fornecedor parcelamento QA',0]);eq(lista.itens.length,1,'listagem não duplica compras por parcela');eq(lista.itens[0].aberto_centavos,10001,'listagem soma o saldo');
 const t=compra.titulos[2],baixa=await call('baixar_titulo_financeiro',[r.w,t.id,uuid(),3333,0,r.hoje,'banco','boleto','Parcela 3']);
 await no(()=>call('cancelar_compra_estoque',[r.w,d.id,'Cancelamento QA']),'parcela posterior paga impede cancelamento');
 await call('estornar_baixa_financeira',[r.w,baixa,r.hoje,'Estorno QA']);await call('cancelar_compra_estoque',[r.w,d.id,'Cancelamento QA']);compra=await call('consultar_compra_estoque',[r.w,d.id]);eq(compra.titulos.every(t=>!!t.cancelado_em),true,'cancelamento encerra todas as parcelas');
 const saldo=()=>one('select saldo from public.estoque_produtos where oficina_id=$1 and item_catalogo_id=$2',[r.w,produto]);eq(Number(await saldo()),0,'cancelamento reverte estoque');
 const pago={...d,id:uuid(),pagamento:{modo:'pago',forma:'pix',conta:'banco',data:r.hoje,parcelas:[{valor_centavos:10001,vencimento:r.hoje}]}};await save(pago);compra=await call('consultar_compra_estoque',[r.w,pago.id]);eq([compra.titulos[0].baixado_centavos,compra.titulos[0].aberto_centavos],[10001,0],'já pago entra no financeiro');
 const antes=Number(await saldo());await no(()=>save({...d,id:uuid(),pagamento:{...plano,parcelas:[{valor_centavos:10,vencimento:r.hoje}]}}),'soma inválida rejeitada');eq(Number(await saldo()),antes,'erro financeiro não movimenta estoque');
 await no(()=>save({...pago,id:uuid(),pagamento:{...pago.pagamento,data:'2099-01-01'}}),'pagamento futuro bloqueado');eq(Number(await saldo()),antes,'pagamento inválido reverte compra toda');
 const pedido=uuid();await call('salvar_pedido_compra',[r.w,pedido,{fornecedor_id:f,referencia:'Pedido pagamento QA'},[{produto_id:produto,quantidade:10,custo_centavos:1000}]]);let p=await call('consultar_pedidos_compra',[r.w,'',0,pedido]);
 const parc={...plano,parcelas:[{valor_centavos:3000,vencimento:r.hoje},{valor_centavos:3000,vencimento:'2027-01-15'}]},chave=uuid();const args=[r.w,pedido,chave,p.revisao,'compra',r.hoje,r.hoje,'',[{item_id:p.itens[0].id,quantidade:6,recusado:4,custo_centavos:1000}],null,'4 peças avariadas',parc];await call('receber_pedido_com_pagamento',args);await call('receber_pedido_com_pagamento',args);
 compra=await call('consultar_compra_estoque',[r.w,chave]);eq(compra.titulos.map(t=>t.valor_centavos),[3000,3000],'entrega parcial parcela somente aceitas');p=await call('consultar_pedidos_compra',[r.w,'',0,pedido]);eq(p.itens[0].pendente,4,'recusadas continuam pendentes');
 await no(()=>call('registrar_compra_com_pagamento',[Object.values(c.registros).find(x=>x.w!==r.w).w,d]),'isolamento entre empresas');
 resultados.push({perfil,checks});console.log(perfil,checks.length);
}
await mkdir('output/operacao-simplificada-20261104',{recursive:true});await writeFile('output/operacao-simplificada-20261104/compras-banco.json',JSON.stringify({ok:true,total:resultados.reduce((n,r)=>n+r.checks.length,0),resultados},null,2));
}catch(e){console.error({message:e.message,code:e.code,where:e.where,query:e.internalQuery});process.exitCode=1;}finally{await db?.close();}
