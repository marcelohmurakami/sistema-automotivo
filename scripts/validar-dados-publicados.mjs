// Somente consultas nas 26 empresas fictícias já existentes.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {createClient} from '@supabase/supabase-js';
import {conferirAcesso} from './lib/contas-teste.mjs';
const pasta='output/dados-seguranca-20261104';
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
  conferirAcesso(await rpc('consultar_meu_acesso'),conta,true);checks.push('Conta, empresa fictícia e acesso original preservados');
  const w=conta.empresa_id,dados=await rpc('consultar_dados_empresa',{p_oficina:w});assert(Array.isArray(dados.solicitacoes)&&Array.isArray(dados.importacoes));checks.push('Dados e solicitações');
  assert(Array.isArray(await rpc('consultar_restricoes_acesso',{p_oficina:w})));checks.push('Permissões da equipe');
  await rpc('consultar_suporte_empresa',{p_oficina:w});checks.push('Suporte configurável');
  assert(Array.isArray(await rpc('listar_anexos_portabilidade',{p_oficina:w})));checks.push('Anexos importados');
  const manifesto=await rpc('exportar_dados_empresa',{p_oficina:w});assert(manifesto.tabelas.length>100);checks.push('Manifesto paginado da empresa');
  const pagina=await rpc('exportar_dados_empresa',{p_oficina:w,p_tabela:'clientes'});assert(pagina.linhas.length<=500);assert(pagina.linhas.every(x=>x.oficina_id===w));checks.push('Exportação isolada por empresa');
  await assert.rejects(()=>rpc('exportar_dados_empresa',{p_oficina:w,p_tabela:'auth.users'}),e=>e.code==='22023');checks.push('Tabela não autorizada recusada');
  const outra=m.contas.find(x=>x.empresa_id!==w);await assert.rejects(()=>rpc('consultar_dados_empresa',{p_oficina:outra.empresa_id}),e=>e.code==='42501');checks.push('Outra empresa bloqueada');
  resultados.push({perfil:conta.especialidade,ok:true,checks});console.log('PASS',conta.especialidade,checks.length);
 }catch(e){resultados.push({perfil:conta.especialidade,ok:false,checks,erro:{message:e.message,code:e.code}});console.error('FALHA',conta.especialidade,e.message);process.exitCode=1;break;}
 finally{await c.auth.signOut({scope:'local'});}
}
const anon=criar();const teste=await anon.rpc('consultar_dados_empresa',{p_oficina:m.contas[0].empresa_id});const anonBloqueado=!!teste.error;
const resumo={ok:!process.exitCode&&anonBloqueado&&resultados.length===26,data:new Date().toISOString(),ambiente:'Supabase publicado, consultas reais; sem pagamentos ou alterações de empresas',empresas:resultados.length,verificacoes:resultados.reduce((n,r)=>n+r.checks.length,0)+(anonBloqueado?1:0),anonBloqueado,resultados};
await writeFile(pasta+'/publicado-banco.json',JSON.stringify(resumo,null,2));if(!resumo.ok)process.exitCode=1;console.log(JSON.stringify({ok:resumo.ok,empresas:resumo.empresas,verificacoes:resumo.verificacoes}));
