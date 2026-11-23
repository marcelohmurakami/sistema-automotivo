import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {resolve} from 'node:path';import {mkdir,writeFile} from 'node:fs/promises';
import {criarCenarioSubsistemas} from './subsistemas-fixture.mjs';
import {especialidades} from '../../src/lib/especialidades.ts';
process.env.DB_VALIDATION_RUNTIME ||= resolve('node_modules/@electric-sql/pglite/dist/index.js');process.env.DB_VALIDATION_MIGRATION_LIMIT='99999999999999';
const pasta=resolve('output/detalhamento-financeiro-20261106');await mkdir(pasta,{recursive:true});const resultados=[];let db;
try{
 const f=await criarCenarioSubsistemas();db=f.db;
 const scalar=async(s,a=[])=>Object.values((await db.query(s,a)).rows[0])[0];
 const call=(fn,a)=>scalar(`select public.${fn}(${a.map((_,i)=>'$'+(i+1)).join(',')})`,a);
 for(const [perfil,r] of Object.entries(f.registros)){
  await f.login(f.ids[perfil]);const inicio=r.hoje.slice(0,7)+'-01',fim=r.hoje;
  const criar=async(natureza,categoria,valor,extra={})=>{const id=randomUUID();await call('salvar_titulo_financeiro',[r.w,id,{natureza,categoria,valor_centavos:valor,descricao:'QA '+categoria,pessoa:'Cliente teste '+perfil,competencia:inicio,vencimento:fim,observacoes:'Histórico QA',...extra},null]);return id;};
  const baixa=(t,v,taxa=0,data=fim,conta='banco')=>call('baixar_titulo_financeiro',[r.w,t,randomUUID(),v,taxa,data,conta,taxa?'credito':'pix','Teste de histórico']);
  const receita=await criar('receber','servicos',10000);const b=await baixa(receita,3000,90);await call('estornar_baixa_financeira',[r.w,b,fim,'Reversão QA']);await baixa(receita,4500,135);
  const despesa=await criar('pagar','aluguel',4000);await baixa(despesa,1000);
  const estoque=await criar('pagar','compra_estoque',7000);await baixa(estoque,2000);
  const antigo=await criar('receber','outras_receitas',8000,{competencia:'2026-01-01',vencimento:'2026-01-31'});await baixa(antigo,3000,0,'2026-01-15','caixa');
  await criar('receber','outras_receitas',9000,{competencia:'2026-12-01',vencimento:'2026-12-15'});
  const cancelado=await criar('receber','servicos',99999);await call('cancelar_titulo_financeiro',[r.w,cancelado,1,'Cancelamento QA']);
  for(let i=0;i<32;i++)await criar('receber','outras_receitas',101+i,{descricao:'Paginação '+i});
  // Fixture-only ledger entries for transfers and provisional records, without changing production.
  await db.exec('reset role');
  await db.query('update public.titulos_financeiros set provisorio=true where id=$1',[cancelado]);
  for(const natureza of ['receber','pagar']){const t=randomUUID();await db.query(`insert into public.titulos_financeiros(id,oficina_id,natureza,categoria,descricao,valor_centavos,competencia,vencimento) values($1,$2,$3,'transferencia','Transferência QA',500,$4,$4)`,[t,r.w,natureza,fim]);await db.query(`insert into public.baixas_financeiras(oficina_id,titulo_id,valor_centavos,data,conta,forma,chave,criado_por) values($1,$2,500,$3,$4,'transferencia',$5,$6)`,[r.w,t,fim,natureza==='receber'?'caixa':'banco',randomUUID(),f.ids[perfil]]);}
  await f.login(f.ids[perfil]);
  if(especialidades[perfil].ramo==='automotivo'){
   const q=await call('emitir_orcamento',[r.w,r.proposta.id,r.proposta.revisao,7,randomBytes(32).toString('hex')]);await call('aprovar_orcamento_interno',[r.w,q.id,q.revisao,q.versao.id]);const os=await call('converter_orcamento_em_os',[r.w,q.id]);
   await db.exec('reset role;begin');await db.query('update public.estoque_produtos set saldo=saldo-2 where oficina_id=$1 and item_catalogo_id=$2',[r.w,r.produto]);await db.query(`insert into public.movimentacoes_estoque(oficina_id,item_catalogo_id,tipo,quantidade,saldo_apos,custo_centavos,motivo,ordem_servico_id,chave,criado_por,criado_em) values($1,$2,'consumo_os',-2,8,2000,'Consumo QA',$3,$4,$5,$6::date+interval '12 hour')`,[r.w,r.produto,os,randomUUID(),f.ids[perfil],fim]);await db.exec("commit");await f.login(f.ids[perfil]);
  }
  const painel=await call('consultar_financeiro',[r.w,inicio,fim,'','','',0,null]),s=painel.resumo;
  const esperados={resultado:s.receitas-s.despesas-s.pecas-s.taxas,receitas:s.receitas,custos:s.despesas+s.pecas+s.taxas,entradas:s.entradas,saidas:s.saidas,receber:s.receber,pagar:s.pagar};
  const detalhe=(indicador,extra={})=>call('consultar_detalhe_financeiro',Object.assign([r.w,indicador,inicio,fim,'','','',0,false],extra));
  for(const indicador of [...Object.keys(esperados),'saldo']){
   const d=await detalhe(indicador);if(indicador==='saldo'){assert.equal(d.saldos.atual,painel.contas.reduce((s,c)=>s+c.saldo,0));assert.equal(d.saldos.anterior+d.total_centavos,d.saldos.final);}else assert.equal(d.total_centavos,esperados[indicador],perfil+' '+indicador);
   const itens=[...d.itens];for(let p=1;p*30<d.quantidade;p++)itens.push(...(await detalhe(indicador,{7:p})).itens);
   assert.equal(itens.length,d.quantidade);assert.equal(new Set(itens.map(x=>x.id)).size,itens.length);assert.equal(itens.reduce((s,x)=>s+x.valor,0),d.total_centavos);assert.equal(d.composicao.reduce((s,x)=>s+x.valor,0),d.total_centavos);
   resultados.push({perfil,cenario:indicador+' total, composição e paginação conferidos com painel',ok:true});
  }
  const filtrado=await detalhe('receitas',{4:'Paginação'});assert.equal(filtrado.quantidade,32);assert.equal(filtrado.filtrado_centavos,Array.from({length:32},(_,i)=>101+i).reduce((s,v)=>s+v,0));
  const aluguel=await detalhe('custos',{5:'aluguel'});assert.equal(aluguel.filtrado_centavos,4000);
  const banco=await detalhe('saldo',{6:'banco'});assert.equal(banco.saldos.atual,painel.contas.find(x=>x.conta==='banco').saldo);
  const venc=await detalhe('receber',{8:true});assert(venc.total_centavos<s.receber);assert(venc.itens.every(x=>x.data>=inicio&&x.data<=fim));
  assert.equal((await detalhe('receitas',{4:'ausente'})).quantidade,0);
  await assert.rejects(()=>detalhe('invalido'));await assert.rejects(()=>detalhe('saldo',{2:'2025-01-01'}));
  await f.login(f.ids.stranger);await assert.rejects(()=>detalhe('saldo'));await f.login('','anon');await assert.rejects(()=>detalhe('saldo'));await f.login(f.ids[perfil]);
  resultados.push({perfil,cenario:'Busca, categoria, conta, vencimento, período inválido e isolamento/anon',ok:true});
 }
 console.log(JSON.stringify({ok:true,subsistemas:26,verificacoes:resultados.length}));
}catch(e){process.exitCode=1;console.error(e.stack||e);}finally{if(db)await db.close();await writeFile(resolve(pasta,'banco.json'),JSON.stringify({ok:!process.exitCode,resultados},null,2));}
