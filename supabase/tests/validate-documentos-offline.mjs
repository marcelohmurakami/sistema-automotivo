import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {criarCenarioSubsistemas,exemplosSubsistemas} from './subsistemas-fixture.mjs';
import {novaFichaEspecialidade} from '../../src/lib/perfisAtendimento.ts';
process.env.DB_VALIDATION_MIGRATION_LIMIT='20261110115240';
process.env.DB_VALIDATION_RUNTIME ||= resolve('node_modules/@electric-sql/pglite/dist/index.js');
const {db,login,ids,registros}=await criarCenarioSubsistemas();
const call=async(n,args)=>Object.values((await db.query(`select public.${n}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args)).rows[0])[0];
const resultados=[];
try{
 for(const [perfil,r] of Object.entries(registros)){
  await login(ids[perfil]);const checks=[];
  for(const tipo of ['os','orcamento']){
   const id=uuid(),pedido={versao:1,tipo,especialidade:perfil,cliente:{id:'',nome:'Novo cliente offline '+tipo,telefone:'11999999999'},bem:{id:'',nome:exemplosSubsistemas[perfil][0]+' '+tipo,marca:'QA',placa:'',motor:''},data:'2026-11-10',titulo:'Documento completo offline',itens:[{id:uuid(),tipo:'service',descricao:exemplosSubsistemas[perfil][1],unidade:'serv',quantidade:1,preco_unitario_centavos:10000,situacao:'pending'},{id:uuid(),tipo:'part',descricao:exemplosSubsistemas[perfil][2],unidade:'un',quantidade:2,preco_unitario_centavos:5000,situacao:'pending',origem_peca:'compra_avulsa'}],desconto:{tipo:'percentual',valor:10},mostrar_desconto_nota:true,ficha:novaFichaEspecialidade(perfil),observacoes:'Conferência offline',condicoes:'Condições preservadas',forma_pagamento:'Pix',vencimento:'2026-11-10'};
   const antes=(await db.query('select count(*)::int n from public.clientes where oficina_id=$1',[r.w])).rows[0].n;
   const res=await call('sincronizar_documento_offline',[r.w,id,pedido]);assert.equal(res.total_centavos,18000);assert(res.numero);assert.equal(res.tipo,tipo);checks.push(tipo+': criação completa e total');
   assert.deepEqual(await call('sincronizar_documento_offline',[r.w,id,pedido]),res);checks.push(tipo+': repetição retorna o mesmo recibo');
   assert.equal((await db.query('select count(*)::int n from public.clientes where oficina_id=$1',[r.w])).rows[0].n,antes+1);checks.push(tipo+': cliente sem duplicação');
   await assert.rejects(()=>call('sincronizar_documento_offline',[r.w,id,{...pedido,observacoes:'Diferente'}]),e=>e.code==='PT409');checks.push(tipo+': rejeita chave com conteúdo diferente');
   const auto=!!r.proposta;
   const salvo=await call(auto?(tipo==='os'?'consultar_ordem_servico':'consultar_orcamento'):'consultar_detalhes_atendimento',[r.w,res.id]);
   assert.equal(salvo.itens.length,2);
   assert.equal(auto?(tipo==='os'?salvo.total_centavos:salvo.versao.total_centavos):salvo.atendimento.valor_centavos,18000);
   assert.equal(auto?(tipo==='os'?salvo.desconto_centavos:salvo.versao.desconto_centavos):salvo.comercial.desconto_centavos,2000);
   if(auto&&tipo==='os')assert.equal(salvo.mostrar_desconto_nota,true);
   if(!auto){assert.equal(salvo.atendimento.mostrar_desconto_nota,true);assert.equal(salvo.atendimento.dados.documento,tipo==='os'?'ordem':'orcamento');}
   checks.push(tipo+': itens, desconto e tipo no sistema');
   await login(ids.stranger);await assert.rejects(()=>call('sincronizar_documento_offline',[r.w,id,pedido]));await login(ids[perfil]);checks.push(tipo+': isolado de outra conta');
   const invalido={...pedido,itens:[{...pedido.itens[0],descricao:''}]};
   const count=(await db.query('select count(*)::int n from public.clientes where oficina_id=$1',[r.w])).rows[0].n;
   await assert.rejects(()=>call('sincronizar_documento_offline',[r.w,uuid(),invalido]));
   assert.equal((await db.query('select count(*)::int n from public.clientes where oficina_id=$1',[r.w])).rows[0].n,count);checks.push(tipo+': falha desfaz cliente e documento');
   await assert.rejects(()=>call('sincronizar_documento_offline',[r.w,uuid(),{...pedido,itens:[{...pedido.itens[0],quantidade:1.001}]}]),e=>e.code==='22023');checks.push(tipo+': quantidade inteira');
   const antesFalha=(await db.query('select count(*)::int n from public.clientes where oficina_id=$1',[r.w])).rows[0].n;
   await assert.rejects(()=>call('sincronizar_documento_offline',[r.w,uuid(),{...pedido,itens:pedido.itens.map(i=>({...i,id:uuid()})),ficha:{...pedido.ficha,campos:{campo_inexistente:'Inválido'}}}]));
   assert.equal((await db.query('select count(*)::int n from public.clientes where oficina_id=$1',[r.w])).rows[0].n,antesFalha);checks.push(tipo+': falha na ficha desfaz cadastros criados na transação');
   assert.equal(auto?(tipo==='os'?salvo.data_servico:salvo.versao.data_servico):salvo.atendimento.data_servico,pedido.data);checks.push(tipo+': data informada preservada');
   if(auto&&tipo==='os'){assert(salvo.queixa_cliente.includes(pedido.observacoes));assert(salvo.queixa_cliente.includes(pedido.condicoes));}
   else if(auto){assert.equal(salvo.versao.observacoes,pedido.observacoes);assert.equal(salvo.versao.condicoes,pedido.condicoes);}
   else{assert.equal(salvo.atendimento.dados.observacoes_cliente,pedido.observacoes);assert.equal(salvo.atendimento.dados.condicoes,pedido.condicoes);}
   checks.push(tipo+': observações e condições preservadas para reimpressão');
   const chaveExtra=uuid(),extra={...pedido,cliente:{...pedido.cliente,id:r.cliente},bem:{...pedido.bem,nome:'QA Extra '+tipo},itens:[{...pedido.itens[0],id:uuid(),custo_unitario_previsto_centavos:3000,custo_ajustado:true,grupo_servico:'Grupo QA'}],desconto:{tipo:'valor',valor:10},mostrar_desconto_nota:false};
   const er=await call('sincronizar_documento_offline',[r.w,chaveExtra,extra]);assert.equal(er.total_centavos,9000);
   const ed=await call(auto?(tipo==='os'?'consultar_ordem_servico':'consultar_orcamento'):'consultar_detalhes_atendimento',[r.w,er.id]);
   assert.equal(auto?ed.itens[0].custo_unitario_previsto_centavos:ed.itens[0].custo_centavos,3000);
   if(!auto)assert.equal(ed.itens[0].grupo_servico,'Grupo QA');checks.push(tipo+': desconto em reais, custo e grupo preservados');
  }
  resultados.push({perfil,checks});console.log('PASS',perfil,checks.length);
 }
 await login('','anon');await assert.rejects(()=>call('sincronizar_documento_offline',[Object.values(registros)[0].w,uuid(),{}]));
 await mkdir('output/offline-completo-20261110',{recursive:true});await writeFile('output/offline-completo-20261110/banco.json',JSON.stringify({ok:true,subsistemas:resultados.length,verificacoes:resultados.reduce((s,r)=>s+r.checks.length,0)+1,resultados},null,2));
}finally{await db.close();}

