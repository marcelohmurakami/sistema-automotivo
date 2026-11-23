import assert from 'node:assert/strict';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root=resolve('output/regressao-assistencia-manutencao-limpeza-20261116');
const out=resolve(root,'relatorio-revisao');await mkdir(out,{recursive:true});
const sum=JSON.parse(await readFile(resolve(root,'sumario.json'),'utf8'));
assert.equal(sum.documentos.length,128);
assert.equal(sum.tempos.length,1280);
assert.equal(sum.banco.filter(x=>x.ok).length,16);
assert.equal(sum.ciclo.filter(x=>x.ok).length,16);
assert.equal(sum.excecoes.resultados.filter(x=>x.ok).length,16);
assert.equal(sum.busca.resultados.filter(x=>x.ok).length,32);
assert.equal(sum.login.resultados.length,15);
assert.equal(sum.suitesOk,sum.suites);
assert(sum.publicacao.publicado);
assert(sum.documentos.every(d=>sum.tempos.filter(t=>['perfil','width','caso','pasta'].every(k=>t[k]===d[k])).length===10));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[];
try{
 for(const arquivo of ['relatorio.html','assistencia.html','manutencao.html','limpeza.html']){
  const p=await browser.newPage(),erros=[];p.on('pageerror',e=>erros.push(e.message));
  await p.goto(pathToFileURL(resolve(root,arquivo)).href,{waitUntil:'domcontentloaded',timeout:60000});
  const links=await p.locator('a[href]').evaluateAll(es=>es.map(e=>e.href));
  for(const link of links)if(link.startsWith('file:'))await access(fileURLToPath(link));
  for(const width of [1920,390]){
   await p.setViewportSize({width,height:width===390?844:1080});
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),arquivo+' / '+width);
   await p.screenshot({path:resolve(out,arquivo.replace('.html','')+'-'+width+'.png')});
  }
  if(arquivo!=='relatorio.html'){
   const rows=p.locator('#busca + .tabela tbody tr'),total=await rows.count();
   await p.getByRole('textbox',{name:'Filtrar testes'}).fill('Editar ficha e data');
   assert.equal(await rows.filter({visible:true}).count(),total/10);
   await p.getByRole('textbox',{name:'Filtrar testes'}).fill('');
   assert.equal(await rows.filter({visible:true}).count(),total);
  }
  assert.equal(erros.length,0,erros.join('; '));
  resultados.push({arquivo,ok:true,linksConferidos:links.length});await p.close();
 }
}finally{await browser.close();await writeFile(resolve(out,'resultado.json'),JSON.stringify({ok:resultados.length===4,resultados},null,2))}
console.log(JSON.stringify({ok:true,relatorios:resultados.length,links:resultados.reduce((s,x)=>s+x.linksConferidos,0)}));
