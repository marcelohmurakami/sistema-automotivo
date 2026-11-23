import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {createClient} from '@supabase/supabase-js';
import {sessaoQa} from './sessoes-qa-concorrencia-20261116.mjs';
import {preview} from 'vite';
const root=resolve('output/picos-abertura-20261117'),fase=process.env.QA_FASE||'diagnostico',out=resolve(root,fase),dist=resolve(process.env.QA_BUILD||'output/clientes-estoque-velocidade-20261117/build-final');await mkdir(out,{recursive:true});
const vite = await preview({ build: { outDir: dist }, preview: { host: '127.0.0.1', port: 0, strictPort: true } });
const base=process.env.QA_URL||`http://127.0.0.1:${vite.httpServer.address().port}`;
const env=Object.fromEntries((await readFile('.env.local','utf8')).split(/\r?\n/).filter(l=>/^VITE_SUPABASE_/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.filter(c=>!process.env.QA_PERFIS||process.env.QA_PERFIS.split(',').includes(c.especialidade));
const sessoes=[];for(const c of contas){assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));const cli=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});sessoes.push(await sessaoQa(cli,c))}
const resultados=[],falhas=[],browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:process.env.QA_DNS_BLOQUEADO?['--host-resolver-rules=MAP hzihxtjirttetnfdujcx.supabase.co ~NOTFOUND']:[]});
const salvar=()=>writeFile(resolve(out,'resultados.json'),JSON.stringify({fase,base,build:JSON.parse(awaitReadHealth),geradoEm:new Date().toISOString(),condicoes:{desktop:'1920x1080',celular:'390x844, toque, CPU 4x',cache:'Contexto novo por abertura',workers:Number(process.env.QA_WORKERS||1),dnsBloqueado:!!process.env.QA_DNS_BLOQUEADO,serviceWorker:!!process.env.QA_SW,redeLenta:!!process.env.QA_REDE_LENTA,criterio:'Dados visíveis; inclui mudanças de texto do React'},resultados,falhas},null,2));
const awaitReadHealth=process.env.QA_URL?await (await fetch(base+'/health.json')).text():await readFile(resolve(dist,'health.json'),'utf8');
const path=url=>{try{const u=new URL(url);return u.hostname+u.pathname}catch{return 'local'}};
async function caso(i,mobile,rodada,rota){
 const c=contas[i],ctx=await browser.newContext({viewport:{width:mobile?390:1920,height:mobile?844:1080},isMobile:mobile,hasTouch:mobile,locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:process.env.QA_SW?'allow':'block'});
 await ctx.addInitScript(({session,base,rota})=>{
  if(location.origin!==base)return;localStorage.setItem('sb-hzihxtjirttetnfdujcx-auth-token',JSON.stringify(session));
  const d=window.qaInicio={marcas:[],fetches:[],tarefas:[],pronta:null};const mark=n=>d.marcas.push({n,t:performance.now()});
  document.addEventListener('DOMContentLoaded',()=>mark('DOMContentLoaded'));window.addEventListener('load',()=>mark('load'));
  try{new PerformanceObserver(l=>d.tarefas.push(...l.getEntries().map(e=>({inicio:e.startTime,duracao:e.duration})))).observe({type:'longtask',buffered:true})}catch{}
  const observar=()=>{if(d.pronta!==null)return;const e=rota==='/clientes'?document.querySelector('.lista-clientes'):rota==='/estoque'?document.querySelector('.lista-estoque'):document.querySelector('.mapa-visao-rapida, .lista-clientes, .servicos-indicadores');if(e&&e.getBoundingClientRect().height>0&&!e.textContent.includes('—')&&!Array.from(document.querySelectorAll('.assistencia-coluna [role="status"]')).some(n=>n.textContent.includes('Carregando'))){d.pronta=performance.now();mark('conteudo-visivel')}};
  new MutationObserver(observar).observe(document,{childList:true,subtree:true,characterData:true});
  const original=window.fetch.bind(window);window.fetch=async(input,init)=>{const u=new URL(typeof input==='string'?input:input.url||String(input),location.href);if(!u.pathname.includes('/rest/v1/')&&!u.pathname.includes('/auth/v1/'))return original(input,init);const f={nome:u.pathname,inicio:performance.now()};d.fetches.push(f);try{const r=await original(input,init);f.headers=performance.now();f.status=r.status;for(const metodo of ['text','json']){const ler=r[metodo].bind(r);r[metodo]=async()=>{const v=await ler();f.corpo=performance.now();return v}}return r}catch(e){f.erro=e.name;f.fim=performance.now();throw e}};
 },{session:sessoes[i],base,rota});
 const p=await ctx.newPage(),cdp=await ctx.newCDPSession(p);await cdp.send('Network.enable');if(mobile)await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 if(process.env.QA_REDE_LENTA)await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:93750});
 const rede=[],index=new Map(),erros=[];let dcl=null;const t=performance.now();p.once('domcontentloaded',()=>dcl=performance.now()-t);p.on('pageerror',e=>erros.push(e.message));
 cdp.on('Network.requestWillBeSent',e=>{const a={id:e.requestId,url:path(e.request.url),tipo:e.type,inicio:e.timestamp,wall:e.wallTime};rede.push(a);index.set(e.requestId,a)});
 cdp.on('Network.responseReceived',e=>{const a=index.get(e.requestId);if(a){a.headers=e.timestamp;a.status=e.response.status;a.protocolo=e.response.protocol;a.timing=e.response.timing}});
 cdp.on('Network.loadingFinished',e=>{const a=index.get(e.requestId);if(a){a.fim=e.timestamp;a.bytes=e.encodedDataLength}});
 cdp.on('Network.loadingFailed',e=>{const a=index.get(e.requestId);if(a){a.fim=e.timestamp;a.erro=e.errorText}});
 try{
  await p.goto(base+rota,{waitUntil:'commit'});const commit=performance.now()-t;
  await p.waitForFunction(()=>window.qaInicio?.pronta!==null&&window.qaInicio?.pronta!==undefined,{},{timeout:Number(process.env.QA_TIMEOUT||30000)});const observada=performance.now()-t;
  await p.waitForLoadState('domcontentloaded',{timeout:30000});
  if(process.env.QA_CAPTURA_LONGA)await p.waitForTimeout(11000);
  const pagina=await p.evaluate(()=>({dados:window.qaInicio,navegacao:performance.getEntriesByType('navigation').map(e=>e.toJSON()),recursos:performance.getEntriesByType('resource').map(e=>({nome:new URL(e.name).pathname,inicio:e.startTime,duracao:e.duration,tipo:e.initiatorType,ttfb:e.responseStart-e.requestStart,bytes:e.transferSize})),rolagem:document.documentElement.scrollWidth-innerWidth}));
  assert.equal(erros.length,0);assert(pagina.dados.pronta>0);assert(pagina.rolagem<=2);
  if(process.env.QA_FOTOS)await p.screenshot({path:resolve(out,`${c.especialidade}-${mobile?'celular':'desktop'}-${rodada}-${rota.replaceAll('/','')||'inicio'}.png`)});
  resultados.push({perfil:c.especialidade,mobile,rodada,rota,commit,observada,dcl,segundos:pagina.dados.pronta/1000,pagina,rede});console.log('PASS',c.especialidade,mobile,rodada,rota,'pronta',Math.round(pagina.dados.pronta),'dcl',Math.round(dcl));
 }catch(e){falhas.push({perfil:c.especialidade,mobile,rodada,rota,erro:e.message,rede,pagina:await p.evaluate(()=>window.qaInicio).catch(()=>null)});console.log('FAIL',c.especialidade,e.message.slice(0,200));await p.screenshot({path:resolve(out,`${c.especialidade}-${mobile}-${rodada}-falha.png`)})}
 finally{await ctx.close();await salvar()}
}
try{const tarefas=[];for(let rodada=1;rodada<=Number(process.env.QA_RODADAS||1);rodada++)for(let i=0;i<contas.length;i++)for(const mobile of (process.env.QA_DESKTOP?[false]:[false,true]))for(const rota of (process.env.QA_ROTAS||'/clientes').split(','))tarefas.push({i,mobile,rodada,rota});let proxima=0;await Promise.all(Array.from({length:Number(process.env.QA_WORKERS)||1},async()=>{while(proxima<tarefas.length){const a=tarefas[proxima++];await caso(a.i,a.mobile,a.rodada,a.rota)}}))}finally{await browser.close();await new Promise(r=>vite.httpServer.close(r));await salvar()}
assert.equal(falhas.length,0);
