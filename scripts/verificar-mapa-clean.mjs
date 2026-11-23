import assert from 'node:assert/strict';import{mkdir,writeFile}from'node:fs/promises';import{resolve}from'node:path';import{build,preview}from'vite';import react from'@vitejs/plugin-react';import tailwindcss from'@tailwindcss/vite';import{chromium}from'playwright';
const pasta=resolve(process.env.QA_OUTPUT || 'output/mapa-impressao-20261105');await mkdir(pasta,{recursive:true});
const config={configFile:false,envDir:false,logLevel:'error',plugins:[react(),tailwindcss()],define:{'import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':'""'},build:{outDir:resolve(pasta,'mapa-build'),rollupOptions:{input:'scripts/fixtures/mapa-clean.html'}}};
if(!process.argv.includes('--sem-build'))await build(config);
const server=await preview({...config,preview:{port:0,host:'127.0.0.1'}}),browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const p=await browser.newPage({locale:'pt-BR'}),resultados=[],erros=[];p.setDefaultTimeout(30000);p.on('pageerror',e=>erros.push(e.message));
async function conferir(){return p.evaluate(()=>{const q=document.querySelector('.quadro');return{viewport:innerWidth,pagina:document.documentElement.scrollWidth,quadro:q.clientWidth,conteudo:q.scrollWidth,colunas:[...q.children].map(e=>({x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,w:e.getBoundingClientRect().width})),cortados:[...document.querySelectorAll('.mapa-real button,.coluna-cabecalho h3')].filter(e=>e.checkVisibility()).filter(e=>{const r=e.getBoundingClientRect();return r.right>innerWidth+1||r.x<0}).map(e=>e.textContent)}})}
try{
 for(const tema of ['claro','escuro'])for(const largura of [320,390,600,768,1024,1280,1366,1440,1600,1920,2560]){
  await p.setViewportSize({width:largura,height:1080});await p.goto(server.resolvedUrls.local[0]+'scripts/fixtures/mapa-clean.html?tema='+tema,{waitUntil:'domcontentloaded',timeout:60000});
  await p.getByRole('button',{name:'Visualizar em quadro',exact:true}).click();await p.locator('.quadro').waitFor();await p.evaluate(()=>document.fonts.ready);
  const d=await conferir();assert(d.pagina<=largura+1,JSON.stringify(d));assert(d.conteudo<=d.quadro+1,JSON.stringify(d));assert.deepEqual(d.cortados,[]);assert.equal(d.colunas.length,5);if(largura>=1600)assert(d.colunas.every(c=>Math.abs(c.y-d.colunas[0].y)<2),'As 5 colunas cabem lado a lado');
  assert.equal(await p.locator('.cabecalho .acesso-rapido-header').count(),0);assert.equal(await p.locator('.assistente-atalho').count(),0);await p.getByRole('button',{name:'Abrir assistente por voz ou texto',exact:true}).waitFor();
  if([390,1366,1920].includes(largura))await p.screenshot({path:resolve(pasta,`mapa-${tema}-${largura}.png`),fullPage:true});
  if(largura<=600){const [fab,nav]=await Promise.all([p.locator('.assistente-flutuante').boundingBox(),p.locator('.navegacao-inferior').boundingBox()]);assert(fab.y+fab.height<=nav.y,'Assistente não cobre navegação');}
  await p.getByRole('button',{name:'Abrir assistente por voz ou texto',exact:true}).click();await p.getByRole('dialog',{name:'Assistente',exact:true}).waitFor();
  assert(await p.locator('.assistente-dialogo').evaluate(e=>e.scrollWidth<=e.clientWidth+1));const dialogo=await p.locator('.assistente-dialogo').boundingBox();assert(dialogo.y>=-1&&dialogo.x>=-1&&dialogo.x+dialogo.width<=largura+1);
  if(largura===390)await p.screenshot({path:resolve(pasta,`assistente-${tema}-${largura}.png`)});
  await p.getByRole('dialog',{name:'Assistente',exact:true}).getByRole('button',{name:'Fechar janela',exact:true}).click();
  resultados.push({tema,largura,ok:true,linhas:new Set(d.colunas.map(c=>Math.round(c.y))).size});
 }
 for(const [width,height] of [[320,568],[390,600],[390,420],[844,390]]){
  await p.setViewportSize({width,height});await p.getByRole('button',{name:'Abrir assistente por voz ou texto',exact:true}).click();
  const d=p.getByRole('dialog',{name:'Assistente',exact:true});const r=await d.boundingBox();assert(r.x>=-1&&r.y>=-1&&r.y+r.height<=height+1);assert(await d.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  await d.getByRole('textbox',{name:'Seu pedido',exact:true}).fill('Consultar uma ordem de serviço');
  await d.getByRole('button',{name:'Enviar mensagem',exact:true}).scrollIntoViewIfNeeded();assert(await d.getByRole('button',{name:'Enviar mensagem',exact:true}).isVisible());
  await d.getByRole('button',{name:'Fechar janela',exact:true}).click();resultados.push({cenario:`Assistente em tela curta ${width}x${height}`,ok:true});
 }
 await p.setViewportSize({width:1920,height:1080});await p.keyboard.press('Control+k');await p.getByRole('dialog',{name:'Acesso rápido',exact:true}).waitFor();await p.keyboard.press('Escape');
 await p.getByRole('button',{name:'Prontos para entregar',exact:false}).click();assert.equal(await p.locator('.quadro .coluna-etapa').count(),1);const filtro=await conferir();assert(filtro.conteudo<=filtro.quadro+1);
 await p.getByRole('button',{name:'Ver todas as OS',exact:true}).click();assert.equal(await p.locator('.quadro .coluna-etapa').count(),5);
 await p.getByRole('button',{name:'Visualizar em lista',exact:true}).click();await p.locator('.mapa-item-lista').first().waitFor();assert.equal(await p.locator('.mapa-item-lista').count(),5);
 resultados.push({cenario:'Atalho de teclado, filtro, volta ao quadro e lista preservados',ok:true});assert.deepEqual(erros,[]);
}catch(e){process.exitCode=1;console.error(e);await p.screenshot({path:resolve(pasta,'mapa-falha.png'),fullPage:true});await writeFile(resolve(pasta,'mapa-falha.txt'),await p.locator('body').innerText());}
finally{await browser.close();await new Promise(ok=>server.httpServer.close(ok));await writeFile(resolve(pasta,'mapa-ui.json'),JSON.stringify({ok:!process.exitCode,resultados,erros},null,2));console.log(JSON.stringify({ok:!process.exitCode,cenarios:resultados.length}));}

