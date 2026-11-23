import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {preview,loadConfigFromFile} from 'vite';
import {chromium} from './lib/chrome-conferencia.mjs';
import {createClient} from '@supabase/supabase-js';
import {sessaoQa} from './sessoes-qa-concorrencia-20261116.mjs';
const root=resolve('output/offline-picos-20261119'),out=resolve(process.env.QA_OUTPUT||resolve(root,'comparacao-26'));await mkdir(out,{recursive:true});
const rodadas=Number(process.env.QA_RODADAS||5);
const env=Object.fromEntries((await readFile('.env.local','utf8')).split(/\r?\n/).filter(l=>/^VITE_SUPABASE_/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json')).contas.filter(c=>!process.env.QA_AMOSTRA||process.env.QA_AMOSTRA.split(',').includes(c.especialidade));
if(!process.env.QA_AMOSTRA)assert.equal(contas.length,26);
const servers={},urls={},builds={},resultados=[],falhas=[],rede=[],iniciadoEm=new Date().toISOString();
for(const fase of ['antes','depois']){
  const pasta=resolve(fase==='antes'?(process.env.QA_BUILD_ANTES||'output/picos-51-20261119/build-depois'):process.env.QA_BUILD_DEPOIS||resolve(root,'build-depois'));
  builds[fase]={pasta,indexSha256:createHash('sha256').update(await readFile(resolve(pasta,'index.html'))).digest('hex')};
  const configuration=await loadConfigFromFile({command:'serve',mode:'production'},resolve('vite.config.ts'));
  servers[fase]=await preview({...configuration.config,configFile:false,build:{...configuration.config.build,outDir:pasta},preview:{host:'127.0.0.1',port:0}});urls[fase]=servers[fase].resolvedUrls.local[0];
}
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const guardar=()=>writeFile(resolve(out,'resultados.json'),JSON.stringify({metodo:'Abertura fria de /execucao-offline. Frontend compilado local e Supabase publicado; mesmo proxy com keep-alive nas duas versões. Contexto novo para cada leitura, cache de navegador vazio, service worker bloqueado. Cinco rodadas planejadas (ou QA_RODADAS), versões alternadas. Desktop1920x1080/CPU1x; celular390x844/toque/CPU4x. Aguarda a empresa, as leituras IndexedDB e o botão Preparar habilitado, mais duas pinturas. Preserva falhas e todas as amostras. Não mede tempo de digitação nem aparelho físico.',rodadas,iniciadoEm,geradoEm:new Date().toISOString(),builds,resultados,falhas,rede},null,2));
await writeFile(resolve(out,'medicoes.ndjson'),'');
try {
  for(let rodada=0;rodada<rodadas;rodada++)for(const [indice,c] of contas.entries()){
    assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
    const session=await sessaoQa(createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),c);
    for(const mobile of [false,true])for(const fase of (indice+rodada+Number(mobile))%2?['depois','antes']:['antes','depois']){
      const ctx=await browser.newContext({viewport:{width:mobile?390:1920,height:mobile?844:1080},isMobile:mobile,hasTouch:mobile,locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'}),base=urls[fase];
      await ctx.addInitScript(({session,base})=>{
        if(location.origin===new URL(base).origin)localStorage.setItem('sb-hzihxtjirttetnfdujcx-auth-token',JSON.stringify(session));
        window.qaLongas=[];window.qaIDB=0;
        new PerformanceObserver(l=>window.qaLongas.push(...l.getEntries().map(x=>({inicio:x.startTime,duracao:x.duration})))).observe({type:'longtask',buffered:true});
        const tx=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(...args){const r=tx.apply(this,args);window.qaIDB++;r.addEventListener('complete',()=>window.qaIDB--,{once:true});r.addEventListener('abort',()=>window.qaIDB--,{once:true});return r};
      },{session,base});
      const p=await ctx.newPage(),cdp=await ctx.newCDPSession(p),erros=[];p.setDefaultTimeout(30000);
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:mobile?4:1});
      p.on('pageerror',e=>erros.push(e.message));
      p.on('response',r=>{if(r.url().includes('/rpc/'))rede.push({rodada:rodada+1,perfil:c.especialidade,mobile,fase,rpc:r.url().split('/').at(-1),status:r.status()})});
      const t=performance.now();
      try{
        await p.goto(base+'execucao-offline');
        await p.locator('.offline-resumo').getByText(c.empresa,{exact:true}).waitFor();
        await p.waitForFunction(()=>window.qaIDB===0&&!document.querySelector('.offline-preparo button')?.disabled);
        await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        const segundos=(performance.now()-t)/1000;
        const dados=await p.evaluate(()=>({longas:window.qaLongas,recursos:performance.getEntriesByType('resource').map(x=>({nome:new URL(x.name).pathname,inicio:x.startTime,duracao:x.duration,bytes:x.transferSize})),overflow:document.documentElement.scrollWidth-innerWidth,agora:performance.now()}));
        assert.deepEqual(erros,[]);assert(dados.overflow<=2);
        if(fase==='depois')assert(!dados.recursos.some(x=>/\/(RotasSistema|FichaEspecialidade|NovosAtendimentosOffline)-/.test(x.nome)),'Código online ou editor carregado antes de ser usado');
        const r={rodada:rodada+1,perfil:c.especialidade,mobile,fase,segundos,...dados};resultados.push(r);await appendFile(resolve(out,'medicoes.ndjson'),JSON.stringify(r)+'\n');
        if(rodada===0&&['retifica','assistencia_celulares','manutencao_climatizacao','limpeza_geral'].includes(c.especialidade))await p.screenshot({path:resolve(out,`${c.especialidade}-${mobile?'celular':'desktop'}-${fase}.png`),fullPage:true});
        console.log('PASS',rodada+1,c.especialidade,mobile?'celular':'desktop',fase,segundos.toFixed(3));
      }catch(e){falhas.push({rodada:rodada+1,perfil:c.especialidade,mobile,fase,erro:e.message});console.log('FALHA',rodada+1,c.especialidade,mobile,fase,e.message.split('\n')[0]);await p.screenshot({path:resolve(out,`falha-${c.especialidade}-${mobile}-${fase}-${rodada}.png`)}).catch(()=>{})}
      finally{await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});await cdp.detach();await ctx.close();await guardar()}
    }
  }
}finally{await browser.close();for(const s of Object.values(servers))await new Promise(r=>s.httpServer.close(r));await guardar()}
assert.deepEqual(falhas,[]);assert.equal(resultados.length,contas.length*4*rodadas);
