import assert from 'node:assert/strict';
import {access,readFile,writeFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
const root=resolve('output/picos-abertura-20261117'),html=await readFile(resolve(root,'relatorio.html'),'utf8'),checks=[];
for(const [,href] of html.matchAll(/href="([^"]+)"/g)){
 if(href.startsWith('https://'))continue;
 const path=resolve(root,href);assert(path.startsWith(root+sep));await access(path);checks.push({nome:'Link local existente',href,ok:true});
}
const b=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{for(const width of [1440,390]){
 const p=await b.newPage({viewport:{width,height:1000}}),erros=[];p.on('pageerror',e=>erros.push(e.message));
 await p.goto(pathToFileURL(resolve(root,'relatorio.html')).href);assert.equal(await p.locator('h1').count(),1);assert.equal(await p.locator('tbody tr').count(),34);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(erros,[]);
 await p.screenshot({path:resolve(root,`relatorio-${width}.png`)});checks.push({nome:'Relatório legível e sem transbordar',largura:width,ok:true});await p.close();
}}finally{await b.close();await writeFile(resolve(root,'conferencia-relatorio.json'),JSON.stringify(checks,null,2))}
console.log('PASS',checks.length,'verificações do relatório');
