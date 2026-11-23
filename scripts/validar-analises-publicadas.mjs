// Consultas reais autenticadas; usa somente empresas fictícias e não grava dados.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {performance} from 'node:perf_hooks';
import {createClient} from '@supabase/supabase-js';
import {conferirAcesso} from './lib/contas-teste.mjs';
const pasta='output/relatorios-avancados-20261102';
const manifesto=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8'));
const env=parseEnv(await readFile('.env.local','utf8'));
assert.equal(manifesto.projeto,'hzihxtjirttetnfdujcx');
assert.equal(manifesto.contas.length,26);
assert.equal(env.VITE_SUPABASE_URL,'https://hzihxtjirttetnfdujcx.supabase.co');
const tipos=['clientes','dados','tempos','recursos','contratos','primeira_visita','equipamentos','comparacao','filiais'];
const criar=()=>createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(u,i)=>fetch(u,{...i,signal:AbortSignal.timeout(40000)})}});
const resultados=[];
const args=(w,t)=>({p_oficina:w,p_tipo:t,p_inicio:'2026-10-01',p_fim:'2026-10-31',p_filtros:t==='filiais'?{unidades:[w]}:{},p_pagina:0});
for(const conta of manifesto.contas){
 assert(conta.empresa.startsWith('ZZ [TESTE 20261019] '));
 assert.equal(conta.email,`qa.20261019.${conta.especialidade}@example.com`);
 const c=criar(), checks=[],tempos=[];
 const rpc=async(n,a)=>{const r=await c.rpc(n,a);if(r.error)throw Object.assign(new Error(n+': '+r.error.message),{code:r.error.code});return r.data};
 try {
  const login=await c.auth.signInWithPassword({email:conta.email,password:conta.senha});if(login.error)throw Error('Login: '+login.error.code);
  conferirAcesso(await rpc('consultar_meu_acesso',{}),conta,true);checks.push('Empresa fictícia, usuário e plano conferidos');
  for(const tipo of tipos){
   const inicio=performance.now();const r=await rpc('consultar_analise_gerencial',args(conta.empresa_id,tipo));
   assert.equal(r.tipo,tipo);assert.equal(r.pagina,0);assert(Array.isArray(r.linhas)&&r.linhas.length<=25);assert(Number.isInteger(r.total)&&r.total>=r.linhas.length);assert(r.criterios.length>30);assert(r.resumo&&typeof r.resumo==='object');
   if(tipo==='filiais')assert.deepEqual(r.linhas.map(x=>x.id),[conta.empresa_id]);
   checks.push('Consulta '+tipo+' com estrutura e paginação válidas');tempos.push({tipo,ms:Math.round(performance.now()-inicio),total:r.total});
  }
  for(const tipo of ['documento','contrato','objeto','problema','recurso','visita','despesa','receita']){
   const r=await rpc('buscar_opcoes_analiticas',{p_oficina:conta.empresa_id,p_tipo:tipo,p_busca:''});assert(Array.isArray(r)&&r.length<=30);checks.push('Busca limitada: '+tipo);
  }
  const outra=manifesto.contas.find(x=>x.empresa_id!==conta.empresa_id);
  await assert.rejects(()=>rpc('consultar_analise_gerencial',args(outra.empresa_id,'clientes')),e=>e.code==='42501');checks.push('Consulta de outra empresa bloqueada');
  await assert.rejects(()=>rpc('consultar_analise_gerencial',{...args(conta.empresa_id,'filiais'),p_filtros:{unidades:[conta.empresa_id,outra.empresa_id]}}),e=>e.code==='42501');checks.push('Consolidação sem acesso bloqueada');
  await assert.rejects(()=>rpc('consultar_analise_gerencial',{...args(conta.empresa_id,'clientes'),p_pagina:-1}),e=>e.code==='22023');checks.push('Página inválida recusada');
  resultados.push({perfil:conta.especialidade,ok:true,checks,tempos});console.log('PASS',conta.especialidade,checks.length);
 }catch(e){resultados.push({perfil:conta.especialidade,ok:false,checks,tempos,erro:{message:e.message,code:e.code}});process.exitCode=1;console.error('FALHA',conta.especialidade,e.message);break}
 finally{await c.auth.signOut({scope:'local'})}
 await writeFile(pasta+'/publicado-rpc.json',JSON.stringify({ok:false,em_andamento:true,resultados},null,2));
}
const anon=criar();const an=await anon.rpc('consultar_analise_gerencial',args(manifesto.contas[0].empresa_id,'clientes'));
const anonBloqueado=!!an.error;if(!anonBloqueado)process.exitCode=1;
const resumo={data:new Date().toISOString(),ok:!process.exitCode&&resultados.length===26,modo:'Leitura autenticada em empresas fictícias no Supabase publicado',subsetores:resultados.length,verificacoes:resultados.reduce((s,r)=>s+r.checks.length,0)+(anonBloqueado?1:0),anonBloqueado,resultados};
await writeFile(pasta+'/publicado-rpc.json',JSON.stringify(resumo,null,2));
console.log(JSON.stringify({ok:resumo.ok,subsetores:resumo.subsetores,verificacoes:resumo.verificacoes}));
