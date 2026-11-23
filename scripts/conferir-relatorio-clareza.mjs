import assert from 'node:assert/strict';
import {readFile,access,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
const pasta=resolve('output/relatorios-clareza-20261109');
const html=await readFile(resolve(pasta,'relatorio.html'),'utf8');
const links=[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m=>m[1]).filter(p=>!p.startsWith('http'));
for(const p of links)await access(resolve(pasta,p));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const resultados=[];
try {const page=await browser.newPage();
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.goto(pathToFileURL(resolve(pasta,'relatorio.html')).href);
  assert.equal(await page.locator('.stats strong').first().innerText(),'26 / 26');
  assert(await page.evaluate(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0)));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:resolve(pasta,'relatorio-'+width+'.png')});resultados.push({width,ok:true});
 }
}finally{await browser.close();}
await writeFile(resolve(pasta,'relatorio-validacao.json'),JSON.stringify({ok:true,linksLocais:links.length,resultados},null,2));
console.log(JSON.stringify({ok:true,linksLocais:links.length,resultados}));
