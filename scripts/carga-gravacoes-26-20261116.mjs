// API autenticada real. Documentos criados pela interface nas empresas fictícias.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const root='output/timeouts-concorrencia-26-20261116',fase=process.env.QA_FASE||'antes',limite=Number(process.env.QA_CONCORRENCIA||26),rodadas=Number(process.env.QA_RODADAS||3);
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas;assert.equal(contas.length,26);assert(contas.every(c=>c.empresa.startsWith('ZZ [TESTE 20261019] ')));
const docs=JSON.parse(await readFile(root+'/antes-documentos-4/resultado.json','utf8')).docs;
const env=Object.fromEntries((await readFile('.env.local','utf8')).split(/\r?\n/).filter(l=>/^VITE_SUPABASE_/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
const medidas=[],falhas=[],users=[],inicio=new Date().toISOString();let parar=false,ativos=0,pico=0;
const salvar=()=>writeFile(root+'/'+fase+'-api-'+limite+'.json',JSON.stringify({fase,limite,rodadas,inicio,fim:new Date().toISOString(),pico,medidas,falhas,parar},null,2));
for(const c of contas){const cli=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(30000)})}});const {error}=await cli.auth.signInWithPassword({email:c.email,password:c.senha});assert.ifError(error);const doc=docs.find(d=>d.perfil===c.especialidade&&d.tipo==='ordem');assert(doc);users.push({c,cli,doc,auto:c.ramo==='automotivo'});}
async function rpc(u,n,args={}){const t=performance.now();ativos++;pico=Math.max(pico,ativos);try{const {data,error}=await u.cli.rpc(n,{p_oficina:u.c.empresa_id,...args});medidas.push({perfil:u.c.especialidade,nome:n,rodada:u.rodada,segundos:(performance.now()-t)/1000,timestamp:new Date().toISOString(),ok:!error,codigo:error?.code});if(error)throw error;return data}finally{ativos--}}
for(let rodada=1;rodada<=rodadas&&!parar;rodada++)for(let start=0;start<users.length&&!parar;start+=limite){
 await Promise.all(users.slice(start,start+limite).map(async u=>{u.rodada=rodada;try{
 const ler=()=>rpc(u,u.auto?'consultar_ordem_servico':'consultar_detalhes_atendimento',u.auto?{p_os:u.doc.id}:{p_atendimento:u.doc.id});
 let d=await ler();assert.equal(d.itens.length,12);const desconto=rodada%2?12000:26000;
 if(u.auto){assert.equal(d.situacao,'open');const dados={cliente_id:d.cliente_id,veiculo_id:d.veiculo_id,cliente_nome_livre:d.dados_cliente?.nome,cliente_telefone_livre:d.dados_cliente?.telefone_e164,...(u.c.especialidade==='retifica'?{carro_livre:d.dados_veiculo?.modelo,motor_livre:d.dados_veiculo?.motor}:{}),data_servico:d.data_servico,itens:d.itens,desconto_centavos:desconto};await rpc(u,'salvar_os_com_itens',{p_os:d.id,p_revisao:d.revisao,p_chave:randomUUID(),p_dados:dados});}
 else await rpc(u,'salvar_itens_atendimento_nota',{p_atendimento:u.doc.id,p_revisao:d.atendimento.revisao,p_itens:d.itens,p_desconto:desconto,p_custo_extra:d.comercial.custo_extra_centavos||0,p_motivo:d.comercial.motivo_custo||'',p_mostrar_desconto_nota:false});
 d=await ler();assert.equal(u.auto?d.total_centavos:d.atendimento.valor_centavos,130000-desconto);
 // Mesma consulta de notificações usada pelo header, executada junto ao trabalho.
 await rpc(u,'consultar_alertas');
 console.log('PASS',rodada,u.c.especialidade);
 }catch(e){falhas.push({perfil:u.c.especialidade,rodada,erro:e.message,codigo:e.code});console.log('FAIL',rodada,u.c.especialidade,e.code,e.message);if(falhas.filter(f=>f.codigo==='57014'||/timeout/i.test(f.erro)).length>=3)parar=true}}));await salvar();
}
await salvar();console.log(JSON.stringify({medidas:medidas.length,falhas:falhas.length,pico,parar}));if(falhas.length)process.exitCode=1;
