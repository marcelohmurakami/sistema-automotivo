import assert from 'node:assert/strict';
import {readFile,writeFile,access} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=resolve('output/picos-51-20261119'),arquivo=resolve(root,'relatorio.html');
const resumo=JSON.parse(await readFile(resolve(root,'resumo.json'),'utf8'));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const resultados=[],erros=[];
try {
  for(const width of [1920,390]) {
    const ctx=await browser.newContext({viewport:{width,height:width===390?844:1080},isMobile:width===390,hasTouch:width===390});
    const p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));
    await p.goto(pathToFileURL(arquivo).href);
    assert.equal(await p.locator('.case').count(),51);
    assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
    await p.screenshot({path:resolve(root,`relatorio-${width}-inicio.png`)});
    await p.locator('#casos').scrollIntoViewIfNeeded();
    await p.screenshot({path:resolve(root,`relatorio-${width}-casos.png`)});
    await p.locator('#escopo').selectOption('todos');assert.equal(await p.locator('.case').count(),384);
    await p.locator('#escopo').selectOption('pioras');assert.equal(await p.locator('.case').count(),resumo.paresMaisLentos);
    await p.locator('#escopo').selectOption('51');
    await p.locator('#busca').fill('borracharia');
    assert.equal(await p.locator('.case').count(),resumo.comparacoes.filter(x=>x.eraUmDos51&&x.perfil==='borracharia').length);
    await p.locator('#busca').fill('sem-correspondencia-inexistente');assert.equal(await p.locator('.case').count(),0);
    await p.locator('#busca').fill('');assert.equal(await p.locator('.case').count(),51);
    const links=await p.locator('a[href]').evaluateAll(as=>as.map(a=>a.href));
    for(const href of links)if(href.startsWith('file:')){
      const u=new URL(href);u.hash='';assert(fileURLToPath(u).startsWith(dirname(arquivo)));await access(fileURLToPath(u));
    }
    resultados.push({largura:width,casosOriginais:51,todos:384,pioras:resumo.paresMaisLentos,linksLocaisConferidos:true,semExcessoHorizontal:true,buscaConferida:true,ok:true});
    await ctx.close();
  }
  assert.deepEqual(erros,[]);
} finally {await browser.close();await writeFile(resolve(root,'conferencia-relatorio.json'),JSON.stringify({resultados,erros},null,2));}
console.log('Relatório conferido em 1920 px e 390 px, incluindo filtros e links.');
