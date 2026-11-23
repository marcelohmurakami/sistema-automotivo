import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve('output/revisao-integral-20261119'),resultados=[];
for(const [nome,script] of [['relogio','verificar-relogio-componentes.mjs'],['dialogos','conferir-dialogos-desempenho.mjs'],['acesso','verificar-acesso-resiliencia.mjs'],['fotos','verificar-reabertura-fotos.mjs']]){
 for(const fase of ['antes','depois']){
  const out=resolve(root,nome+'-'+fase);await mkdir(out,{recursive:true});
  const env={...process.env,QA_OUTPUT:out};delete env.QA_SOURCE_DIR;delete env.QA_ANTES;
  if(fase==='antes')env.QA_SOURCE_DIR=resolve(root,'antes/src');
  const inicio=performance.now();let texto='';
  const codigo=await new Promise((done)=>{const p=spawn(process.execPath,['scripts/'+script],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});p.stdout.on('data',x=>texto+=x);p.stderr.on('data',x=>texto+=x);p.on('error',e=>{texto+=e.stack;done(-1)});p.on('close',done);});
  await writeFile(resolve(out,'execucao.log'),texto);
  const resultado={nome,fase,codigo,segundos:(performance.now()-inicio)/1000,saida:out};resultados.push(resultado);
  await writeFile(resolve(root,'validacao-inicial.json'),JSON.stringify({resultados,observacao:'Antes preservado. Falhas anteriores são reprodução, não aprovação; conferir o motivo no log.'},null,2));
  console.log(JSON.stringify(resultado));
  if(codigo!==0)console.log(texto.slice(-1800));
 }
}
process.exitCode=resultados.some(r=>r.fase==='depois'&&r.codigo!==0)?1:0;
