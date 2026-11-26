// Escritas limitadas às 26 empresas fictícias ZZ. Não utiliza credencial de serviço.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {sessaoQa} from './sessoes-qa-concorrencia-20261116.mjs';
const out='output/localizacao-produtividade-20261126';await mkdir(out,{recursive:true});
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas;assert.equal(contas.length,26);
const env=Object.fromEntries((await readFile('.env.local','utf8')).split(/\r?\n/).filter(l=>/^VITE_SUPABASE_/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
assert.equal(env.VITE_SUPABASE_URL,'https://hzihxtjirttetnfdujcx.supabase.co');
const base='https://sistema-automotivo.vercel.app',result=[];
for(const c of contas){
 const file=`${out}/api-${c.especialidade}.json`;let previous;try{previous=JSON.parse(await readFile(file,'utf8'))}catch{}
 if(previous?.ok){result.push(previous);continue;}
 assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
 const s={perfil:c.especialidade,empresa:c.empresa_id,checks:[],calls:[],ok:false};
 const api=createClient(base+'/_supabase',env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(30000)})}});
 const save=()=>writeFile(file,JSON.stringify(s,null,2));
 const rpc=async(n,args={})=>{const t=performance.now();const {data,error}=await api.rpc(n,{p_oficina:c.empresa_id,...args});s.calls.push({nome:n,segundos:+((performance.now()-t)/1000).toFixed(3),erro:error?.code||null});if(error)throw Object.assign(Error(error.message),error);return data};
 const test=async(n,fn)=>{await fn();s.checks.push({nome:n,ok:true});await save()};
 try{
  await sessaoQa(api,c);
  const {data:w,error}=await api.from('oficinas').select('nome').eq('id',c.empresa_id).single();assert.ifError(error);assert(w.nome.startsWith('ZZ [TESTE 20261019] '));
  // Cinco consultas sem cache de aplicação para registrar a variação real do servidor.
  for(let k=0;k<5;k++)await rpc('listar_itens_fisicos',{p_busca:'QA L26'});
  const nome='QA L26 '+Date.now().toString(36);
  const local=await rpc('salvar_local_fisico',{p_id:randomUUID(),p_nome:nome+' Entrada'});
  const destino=await rpc('salvar_local_fisico',{p_id:randomUUID(),p_nome:nome+' Bancada'});
  const id=randomUUID(),dados={descricao:nome+' Conjunto',categoria:'equipamento',local_id:local.id,codigo_externo:nome+' SERIE',observacoes:'Conferência QA'},acessorios=[{id:randomUUID(),descricao:nome+' Cabo',categoria:'acessorio'},{id:randomUUID(),descricao:nome+' Controle',categoria:'acessorio'}];
  let itens;
  await test('Cadastro completo, conjunto e reenvio sem duplicar',async()=>{itens=await rpc('registrar_conjunto_fisico',{p_id:id,p_dados:dados,p_acessorios:acessorios});assert.equal(itens.length,3);assert.deepEqual(await rpc('registrar_conjunto_fisico',{p_id:id,p_dados:dados,p_acessorios:acessorios}),itens);});
  s.itens=itens.map(({id,codigo,descricao})=>({id,codigo,descricao}));s.locais={entrada:local,destino};
  await test('Etiqueta em minúsculas e acessórios consultados',async()=>{const i=await rpc('consultar_item_fisico',{p_codigo:itens[0].codigo.toLowerCase()});assert.equal(i.relacionados.length,2);});
  await test('Busca por série e filtro por local',async()=>{const r=await rpc('listar_itens_fisicos',{p_busca:dados.codigo_externo,p_local:local.id});assert.equal(r.itens.length,1);assert.equal(r.itens[0].id,id);});
  const mover=(xs,acao,local_id,extra={})=>rpc('movimentar_itens_fisicos',{p_itens:xs.map(({id,revisao})=>({id,revisao})),p_acao:acao,p_local:local_id,p_com_quem:'',p_observacoes:'',p_chave:randomUUID(),...extra});
  const antigos=itens,chave=randomUUID();
  await test('Lote atômico e repetição sem histórico duplicado',async()=>{itens=await mover(antigos,'mover',destino.id,{p_chave:chave});assert(itens.every(i=>i.local_id===destino.id));assert.deepEqual(await mover(antigos,'mover',destino.id,{p_chave:chave}),itens);assert.equal((await rpc('historico_item_fisico',{p_item:id})).eventos.length,2);});
  await test('Revisão antiga recusa lote inteiro',async()=>{await assert.rejects(()=>mover([itens[0],antigos.find(i=>i.id!==itens[0].id)],'mover',local.id),e=>e.code==='PT409');assert.equal((await rpc('consultar_item_fisico',{p_codigo:itens[0].codigo})).local_id,destino.id);});
  await test('Saída externa exige responsável',async()=>{await assert.rejects(()=>mover(itens,'externo',null),e=>e.code==='22023');itens=await mover(itens,'externo',null,{p_com_quem:'Equipe fictícia QA'});assert(itens.every(i=>i.situacao==='externo'));});
  await test('Retorno da bancada, entrega física e proteção de retorno',async()=>{itens=await mover(itens,'mover',local.id);itens=await mover(itens,'entregar',null,{p_com_quem:'Cliente fictício QA'});await assert.rejects(()=>mover(itens,'mover',destino.id),e=>e.code==='22023');await assert.rejects(()=>mover(itens,'retorno',destino.id),e=>e.code==='22023');itens=await mover(itens,'retorno',destino.id,{p_observacoes:'Retorno de teste QA'});});
  await test('Correção da identificação preserva localização',async()=>{const i=await rpc('salvar_item_fisico',{p_id:id,p_dados:{...dados,descricao:nome+' Conjunto editado',local_id:local.id},p_revisao:itens.find(x=>x.id===id).revisao});assert.equal(i.local_id,destino.id);itens=itens.map(x=>x.id===i.id?i:x);});
  await test('Não localizado exige motivo e pode ser recuperado',async()=>{await assert.rejects(()=>mover(itens,'nao_localizado',null),e=>e.code==='22023');itens=await mover(itens,'nao_localizado',null,{p_observacoes:'Simulação QA'});itens=await mover(itens,'mover',destino.id);assert(itens.every(i=>i.situacao==='na_empresa'));});
  await test('Outra empresa não consegue consultar ou movimentar',async()=>{const outra=contas.find(x=>x.empresa_id!==c.empresa_id).empresa_id;await assert.rejects(()=>rpc('consultar_item_fisico',{p_oficina:outra,p_codigo:itens[0].codigo}),e=>e.code==='42501');});
  await test('Histórico com autor, antes e depois',async()=>{const h=await rpc('historico_item_fisico',{p_item:id});assert(h.eventos.length>=9);assert(h.eventos.every(e=>e.autor_nome&&e.depois));assert(h.eventos.some(e=>e.antes?.local_id===local.id&&e.depois.local_id===destino.id));});
  // Deixa o conjunto de teste guardado para conferência visual, sem alterar nenhuma OS.
  s.ok=true;await save();console.log('PASS',c.especialidade,s.checks.length);
 }catch(e){s.erro={mensagem:e.message,code:e.code};await save();console.log('FAIL',c.especialidade,e.message);}
 result.push(s);
}
await writeFile(out+'/api-resumo.json',JSON.stringify({base,geradoEm:new Date().toISOString(),perfis:result.map(s=>({perfil:s.perfil,ok:s.ok,checks:s.checks.length,erro:s.erro}))},null,2));
if(result.some(s=>!s.ok))process.exitCode=1;
