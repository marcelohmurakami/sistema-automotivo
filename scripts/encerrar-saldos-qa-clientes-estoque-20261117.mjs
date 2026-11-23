// Encerra somente os saldos dos itens criados pelos roteiros interrompidos desta auditoria.
import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { sessaoQa } from './sessoes-qa-concorrencia-20261116.mjs';
const root='output/clientes-estoque-velocidade-20261117';
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas;
const env=Object.fromEntries((await readFile('.env.local','utf8')).split(/\r?\n/).filter(l=>/^VITE_SUPABASE_/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
const vistos=new Set(),resultados=[];
for(const fase of ['depois','depois-secundaria-lenta','reproducao-estorno']){
 const dados=JSON.parse(await readFile(root+'/'+fase+'/resultados.json','utf8'));
 for(const r of dados.registros){
  if(!r.peca||vistos.has(r.peca))continue;vistos.add(r.peca);
  const c=contas.find(c=>c.especialidade===r.perfil);assert(c?.empresa.startsWith('ZZ [TESTE 20261019] '));
  const cli=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});await sessaoQa(cli,c);
  const call=async(nome,args)=>{const {data,error}=await cli.rpc(nome,{p_oficina:c.empresa_id,...args});assert.ifError(error);return data};
  const p=await call('consultar_produto_estoque',{p_produto:r.peca});assert.equal(p.id,r.peca);assert(p.descricao.startsWith('AA QA item '));
  if(p.saldo!==0){assert(p.saldo>0&&p.saldo<=10);await call('movimentar_estoque_deposito',{p_produto:p.id,p_deposito:null,p_chave:randomUUID(),p_revisao:p.revisao,p_tipo:'ajuste',p_quantidade:0,p_motivo:'Encerramento da auditoria fictícia de clientes e estoque de 17/11/2026',p_documento:'QA 20261117'});const fim=await call('consultar_produto_estoque',{p_produto:p.id});assert.equal(fim.saldo,0);resultados.push({perfil:r.perfil,produto:p.id,saldoAntes:p.saldo,saldoDepois:fim.saldo})}
 }
}
await writeFile(root+'/encerramento-saldos.json',JSON.stringify({somenteEmpresasFicticias:true,resultados},null,2));console.log('Itens de teste encerrados:',resultados.length);
