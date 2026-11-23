// Consultas nas empresas fictícias; não cria OS, cobranças ou pagamentos.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {createClient} from '@supabase/supabase-js';
import {conferirAcesso} from './lib/contas-teste.mjs';
const pasta='output/conta-cliente-ficha-20261105';
const m=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8'));
const env=parseEnv(await readFile('.env.local','utf8'));
assert.equal(m.projeto,'hzihxtjirttetnfdujcx');assert.equal(m.contas.length,26);
assert.equal(env.VITE_SUPABASE_URL,'https://hzihxtjirttetnfdujcx.supabase.co');
const criar=()=>createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(u,i)=>fetch(u,{...i,signal:AbortSignal.timeout(45000)})}});
const resultados=[];
for(const conta of m.contas){
 assert(conta.empresa.startsWith('ZZ [TESTE 20261019] '));const c=criar(),checks=[];
 const rpc=async(n,a={})=>{const r=await c.rpc(n,a);if(r.error)throw Object.assign(Error(n+': '+r.error.message),{code:r.error.code});return r.data;};
 try{
  const r=await c.auth.signInWithPassword({email:conta.email,password:conta.senha});if(r.error)throw Error('Falha de login: '+r.error.code);
  conferirAcesso(await rpc('consultar_meu_acesso'),conta,true);checks.push('Login e empresa fictícia conferidos');
  const w=conta.empresa_id;
  const anterior=conta.ramo==='automotivo'?(await rpc('consultar_contas_clientes',{p_oficina:w})).ordens:(await rpc('consultar_relatorios_servicos',{p_oficina:w,p_inicio:'2026-01-01',p_fim:'2026-12-31'})).devedores;
  const candidatos=Object.entries((anterior||[]).reduce((acc,o)=>{if(o.cliente_id)acc[o.cliente_id]=(acc[o.cliente_id]||0)+1;return acc;},{})).sort((a,b)=>b[1]-a[1]);
  const cliente=candidatos[0]?.[0]||(await rpc('listar_clientes',{p_oficina:w,p_busca:'',p_arquivados:false,p_pagina:0})).itens[0]?.id;assert(cliente,'Cliente de teste disponível');
  const dados=await rpc('consultar_conta_financeira_cliente',{p_oficina:w,p_cliente:cliente});
  assert.equal(dados.identidade.nome,conta.empresa);assert(dados.ordens.length<=50);assert(dados.total>=dados.ordens.length);checks.push('Consulta por cliente e identidade da empresa');
  for(const o of dados.ordens){assert.equal(o.cliente_id,cliente);assert(o.aberto_centavos>0);assert.equal(o.aberto_centavos,o.titulos.reduce((n,t)=>n+t.aberto_centavos,0));assert.equal(o.pago_centavos,o.titulos.reduce((n,t)=>n+t.pago_centavos,0));assert.equal(o.total_centavos,o.titulos.reduce((n,t)=>n+t.total_centavos,0));}
  checks.push('Saldos e pagamentos das OS conferidos com seus títulos');
  if(dados.ordens.length){const o=dados.ordens.at(-1);const unica=await rpc('consultar_conta_financeira_cliente',{p_oficina:w,p_cliente:cliente,p_ids:[o.id]});assert.equal(unica.ordens.length,1);assert.equal(unica.ordens[0].id,o.id);assert.equal(unica.ordens[0].aberto_centavos,o.aberto_centavos);checks.push('Seleção individual e reconferência');}
  const outra=m.contas.find(x=>x.empresa_id!==w);await assert.rejects(()=>rpc('consultar_conta_financeira_cliente',{p_oficina:outra.empresa_id,p_cliente:cliente}),e=>e.code==='42501');checks.push('Outra empresa bloqueada');
  resultados.push({perfil:conta.especialidade,cliente,ok:true,total:dados.total,ordens:dados.ordens.map(o=>({id:o.id,numero:o.numero,aberto_centavos:o.aberto_centavos})),checks});console.log('PASS',conta.especialidade,checks.length,'OS',dados.total);
 }catch(e){resultados.push({perfil:conta.especialidade,ok:false,checks,erro:{message:e.message,code:e.code}});console.error('FALHA',conta.especialidade,e.message);process.exitCode=1;break;}
 finally{await c.auth.signOut({scope:'local'});}
}
const anon=criar(),r=await anon.rpc('consultar_conta_financeira_cliente',{p_oficina:m.contas[0].empresa_id,p_cliente:resultados[0]?.cliente});const anonBloqueado=!!r.error;
const resumo={ok:!process.exitCode&&anonBloqueado&&resultados.length===26,data:new Date().toISOString(),ambiente:'Supabase publicado, consultas reais em empresas fictícias; sem gravações financeiras',empresas:resultados.length,verificacoes:resultados.reduce((n,r)=>n+r.checks.length,0)+(anonBloqueado?1:0),anonBloqueado,resultados};
await writeFile(pasta+'/publicado-banco.json',JSON.stringify(resumo,null,2));if(!resumo.ok)process.exitCode=1;console.log(JSON.stringify({ok:resumo.ok,empresas:resumo.empresas,verificacoes:resumo.verificacoes}));
