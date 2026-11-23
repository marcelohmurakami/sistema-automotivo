import assert from 'node:assert/strict';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const out=resolve('output/orcamentos-velocidade-20261113'),resumo=JSON.parse(await readFile(resolve(out,'resumo.json'),'utf8'));
assert.equal(resumo.medicoes,516);assert.equal(resumo.perfis.length,10);assert.equal(resumo.documentos.length,100);assert.equal(resumo.arquivos.length,5);
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[];
try{for(const largura of [1366,390]){
 const p=await browser.newPage({viewport:{width:largura,height:1000},locale:'pt-BR'}),erros=[];p.on('pageerror',e=>erros.push(e.message));
 await p.goto(pathToFileURL(resolve(out,'relatorio.html')).href);await p.evaluate(()=>document.fonts.ready);
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.equal(await p.locator('#processos tbody tr').count(),resumo.processos.length);
 assert(await p.locator('img').evaluateAll(xs=>xs.every(x=>x.complete&&x.naturalWidth>0)));
 await p.screenshot({path:resolve(out,'relatorio-'+largura+'.png'),fullPage:false});
 await p.getByRole('textbox',{name:'Filtrar processos',exact:true}).fill('a partir da consulta');assert.equal(await p.locator('#processos tbody tr:visible').count(),2);
 assert.deepEqual(erros,[]);for(const link of await p.locator('a').evaluateAll(xs=>xs.map(x=>x.href).filter(x=>x.startsWith('file:'))))assert((await stat(fileURLToPath(link))).isFile(),link);
 resultados.push({largura,semOverflow:true,imagens:true,busca:true,links:true});await p.close();
}}finally{await browser.close();}
await writeFile(resolve(out,'entrega-validada.json'),JSON.stringify({ok:true,build:resumo.publicacao.build,medicoes:resumo.medicoes,relatorio:resultados,publicacao:resumo.publicacao},null,2));
console.log(JSON.stringify({ok:true,build:resumo.publicacao.build,medicoes:resumo.medicoes}));
