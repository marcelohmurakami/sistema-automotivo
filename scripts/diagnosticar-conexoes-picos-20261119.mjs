import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {Agent} from 'node:https';
import {preview} from 'vite';
import {createClient} from '@supabase/supabase-js';
import {sessaoQa} from './sessoes-qa-concorrencia-20261116.mjs';
const root='output/picos-51-20261119';
const env=Object.fromEntries((await readFile('.env.local','utf8')).split(/\r?\n/).filter(l=>/^VITE_SUPABASE_/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
const conta=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.find(c=>c.especialidade==='manutencao_equipamentos');
const cli=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),sessao=await sessaoQa(cli,conta);
const agent=new Agent({keepAlive:true,maxSockets:32,maxFreeSockets:8,timeout:30000});
const servers={},traces=[],resultados=[];
for(const fase of ['antes','depois'])servers[fase]=await preview({configFile:false,build:{outDir:root+'/build-antes'},preview:{host:'127.0.0.1',port:0,proxy:{'/_supabase':{
 target:env.VITE_SUPABASE_URL,changeOrigin:true,agent:fase==='antes'?false:agent,rewrite:p=>p.slice('/_supabase'.length),
 configure(proxy){proxy.on('proxyReq',(request,req)=>{
  request.removeHeader('cookie');const t=performance.now();const r={fase,caso:req.headers['x-qa-caso'],rota:req.url.split('?')[0],inicio:t};traces.push(r);
  const socket=s=>{r.reutilizada=request.reusedSocket===true;r.conectando=s.connecting;if(!s.connecting){r.tlsMs=0;return;}s.once('lookup',()=>r.dnsMs=performance.now()-t);s.once('connect',()=>r.tcpMs=performance.now()-t);s.once('secureConnect',()=>r.tlsMs=performance.now()-t)};
  if(request.socket)socket(request.socket);else request.once('socket',socket);
  request.once('response',response=>{r.headersMs=performance.now()-t;r.upstreamMs=Number(response.headers['x-envoy-upstream-service-time'])||null;r.requestId=response.headers['sb-request-id']||null;response.once('end',()=>r.totalMs=performance.now()-t)});
 });}
}}}});
try{for(let rodada=0;rodada<10;rodada++)for(const [rpc,args] of [['consultar_meu_acesso',{}],['consultar_relatorios_servicos',{p_oficina:conta.empresa_id,p_inicio:'2026-11-01',p_fim:'2026-11-19'}]])for(const fase of rodada%2?['depois','antes']:['antes','depois']){
 const id=rodada+'-'+rpc+'-'+fase,base=servers[fase].resolvedUrls.local[0];const t=performance.now();const r=await fetch(base+'_supabase/rest/v1/rpc/'+rpc,{method:'POST',headers:{apikey:env.VITE_SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+sessao.access_token,'content-type':'application/json','x-qa-caso':id},body:JSON.stringify(args)});const data=await r.json();assert(r.ok,JSON.stringify(data));const segundos=(performance.now()-t)/1000;
 resultados.push({id,fase,rodada,rpc,segundos,status:r.status,bytes:JSON.stringify(data).length});
} }finally{agent.destroy();for(const s of Object.values(servers))await new Promise(r=>s.httpServer.close(r));await writeFile(root+'/conexoes-causa.json',JSON.stringify({metodo:'Mesmo build e mesmo endpoint autenticado. Alternância com proxy sem agente (comportamento anterior do Vite) e com pool TLS. Só leituras em empresa fictícia. Nenhuma retentativa de aplicação.',resultados,traces},null,2));}
const med=a=>{const s=a.toSorted((a,b)=>a-b);return(s[Math.floor((s.length-1)/2)]+s[Math.ceil((s.length-1)/2)])/2};
for(const fase of ['antes','depois'])console.log(JSON.stringify({fase,n:resultados.filter(r=>r.fase===fase).length,medianaMs:med(resultados.filter(r=>r.fase===fase).map(r=>r.segundos*1000)),novasTLS:traces.filter(r=>r.fase===fase&&r.conectando).length,reutilizadas:traces.filter(r=>r.fase===fase&&r.reutilizada).length,tlsMediana:med(traces.filter(r=>r.fase===fase).map(r=>r.tlsMs||0))}));
