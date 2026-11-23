// Leitura autenticada nas empresas fictícias. Não grava nem gera pagamentos.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {conferirAcesso} from './lib/contas-teste.mjs';
const pasta='output/auditoria-equipe-20261030',antes=process.argv.includes('--antes');
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8'));
const anteriores=JSON.parse(await readFile('output/funcionarios-produtividade-20261030/publicado-cenarios.local.json','utf8'));
const env=parseEnv(await readFile('.env.local','utf8'));
assert.equal(contas.projeto,'hzihxtjirttetnfdujcx');assert.equal(contas.contas.length,26);
assert.equal(env.VITE_SUPABASE_URL,'https://hzihxtjirttetnfdujcx.supabase.co');
const resultados=[];
for(const conta of contas.contas){
 assert(conta.empresa.startsWith('ZZ [TESTE 20261019] '));
 assert.equal(conta.email,`qa.20261019.${conta.especialidade}@example.com`);
 const caso=anteriores.casos.find(x=>x.perfil===conta.especialidade);assert.equal(caso.empresa_id,conta.empresa_id);
 const c=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(u,i)=>fetch(u,{...i,signal:AbortSignal.timeout(30000)})}});
 const checks=[],ok=(v,n)=>{assert(v,n);checks.push(n)};
 const rpc=async(n,a={})=>{const r=await c.rpc(n,{p_oficina:conta.empresa_id,...a});if(r.error)throw Object.assign(new Error(n+': '+r.error.message),{code:r.error.code});return r.data};
 try{
  const l=await c.auth.signInWithPassword({email:conta.email,password:conta.senha});if(l.error)throw Error('Login: '+l.error.code);
  const a=await c.rpc('consultar_meu_acesso');if(a.error)throw Error(a.error.code);conferirAcesso(a.data,conta,true);ok(true,'Acesso à empresa fictícia');
  const d=await rpc('consultar_contribuicao_equipe',{p_documento:caso.documento_id});
  ok(d.horas.some(x=>x.id===caso.hora),'Hora da homologação preservada');
  ok(d.participantes.reduce((s,x)=>s+x.receita,0)===d.documento.receita,'Receita atribuída confere');
  ok(d.participantes.reduce((s,x)=>s+x.custo,0)===d.documento.custo,'Custo atribuído confere');
  ok((await rpc('historico_contribuicao_equipe',{p_documento:caso.documento_id})).length>0,'Histórico de contribuição acessível');
  const q=await rpc('consultar_qualificacoes_equipe',{p_funcionario:caso.funcionario,p_pagina:0});
  ok(q.qualificacoes.some(x=>x.id===caso.qualificacao),'Qualificação preservada');
  const mat=await rpc('matriz_qualificacoes_equipe',{p_funcionario:caso.funcionario,p_pagina:0});
  ok(mat[0].aptidoes.some(x=>x.habilidade===caso.habilidade),'Matriz de aptidões acessível');
  ok((await rpc('consultar_demanda_equipe',{p_inicio:'2026-11-10',p_fim:'2026-11-10'})).some(x=>x.id===caso.agenda_id),'Escala persiste na agenda');
  const dp=await rpc('consultar_departamento_pessoal',{p_inicio:'2026-10-01',p_fim:'2026-10-31'});
  ok(dp.lancamentos.some(x=>x.id===caso.lancamento),'Lançamento para conferência preservado');
  const ex=await rpc('obter_exportacao_dp',{p_id:caso.exportacao});
  ok(createHash('sha256').update(ex.dados_canonicos).digest('hex')===ex.hash,'Hash da exportação anterior íntegro');
  const outra=contas.contas.find(x=>x.empresa_id!==conta.empresa_id);
  await assert.rejects(()=>rpc('consultar_departamento_pessoal',{p_oficina:outra.empresa_id,p_inicio:'2026-10-01',p_fim:'2026-10-31'}),e=>e.code==='42501');ok(true,'Isolamento entre empresas');
  const estruturaCorrigida=Array.isArray(dp.comissoes)&&dp.horas_produtivas.every(x=>'origem' in x&&'em_aberto' in x);
  if(!antes)ok(estruturaCorrigida,'Estrutura corrigida publicada');
  resultados.push({perfil:conta.especialidade,ok:true,checks,estruturaCorrigida});console.log('PASS leitura',conta.especialidade,checks.length,estruturaCorrigida?'estrutura corrigida':'migração pendente');
 }catch(e){resultados.push({perfil:conta.especialidade,ok:false,checks,erro:{message:e.message,code:e.code}});process.exitCode=1;console.error('FALHA',conta.especialidade,e.message);break}
 finally{await c.auth.signOut({scope:'local'})}
}
await mkdir(pasta,{recursive:true});await writeFile(pasta+(antes?'/publicado-antes.json':'/publicado-depois.json'),JSON.stringify({data:new Date().toISOString(),modo:'Somente leitura autenticada em empresas fictícias',ok:!process.exitCode&&resultados.length===26,verificacoes:resultados.reduce((s,x)=>s+x.checks.length,0),resultados},null,2));
