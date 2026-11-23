import assert from 'node:assert/strict';import{mkdir,writeFile}from'node:fs/promises';import{resolve}from'node:path';import{build,preview}from'vite';import react from'@vitejs/plugin-react';import tailwindcss from'@tailwindcss/vite';import{chromium}from'playwright';
const pasta=resolve('output/vinculo-pecas-20261105');await mkdir(pasta,{recursive:true});
const config={configFile:false,envDir:false,logLevel:'error',plugins:[react(),tailwindcss()],define:{'import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':'""'},build:{outDir:resolve(pasta,'interface-build'),rollupOptions:{input:'scripts/fixtures/vinculo-peca.html'}}};
await build(config);const server=await preview({...config,preview:{port:0,host:'127.0.0.1'}}),browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});const p=await browser.newPage(),resultados=[];
try{for(const caso of ['os','orcamento','assistencia','sem-estoque'])for(const width of [390,1920]){
 await p.setViewportSize({width,height:900});await p.goto(server.resolvedUrls.local[0]+'scripts/fixtures/vinculo-peca.html?caso='+caso);
 await p.getByRole('button',{name:/Adicionar Pastilha FIRE de teste por/}).click();const itens=await p.evaluate(()=>window.qaItens),convertidos=await p.evaluate(()=>window.qaAtendimento);
 assert.equal(itens.length,1);assert.equal(itens[0].produto_estoque_id,caso==='sem-estoque'?undefined:'estoque-2');assert.equal(convertidos[0].produto_id,caso==='sem-estoque'?null:'estoque-2');assert.equal(convertidos[0].origem,caso==='sem-estoque'?'externa':'estoque');
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));resultados.push({caso,width,ok:true});
}await writeFile(resolve(pasta,'interface.json'),JSON.stringify({ok:true,resultados},null,2));console.log('PASS',resultados.length,'cenários de seleção sem acesso aos custos');}finally{await browser.close();await new Promise(ok=>server.httpServer.close(ok));}
