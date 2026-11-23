import assert from 'node:assert/strict';
import {readFile,stat,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
const raiz=resolve('output/gestao-operacao-velocidade-20261118');
const resumo=JSON.parse(await readFile(resolve(raiz,'resumo.json')));
assert.equal(resumo.falhas.length,0);assert.equal(resumo.problemas.length,0);assert.equal(resumo.sitePerfis,26);
for(const r of resumo.abertura){assert.equal(r.antes.n,r.modulo==='Clientes para contatar'?10:26);assert.equal(r.depois.n,r.antes.n)}
const html=await readFile(resolve(raiz,'relatorio.html'),'utf8');
let links=0;for(const[,href]of html.matchAll(/(?:href|src)="([^"]+)"/g)){if(/^[a-z]+:|^#/.test(href))continue;await stat(resolve(raiz,href));links++}
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const erros=[],checks=[];
try{const p=await browser.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto(pathToFileURL(resolve(raiz,'relatorio.html')).href);
 for(const width of [1440,390]){await p.setViewportSize({width,height:1000});await p.evaluate(()=>scrollTo(0,0));assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await p.screenshot({path:resolve(raiz,'relatorio-'+width+'.png')});checks.push({width,semTransbordamento:true})}
 await p.setViewportSize({width:1440,height:1000});await p.getByRole('heading',{name:'Onde a causa da espera foi corrigida',exact:true}).scrollIntoViewIfNeeded();await p.screenshot({path:resolve(raiz,'relatorio-tempos.png')});assert.deepEqual(erros,[]);
}finally{await browser.close()}
await writeFile(resolve(raiz,'conferencia-relatorio.json'),JSON.stringify({ok:true,linksConferidos:links,checks},null,2));console.log('PASS relatório: contagens, links locais e layout desktop/celular');
