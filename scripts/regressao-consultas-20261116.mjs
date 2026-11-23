import {spawn} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const out='output/timeouts-concorrencia-26-20261116/regressao';await mkdir(out,{recursive:true});
const nomes=['conferencia-rls','dados-seguranca','clientes-planos','alertas','alertas-contatos','excluir-todos-alertas','jornadas-subsistemas','orcamento-gestao','os-gestao','operacao-servicos','documentos-offline','produtividade-equipe'];
const resultados=[];
for(const nome of nomes){const inicio=performance.now();const arquivo='supabase/tests/validate-'+nome+'.mjs';let saida='';
 const codigo=await new Promise(resolveCodigo=>{const env={...process.env,DB_VALIDATION_RUNTIME:resolve('node_modules/@electric-sql/pglite/dist/index.js'),DB_VALIDATION_MIGRATION_LIMIT:'20261116201751'};delete env.DB_VALIDATION_PG_PORT;delete env.DB_VALIDATION_PG_DATABASE;
 const p=spawn(process.execPath,[arquivo],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});p.stdout.on('data',d=>saida+=d);p.stderr.on('data',d=>saida+=d);p.on('close',resolveCodigo);p.on('error',e=>{saida+=e.message;resolveCodigo(-1)});});
 await writeFile(out+'/'+nome+'.log',saida);resultados.push({arquivo,ok:codigo===0,segundos:(performance.now()-inicio)/1000});console.log(JSON.stringify(resultados.at(-1)));await writeFile(out+'/resultado.json',JSON.stringify({migracao:'20261116201751',resultados},null,2));}
if(resultados.some(r=>!r.ok))process.exitCode=1;
