import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
const raiz=resolve('output/gestao-operacao-velocidade-20261118');await mkdir(resolve(raiz,'validacoes'),{recursive:true});
const resultados=[];
async function executar(nome,args,extra={}){
 const pasta=resolve(raiz,'validacoes',nome);await mkdir(pasta,{recursive:true});const inicio=performance.now();let saida='';console.log('INÍCIO',nome);
 const codigo=await new Promise((ok,erro)=>{const p=spawn(process.execPath,args,{windowsHide:true,env:{...process.env,PLAYWRIGHT_BROWSER:'C:/Program Files/Google/Chrome/Application/chrome.exe',DB_VALIDATION_RUNTIME:resolve('node_modules/@electric-sql/pglite/dist/index.js'),DB_VALIDATION_MIGRATION_LIMIT:'99999999999999',QA_OUTPUT:pasta,QA_JORNADAS_FILE:resolve(pasta,'tempos.json'),QA_SUITE_OUTPUT:resolve(pasta,'suites'),...extra},stdio:['ignore','pipe','pipe']});p.stdout.on('data',b=>saida+=b);p.stderr.on('data',b=>saida+=b);p.on('error',erro);p.on('exit',ok)});
 await writeFile(resolve(pasta,'execucao.log'),saida);resultados.push({nome,args,codigo,segundos:(performance.now()-inicio)/1000});await writeFile(resolve(raiz,'validacoes','indice.json'),JSON.stringify(resultados,null,2));console.log(codigo===0?'PASS':'FAIL',nome,(resultados.at(-1).segundos).toFixed(1)+'s');return codigo===0;
}
// Mantém os tempos da navegação inicial livres das bancadas pesadas de compilação/banco.
while(true){const a=JSON.parse(await readFile(resolve(raiz,'antes/resultados.json')));if(a.verificacoes.filter(x=>x.nome==='Sem erro JavaScript').length+a.falhas.length>=52)break;await new Promise(r=>setTimeout(r,10000))}
const fontes=[];async function procurar(p){for(const d of await readdir(p,{withFileTypes:true})){const f=resolve(p,d.name);if(d.isDirectory())await procurar(f);else if(/\.(ts|tsx)$/.test(f)){let antes;try{antes=await readFile(resolve(raiz,'antes',relative(resolve(),f)),'utf8')}catch{}if(antes!==await readFile(f,'utf8'))fontes.push(relative(resolve(),f))}}}await procurar(resolve('src'));
await writeFile(resolve(raiz,'arquivos-alterados.json'),JSON.stringify(fontes,null,2));
await executar('formatacao',['node_modules/prettier/bin/prettier.cjs','--write',...fontes]);
const tipos=await executar('tipos',['node_modules/typescript/bin/tsc','-b']);
const lint=await executar('lint',['node_modules/eslint/bin/eslint.js',...fontes]);
if(!tipos||!lint)process.exit(1);
if(!await executar('build',['node_modules/vite/bin/vite.js','build','--outDir',resolve(raiz,'build-depois')]))process.exit(1);
await executar('controlado-antes',['scripts/medir-gestao-controlada-20261118.mjs'],{QA_SOURCE_DIR:resolve(raiz,'antes/src'),QA_FASE:'antes'});
await executar('controlado-depois',['scripts/medir-gestao-controlada-20261118.mjs'],{QA_FASE:'depois'});
await executar('laudos-antes',['scripts/verificar-laudos.mjs'],{QA_SOURCE_DIR:resolve(raiz,'antes/src')});
await executar('laudos-depois',['scripts/verificar-laudos.mjs']);
await executar('agenda',['scripts/verificar-agendamento-separado.mjs']);
await executar('qualidade',['scripts/verificar-qualidade-avancada.mjs']);
await executar('garantias-auto',['scripts/verificar-garantias-auto.mjs']);
await executar('garantias-servicos',['scripts/verificar-garantias-interface.mjs']);
await executar('offline',['scripts/bancada-documentos-offline.mjs']);
await executar('regressao',['scripts/testar-tudo.mjs','--unidade']);
for(const nome of ['laudos','logistica-visitas','agendamento-livre','qualidade-operacional','qualidade-gestao','qualidade-avancada','relatorios-recorte','relatorios-operacao','relatorio-oficina','relatorio-financeiro','site-portal','documentos-offline'])await executar('banco-'+nome,['supabase/tests/validate-'+nome+'.mjs']);
console.log('FIM',resultados.length,'etapas',resultados.filter(x=>x.codigo!==0).length,'falhas');process.exitCode=resultados.some(x=>x.codigo!==0)?1:0;
