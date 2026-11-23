import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {criarCenarioSubsistemas} from './subsistemas-fixture.mjs';
process.env.DB_VALIDATION_RUNTIME=resolve('node_modules/@electric-sql/pglite/dist/index.js');
process.env.DB_VALIDATION_MIGRATION_LIMIT='99999999999999';
const out=resolve(process.env.QA_OUTPUT || 'output/agilidade-20261111'),resultados=[];let db;
try{
 const c=await criarCenarioSubsistemas();db=c.db;
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const call=(fn,args)=>one(`select public.${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);
 for(const [perfil,r] of Object.entries(c.registros)){
  await c.login(c.ids[perfil]);
  const inicio=r.hoje.slice(0,7)+'-01';
  const titulo=randomUUID();
  await call('salvar_titulo_financeiro',[r.w,titulo,{natureza:'receber',categoria:'outras_receitas',valor_centavos:18000,descricao:'QA comparação painel',competencia:r.hoje,vencimento:r.hoje}]);
  await call('baixar_titulo_financeiro',[r.w,titulo,randomUUID(),6000,100,r.hoje,'banco','credito']);
  for(const variavel of [false,true])await call('salvar_conta_recorrente',[r.w,randomUUID(),{descricao:'QA recorrência painel '+variavel,natureza:'pagar',categoria:'aluguel',valor_centavos:variavel?0:13000,valor_variavel:variavel,dia:1,inicio,ativa:true},0]);
  let checks=0;
  for(const [busca,filtro,natureza,pagina,id] of [
   ['', 'abertos','',0,null],['QA','todos','receber',0,null],['','todos','pagar',0,null],['','todos','',1,null],['','todos','',0,titulo],['','todos','',0,randomUUID()]
  ]){
   const args=[r.w,inicio,r.hoje,busca,filtro,natureza,pagina,null];
   await call('sincronizar_contas_recorrentes',[r.w]);
   const anterior=await call('consultar_financeiro',args);
   if(id){const t=await call('consultar_titulo_alerta',[r.w,id]);anterior.itens=t?[t]:[];anterior.total=t?1:0;}
   const novo=await call('consultar_painel_financeiro',[...args,id]);
   assert.deepEqual(novo,anterior,'Valores, filtros, saldos e seleção idênticos: '+perfil);
   assert.deepEqual(await call('consultar_painel_financeiro',[...args,id]),novo,'Consulta repetida sem duplicar contas');checks+=2;
  }
  const args=[r.w,inicio,r.hoje];
  await assert.rejects(()=>call('consultar_painel_financeiro',[r.w,'2020-01-01',r.hoje]),e=>e.code==='22023');checks++;
  await c.login(c.ids.stranger);await assert.rejects(()=>call('consultar_painel_financeiro',args),e=>e.code==='42501');checks++;
  await c.login(c.ids[perfil],'anon');await assert.rejects(()=>call('consultar_painel_financeiro',args),e=>e.code==='42501');checks++;
  await db.exec('reset role');
  await db.query("insert into public.membros_oficina(oficina_id,usuario_id,perfil) values($1,$2,'staff')",[r.w,c.ids.stranger]);
  await c.login(c.ids.stranger);await assert.rejects(()=>call('consultar_painel_financeiro',args),e=>e.code==='42501');checks++;
  resultados.push({perfil,ok:true,checks});console.log('PASS',perfil,checks);
 }
 await db.exec('reset role');
 assert.equal(await one("select prosecdef from pg_proc where oid='public.consultar_painel_financeiro(uuid,date,date,text,text,text,integer,uuid,uuid)'::regprocedure"),false);
 assert.equal(await one("select has_function_privilege('anon','public.consultar_painel_financeiro(uuid,date,date,text,text,text,integer,uuid,uuid)','execute')"),false);
}catch(e){console.error(e.stack,e.code,e.where);process.exitCode=1;}finally{await db?.close();await mkdir(out,{recursive:true});await writeFile(resolve(out,'banco-painel.json'),JSON.stringify({ok:!process.exitCode,checks:resultados.reduce((n,r)=>n+r.checks,0)+(!process.exitCode?2:0),resultados},null,2));}
