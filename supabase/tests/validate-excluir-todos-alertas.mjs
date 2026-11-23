import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {criarCenarioSubsistemas} from './subsistemas-fixture.mjs';
process.env.DB_VALIDATION_RUNTIME ||= resolve('node_modules/@electric-sql/pglite/dist/index.js');
process.env.DB_VALIDATION_MIGRATION_LIMIT ||= '20261110193834';
const c=await criarCenarioSubsistemas(),db=c.db,resultados=[];
const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
try{
 for(const [perfil,r] of Object.entries(c.registros)){
  await db.exec('reset role');
  const titulo=await one("insert into public.titulos_financeiros(oficina_id,natureza,descricao,categoria,valor_centavos,competencia,vencimento) values($1,'receber','QA avisos em lote','outras_receitas',10000,current_date,current_date) returning id",[r.w]);
  const antes=await one('select to_jsonb(t) from public.titulos_financeiros t where id=$1',[titulo]);
  await c.login(c.ids[perfil]);
  const consultar=()=>one('select public.consultar_alertas($1)',[r.w]);
  let avisos=await consultar();assert(avisos.length>0);const chaves=avisos.map(a=>a.chave);
  await one('select public.marcar_alertas_lidos($1,$2)',[r.w,[chaves[0]]]);
  await assert.rejects(one('select public.excluir_alertas($1,$2)',[r.w,[...chaves,null]]));
  assert.equal((await consultar()).length,avisos.length);
  assert.equal(await one('select public.excluir_alertas($1,$2)',[r.w,[...chaves,chaves[0]]]),chaves.length);
  assert.equal((await consultar()).length,0);
  await one('select public.excluir_alertas($1,$2)',[r.w,chaves]);assert.equal((await consultar()).length,0);
  assert.equal(await one('select public.excluir_alertas($1,$2)',[r.w,[]]),0);
  const outra=Object.values(c.registros).find(x=>x.w!==r.w);await assert.rejects(one('select public.excluir_alertas($1,$2)',[outra.w,chaves]));
  await db.exec('reset role');assert.deepEqual(await one('select to_jsonb(t) from public.titulos_financeiros t where id=$1',[titulo]),antes);
  await db.query('update public.titulos_financeiros set vencimento=current_date+1 where id=$1',[titulo]);
  await c.login(c.ids[perfil]);assert((await consultar()).some(a=>a.id===titulo));
  resultados.push({perfil,avisos:chaves.length,ok:true});console.log('PASS',perfil);
 }
 const r=Object.values(c.registros)[0];
 await db.exec('reset role');
 await db.query("insert into public.membros_oficina(oficina_id,usuario_id,perfil,ativo) values($1,$2,'manager',true)",[r.w,c.ids.stranger]);
 await c.login(c.ids.stranger);assert((await one('select public.consultar_alertas($1)',[r.w])).length>0);
  await db.exec('reset role');await db.query("insert into public.restricoes_acesso(oficina_id,usuario_id,regras,autor) values($1,$2,'{\"administracao\":\"leitura\"}',$2)",[r.w,c.ids.stranger]);
 await c.login(c.ids.stranger);await assert.rejects(one('select public.excluir_alertas($1,$2)',[r.w,['teste']]));
 await c.login('','anon');await assert.rejects(one('select public.excluir_alertas($1,$2)',[r.w,['teste']]));
 await assert.rejects(one('select private.excluir_alertas($1,$2)',[r.w,['teste']]));
 console.log('PASS isolamento entre usuários, restrições e anonimato');
 assert.equal(resultados.length,26);
 await mkdir('output/excluir-avisos-20261110',{recursive:true});await writeFile('output/excluir-avisos-20261110/banco.json',JSON.stringify({ok:true,resultados},null,2));
} finally {await db.close();}
