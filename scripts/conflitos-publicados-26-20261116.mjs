import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {sessaoQa} from './sessoes-qa-concorrencia-20261116.mjs';
const root='output/timeouts-concorrencia-26-20261116';
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas;
assert.equal(contas.length,26);assert(contas.every(c=>c.empresa.startsWith('ZZ [TESTE 20261019] ')));
const docs=JSON.parse(await readFile(root+'/antes-documentos-4/resultado.json','utf8')).docs;
const env=Object.fromEntries((await readFile('.env.local','utf8')).split(/\r?\n/).filter(l=>/^VITE_SUPABASE_/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
const users=[],resultados=[],medidas=[],inicio=new Date().toISOString();let ativos=0,pico=0;
for(const c of contas){const cli=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(30000)})}});await sessaoQa(cli,c);users.push({c,cli,auto:c.ramo==='automotivo',doc:docs.find(d=>d.perfil===c.especialidade&&d.tipo==='ordem')});}
async function rpc(u,n,args={}){const t=performance.now();ativos++;pico=Math.max(pico,ativos);try{const r=await u.cli.rpc(n,{p_oficina:u.c.empresa_id,...args});medidas.push({perfil:u.c.especialidade,nome:n,segundos:(performance.now()-t)/1000,status:r.status,codigo:r.error?.code});return r}finally{ativos--}}
for(let start=0;start<26;start+=13){await Promise.all(users.slice(start,start+13).map(async u=>{const t=performance.now();try{
 const ler=async()=>{const r=await rpc(u,u.auto?'consultar_ordem_servico':'consultar_detalhes_atendimento',u.auto?{p_os:u.doc.id}:{p_atendimento:u.doc.id});assert.ifError(r.error);return r.data};
 const d=await ler(),chaves=[randomUUID(),randomUUID()];assert.equal(d.itens.length,12);if(u.auto)assert.equal(d.situacao,'open');
 const salvar=(i)=>{const desconto=i===0?12000:26000;return u.auto?rpc(u,'salvar_os_com_itens',{p_os:u.doc.id,p_revisao:d.revisao,p_chave:chaves[i],p_dados:{cliente_id:d.cliente_id,veiculo_id:d.veiculo_id,cliente_nome_livre:d.dados_cliente?.nome,cliente_telefone_livre:d.dados_cliente?.telefone_e164,...(u.c.especialidade==='retifica'?{carro_livre:d.dados_veiculo?.modelo,motor_livre:d.dados_veiculo?.motor}:{}),data_servico:d.data_servico,itens:d.itens,desconto_centavos:desconto}}):rpc(u,'salvar_itens_atendimento_nota',{p_atendimento:u.doc.id,p_revisao:d.atendimento.revisao,p_itens:d.itens,p_desconto:desconto,p_custo_extra:d.comercial.custo_extra_centavos||0,p_motivo:d.comercial.motivo_custo||'',p_mostrar_desconto_nota:false})};
 const r=await Promise.all([salvar(0),salvar(1)]);assert.equal(r.filter(x=>!x.error).length,1,'Uma edição deve vencer');const perdedora=r.find(x=>x.error);assert.equal(perdedora.status,409);assert.equal(perdedora.error.code,'PT409');const vencedora=r.findIndex(x=>!x.error);const depois=await ler();assert.equal(u.auto?depois.total_centavos:depois.atendimento.valor_centavos,130000-(vencedora===0?12000:26000));assert.equal(depois.itens.length,12);
 // p_chave é idempotência de criação. Edição usa revisão e rejeita repetição obsoleta.
 const repetida=await salvar(vencedora);assert.equal(repetida.status,409);assert.equal(repetida.error?.code,'PT409');
 const aposReenvio=await ler();assert.equal(u.auto?aposReenvio.revisao:aposReenvio.atendimento.revisao,u.auto?depois.revisao:depois.atendimento.revisao);assert.equal(u.auto?aposReenvio.total_centavos:aposReenvio.atendimento.valor_centavos,u.auto?depois.total_centavos:depois.atendimento.valor_centavos);assert.deepEqual(aposReenvio.itens,depois.itens);
 resultados.push({perfil:u.c.especialidade,ok:true,conflito:409,semPerda:true,semDuplicacao:true,reenvioObsoletoBloqueado:true,segundos:(performance.now()-t)/1000});
 }catch(e){resultados.push({perfil:u.c.especialidade,ok:false,erro:e.message,segundos:(performance.now()-t)/1000})}console.log(JSON.stringify(resultados.at(-1)))}));}
await writeFile(root+'/conflitos-publicados.json',JSON.stringify({inicio,fim:new Date().toISOString(),pico,resultados,medidas},null,2));if(resultados.some(r=>!r.ok))process.exitCode=1;
