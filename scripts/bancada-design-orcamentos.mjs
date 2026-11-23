import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createServer} from 'node:http';
import {build} from './lib/vite-conferencia.mjs';
import {chromium} from './lib/chrome-conferencia.mjs';
import {perfisOrcamento} from './fixtures/orcamentos-impressao-dados.mjs';
const dir=resolve(process.env.QA_OUTPUT || 'output/orcamentos-impressao-20261111');await mkdir(dir,{recursive:true});
const out=resolve(dir,'fixture');
await build({logLevel:'error',build:{outDir:out,rollupOptions:{input:'scripts/fixtures/orcamentos-impressao.html'}}});
const server=createServer(async(req,res)=>{try{const u=new URL(req.url,'http://local'),f=resolve(out,'.'+u.pathname);assert(f.startsWith(out+sep));res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(f)]||'application/octet-stream');res.end(await readFile(f));}catch{res.statusCode=404;res.end();}});
await new Promise(ok=>server.listen(5186,'127.0.0.1',ok));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const resultados=[];
try {
 for(const perfil of perfisOrcamento) {
  const ctx=await browser.newContext({viewport:{width:1366,height:1000},locale:'pt-BR'}),page=await ctx.newPage(),errors=[];
  await ctx.addInitScript(()=>{window.print=()=>{window.qaImpresso=(window.qaImpresso||0)+1;};});
  ctx.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  const casos=perfil==='mecanica'?['normal','rascunho','sem-itens','identidade-longa','longo']:['normal'];
  for(const caso of casos) {
   await page.goto(`http://127.0.0.1:5186/scripts/fixtures/orcamentos-impressao.html?perfil=${perfil}&caso=${caso}`);
   await page.locator('.orc-doc-totais').waitFor();
   assert.equal(await page.locator('.orc-doc-itens tbody tr').count(),await page.evaluate(()=>window.qaDocumento.itens.length));
   const pp=ctx.waitForEvent('page');await page.locator('#imprimir').click();const popup=await pp;await popup.waitForFunction(()=>window.qaImpresso===1);
   for(const largura of [1366,390,320]) {
    await popup.setViewportSize({width:largura,height:900});
    const layout=await popup.evaluate(()=>{
     const papel=document.querySelector('.folha-orcamento'),r=papel.getBoundingClientRect();
     const tabela=document.querySelector('.orc-doc-itens');
     return {width:document.documentElement.scrollWidth,viewport:innerWidth,papel:r.width,font:getComputedStyle(tabela).fontSize,
       estourados:[...papel.querySelectorAll('*')].filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&(b.left<r.left-1||b.right>r.right+1);}).map(e=>e.className)};
    });
    assert(layout.width<=layout.viewport,`${perfil}/${caso}/${largura}: rolagem horizontal ${JSON.stringify(layout)}`);
    assert.deepEqual(layout.estourados,[],`${perfil}/${caso}/${largura}: elementos fora do papel`);
    if(['mecanica','assistencia_celulares','manutencao_climatizacao','limpeza_geral'].includes(perfil)&&caso==='normal')await popup.screenshot({path:resolve(dir,`${perfil}-${largura}.png`),fullPage:true});
   }
   if(perfil==='mecanica'&&['normal','longo'].includes(caso)){
    await popup.pdf({path:resolve(dir,`impressao-navegador-${caso}.pdf`),format:'A4',printBackground:true,preferCSSPageSize:true});
    const download=Promise.race([page.waitForEvent('download'),popup.waitForEvent('download')]);await popup.getByRole('button',{name:'Baixar PDF',exact:true}).click();await (await download).saveAs(resolve(dir,`download-${caso}.pdf`));
   }
   assert.equal(await popup.locator('.orc-doc-totais strong').innerText(),await page.locator('.orc-doc-totais strong').innerText());
   await popup.getByRole('button',{name:'Imprimir',exact:true}).click();assert.equal(await popup.evaluate(()=>window.qaImpresso),2);
   await popup.close();resultados.push({perfil,caso,desktop:true,mobile390:true,mobile320:true,impressao:true});
  }
  assert.deepEqual(errors,[]);await ctx.close();console.log('PASS interface '+perfil);
 }
 await writeFile(resolve(dir,'interface.json'),JSON.stringify({ok:true,resultados},null,2));
}finally{await browser.close();await new Promise(ok=>server.close(ok));}
