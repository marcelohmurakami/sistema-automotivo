import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';

const root='output/regressao-assistencia-manutencao-limpeza-20261116';
const out=root+'/concorrencia-publicado';await mkdir(out,{recursive:true});
const perfis=['assistencia_celulares','manutencao_climatizacao','limpeza_pos_obra'];
const env=Object.fromEntries((await readFile('.env.local','utf8')).split(/\r?\n/).filter(l=>/^VITE_SUPABASE_/.test(l)).map(l=>{const n=l.indexOf('=');return [l.slice(0,n),l.slice(n+1).trim().replace(/^['"]|['"]$/g,'')]}));
assert.equal(env.VITE_SUPABASE_URL,'https://hzihxtjirttetnfdujcx.supabase.co');
const cred=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.find(c=>c.especialidade==='assistencia_informatica');
assert(cred.empresa.startsWith('ZZ [TESTE 20261019] '));
const banco=JSON.parse(await readFile(root+'/banco/assistencia_informatica.json','utf8'));assert.equal(banco.empresa,cred.empresa_id);
const client=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(45000)})}});
const {error}=await client.auth.signInWithPassword({email:cred.email,password:cred.senha});assert.ifError(error);
const rpc=[],inicio=performance.now();
const executar=perfil=>new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,['scripts/regressao-servicos-publicado-20261116.mjs'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,QA_PERFIS:perfil,QA_TELAS:'390',QA_URL:'https://patio-gestao-peach.vercel.app',QA_OUTPUT:out+'/'+perfil}});
 let log='';child.stdout.on('data',s=>{log+=s;process.stdout.write(s)});child.stderr.on('data',s=>{log+=s});
 child.on('error',reject);child.on('exit',async code=>{await writeFile(out+'/'+perfil+'.log',log);resolve({perfil,code})});
});
const leitor=async()=>{
 const limite=performance.now()+180_000;
 for(let i=0;i<30&&performance.now()<limite;i++){
  for(const [nome,args] of [['consultar_alertas',{}],['consultar_detalhes_atendimento',{p_atendimento:banco.documentos.fluxo.id}]]){
   const t=performance.now();const {error}=await client.rpc(nome,{p_oficina:cred.empresa_id,...args});
   rpc.push({nome,segundos:(performance.now()-t)/1000,ok:!error,erro:error?{code:error.code,message:error.message}:null});
   if(error)console.log('FAIL leitura',nome,error.code);
  }
  await delay(1000);
 }
};
const execucoes=await Promise.allSettled([...perfis.map(executar),leitor()]);
const rodadas=await Promise.all(perfis.map(async perfil=>({perfil,...JSON.parse(await readFile(out+'/'+perfil+'/resultados.json','utf8'))})));
const resultado={url:'https://patio-gestao-peach.vercel.app',build:rodadas[0].build,segundos:(performance.now()-inicio)/1000,metodo:'3 navegadores Chromium com toque em 390 px e 1 cliente de API somente leitura, limitado a 60 consultas / 3 minutos. Não é homologação de capacidade.',casos:rodadas.flatMap(r=>r.documentos.filter(d=>d.pdf)),operacoes:rodadas.flatMap(r=>r.resultados),checks:rodadas.reduce((n,r)=>n+r.checks.length,0),falhas:rodadas.flatMap(r=>r.falhas),rpc,execucoes:execucoes.map(x=>x.status==='fulfilled'?{status:x.status,resultado:x.value}:{status:x.status,erro:String(x.reason)})};
resultado.ok=resultado.casos.length===12&&!resultado.falhas.length&&rpc.every(x=>x.ok)&&execucoes.every(x=>x.status==='fulfilled'&&(!x.value||x.value.code===0));
await writeFile(out+'/resultado.json',JSON.stringify(resultado,null,2));
console.log(JSON.stringify({ok:resultado.ok,casos:resultado.casos.length,leituras:rpc.length,falhas:resultado.falhas.length,segundos:resultado.segundos}));
if(!resultado.ok)process.exitCode=1;
