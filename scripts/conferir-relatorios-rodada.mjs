import assert from 'node:assert/strict';import{readFile,writeFile,access,mkdir}from'node:fs/promises';import{resolve,dirname}from'node:path';import{pathToFileURL}from'node:url';import{chromium}from'playwright';
const root=resolve('output/regressao-mapa-orcamentos-os-20261116'),out=resolve(root,'html-revisao');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[],erros=[];
try{for(const nome of['relatorio','mapa','orcamentos','os']){
 const arquivo=resolve(root,nome+'.html'),html=await readFile(arquivo,'utf8');
 for(const m of html.matchAll(/(?:href|src)="([^"]+)"/g)){if(/^(?:https?:|#|data:|file:)/.test(m[1]))continue;await access(resolve(dirname(arquivo),m[1].replaceAll('&amp;','&')));}
 for(const width of[390,1920]){
  const page=await browser.newPage({viewport:{width,height:1000}});page.on('pageerror',e=>erros.push(e.message));await page.goto(pathToFileURL(arquivo).href,{waitUntil:'load'});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.equal(await page.locator('h1').count(),1);
  await page.screenshot({path:resolve(out,nome+'-'+width+'.png')});
  if(nome!=='relatorio'){const antes=await page.locator('#registros tbody tr:visible').count();await page.getByLabel('Filtrar registros').fill('inexistente-qa-99999999');assert.equal(await page.locator('#registros tbody tr:visible').count(),0);await page.getByLabel('Filtrar registros').fill('');assert.equal(await page.locator('#registros tbody tr:visible').count(),antes);}
  resultados.push({relatorio:nome,width,linksLocaisValidos:true,filtro:nome!=='relatorio',ok:true});await page.close();
 }
}assert.deepEqual(erros,[]);}finally{await browser.close();}
await writeFile(resolve(out,'resultado.json'),JSON.stringify({ok:true,resultados,erros},null,2));console.log(JSON.stringify({ok:true,verificacoes:resultados.length}));
