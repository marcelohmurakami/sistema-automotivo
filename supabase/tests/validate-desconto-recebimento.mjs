import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {criarCenarioSubsistemas} from './subsistemas-fixture.mjs';
import {especialidades} from '../../src/lib/especialidades.ts';
process.env.DB_VALIDATION_RUNTIME ||= resolve('node_modules/@electric-sql/pglite/dist/index.js');
process.env.DB_VALIDATION_MIGRATION_LIMIT='99999999999999';
const pasta=resolve('output/desconto-pagamento-20261105');await mkdir(pasta,{recursive:true});
const resultados=[];let db;
try {
 const f=await criarCenarioSubsistemas();db=f.db;
 const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const call=(fn,args)=>scalar(`select public.${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);
 for(const [perfil,r] of Object.entries(f.registros)) {
  await f.login(f.ids[perfil]);const auto=especialidades[perfil].ramo==='automotivo';let doc=r.atendimento;
  if(auto){
   const q=await call('emitir_orcamento',[r.w,r.proposta.id,r.proposta.revisao,7,randomBytes(32).toString('hex')]);
   await call('aprovar_orcamento_interno',[r.w,q.id,q.revisao,q.versao.id]);
   doc=await call('converter_orcamento_em_os',[r.w,q.id]);
  }else{
   const {atendimento:a}=await call('consultar_detalhes_atendimento',[r.w,doc]);
   await call('salvar_atendimento_servico',[r.w,doc,{...a,situacao:'aprovado'},a.revisao]);
  }
  const t=await call(auto?'preparar_financeiro_os':'faturar_atendimento_servico',[r.w,doc]);
  const total=auto?10000:15000;
  // Um sinal já recebido não pode ser descontado de novo.
  await call('baixar_titulo_financeiro',[r.w,t,randomUUID(),1000,0,r.hoje,'banco','pix','Sinal']);
  const saldo=total-1000,desconto=Math.round(saldo*0.125),pago=2000,key=randomUUID();
  const args=[r.w,t,key,pago,0,r.hoje,'banco','pix',desconto,saldo,'Desconto QA','2026-12-15'];
  const aplicar=(over={})=>call('baixar_titulo_com_desconto_os',Object.assign([...args],over));
  const documento=async()=>auto?call('consultar_ordem_servico',[r.w,doc]):call('consultar_detalhes_atendimento',[r.w,doc]);
  const snapshot=async()=>({doc:await documento(),titulo:(await db.query('select valor_centavos,revisao,vencimento from public.titulos_financeiros where id=$1',[t])).rows[0],baixas:await call('historico_financeiro',[r.w,t])});
  const antes=await snapshot();
  for(const override of [{8:-1},{8:saldo},{9:saldo+1},{3:saldo},{4:pago},{5:'2099-01-01'},{6:'conta-inexistente'}]){
    await assert.rejects(()=>aplicar(override));assert.deepEqual(await snapshot(),antes);
    resultados.push({perfil,cenario:'Entrada inválida mantém OS e financeiro intactos: '+JSON.stringify(override),ok:true});
  }
  await f.login(f.ids.stranger);await assert.rejects(()=>aplicar());await f.login(f.ids[perfil]);
  const baixa=await aplicar();assert.equal(await aplicar(),baixa);
  await assert.rejects(()=>aplicar({3:pago+1}));
  const depois=await snapshot();assert.equal(Number(depois.titulo.valor_centavos),total-desconto);
  assert.equal(depois.baixas.length,2);assert.equal(depois.baixas.reduce((s,b)=>s+b.valor_centavos,0),3000);
  assert.equal(depois.baixas.find(b=>b.id===baixa).desconto_centavos,desconto);
  const novoTotal=auto?depois.doc.total_centavos:depois.doc.atendimento.valor_centavos;
  assert.equal(novoTotal,total-desconto);assert.equal(auto?depois.doc.desconto_centavos:depois.doc.comercial.desconto_centavos,desconto);
  resultados.push({perfil,cenario:'12,5% somente do saldo; parcial, vencimento, idempotência, isolamento e total da OS',ok:true});
  // Estorno devolve dinheiro ao saldo, mas não revoga o desconto concedido.
  await call('estornar_baixa_financeira',[r.w,baixa,r.hoje,'Teste de estorno']);
  assert.equal(Number((await snapshot()).titulo.valor_centavos),total-desconto);
  const restante=total-desconto-1000,desconto2=123;
  await aplicar({2:randomUUID(),3:restante-desconto2,8:desconto2,9:restante,11:null});
  const fim=await snapshot();assert.equal(Number(fim.titulo.valor_centavos),total-desconto-desconto2);
  assert.equal(fim.baixas.reduce((s,b)=>s+(b.estorno_de?-1:1)*b.valor_centavos,0),total-desconto-desconto2);
  resultados.push({perfil,cenario:'Estorno preserva desconto; novo desconto R$ acumula corretamente e quita',ok:true});
 }
 console.log(JSON.stringify({ok:true,subsistemas:26,verificacoes:resultados.length}));
} catch(e){process.exitCode=1;console.error(e.stack || e);}
finally{if(db)await db.close();await writeFile(resolve(pasta,'banco.json'),JSON.stringify({ok:!process.exitCode,resultados},null,2));}
