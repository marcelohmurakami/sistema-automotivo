import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {preview} from 'vite';
import {createClient} from '@supabase/supabase-js';
import {criarTransporteSupabase} from '../src/lib/transporteSupabase.ts';
import {sessaoQa} from './sessoes-qa-concorrencia-20261116.mjs';
const env=Object.fromEntries((await readFile('.env.local','utf8')).split(/\r?\n/).filter(l=>/^VITE_SUPABASE_/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
const url=env.VITE_SUPABASE_URL,key=env.VITE_SUPABASE_PUBLISHABLE_KEY;
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas;
const server=await preview({build:{outDir:'output/picos-abertura-20261117/build-depois'},preview:{host:'127.0.0.1',port:0,strictPort:true}}),base=`http://127.0.0.1:${server.httpServer.address().port}`;
const checks=[],chamadas=[];
const transport=criarTransporteSupabase(url,'/_supabase',async(input,init)=>{
 const path=String(input);const r=await fetch(path.startsWith('/')?base+path:input,init);
 chamadas.push({path:new URL(r.url).pathname,status:r.status,cache:r.headers.get('cache-control'),cdn:r.headers.get('cdn-cache-control')});return r;
});
const client=proxy=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:proxy?{fetch:transport}:undefined});
async function check(nome,perfil,fn){const t=performance.now();try{await fn();checks.push({nome,perfil,ok:true,segundos:(performance.now()-t)/1000})}catch(e){checks.push({nome,perfil,ok:false,erro:e.message});console.log('FAIL',nome,perfil,e.message.slice(0,200))}}
try{
 for(let i=0;i<contas.length;i++){
  const c=contas[i];assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));const direto=client(false),proxy=client(true);const s=await sessaoQa(direto,c);assert.ifError((await proxy.auth.setSession(s)).error);
  const args={p_oficina:c.empresa_id,p_busca:'',p_arquivados:false,p_pagina:1};
  await check('Mesma identidade autenticada',c.especialidade,async()=>{const r=await proxy.auth.getUser();assert.ifError(r.error);assert.equal(r.data.user.id,s.user.id)});
  await check('Mesmas regras de acesso',c.especialidade,async()=>{const a=await direto.rpc('consultar_meu_acesso'),b=await proxy.rpc('consultar_meu_acesso');assert.ifError(a.error);assert.ifError(b.error);assert.deepEqual(b.data,a.data)});
  await check('Mesmos clientes e total',c.especialidade,async()=>{const a=await direto.rpc('listar_clientes',args),b=await proxy.rpc('listar_clientes',args);assert.ifError(a.error);assert.ifError(b.error);assert.deepEqual(b.data,a.data)});
  await check('Outra empresa bloqueada',c.especialidade,async()=>{const r=await proxy.rpc('listar_clientes',{...args,p_oficina:contas[(i+1)%contas.length].empresa_id});assert(r.error,'Outra empresa não pode ser consultada');assert(['42501','PT403'].includes(r.error.code),r.error.code)});
  await check('Mesmo nível de autenticação',c.especialidade,async()=>{const a=await direto.auth.mfa.getAuthenticatorAssuranceLevel(),b=await proxy.auth.mfa.getAuthenticatorAssuranceLevel();assert.ifError(a.error);assert.ifError(b.error);assert.deepEqual(b.data,a.data)});
  console.log('PERFIL',c.especialidade,checks.filter(x=>x.perfil===c.especialidade&&x.ok).length+'/5');
 }
 await check('Sem cache de resposta autenticada','geral',async()=>{assert(chamadas.length>100);assert(chamadas.every(x=>x.cache?.includes('no-store')&&x.cdn==='no-store'))});
 await check('Token inválido continua negado','geral',async()=>{const init={headers:{apikey:key,Authorization:'Bearer token-invalido'}};const direto=await fetch(url+'/auth/v1/user',init);const r=await transport(url+'/auth/v1/user',init);assert([401,403].includes(r.status));assert.equal(r.status,direto.status);assert.deepEqual(await r.json(),await direto.json())});
 await check('Sessão ausente não obtém dados','geral',async()=>{const p=client(true);const r=await p.rpc('listar_clientes',{p_oficina:contas[0].empresa_id,p_busca:'',p_arquivados:false,p_pagina:1});assert(r.error)});
 // Sessão nova e independente das usadas na matriz; logout somente desta sessão.
 const p=client(true),c=contas.find(c=>c.especialidade==='retifica');
 await check('Login real por senha pelo proxy','geral',async()=>{const r=await p.auth.signInWithPassword({email:c.email,password:c.senha});assert.ifError(r.error);assert(r.data.session)});
 await check('Renovação real pelo proxy','geral',async()=>{const r=await p.auth.refreshSession();assert.ifError(r.error);assert(r.data.session)});
 await check('Sessão renovada acessa a empresa correta','geral',async()=>{const r=await p.rpc('listar_clientes',{p_oficina:c.empresa_id,p_busca:'',p_arquivados:false,p_pagina:1});assert.ifError(r.error);assert(r.data.total>0)});
 await check('Logout da sessão de teste','geral',async()=>{assert.ifError((await p.auth.signOut({scope:'local'})).error);assert.equal((await p.auth.getSession()).data.session,null)});
}finally{await new Promise(r=>server.httpServer.close(r));await writeFile('output/picos-abertura-20261117/seguranca-proxy.json',JSON.stringify({geradoEm:new Date().toISOString(),checks,chamadas},null,2))}
console.log('TOTAL',checks.length,'FALHAS',checks.filter(x=>!x.ok).length);assert(checks.every(x=>x.ok));
