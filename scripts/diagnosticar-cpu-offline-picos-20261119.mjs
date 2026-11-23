import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { preview, loadConfigFromFile } from 'vite';
import { chromium } from './lib/chrome-conferencia.mjs';
import { createClient } from '@supabase/supabase-js';
import { sessaoQa } from './sessoes-qa-concorrencia-20261116.mjs';
const root=resolve(process.env.QA_RAIZ || 'output/picos-51-20261119'), out=resolve(root,process.env.QA_DATAS?'datas-offline':process.env.QA_TRACE?'trace-offline':'cpu-offline');
await mkdir(out,{recursive:true});
const env=Object.fromEntries((await readFile('.env.local','utf8')).split(/\r?\n/).filter(l=>/^VITE_SUPABASE_/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
const conta=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json')).contas.find(c=>c.especialidade==='autoeletrica');
assert(conta.empresa.startsWith('ZZ [TESTE 20261019] '));
const session=await sessaoQa(createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),conta);
const configuration=await loadConfigFromFile({command:'serve',mode:'production'},resolve('vite.config.ts'));
const server=await preview({...configuration.config,configFile:false,build:{...configuration.config.build,outDir:resolve(root,'build-depois')},preview:{host:'127.0.0.1',port:0}});
const base=server.resolvedUrls.local[0], browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}), resultados=[];
try {
  for(let i=0;i<(process.env.QA_TRACE?3:8);i++) {
    const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
    await ctx.addInitScript(({session,base})=>{if(location.origin===new URL(base).origin)localStorage.setItem('sb-hzihxtjirttetnfdujcx-auth-token',JSON.stringify(session));window.qaLongas=[];new PerformanceObserver(l=>window.qaLongas.push(...l.getEntries().map(x=>({inicio:x.startTime,duracao:x.duration})))).observe({type:'longtask',buffered:true})},{session,base});
    if(process.env.QA_DATAS)await ctx.addInitScript(()=>{window.qaDatas=[];for(const key of ['DateTimeFormat','NumberFormat']){const original=Intl[key];Intl[key]=new Proxy(original,{construct(target,args,newTarget){const t=performance.now();try{return Reflect.construct(target,args,newTarget)}finally{window.qaDatas.push({tipo:key,ms:performance.now()-t,inicio:t})}}})}const original=Date.prototype.toLocaleDateString;Date.prototype.toLocaleDateString=function(...args){const t=performance.now();try{return original.apply(this,args)}finally{window.qaDatas.push({tipo:'toLocaleDateString',ms:performance.now()-t,inicio:t})}}});
    const p=await ctx.newPage(), cdp=await ctx.newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    const events=[];
    if(process.env.QA_TRACE){cdp.on('Tracing.dataCollected',e=>events.push(...e.value));await cdp.send('Tracing.start',{categories:'devtools.timeline,v8,blink.user_timing,disabled-by-default-devtools.timeline',transferMode:'ReportEvents'})}
    await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
    const t=performance.now();
    await p.goto(base+'execucao-offline');
    await p.locator('.offline-resumo').getByText(conta.empresa,{exact:true}).waitFor();
    await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const segundos=(performance.now()-t)/1000;
    const {profile}=await cdp.send('Profiler.stop');
    if(process.env.QA_TRACE){const done=new Promise(r=>cdp.once('Tracing.tracingComplete',r));await cdp.send('Tracing.end');await done;await writeFile(resolve(out,`trace-${i+1}.json`),JSON.stringify({traceEvents:events}));console.log('TRACE',i+1,JSON.stringify(events.filter(e=>e.ph==='X'&&e.dur>50000).sort((a,b)=>b.dur-a.dur).slice(0,25).map(e=>({name:e.name,cat:e.cat,dur:e.dur/1000,args:e.args}))))}
    await writeFile(resolve(out,`amostra-${i+1}.cpuprofile`),JSON.stringify(profile));
    const diagnostico=await p.evaluate(()=>({datas:window.qaDatas,longas:window.qaLongas,recursos:performance.getEntriesByType('resource').map(x=>({nome:new URL(x.name).pathname,inicio:x.startTime,duracao:x.duration}))}));
    const nodeMap=new Map(profile.nodes.map(n=>[n.id,n])), totals=new Map();
    profile.samples.forEach((id,j)=>{const n=nodeMap.get(id), key=JSON.stringify(n.callFrame);totals.set(key,(totals.get(key)||0)+(profile.timeDeltas[j]||0))});
    const top=[...totals].sort((a,b)=>b[1]-a[1]).slice(0,30).map(([k,v])=>({...JSON.parse(k),ms:v/1000}));
    resultados.push({rodada:i+1,segundos,...diagnostico,top});
    console.log(JSON.stringify({rodada:i+1,segundos,datas:diagnostico.datas,top:top.slice(0,6).map(x=>({nome:x.functionName,url:x.url,ms:x.ms}))}));
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});await cdp.detach();await ctx.close();
  }
} finally {await browser.close();await new Promise(r=>server.httpServer.close(r));await writeFile(resolve(out,'resultados.json'),JSON.stringify({metodo:'Diagnóstico de CPU com profiler ligado: não misturar tempos com a matriz principal. 8 contextos frios, celular CPU4x, build corrigido e empresa fictícia autoelétrica.',resultados},null,2))}
