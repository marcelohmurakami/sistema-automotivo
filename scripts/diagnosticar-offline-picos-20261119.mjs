import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {preview,loadConfigFromFile} from 'vite';
import {chromium} from './lib/chrome-conferencia.mjs';
import {createClient} from '@supabase/supabase-js';
import {sessaoQa} from './sessoes-qa-concorrencia-20261116.mjs';
const residual=!!process.env.QA_RESIDUAL;
const out=resolve('output/offline-picos-20261119',residual?(process.env.QA_DIAG_SAIDA || 'diagnostico-residual'):'.');await mkdir(out,{recursive:true});
const env=Object.fromEntries((await readFile('.env.local','utf8')).split(/\r?\n/).filter(l=>/^VITE_SUPABASE_/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
const c=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json')).contas.find(c=>c.especialidade==='autoeletrica');assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
const session=await sessaoQa(createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),c);
const configuration=await loadConfigFromFile({command:'serve',mode:'production'},resolve('vite.config.ts'));
const server=await preview({...configuration.config,configFile:false,build:{...configuration.config.build,outDir:resolve(residual?'output/offline-picos-20261119/build-depois':'output/picos-51-20261119/build-depois')},preview:{host:'127.0.0.1',port:0}});
const base=server.resolvedUrls.local[0],browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[];
const variantes=process.env.QA_INSTRUMENTO?['original','observadorNativo']:residual?['original','semCriarDatas','semIntlInicial','semDatasNemIntl']:['original','semDatasNativas','semFonte','intlSobDemanda','cpuNormal'];
const guardar=()=>writeFile(resolve(out,'diagnostico-causal.json'),JSON.stringify({metodo:'8 rodadas, variantes alternadas, mesmo build anterior e mesma empresa fictícia. Alterações somente no instrumento para testar hipóteses; nenhuma destas variantes é uma correção de aplicação. Celular 390x844 CPU4x, exceto controle cpuNormal. Sem profiler; calibração de CPU feita após medir a abertura.',resultados},null,2));
try {
  for(let rodada=0;rodada<8;rodada++)for(const variante of [...variantes.slice(rodada%variantes.length),...variantes.slice(0,rodada%variantes.length)]){
    const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
    await ctx.addInitScript(({session,base,variante,empresa})=>{
      if(location.origin===new URL(base).origin)localStorage.setItem('sb-hzihxtjirttetnfdujcx-auth-token',JSON.stringify(session));
      window.qaLongas=[];window.qaIDB=0;window.qaDatas=[];window.qaAlterados=0;
      new PerformanceObserver(l=>window.qaLongas.push(...l.getEntries().map(x=>({inicio:x.startTime,duracao:x.duration})))).observe({type:'longtask',buffered:true});
      const tx=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(...args){const r=tx.apply(this,args);window.qaIDB++;r.addEventListener('complete',()=>window.qaIDB--,{once:true});r.addEventListener('abort',()=>window.qaIDB--,{once:true});return r};
      window.qaProntoPromise=new Promise(resolve=>{
        let verificando=false;
        const condicao=()=>window.qaIDB===0&&document.querySelector('.offline-resumo')?.textContent.includes(empresa)&&document.querySelector('.offline-preparo button')?.disabled===false;
        const verificar=()=>{if(verificando||!condicao())return;verificando=true;requestAnimationFrame(()=>requestAnimationFrame(()=>{if(condicao()){window.qaPronto=performance.now();observer.disconnect();clearInterval(timer);resolve(window.qaPronto)}else verificando=false}))};
        const observer=new MutationObserver(verificar);observer.observe(document,{subtree:true,childList:true,attributes:true});const timer=setInterval(verificar,50);
      });
      if(variante==='semDatasNativas')new MutationObserver(()=>{for(const el of document.querySelectorAll('input[type=date]')){el.type='text';window.qaAlterados++}}).observe(document,{subtree:true,childList:true});
      if(['semCriarDatas','semDatasNemIntl'].includes(variante)){
        const setAttribute=Element.prototype.setAttribute;
        Element.prototype.setAttribute=function(k,v){if(this instanceof HTMLInputElement&&k==='type'&&v==='date'){v='text';window.qaAlterados++}return setAttribute.call(this,k,v)};
        const tipo=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'type');
        Object.defineProperty(HTMLInputElement.prototype,'type',{...tipo,set(v){if(v==='date'){v='text';window.qaAlterados++}return tipo.set.call(this,v)}});
      }
      if(['semIntlInicial','semDatasNemIntl'].includes(variante)){
        const formatar=Date.prototype.toLocaleDateString;
        Date.prototype.toLocaleDateString=function(...args){if(args[0]==='en-CA'&&!args[1])return [this.getFullYear(),String(this.getMonth()+1).padStart(2,'0'),String(this.getDate()).padStart(2,'0')].join('-');return formatar.apply(this,args)};
      }
      for(const key of ['DateTimeFormat','NumberFormat']){
        const original=Intl[key];
        Intl[key]=new Proxy(original,{construct(target,args){
          const criar=()=>{const t=performance.now();try{return Reflect.construct(target,args)}finally{window.qaDatas.push({tipo:key,ms:performance.now()-t,inicio:t})}};
          if(!['intlSobDemanda','semIntlInicial','semDatasNemIntl'].includes(variante))return criar();
          let valor;return new Proxy({}, {get(_,prop){valor??=criar();const member=Reflect.get(valor,prop,valor);return typeof member==='function'?member.bind(valor):member}});
        }});
      }
    },{session,base,variante,empresa:c.empresa});
    if(variante==='semFonte')await ctx.route('**/*.woff2',r=>r.abort());
    const p=await ctx.newPage(),cdp=await ctx.newCDPSession(p),erros=[];
    p.on('pageerror',e=>erros.push(e.message));
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:variante==='cpuNormal'?1:4});
    const inicio=performance.now();
    try {
      await p.goto(base+'execucao-offline');
      if(variante==='observadorNativo')await cdp.send('Runtime.evaluate',{expression:'window.qaProntoPromise',awaitPromise:true,returnByValue:true});
      else {
        await p.locator('.offline-resumo').getByText(c.empresa,{exact:true}).waitFor();
        await p.waitForFunction(()=>window.qaIDB===0&&!document.querySelector('.offline-preparo button')?.disabled);
        await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      }
      const segundos=(performance.now()-inicio)/1000;
      const dados=await p.evaluate(()=>({prontoNativo:window.qaPronto,longas:window.qaLongas,datas:window.qaDatas,alterados:window.qaAlterados,recursos:performance.getEntriesByType('resource').map(x=>({nome:new URL(x.name).pathname,inicio:x.startTime,duracao:x.duration})),overflow:document.documentElement.scrollWidth-innerWidth}));
      const calibracao=await p.evaluate(()=>{const t=performance.now();let s=0;for(let i=0;i<2e6;i++)s+=Math.sqrt(i);return {ms:performance.now()-t,resultado:s}});
      resultados.push({rodada:rodada+1,variante,segundos,...dados,calibracao,erros});
      assert.deepEqual(erros,[]);console.log(rodada+1,variante,segundos.toFixed(3),'CPU',calibracao.ms.toFixed(1),'tarefas',dados.longas.reduce((s,x)=>s+x.duracao,0));
    } finally {await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});await cdp.detach();await ctx.close();await guardar()}
  }
} finally {await browser.close();await new Promise(r=>server.httpServer.close(r));await guardar()}
