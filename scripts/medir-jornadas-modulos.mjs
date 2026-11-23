import assert from 'node:assert/strict';import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';import {resolve,dirname} from 'node:path';import {pathToFileURL} from 'node:url';import {spawn} from 'node:child_process';import ts from 'typescript';import {jornadas} from './jornadas-config.mjs';
const out=resolve(process.env.QA_JORNADAS_OUTPUT||'output/jornadas-completas-20261112'),selecionadas=process.env.QA_JORNADAS_SUITES?.split(',');await mkdir(out,{recursive:true});
const resultados=await readFile(resolve(out,'execucoes.json'),'utf8').then(x=>JSON.parse(x).resultados).catch(()=>[]);
for(const j of jornadas.filter(x=>!selecionadas||selecionadas.includes(x.arquivo))){
 const pasta=resolve(out,j.arquivo);await mkdir(pasta,{recursive:true});
 const original=resolve('scripts',j.arquivo+'.mjs');let fonte=(await readFile(original,'utf8')).replace(/\r\n/g,'\n');
 // Copia verificável do teste, sem alterar suas asserções ou os dados de negócio.
 const insercoes=[],intervalos=[],offset=j.apos?fonte.indexOf(j.apos):0;assert(offset>=0,j.arquivo+': escopo da instrumentação');
 for(const m of j.marcacoes){const a=fonte.indexOf(m.inicio,offset);assert(a>=0,j.arquivo+': início '+m.nome);const b=fonte.indexOf(m.fim,a);assert(b>=a,j.arquivo+': fim '+m.nome);intervalos.push({inicio:a,fim:b+m.fim.length,nome:m.nome});insercoes.push({i:a,s:`iniciarJornada(${m.expressaoNome||JSON.stringify(m.nome)},${j.perfil||"''"},{inicioDeclarado:${JSON.stringify(m.inicio)},fimDeclarado:${JSON.stringify(m.fim+(m.validacao||''))}});\n`},{i:b+m.fim.length,s:`\n${m.validacao||''}\nconcluirJornada();\n`});}
 intervalos.sort((a,b)=>a.inicio-b.inicio);for(let i=1;i<intervalos.length;i++)assert(intervalos[i].inicio>=intervalos[i-1].fim,j.arquivo+': medição sobreposta: '+intervalos[i-1].nome+' / '+intervalos[i].nome);
 // Trocar imports relativos por URLs preserva o módulo original ao gerar a cópia no output.
 const ast=ts.createSourceFile(original,fonte,ts.ScriptTarget.Latest,true);const trocas=[];function visitar(n){if(ts.isImportDeclaration(n)&&ts.isStringLiteral(n.moduleSpecifier)&&n.moduleSpecifier.text.startsWith('.'))trocas.push({i:n.moduleSpecifier.getStart(ast),fim:n.moduleSpecifier.end,s:JSON.stringify(pathToFileURL(resolve(dirname(original),n.moduleSpecifier.text)).href)});ts.forEachChild(n,visitar)}visitar(ast);
 // Inserimos de trás para frente. Se duas jornadas são adjacentes, inserir
 // primeiro o início da segunda faz o encerramento da primeira ficar antes dele.
 for(const op of [...insercoes,...trocas].sort((a,b)=>b.i-a.i||Number(b.s.startsWith('iniciarJornada('))-Number(a.s.startsWith('iniciarJornada('))))fonte=fonte.slice(0,op.i)+op.s+fonte.slice(op.fim??op.i);
 fonte=`import {iniciarJornada,concluirJornada} from ${JSON.stringify(pathToFileURL(resolve('scripts/lib/medir-jornadas.mjs')).href)};\n`+fonte;
 const arquivo=resolve(pasta,'bancada-instrumentada.mjs');await writeFile(arquivo,fonte);
 const inicio=Date.now(),ultima=(await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort().at(-1).slice(0,14);
 const r=await new Promise(ok=>{const p=spawn(process.execPath,[arquivo],{windowsHide:true,env:{...process.env,QA_OUTPUT:pasta,QA_JORNADAS_FILE:resolve(pasta,'tempos.json'),PLAYWRIGHT_BROWSER:'C:/Program Files/Google/Chrome/Application/chrome.exe',DB_VALIDATION_RUNTIME:resolve('node_modules/@electric-sql/pglite/dist/index.js'),DB_VALIDATION_MIGRATION_LIMIT:ultima},stdio:['ignore','pipe','pipe']});let log='';p.stdout.on('data',d=>log+=d);p.stderr.on('data',d=>log+=d);p.on('close',async code=>{await writeFile(resolve(pasta,'execucao.log'),log);ok({arquivo:j.arquivo,ok:code===0,code,duracaoMs:Date.now()-inicio})})});resultados.push(r);await writeFile(resolve(out,'execucoes.json'),JSON.stringify({resultados},null,2));console.log(JSON.stringify(r));
}
if(resultados.some(r=>!r.ok))process.exitCode=1;
