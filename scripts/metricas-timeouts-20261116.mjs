import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
const out='output/timeouts-concorrencia-26-20261116';await mkdir(out,{recursive:true});
const env=Object.fromEntries((await readFile('output/contas-teste/admin.env.local','utf8')).split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
if(!env.SUPABASE_SERVICE_ROLE_KEY)throw new Error('Credencial administrativa local ausente');
const amostras=[];
for(let i=0;i<Number(process.env.QA_AMOSTRAS||1);i++){
 try {
 const res=await fetch('https://hzihxtjirttetnfdujcx.supabase.co/customer/v1/privileged/metrics',{headers:{authorization:'Basic '+Buffer.from('service_role:'+env.SUPABASE_SERVICE_ROLE_KEY).toString('base64')},signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw new Error('Metrics API HTTP '+res.status);
 const text=await res.text();const linhas=text.split('\n').filter(l=>/^(node_(cpu|load|memory|disk|vmstat|pressure)|pg_stat_(activity|database)|pg_settings_(max_connections|shared_buffers)|pg_up)/.test(l));
 amostras.push({recebidoEm:new Date().toISOString(),linhas});
 console.log(JSON.stringify({amostra:i+1,series:linhas.length,nomes:i===0?[...new Set(linhas.map(l=>l.split(/[ {]/)[0]))]:undefined}));
 } catch (erro) {
  amostras.push({recebidoEm:new Date().toISOString(),erro:erro.message,linhas:[]});
  console.log(JSON.stringify({amostra:i+1,erro:erro.message}));
 }
 await writeFile(out+'/'+(process.env.QA_METRICAS||'metricas-iniciais')+'.json',JSON.stringify(amostras,null,2));
 if(i+1<Number(process.env.QA_AMOSTRAS||1))await delay(60000);
}
