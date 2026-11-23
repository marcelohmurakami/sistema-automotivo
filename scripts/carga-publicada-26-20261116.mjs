import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import os from 'node:os';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import {chromium} from 'playwright';
import {createClient} from '@supabase/supabase-js';
import {sessaoQa} from './sessoes-qa-concorrencia-20261116.mjs';
const root='output/timeouts-concorrencia-26-20261116',fase=process.env.QA_FASE||'antes',limite=Number(process.env.QA_CONCORRENCIA||4),out=root+'/'+fase+'-'+limite;
await mkdir(out,{recursive:true});
const base='https://patio-gestao-peach.vercel.app',api='https://hzihxtjirttetnfdujcx.supabase.co';
const env=Object.fromEntries((await readFile('.env.local','utf8')).split(/\r?\n/).filter(l=>/^VITE_SUPABASE_/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));assert.equal(env.VITE_SUPABASE_URL,api);
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas;assert.equal(contas.length,26);assert(contas.every(c=>c.empresa.startsWith('ZZ [TESTE 20261019] ')));
const build=await fetch(base+'/health.json?qa='+Date.now()).then(r=>r.json());
const sessoes=[];for(const c of contas){const cli=createClient(api,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});sessoes.push(await sessaoQa(cli,c));}
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const resultados=[],requisicoes=[],falhas=[],erroJs=[];let proximo=0,ativos=0,pico=0,parar=false;
const recursos=[],lag=monitorEventLoopDelay({resolution:20});lag.enable();
const cpu=()=>os.cpus().reduce((s,c)=>({idle:s.idle+c.times.idle,total:s.total+Object.values(c.times).reduce((a,b)=>a+b,0)}),{idle:0,total:0});let cpuAnterior=cpu();
const medidor=setInterval(()=>{const atual=cpu(),dt=atual.total-cpuAnterior.total;recursos.push({hora:new Date().toISOString(),cpuPercent:dt?100*(1-(atual.idle-cpuAnterior.idle)/dt):0,memoriaLivreMiB:os.freemem()/1048576,atrasoEventLoopP95Ms:lag.percentile(95)/1e6});cpuAnterior=atual;lag.reset()},1000);
const inicio=new Date().toISOString(),start=performance.now();
const salvar=()=>writeFile(out+'/resultado.json',JSON.stringify({fase,limite,build:build.build,inicio,fim:new Date().toISOString(),duracao:(performance.now()-start)/1000,pico,paradaPreventiva:parar,resultados,requisicoes,falhas,erroJs,gerador:{cpus:os.cpus().length,memoriaTotal:os.totalmem(),memoriaLivre:os.freemem(),recursos}},null,2));
async function usuario(i){
 const c=contas[i],mobile=i%2===1,ctx=await browser.newContext({viewport:{width:mobile?390:1920,height:mobile?844:1080},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block',locale:'pt-BR',timezoneId:'America/Sao_Paulo'});
 await ctx.addInitScript(({session,base})=>{if(location.origin===base&&!localStorage.getItem('sb-hzihxtjirttetnfdujcx-auth-token'))localStorage.setItem('sb-hzihxtjirttetnfdujcx-auth-token',JSON.stringify(session))},{session:sessoes[i],base});
 const p=await ctx.newPage();p.setDefaultTimeout(35000);const tempos=new Map();
 p.on('pageerror',e=>erroJs.push({perfil:c.especialidade,erro:e.message}));
 p.on('request',r=>{if(r.url().startsWith(api+'/rest/v1/')){const payload=r.postDataJSON();if(payload?.p_oficina)assert.equal(payload.p_oficina,c.empresa_id);tempos.set(r,{perfil:c.especialidade,nome:new URL(r.url()).pathname.split('/').pop(),inicio:performance.now()})}});
 p.on('requestfinished',async r=>{const t=tempos.get(r);if(t){const response=await r.response(),rede=r.timing();const dado={perfil:t.perfil,nome:t.nome,segundos:(performance.now()-t.inicio)/1000,redeSegundos:rede.responseEnd/1000,esperaPrimeiroByteSegundos:(rede.responseStart-rede.requestStart)/1000,status:response.status()};if(!response.ok()){try{dado.erro=JSON.parse(await response.text()).code}catch{}if(response.status()>=500){falhas.push(dado);if(falhas.length>=3)parar=true;}}requisicoes.push(dado)}});
 try{for(const rota of ['', 'orcamentos',c.ramo==='automotivo'?'ordens-servico':'atendimentos']){
  if(parar)break;const t=performance.now(),rpc=c.ramo==='automotivo'?(rota==='orcamentos'?'listar_orcamentos_gestao':rota==='ordens-servico'?'listar_ordens_servico_gestao':'ordens_servico'):'pagina_servicos';
  const response=p.waitForResponse(r=>r.url().split('?')[0].endsWith('/'+rpc),{timeout:35000});
  await p.goto(base+'/'+rota,{waitUntil:'domcontentloaded',timeout:40000});const r=await response;assert(r.ok(),'Consulta '+rpc+' HTTP '+r.status());await p.getByRole('main').waitFor();
  assert.equal(await p.getByText('Não conseguimos abrir esta tela.',{exact:true}).count(),0);
  await p.waitForTimeout(250);const medidas=await p.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert(medidas.scroll<=medidas.width+2);
  resultados.push({perfil:c.especialidade,ramo:c.ramo,mobile,rota:rota||'painel',segundos:(performance.now()-t)/1000,ok:true});await salvar();
 }console.log('PASS consultas',c.especialidade);}catch(e){falhas.push({perfil:c.especialidade,erro:e.message});if(falhas.length>=3)parar=true;console.log('FAIL',c.especialidade,e.message.slice(0,180));await p.screenshot({path:out+'/'+c.especialidade+'-falha.png'}).catch(()=>{});}finally{await ctx.close();}
}
try{await Promise.all(Array.from({length:limite},async()=>{while(proximo<contas.length&&!parar){const i=proximo++;ativos++;pico=Math.max(pico,ativos);try{await usuario(i)}finally{ativos--;await salvar()}}}));}finally{await browser.close();clearInterval(medidor);lag.disable();await salvar()}
console.log(JSON.stringify({pico,operacoes:resultados.length,falhas:falhas.length,parar}));if(falhas.length||resultados.length!==78)process.exitCode=1;
