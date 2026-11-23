import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const raiz=resolve('output/gestao-operacao-velocidade-20261118'),resultados=[];
for(const [nome,script,env] of [
 ['laudos-antes-isolado','scripts/verificar-laudos.mjs',{QA_SOURCE_DIR:resolve(raiz,'antes/src')}],
 ['laudos-depois-isolado','scripts/verificar-laudos.mjs',{}],
 ['controlado-antes-isolado','scripts/medir-gestao-controlada-20261118.mjs',{QA_SOURCE_DIR:resolve(raiz,'antes/src'),QA_FASE:'antes-isolado'}],
 ['controlado-depois-isolado','scripts/medir-gestao-controlada-20261118.mjs',{QA_FASE:'depois-isolado'}],
]){
 const pasta=resolve(raiz,nome);await mkdir(pasta,{recursive:true});let log='';const t=performance.now();console.log('INÍCIO isolado',nome);
 const codigo=await new Promise((ok,erro)=>{const p=spawn(process.execPath,[script],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,QA_OUTPUT:pasta,QA_JORNADAS_FILE:resolve(pasta,'tempos.json'),...env}});p.stdout.on('data',b=>log+=b);p.stderr.on('data',b=>log+=b);p.on('error',erro);p.on('exit',ok)});
 await writeFile(resolve(pasta,'execucao.log'),log);resultados.push({nome,codigo,segundos:(performance.now()-t)/1000});await writeFile(resolve(raiz,'tempos-isolados.json'),JSON.stringify(resultados,null,2));console.log(codigo===0?'PASS':'FAIL',nome);
 if(codigo!==0)process.exit(1);
}
