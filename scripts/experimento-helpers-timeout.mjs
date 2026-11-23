import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
process.env.DB_VALIDATION_RUNTIME=resolve('node_modules/@electric-sql/pglite/dist/index.js');
process.env.DB_VALIDATION_MIGRATION_LIMIT='99999999999999';
const {criarCenarioSubsistemas}=await import('../supabase/tests/subsistemas-fixture.mjs');
const {db,registros,ids,login}=await criarCenarioSubsistemas();
const root='output/timeouts-concorrencia-26-20261116',resultados=[];
try{const [perfil,r]=Object.entries(registros)[0];await login(ids[perfil]);
 for(const versao of ['originais','experimento','originais','experimento']){
  await db.exec('reset role');await db.exec(await readFile(root+'/helpers-'+versao+'.sql','utf8'));await login(ids[perfil]);
  const tempos=[];let verificado;
  for(let i=0;i<100;i++){const t=performance.now();const q=await db.query("select private.has_feature($1,'work_orders') feature,private.segundo_fator_ok() mfa, private.acesso_area($1,'ordens',true) acesso",[r.w]);tempos.push(performance.now()-t);verificado=q.rows[0];assert.deepEqual(verificado,{feature:true,mfa:true,acesso:true})}
  resultados.push({versao,total:tempos.reduce((a,b)=>a+b,0),p95:tempos.sort((a,b)=>a-b)[94],verificado});console.log(resultados.at(-1));
 }
}finally{await db.close();await writeFile(root+'/benchmark-helpers-local.json',JSON.stringify(resultados,null,2))}
