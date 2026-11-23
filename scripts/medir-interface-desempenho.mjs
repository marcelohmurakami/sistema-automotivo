// Comparação antes/depois: mesmos dados fictícios, Chrome, CPU 4x e rede 1,6 Mbps/150 ms.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {gzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
const fase=process.argv.includes('--antes')?'antes':'depois';
const out=resolve('output/desempenho-20261111'),dir=resolve(fase==='antes'?out+'/baseline/dist':'dist');
await mkdir(out,{recursive:true});
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost'),p=resolve(dir,'.'+decodeURIComponent(u.pathname));if(!p.startsWith(dir))throw Error('path');let data;try{data=await readFile(p);}catch{data=await readFile(resolve(dir,'index.html'));}const tipo=mime[extname(p)]||'text/html';res.setHeader('Content-Type',tipo);res.setHeader('Cache-Control',u.pathname.startsWith('/assets/')?'public,max-age=31536000,immutable':'no-cache');if(/gzip/.test(req.headers['accept-encoding']||'')){res.setHeader('Content-Encoding','gzip');data=gzipSync(data);}res.end(data);}catch{res.statusCode=500;res.end();}});
await new Promise(ok=>server.listen(5188,'127.0.0.1',ok));const base='http://127.0.0.1:5188';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const perfis=(process.env.QA_PERFIS||'mecanica,assistencia_celulares,manutencao_climatizacao,limpeza_geral').split(',');
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.filter(c=>perfis.includes(c.especialidade));
const rotas=(process.env.QA_ROTAS||'/,/clientes,/catalogo,/estoque,/financeiro,/relatorios,/funcionarios,/compras,/configuracoes').split(',');
const resultados=[];
const repeticao=process.env.QA_REPETICAO||'1';
const salvar=()=>writeFile(resolve(out,`navegador-${fase}-${repeticao}.json`),JSON.stringify({fase,repeticao,ambiente:{cpu:4,latencia:150,downloadMbps:1.6,uploadMbps:0.75,serviceWorker:'blocked',cache:'novo por empresa; navegação interna preserva cache',nota:'Consulta real nas empresas fictícias. Tempo de estabilidade inclui janela de 400 ms sem novas requisições da API e dos módulos da interface.'},resultados},null,2));
try{
 for(const conta of contas){
  assert(conta.empresa.startsWith('ZZ [TESTE 20261019] '));
  const auth=await browser.newContext({serviceWorkers:'block'}),login=await auth.newPage();
  await login.goto(base+'/entrar');await login.getByLabel('E-mail',{exact:true}).fill(conta.email);await login.getByLabel('Senha',{exact:true}).fill(conta.senha);await login.getByRole('button',{name:'Entrar no sistema',exact:true}).click();await login.waitForURL(u=>!u.pathname.startsWith('/entrar'));
  const storageState=await auth.storageState();await auth.close();
  const ctx=await browser.newContext({storageState,serviceWorkers:'block',viewport:{width:1366,height:900},locale:'pt-BR'}),p=await ctx.newPage();p.setDefaultTimeout(60000);
  await ctx.addInitScript(()=>{window.__perf={tarefas:[],erros:[]};try{new PerformanceObserver(l=>window.__perf.tarefas.push(...l.getEntries().map(x=>({start:x.startTime,duration:x.duration})))).observe({type:'longtask',buffered:true});}catch{}});
  const cdp=await ctx.newCDPSession(p);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:1.6*1024*1024/8,uploadThroughput:0.75*1024*1024/8});
  let requests=[],errors=[],ultimo=0;const pendentes=new Map();
  const api=req=>req.url().includes('/rest/v1/')||req.url().includes('/auth/v1/');
  p.on('request',req=>{if(api(req)||(req.url().startsWith(base)&&['script','stylesheet'].includes(req.resourceType()))){pendentes.set(req,performance.now());ultimo=performance.now();}});
  p.on('requestfinished',async req=>{const inicio=pendentes.get(req);if(inicio){pendentes.delete(req);ultimo=performance.now();if(api(req)){const resp=await req.response();requests.push({endpoint:new URL(req.url()).pathname,duracaoMs:Math.round(performance.now()-inicio),status:resp.status()});}}});
  p.on('requestfailed',req=>{pendentes.delete(req);ultimo=performance.now();});p.on('pageerror',e=>errors.push(e.message));
  for(const rota of rotas){
   requests=[];errors=[];pendentes.clear();ultimo=performance.now();const inicio=performance.now();let ok=true,erro='';
   await p.evaluate(()=>{performance.clearResourceTimings();if(window.__perf)window.__perf.tarefas=[];});
   try{
    const anterior=await p.locator('main h1').first().textContent({timeout:50}).catch(()=>null);
    if(rota==='/')await p.goto(base,{waitUntil:'domcontentloaded'});
    else {const link=p.locator(`a[href="${rota}"]`).first();if(await link.isVisible()){await link.click();}else await p.goto(base+rota,{waitUntil:'domcontentloaded'});}
    await p.waitForURL(u=>u.pathname===rota);
    if(anterior)await p.waitForFunction(texto=>{const h=document.querySelector('main h1');return h&&h.textContent!==texto;},anterior,{timeout:60000});
    await p.locator('main h1').first().waitFor({timeout:60000});
    await p.waitForTimeout(200);
    while(performance.now()-inicio<60000&&(pendentes.size||performance.now()-ultimo<400))await p.waitForTimeout(100);
    await p.locator('main').getByText('Não conseguimos abrir esta tela.',{exact:true}).waitFor({timeout:30}).then(()=>{throw Error('Tela de erro');},()=>{});
    if(pendentes.size)throw Error('Consultas não concluídas em 60 s');
   }catch(e){ok=false;erro=e.message.split('\n')[0];}
   const tempoMs=Math.round(performance.now()-inicio);
   const metrics=await p.evaluate(()=>({tarefas:window.__perf?.tarefas||[],recursos:performance.getEntriesByType('resource').map(r=>({url:new URL(r.name).pathname,bytes:r.encodedBodySize,transferencia:r.transferSize,ms:r.duration,tipo:r.initiatorType})),nos:document.querySelectorAll('*').length,largura:innerWidth,conteudo:document.documentElement.scrollWidth}));
   const dados={perfil:conta.especialidade,rota,tempoMs,ok,erro,erros:errors,consultas:requests,pendentes:pendentes.size,dom:metrics.nos,overflow:metrics.conteudo>metrics.largura+2,tarefasLongas:metrics.tarefas,recursos:metrics.recursos};resultados.push(dados);
   await p.screenshot({path:resolve(out,`${fase}-${conta.especialidade}-${rota.replaceAll('/','_')||'inicio'}.png`),fullPage:false});
   console.log(`${fase} ${conta.especialidade} ${rota}: ${tempoMs} ms, ${requests.length} consultas, ${metrics.nos} nós, ${ok?'OK':erro}`);await salvar();
  }
  await ctx.close();
 }
}finally{await salvar();await browser.close();await new Promise(ok=>server.close(ok));}
