import {spawn} from 'node:child_process';import {mkdir,readFile,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';
const raiz=resolve('output/gestao-operacao-velocidade-20261118');
while(true){const a=JSON.parse(await readFile(resolve(raiz,'validacoes/indice.json')));if(a.some(x=>x.nome==='banco-documentos-offline'))break;await new Promise(r=>setTimeout(r,10000))}
const resultados=[];async function executar(nome,args,extra={}){const pasta=resolve(raiz,'finais',nome);await mkdir(pasta,{recursive:true});const t=performance.now();let log='';console.log('INÍCIO',nome);const codigo=await new Promise((ok,erro)=>{const p=spawn(process.execPath,args,{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,QA_OUTPUT:pasta,QA_JORNADAS_FILE:resolve(pasta,'tempos.json'),...extra}});p.stdout.on('data',b=>log+=b);p.stderr.on('data',b=>log+=b);p.on('error',erro);p.on('exit',ok)});await writeFile(resolve(pasta,'execucao.log'),log);resultados.push({nome,args,codigo,segundos:(performance.now()-t)/1000});await writeFile(resolve(raiz,'finais/indice.json'),JSON.stringify(resultados,null,2));console.log(codigo===0?'PASS':'FAIL',nome);return codigo===0}
await executar('offline-final',['scripts/bancada-documentos-offline.mjs']);
await executar('preparacao-offline',['scripts/bancada-offline-unificado.mjs'],{QA_OUTPUT:resolve(raiz,'preparacao-offline')});
await executar('laudos-final',['scripts/verificar-laudos.mjs']);
await executar('site-completo',['scripts/verificar-site-gestao-20261118.mjs']);
await executar('controlado-antes-final',['scripts/medir-gestao-controlada-20261118.mjs'],{QA_SOURCE_DIR:resolve(raiz,'antes/src'),QA_FASE:'antes-final'});
await executar('controlado-depois-final',['scripts/medir-gestao-controlada-20261118.mjs'],{QA_FASE:'depois-final'});
if(!await executar('tipos',['node_modules/typescript/bin/tsc','-b']))process.exit(1);
await executar('lint',['node_modules/eslint/bin/eslint.js',...JSON.parse(await readFile(resolve(raiz,'arquivos-alterados.json')))]);
if(!await executar('build',['node_modules/vite/bin/vite.js','build','--outDir',resolve(raiz,'build-final')]))process.exit(1);
await executar('conectado-depois',['scripts/medir-gestao-operacao-20261118.mjs'],{QA_FASE:'depois',QA_BUILD:resolve(raiz,'build-final')});
console.log('FIM',resultados.length,'etapas');process.exitCode=resultados.some(x=>x.codigo!==0)?1:0;
