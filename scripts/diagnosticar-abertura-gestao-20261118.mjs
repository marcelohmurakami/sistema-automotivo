import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {preview} from 'vite';
import {chromium} from 'playwright';
import {createClient} from '@supabase/supabase-js';
import {sessaoQa} from './sessoes-qa-concorrencia-20261116.mjs';
const root=resolve('output/gestao-operacao-velocidade-20261118'),out=resolve(root,'abertura-pareada');await mkdir(out,{recursive:true});
while(true){const d=JSON.parse(await readFile(resolve(root,'depois/resultados.json')));if(d.verificacoes.filter(x=>x.nome==='Sem erro JavaScript').length===52)break;await new Promise(r=>setTimeout(r,10000))}
const env=Object.fromEntries((await readFile('.env.local','utf8')).split(/\r?\n/).filter(l=>/^VITE_SUPABASE_/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json')).contas.filter(x=>['retifica','assistencia_celulares','manutencao_climatizacao','limpeza_geral'].includes(x.especialidade));assert.equal(contas.length,4);
const servers={},urls={};for(const fase of ['antes','final']){servers[fase]=await preview({build:{outDir:resolve(root,'build-'+fase)},preview:{host:'127.0.0.1',port:0}});urls[fase]=servers[fase].resolvedUrls.local[0]}
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[],falhas=[];
const guardar=()=>writeFile(resolve(out,'resultado.json'),JSON.stringify({metodo:'Comparação alternada antes/final no mesmo período: quatro ramos, desktop e celular CPU 4x, duas rodadas por versão. Três rotas com abertura direta. Dados QA no Supabase; nenhuma gravação explícita. Demais bancadas encerradas.',resultados,falhas},null,2));
try{for(const c of contas){assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));const cli=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),session=await sessaoQa(cli,c);
for(const mobile of [false,true])for(let rodada=0;rodada<2;rodada++)for(const fase of rodada%2?['final','antes']:['antes','final']){
 const base=urls[fase],ctx=await browser.newContext({viewport:{width:mobile?390:1920,height:mobile?844:1080},isMobile:mobile,hasTouch:mobile,locale:'pt-BR',serviceWorkers:'block'});
 await ctx.addInitScript(({session,base})=>{if(location.origin===new URL(base).origin)localStorage.setItem('sb-hzihxtjirttetnfdujcx-auth-token',JSON.stringify(session));window.qaLongas=[];new PerformanceObserver(l=>window.qaLongas.push(...l.getEntries().map(x=>({inicio:x.startTime,duracao:x.duration})))).observe({type:'longtask',buffered:true})},{session,base});
 const p=await ctx.newPage();p.setDefaultTimeout(25000);if(mobile)await(await ctx.newCDPSession(p)).send('Emulation.setCPUThrottlingRate',{rate:4});const erros=[];p.on('pageerror',e=>erros.push(e.message));
 try{for(const[nome,path,rpc,selector]of [['Laudos','laudos','listar_laudos','.laudos-lista'],['Histórico','historico','consultar_historico_gestao','.historico-lista'],['Site','meu-site','administrar_site','.meu-site']]){
  const t=performance.now(),resposta=p.waitForResponse(r=>r.url().endsWith('/rpc/'+rpc)&&r.ok());await p.goto(base+path);await(await resposta).finished();await p.locator(selector).first().waitFor();await p.evaluate(()=>new Promise(requestAnimationFrame));const segundos=(performance.now()-t)/1000;
  const recursos=await p.evaluate(()=>({longas:window.qaLongas,documento:performance.getEntriesByType('navigation').map(x=>({resposta:x.responseEnd,dom:x.domContentLoadedEventEnd,load:x.loadEventEnd})),recursos:performance.getEntriesByType('resource').filter(x=>x.name.includes('/rpc/')||x.name.includes('/auth/v1/')||x.name.includes('/assets/')).map(x=>({nome:new URL(x.name).pathname,inicio:x.startTime,duracao:x.duration,transferencia:x.transferSize}))}));
  resultados.push({perfil:c.especialidade,mobile,rodada,fase,nome,segundos,...recursos});await guardar();
 }assert.deepEqual(erros,[])}catch(e){falhas.push({perfil:c.especialidade,mobile,rodada,fase,erro:e.message});await guardar()}finally{await ctx.close()}
 console.log('PASS diagnóstico',c.especialidade,mobile?'celular':'desktop',rodada,fase);
}}}finally{await browser.close();for(const s of Object.values(servers))await new Promise(r=>s.httpServer.close(r));await guardar()}
assert.deepEqual(falhas,[]);assert.equal(resultados.length,96);
