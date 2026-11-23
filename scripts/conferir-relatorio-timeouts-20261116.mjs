import assert from 'node:assert/strict';
import {access,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
const root=resolve('output/timeouts-concorrencia-26-20261116');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1360,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(pathToFileURL(root+'/relatorio-final.html').href);await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('table').count(),6);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert(await page.locator('img').evaluateAll(xs=>xs.every(x=>x.complete&&x.naturalWidth>0)));
 const links=await page.locator('a').evaluateAll(xs=>xs.map(x=>x.getAttribute('href')).filter(x=>!/^https?:/.test(x)));
 for(const link of links)await access(resolve(root,link));
 await page.screenshot({path:root+'/relatorio-final-capa.png'});
 await page.getByRole('heading',{name:'2. Antes e depois: tempos reais'}).scrollIntoViewIfNeeded();await page.screenshot({path:root+'/relatorio-final-tempos.png'});
 await page.getByRole('heading',{name:'6. Limites e registros mantidos'}).scrollIntoViewIfNeeded();await page.screenshot({path:root+'/relatorio-final-limites.png'});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:root+'/relatorio-final-celular.png'});
 assert.equal(errors.length,0);await writeFile(root+'/conferencia-relatorio.json',JSON.stringify({ok:true,linksConferidos:links.length,imagens:3,errosJs:errors,desktop:'1360x1000',celular:'390x844'},null,2));
 console.log(JSON.stringify({ok:true,linksConferidos:links.length}));
}finally{await browser.close()}
