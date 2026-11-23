import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createServer} from 'node:http';
import {build} from './lib/vite-conferencia.mjs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {chromium} from './lib/chrome-conferencia.mjs';
const antes=process.argv.includes('--antes'),pasta=resolve(process.env.QA_OUTPUT||'output/orcamento-layout-20261105'),out=resolve(pasta,antes?'build-antes':'build-teste');
await mkdir(pasta,{recursive:true});
await build({configFile:false,envDir:false,logLevel:'error',plugins:[react(),tailwindcss()],define:{'import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':'""'},build:{outDir:out,rollupOptions:{input:'scripts/fixtures/orcamento-layout.html'}}});
const server=createServer(async(req,res)=>{try{const f=resolve(out,'.'+new URL(req.url,'http://localhost').pathname);assert(f.startsWith(out+sep));res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(f)]||'application/octet-stream');res.end(await readFile(f));}catch{res.statusCode=404;res.end();}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[],erros=[];
let p,ctx;
try{
 for(const tema of antes?['escuro']:['escuro','claro'])for(const estado of antes?['awaiting_approval']:['draft','awaiting_approval','approved'])for(const largura of antes?[1920]:[1920,1366,1024,768,390,320]){
  await ctx?.close();ctx=await browser.newContext({viewport:{width:largura,height:largura>768?1080:844},locale:'pt-BR'});p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/scripts/fixtures/orcamento-layout.html?tema=${tema}&estado=${estado}&longo=1`);
  const d=p.getByRole('dialog',{name:'Orçamento #38',exact:true});await d.waitFor();await p.evaluate(()=>document.fonts.ready);
  const medidas=await d.evaluate(d=>{const h=d.querySelector('.dialogo-cabecalho'),t=h.querySelector('h2'),f=h.querySelector('button[aria-label="Fechar janela"]');const a=d.querySelector('.acoes-detalhe-orcamento, .cabecalho-acoes-orcamento');const dr=d.getBoundingClientRect(),tr=t.getBoundingClientRect(),fr=f.getBoundingClientRect(),ar=a.getBoundingClientRect();const botoes=[...a.querySelectorAll(':scope > button, :scope > a')];return {largura:d.clientWidth,conteudo:d.scrollWidth,titulo:tr.width,tituloLegivel:t.scrollWidth<=t.clientWidth+1,fecharDentro:fr.right<=dr.right&&fr.left>=dr.left,acoesAbaixo:ar.top>=tr.bottom,acoesVisiveis:botoes.every(b=>{const r=b.getBoundingClientRect();return r.left>=dr.left&&r.right<=dr.right&&r.width>0&&r.height>=40}),textosVisiveis:botoes.every(b=>b.innerText.trim().length>0)};});
  resultados.push({tema,estado,largura,...medidas});
  if(antes||estado==='awaiting_approval')await p.screenshot({path:resolve(pasta,`${antes?'antes':'depois'}-${tema}-${largura}.png`)});
  if(!antes){assert(medidas.conteudo<=medidas.largura+1,JSON.stringify(resultados.at(-1)));assert(medidas.titulo>0&&medidas.tituloLegivel&&medidas.fecharDentro&&medidas.acoesAbaixo&&medidas.acoesVisiveis&&medidas.textosVisiveis,JSON.stringify(resultados.at(-1)));
   await d.getByRole('button',{name:'Atualizar situação',exact:true}).click();
   await d.getByRole('button',{name:'Cliente não aprovou / desistiu',exact:true}).click();const cancelar=p.getByRole('dialog',{name:'Registrar recusa ou desistência',exact:true});await cancelar.waitFor();assert(await cancelar.evaluate(e=>e.scrollWidth<=e.clientWidth+1));await cancelar.getByRole('button',{name:'Fechar janela',exact:true}).click();
   await d.getByRole('button',{name:'Fechar janela',exact:true}).click();await d.waitFor({state:'hidden'});
  }
 }
 assert.deepEqual(erros,[]);
}catch(e){process.exitCode=1;console.error(e.message);if(p)await p.screenshot({path:resolve(pasta,'falha.png')});}
finally{await browser.close();await new Promise(ok=>server.close(ok));await writeFile(resolve(pasta,antes?'antes.json':'interface.json'),JSON.stringify({ok:!process.exitCode,resultados,erros},null,2));console.log(JSON.stringify({ok:!process.exitCode,cenarios:resultados.length}));}
