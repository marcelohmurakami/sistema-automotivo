import {chromium} from 'playwright';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {access,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=resolve('output/clientes-estoque-velocidade-20261117'),browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[];
try{const p=await browser.newPage();await p.goto(pathToFileURL(resolve(root,'relatorio.html')).href);const links=await p.locator('a[href]').evaluateAll(a=>a.map(x=>x.getAttribute('href')));for(const link of links)await access(resolve(root,link));for(const width of [1440,390]){await p.setViewportSize({width,height:1000});await p.evaluate(()=>document.fonts.ready);const visual=await p.evaluate(()=>({largura:innerWidth,pagina:document.documentElement.scrollWidth,imagens:[...document.images].map(i=>({src:i.getAttribute('src'),ok:i.complete&&i.naturalWidth>0}))}));assert(visual.pagina<=visual.largura+2);assert(visual.imagens.every(i=>i.ok));await p.screenshot({path:resolve(root,`relatorio-${width}.png`)});resultados.push({width,ok:true,links:links.length,imagens:visual.imagens.length})}}finally{await browser.close();await writeFile(resolve(root,'conferencia-relatorio.json'),JSON.stringify(resultados,null,2))}
console.log(JSON.stringify(resultados));
