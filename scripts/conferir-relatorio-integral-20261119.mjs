import assert from 'node:assert/strict';
import {mkdir,writeFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=resolve('output/revisao-integral-20261119'),out=resolve(root,'validacao-relatorio');await mkdir(out,{recursive:true});
const b=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[],erros=[];
try{for(const width of [1920,390]){
 const p=await b.newPage({viewport:{width,height:1080},locale:'pt-BR'});p.on('pageerror',e=>erros.push(e.message));await p.goto(pathToFileURL(resolve(root,'relatorio.html')).href);
 assert.equal(await p.locator('.arquivo').count(),554);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 if(width===1920){const links=await p.locator('a[href]').evaluateAll(es=>[...new Set(es.map(e=>e.href))]);for(const link of links)if(link.startsWith('file:'))assert(await stat(fileURLToPath(link)).catch(()=>null),'Link local inexistente: '+link);}
 await p.screenshot({path:resolve(out,'relatorio-'+width+'.png')});
 await p.locator('.tabela').evaluate(e=>e.scrollIntoView({block:'start'}));assert.equal(await p.locator('.tabela tbody tr').count(),16);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:resolve(out,'tempos-'+width+'.png')});
 await p.getByLabel('Filtrar decisão').selectOption('Mantido');assert.equal(await p.locator('.arquivo:visible').count(),393);
 await p.getByLabel('Filtrar decisão').selectOption('');await p.getByLabel('Buscar arquivo, componente ou motivo').fill('src/components/financeiro/CustosServicos.tsx');
 assert.equal(await p.locator('.arquivo:visible').count(),1);await p.getByRole('button',{name:'Abrir resultados',exact:true}).click();assert.equal(await p.locator('.arquivo[open]:visible').count(),1);
 await p.locator('.arquivo:visible').scrollIntoViewIfNeeded();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:resolve(out,'detalhe-'+width+'.png')});
 await p.getByRole('button',{name:'Recolher',exact:true}).click();assert.equal(await p.locator('.arquivo[open]').count(),0);resultados.push({width,registros:554,mantidos:393,busca:'ok',expandirRecolher:'ok',semExcessoHorizontal:true});await p.close();
}for(const width of [1920,390]){const p=await b.newPage({viewport:{width,height:1080}});await p.goto(pathToFileURL(resolve(root,'servidor/relatorio.html')).href);assert.equal(await p.locator('article').count(),37);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:resolve(out,'servidor-'+width+'.png')});await p.close();}assert.deepEqual(erros,[]);}finally{await b.close();await writeFile(resolve(out,'resultado.json'),JSON.stringify({resultados,erros},null,2));}console.log(JSON.stringify({resultados,erros}));
