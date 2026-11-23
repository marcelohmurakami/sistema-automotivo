import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
process.env.DB_VALIDATION_RUNTIME=resolve('node_modules/@electric-sql/pglite/dist/index.js');
process.env.DB_VALIDATION_MIGRATION_LIMIT='99999999999999';
const {criarCenarioSubsistemas}=await import('./subsistemas-fixture.mjs');
const {db,registros,ids,login}=await criarCenarioSubsistemas();
const root=process.env.QA_OUTPUT||'output/timeouts-concorrencia-26-20261116',resultados=[],tempos=[];
const antigo=await readFile('output/timeouts-concorrencia-26-20261116/consultas-originais.sql','utf8');
const novo=(await readFile('supabase/migrations/20261116201751_reduzir_planejamento_consultas_concorrentes.sql','utf8')).replace(/^begin;$/m,'').replace(/^commit;$/m,'');
const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
try{
 for(const [perfil,r] of Object.entries(registros)){
  await db.exec('reset role; begin');
  const executar=async(sql)=>{await db.exec('reset role');await db.exec(sql);await login(ids[perfil]);return {acesso:await one('select public.consultar_meu_acesso()'),alertas:await one('select public.consultar_alertas($1)',[r.w]),detalhes:r.atendimento?await one('select public.consultar_detalhes_atendimento($1,$2)',[r.w,r.atendimento]):null}};
  assert.deepEqual(await executar(antigo),await executar(novo));
  await assert.rejects(()=>one('select public.consultar_alertas($1)',[Object.values(registros).find(x=>x.w!==r.w).w]),e=>e.code==='42501');
  // O erro intencional abortou somente a transação isolada.
  await db.exec('rollback');await db.exec('reset role');await db.exec(novo);await login(ids[perfil]);
  // Valida assinatura e MFA pela mesma API pública usada pela aplicação,
  // sem depender da configuração de acesso direto ao schema interno.
  const temOrdens=async()=> (await one('select public.consultar_meu_acesso()')).find(x=>x.id===r.w)?.recursos.includes('work_orders')??false;
  assert.equal(await temOrdens(),true);
  await db.exec('reset role');await db.query("update public.assinaturas_oficina set valido_ate=now()-interval '1 minute' where oficina_id=$1",[r.w]);await login(ids[perfil]);
  assert.equal(await temOrdens(),false);
  await db.exec('reset role');await db.query('update public.assinaturas_oficina set valido_ate=null where oficina_id=$1',[r.w]);
  await db.query("insert into auth.mfa_factors(user_id,status) values($1,'verified')",[ids[perfil]]);await login(ids[perfil]);
  assert.equal(await temOrdens(),false);await one("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({aal:'aal2'})]);assert.equal(await temOrdens(),true);
  await one("select set_config('request.jwt.claims','',false)");await db.exec('reset role');await db.query('delete from auth.mfa_factors where user_id=$1',[ids[perfil]]);
  resultados.push({perfil,checks:5,ok:true});console.log('PASS',perfil);
 }
 const [perfil,r]=Object.entries(registros)[0];
 for(const [versao,sql] of [['antes',antigo],['depois',novo],['antes',antigo],['depois',novo]]){
  await db.exec('reset role');await db.exec(sql);await login(ids[perfil]);const medidas=[];
  for(let i=0;i<100;i++){const t=performance.now();await one('select public.consultar_meu_acesso()');medidas.push(performance.now()-t)}
  tempos.push({versao,operacoes:100,totalMs:medidas.reduce((a,b)=>a+b,0),p95Ms:medidas.sort((a,b)=>a-b)[94]});console.log(tempos.at(-1));
 }
}catch(e){console.error(e.message,e.code,e.where);process.exitCode=1}finally{await db.close();await mkdir(root,{recursive:true});await writeFile(root+'/validacao-consultas.json',JSON.stringify({ok:!process.exitCode,resultados,tempos},null,2))}
