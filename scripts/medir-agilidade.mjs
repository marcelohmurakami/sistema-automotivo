import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp,access} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createServer} from 'node:http';
import {gzipSync} from 'node:zlib';
import {chromium} from 'playwright';
const fase=process.env.QA_FASE||'antes',out=resolve(process.env.QA_OUTPUT||'output/agilidade-20261111');
await mkdir(out,{recursive:true});
if(fase==='antes')try{await access(resolve(out,'baseline/index.html'));}catch{await cp('dist',resolve(out,'baseline'),{recursive:true});}
const dir=resolve(process.env.QA_DIST||(fase==='antes'?out+'/baseline':'dist')),resultados=[];
const server=createServer(async(req,res)=>{try{const u=new URL(req.url,'http://local');let f=resolve(dir,'.'+u.pathname);assert(f===dir||f.startsWith(dir+sep));let b;try{b=await readFile(f);}catch{f=resolve(dir,'index.html');b=await readFile(f);}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.json':'application/json','.svg':'image/svg+xml'})[extname(f)]||'application/octet-stream');res.setHeader('Cache-Control',u.pathname.startsWith('/assets/')?'public,max-age=31536000,immutable':'no-cache');res.setHeader('Content-Encoding','gzip');res.end(gzipSync(b));}catch{res.statusCode=404;res.end();}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+server.address().port;
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.filter(c=>(process.env.QA_PERFIS?.split(',')||['retifica','assistencia_celulares','manutencao_climatizacao','limpeza_geral']).includes(c.especialidade));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{for(const c of contas){
 assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
 const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:1366,height:900},locale:'pt-BR'}),p=await ctx.newPage();p.setDefaultTimeout(30000);
 let erros=[],api=[],solicitacoes=new Set(),ultimo=performance.now();
 p.on('pageerror',e=>erros.push(e.message));p.on('request',r=>{if(r.url().includes('/rest/v1/')){solicitacoes.add(r);r.inicio=performance.now();}});p.on('requestfinished',async r=>{if(solicitacoes.has(r)){solicitacoes.delete(r);ultimo=performance.now();api.push({url:new URL(r.url()).pathname,ms:Math.round(ultimo-r.inicio),status:(await r.response())?.status()});}});p.on('requestfailed',r=>{solicitacoes.delete(r);});p.on('framenavigated',f=>{if(f===p.mainFrame()){solicitacoes.clear();ultimo=performance.now();}});
 await p.goto(base+'/entrar');await p.getByLabel('E-mail',{exact:true}).fill(c.email);await p.getByLabel('Senha',{exact:true}).fill(c.senha);await p.getByRole('button',{name:'Entrar no sistema',exact:true}).click();await p.waitForURL(u=>!u.pathname.startsWith('/entrar'));await p.locator('main h1').waitFor();await p.waitForTimeout(1000);
 const cdp=await ctx.newCDPSession(p);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:1.6*1024*1024/8,uploadThroughput:.75*1024*1024/8});
 const estavel=async()=>{const t=performance.now();while(performance.now()-t<20000&&(solicitacoes.size||performance.now()-ultimo<200))await p.waitForTimeout(50);assert(!solicitacoes.size,'Requisições pendentes: '+[...solicitacoes].map(r=>new URL(r.url()).pathname).join(', '));assert.equal(await p.getByText('Não conseguimos abrir esta tela.',{exact:true}).count(),0);assert.deepEqual(erros,[]);};
 const medir=async(nome,fn)=>{api=[];erros=[];ultimo=performance.now();const trace=process.env.QA_TRACE&&nome==='Abrir /atendimentos';if(trace)await cdp.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,v8,disabled-by-default-v8.cpu_profiler',transferMode:'ReturnAsStream'});const t=performance.now();await fn();const telaMs=Math.round(performance.now()-t);await estavel();resultados.push({fase,perfil:c.especialidade,nome,ms:Math.round(performance.now()-t),telaMs,api});console.log(JSON.stringify(resultados.at(-1)));if(trace){const fim=new Promise(ok=>cdp.once('Tracing.tracingComplete',ok));await cdp.send('Tracing.end');const {stream}=await fim;let partes=[];for(;;){const b=await cdp.send('IO.read',{handle:stream});partes.push(b.data);if(b.eof)break;}await cdp.send('IO.close',{handle:stream});await writeFile(resolve(out,'trace-'+fase+'.json'),partes.join(''));}await writeFile(resolve(out,`${fase}-${process.env.QA_RODADA||'1'}.json`),JSON.stringify(resultados,null,2));};
 await medir('Reabrir início',async()=>{await p.reload({waitUntil:'domcontentloaded'});await p.locator('main h1').waitFor();});
 if(process.env.QA_STARTUP){const recursos=await p.evaluate(()=>({navigation:performance.getEntriesByType('navigation').map(e=>e.toJSON()),resources:performance.getEntriesByType('resource').map(e=>({path:new URL(e.name).pathname,start:Math.round(e.startTime),duration:Math.round(e.duration),transferSize:e.transferSize,type:e.initiatorType}))}));await writeFile(resolve(out,'inicio-'+fase+'.json'),JSON.stringify(recursos,null,2));await ctx.close();continue;}
 const visitadas=new Set();
 for(const rota of ['/clientes','/catalogo','/financeiro',c.ramo==='automotivo'?'/ordens-servico':'/atendimentos','/clientes']){
   const link=p.locator(`aside a[href="${rota}"]`).first();await link.evaluate(e=>{for(let d=e.closest('details');d;d=d.parentElement?.closest('details'))d.open=true;});
   // Simula localizar o item e apontar o mouse; tempo anterior ao clique é registrado separado.
   await link.hover();await p.waitForTimeout(180);
   const anterior=await p.locator('main h1').textContent();await medir((visitadas.has(rota)?'Voltar ':'Abrir ')+rota,async()=>{await link.click();await p.waitForURL(u=>u.pathname===rota);await p.waitForFunction(t=>document.querySelector('main h1')?.textContent!==t,anterior);await p.locator('main h1').waitFor();});visitadas.add(rota);
   if(rota==='/ordens-servico'||rota==='/atendimentos'){
     const nome=c.ramo==='automotivo'?'Nova OS':c.ramo==='assistencia_tecnica'?'Ordem de reparo':c.ramo==='manutencao_campo'?'Visita técnica':'Serviço de limpeza';
     const b=p.getByRole('button',{name:nome,exact:true}).first();await b.hover();await p.waitForTimeout(180);
     await medir('Abrir formulário',async()=>{await b.click();await p.locator('dialog[open] input').first().waitFor();});
     await p.locator('dialog[open]').getByRole('button',{name:'Fechar janela',exact:true}).click();
   }
 }
 await ctx.close();
}}finally{await browser.close();await new Promise(ok=>server.close(ok));}
