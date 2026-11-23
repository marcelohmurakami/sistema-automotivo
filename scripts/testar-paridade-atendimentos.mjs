import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { criarCenarioSubsistemas } from '../supabase/tests/subsistemas-fixture.mjs';
import { novaFichaEspecialidade } from '../src/lib/perfisAtendimento.ts';
import { concluirReparo } from '../src/lib/assistenciaTecnica.ts';
import { especialidades } from '../src/lib/especialidades.ts';
process.env.DB_VALIDATION_RUNTIME=resolve('node_modules/@electric-sql/pglite/dist/index.js');
process.env.DB_VALIDATION_MIGRATION_LIMIT='20261110191114';
const root=resolve('output/paridade-subsistemas-20261110');await mkdir(root,{recursive:true});
const resultados=[];let db;
try {
 const c=await criarCenarioSubsistemas();db=c.db;
 const call=async(fn,args)=>Object.values((await db.query(`select public.${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args)).rows[0])[0];
 for(const [perfil,r] of Object.entries(c.registros)){
  if(!r.atendimento)continue;
  await c.login(c.ids[perfil]);
  const original=await call('consultar_detalhes_atendimento',[r.w,r.atendimento]);
  let ficha=novaFichaEspecialidade(perfil);
  if(especialidades[perfil].ramo==='assistencia_tecnica')ficha=concluirReparo({...original.atendimento,ficha_especialidade:ficha},perfil).ficha_especialidade;
  const dados={cliente_id:r.cliente,objeto_id:r.objeto,titulo:'QA Paridade pronto',data_servico:'2026-11-10',vencimento:'2026-11-10',situacao:'concluido',mostrar_desconto_nota:true,dados:{documento:'ordem'},ficha_especialidade:ficha};
  const itens=[{id:randomUUID(),tipo:'servico',descricao:'Serviço QA',quantidade:2,unidade:'un',preco_centavos:15000,custo_centavos:3000,custo_informado:true,origem:'externa'}];
  const id=randomUUID(),checks=[];
  assert.equal(await call('criar_atendimento_com_itens',[r.w,id,dados,itens,3000,null]),id);checks.push('Criação pronta com itens em uma transação');
  let d=await call('consultar_detalhes_atendimento',[r.w,id]);
  assert.equal(d.atendimento.situacao,'concluido');assert(d.atendimento.concluido_em);assert.equal(d.atendimento.valor_centavos,27000);assert.equal(d.itens.length,1);assert.equal(d.itens[0].custo_centavos,3000);assert.equal(d.atendimento.mostrar_desconto_nota,true);checks.push('Itens, custos, desconto, data e visibilidade preservados');
  if(especialidades[perfil].ramo==='assistencia_tecnica')assert.equal(d.atendimento.ficha_especialidade.etapa,ficha.etapa);
  assert.equal(await call('criar_atendimento_com_itens',[r.w,id,dados,itens,3000,null]),id);const repetido=await call('consultar_detalhes_atendimento',[r.w,id]);assert.equal(repetido.atendimento.revisao,d.atendimento.revisao);assert.equal(repetido.eventos.length,d.eventos.length);checks.push('Repetição não duplica OS nem eventos');
  const titulo=await call('faturar_atendimento_servico',[r.w,id]);const t=await call('consultar_titulo_alerta',[r.w,titulo]);assert.equal(t.valor_centavos,27000);assert.equal(t.baixado_centavos,0);assert.equal(t.aberto_centavos,27000);checks.push('Cobrança correta sem pagamento automático');
  assert.equal(await call('faturar_atendimento_servico',[r.w,id]),titulo);checks.push('Faturamento idempotente');
  await call('combinar_pagamento_titulo',[r.w,titulo,t.revisao,'2026-12-10']);const combinado=await call('consultar_titulo_alerta',[r.w,titulo]);assert.equal(combinado.pagamento_combinado,true);assert.equal(combinado.vencimento,'2026-12-10');assert.equal(combinado.valor_centavos,27000);assert.equal(combinado.baixado_centavos,0);assert.equal(combinado.aberto_centavos,27000);checks.push('Vencimento combinado persistido sem entrada no caixa');
  await assert.rejects(call('combinar_pagamento_titulo',[r.w,titulo,t.revisao,'2026-12-20']));checks.push('Data combinada protege contra edição desatualizada');
  const invalido=randomUUID();await assert.rejects(call('criar_atendimento_com_itens',[r.w,invalido,dados,[{...itens[0],quantidade:-1}],0,null]));await assert.rejects(call('consultar_detalhes_atendimento',[r.w,invalido]));checks.push('Erro de item reverte toda a criação');
  const semEstoque=randomUUID();await assert.rejects(call('criar_atendimento_com_itens',[r.w,semEstoque,dados,[{...itens[0],tipo:'material',origem:'estoque',produto_id:r.produto,quantidade:999999}],0,null]));await assert.rejects(call('consultar_detalhes_atendimento',[r.w,semEstoque]));checks.push('Falta de estoque não deixa OS incompleta');
  const outro=Object.values(c.registros).find(x=>x.w!==r.w);await assert.rejects(call('criar_atendimento_com_itens',[outro.w,randomUUID(),dados,itens,0,null]));checks.push('Isolamento entre empresas');
  await c.login('','anon');await assert.rejects(call('criar_atendimento_com_itens',[r.w,randomUUID(),dados,itens,0,null]));checks.push('Anônimo sem acesso');
  resultados.push({perfil,checks,ok:true});console.log('PASS',perfil,checks.length);
 }
 assert.equal(resultados.length,16);
} finally {if(db)await db.close();await writeFile(resolve(root,'banco.json'),JSON.stringify({ok:resultados.length===16,resultados},null,2));}
