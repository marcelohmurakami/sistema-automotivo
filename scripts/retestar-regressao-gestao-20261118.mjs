import {spawn} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const raiz=resolve('output/gestao-operacao-velocidade-20261118');
const inicial=JSON.parse(await readFile(resolve(raiz,'validacoes/regressao/suites/resultado.json')));
const retestes=[];
for(const antigo of inicial.resultados.filter(x=>!x.sucesso)){
 const pasta=resolve(raiz,'regressao-reteste',antigo.arquivo.replaceAll('/','_'));
 await mkdir(pasta,{recursive:true});let log='';const t=performance.now();
 console.log('INÍCIO',antigo.arquivo);
 const codigo=await new Promise((ok,erro)=>{
  const p=spawn(process.execPath,[antigo.arquivo],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,QA_OUTPUT:pasta,DB_VALIDATION_RUNTIME:resolve('node_modules/@electric-sql/pglite/dist/index.js'),DB_VALIDATION_MIGRATION_LIMIT:inicial.migracoes}});
  const limite=setTimeout(()=>p.kill(),1200000);
  p.stdout.on('data',b=>log+=b);p.stderr.on('data',b=>log+=b);p.on('error',erro);p.on('exit',c=>{clearTimeout(limite);ok(c)});
 });
 await writeFile(resolve(pasta,'execucao.log'),log);
 retestes.push({...antigo,codigo,sucesso:codigo===0,expirou:codigo===null,duracaoMs:Math.round(performance.now()-t),evidencia:resolve(pasta,'execucao.log')});
 await writeFile(resolve(raiz,'regressao-reteste/indice.json'),JSON.stringify(retestes,null,2));
 console.log(codigo===0?'PASS':'FAIL',antigo.arquivo);
}
const resultados=inicial.resultados.map(x=>retestes.find(y=>y.arquivo===x.arquivo)||x);
await writeFile(resolve(raiz,'regressao-consolidada.json'),JSON.stringify({...inicial,executadoEm:new Date().toISOString(),observacao:'108 suítes passaram na rodada inicial. Duas auditorias completas excederam o limite de 180 s da bancada e foram repetidas integralmente com limite de 20 min e saída isolada. Um teste histórico importava Fornecedores de Compras após a separação do módulo; a importação foi atualizada. Logs iniciais preservados.',resultados},null,2));
process.exitCode=resultados.some(x=>!x.sucesso)?1:0;
