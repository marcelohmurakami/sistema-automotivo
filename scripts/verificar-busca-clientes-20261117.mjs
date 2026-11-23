import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve,sep,extname } from 'node:path';
import { createServer } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { sessaoQa } from './sessoes-qa-concorrencia-20261116.mjs';
const fase=process.env.QA_FASE||'depois',out=resolve('output/clientes-estoque-velocidade-20261117'),dist=resolve(out,'build-'+fase);
const servidor=createServer(async(req,res)=>{try{let f=resolve(dist,'.'+new URL(req.url,'http://local').pathname);assert(f.startsWith(dist+sep));if(!extname(f))f=resolve(dist,'index.html');res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(f)]||'application/octet-stream');res.end(await readFile(f))}catch{res.statusCode=404;res.end()}});
await new Promise(r=>servidor.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${servidor.address().port}`;
const env=Object.fromEntries((await readFile('.env.local','utf8')).split(/\r?\n/).filter(l=>/^VITE_SUPABASE_/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
const conta=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.find(c=>c.especialidade==='retifica');
const cli=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),sessao=await sessaoQa(cli,conta);
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[];
try{for(const mobile of [false,true]){
 const ctx=await browser.newContext({viewport:{width:mobile?390:1920,height:900},serviceWorkers:'block'});await ctx.addInitScript(s=>localStorage.setItem('sb-hzihxtjirttetnfdujcx-auth-token',JSON.stringify(s)),sessao);
 const p=await ctx.newPage();p.setDefaultTimeout(15000);let abortada=false;const atrasos=[];
 p.on('requestfailed',r=>{if(r.url().endsWith('/rpc/listar_clientes')&&r.postDataJSON()?.p_busca==='BUSCA_LENTA_QA')abortada=true});
 await p.route('**/rest/v1/rpc/listar_clientes',async route=>{if(route.request().postDataJSON()?.p_busca!=='BUSCA_LENTA_QA')return route.continue();const atraso=new Promise(ok=>setTimeout(ok,1200));atrasos.push(atraso);await atraso;try{await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({itens:[],total:0})})}catch{ /* Cancelamento esperado. */ }});
 await p.goto(base+'/clientes');await p.locator('.lista-clientes li').first().waitFor();const busca=p.getByRole('textbox',{name:'Buscar clientes',exact:true});
 const iniciou=p.waitForRequest(r=>r.url().endsWith('/rpc/listar_clientes')&&r.postDataJSON()?.p_busca==='BUSCA_LENTA_QA');await busca.fill('BUSCA_LENTA_QA');await iniciou;
 const t=performance.now();await busca.fill('');await p.locator('.lista-clientes li').first().waitFor();const segundos=(performance.now()-t)/1000;
 await Promise.all(atrasos);await p.waitForTimeout(50);assert(await p.locator('.lista-clientes li').count()>0,'Resposta antiga não apaga a lista atual');if(fase==='depois')assert(abortada,'Consulta substituída precisa ser cancelada');resultados.push({fase,mobile,segundos,consultaAntigaCancelada:abortada,listaPreservada:true});await ctx.close();
}}finally{await browser.close();await new Promise(r=>servidor.close(r));await mkdir(out,{recursive:true});await writeFile(resolve(out,`busca-${fase}.json`),JSON.stringify({metodo:'API real para consultas normais; resposta de busca antiga atrasada artificialmente em 1,2 s.',resultados},null,2))}
console.log(JSON.stringify(resultados));
