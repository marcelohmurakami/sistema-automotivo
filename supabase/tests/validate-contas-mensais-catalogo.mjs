import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {resolve} from 'node:path';
import {writeFile,mkdir} from 'node:fs/promises';
import {criarCenarioSubsistemas} from './subsistemas-fixture.mjs';
process.env.DB_VALIDATION_RUNTIME=resolve('node_modules/@electric-sql/pglite/dist/index.js');
process.env.DB_VALIDATION_MIGRATION_LIMIT='99999999999999';
const out=resolve('output/contas-mensais-servicos-20261106');let db;const resultados=[];
try {
 const c=await criarCenarioSubsistemas();db=c.db;
 const one=async(s,a=[])=>Object.values((await db.query(s,a)).rows[0])[0];
 const call=(fn,a)=>one(`select public.${fn}(${a.map((_,i)=>'$'+(i+1)).join(',')})`,a);
 for(const [perfil,r] of Object.entries(c.registros)) {
  const checks=[];await c.login(c.ids[perfil]);const w=r.w;
  const base={descricao:'Aluguel mensal QA',natureza:'pagar',categoria:'aluguel',valor_centavos:150000,valor_variavel:false,dia:Number(r.hoje.slice(-2)),inicio:r.hoje,fim:null,ativa:true};
  const fixo=uuid(),variavel=uuid();await call('salvar_conta_recorrente',[w,fixo,base,0]);
  let alerts=await call('consultar_alertas',[w]);const f=alerts.find(a=>a.titulo===base.descricao);assert.equal(f.dias,0);assert.equal(f.valor_centavos,150000);assert.equal(f.valor_pendente,false);
  await call('sincronizar_contas_recorrentes',[w]);assert.equal((await call('consultar_alertas',[w])).filter(a=>a.id===f.id).length,1);checks.push('Conta fixa gerada uma vez; alerta vence hoje');
  await call('salvar_conta_recorrente',[w,variavel,{...base,descricao:'Água mensal QA',categoria:'agua_luz',valor_variavel:true,valor_centavos:0},0]);
  let pend=await call('consultar_contas_mensais_pendentes',[w]);assert.equal(pend.total,1);const p=pend.itens[0];
  alerts=await call('consultar_alertas',[w]);const v=alerts.find(a=>a.tipo==='conta_mensal'&&a.id===p.id);assert.equal(v.dias,0);assert.equal(v.valor_centavos,null);assert.equal(v.valor_pendente,true);
  await call('sincronizar_contas_recorrentes',[w]);assert.equal((await call('consultar_contas_mensais_pendentes',[w])).total,1);checks.push('Variável sem estimativa gera pendência e lembrete, sem inventar dívida');
  await call('marcar_alertas_lidos',[w,[v.chave]]);assert.equal((await call('consultar_alertas',[w])).find(a=>a.id===p.id).lido,true);
  const outro=Object.values(c.registros).find(x=>x.w!==w).w;
  await assert.rejects(()=>call('informar_valor_conta_mensal',[outro,p.id,12345]),e=>e.code==='42501');
  await assert.rejects(()=>call('informar_valor_conta_mensal',[w,p.id,0]),e=>e.code==='22023');
  const t=await call('informar_valor_conta_mensal',[w,p.id,12345]);assert.equal(await call('informar_valor_conta_mensal',[w,p.id,12345]),t);
  await assert.rejects(()=>call('informar_valor_conta_mensal',[w,p.id,54321]),e=>e.code==='PT409');
  const titulo=await call('consultar_titulo_alerta',[w,t]);assert.equal(titulo.valor_centavos,12345);assert.equal(titulo.baixado_centavos,0);assert.ok(titulo.valor_confirmado_em);assert.equal((await call('consultar_contas_mensais_pendentes',[w])).total,0);
  assert.equal((await call('consultar_contas_recorrentes',[w])).find(x=>x.id===variavel).valor_centavos,0);checks.push('Valor confirmado só no mês, sem pagamento automático; retry idempotente e isolamento');
  await call('baixar_titulo_financeiro',[w,t,uuid(),12345,0,r.hoje,'banco','pix','Pagamento QA']);
  assert(!(await call('consultar_alertas',[w])).some(a=>a.id===t||a.id===p.id));checks.push('Pagamento baixa saldo e remove lembrete');
  let rules=await call('consultar_contas_recorrentes',[w]);let rule=rules.find(x=>x.id===fixo);
  await call('salvar_conta_recorrente',[w,fixo,{...rule,valor_centavos:160000},rule.revisao]);
  assert.equal((await call('consultar_titulo_alerta',[w,f.id])).valor_centavos,150000);
  await assert.rejects(()=>call('salvar_conta_recorrente',[w,fixo,rule,rule.revisao]),e=>e.code==='PT409');
  rule=(await call('consultar_contas_recorrentes',[w])).find(x=>x.id===fixo);
  await call('salvar_conta_recorrente',[w,fixo,{...rule,ativa:false},rule.revisao]);await call('sincronizar_contas_recorrentes',[w]);
  assert.equal((await call('consultar_titulo_alerta',[w,f.id])).valor_centavos,150000);checks.push('Editar e pausar preserva meses gerados; edição antiga bloqueada');
  await assert.rejects(()=>call('salvar_conta_recorrente',[w,uuid(),{...base,valor_centavos:0},0]));
  await assert.rejects(()=>call('salvar_conta_recorrente',[w,uuid(),{...base,dia:32},0]));checks.push('Fixo sem valor e vencimento inválido rejeitados');
  const cat=uuid(), ficha={notas:'Conferir condições e executar conforme procedimento.',duracao_minutos:60,custos:[{descricao:'Insumos',valor_centavos:2000},{descricao:'Execução própria',valor_centavos:1000}]};
  const item={tipo:'service',descricao:'Serviço completo QA',unidade:'serv',preco_padrao_centavos:10000,custo_centavos:1,ficha};
  await call('salvar_servico_detalhado',[w,cat,item,null]);let cad=await call('consultar_ficha_servico',[w,cat]);assert.equal(cad.custo_centavos,3000);assert.deepEqual(cad.ficha,ficha);
  const busca=await call('buscar_cadastros_operacao',[w,'catalogo','Serviço completo QA']);assert.equal(busca[0].custo_centavos,3000);checks.push('Ficha e composição persistidas; servidor soma custos; seleção da OS recebe total');
  let id,si=uuid();
  if(r.proposta){const os=await call('salvar_os_com_itens',[w,{cliente_id:r.cliente,veiculo_id:r.objeto,data_servico:r.hoje,desconto_centavos:1000,itens:[{id:si,tipo:'service',descricao:item.descricao,unidade:'serv',quantidade:2,preco_unitario_centavos:10000,item_catalogo_id:cat,situacao:'pending'}]},uuid()]);id=os.id;assert.equal(os.itens.find(x=>x.id===si).custo_unitario_previsto_centavos,3000);}
  else {id=r.atendimento;let d=await call('consultar_detalhes_atendimento',[w,id]);await call('salvar_itens_atendimento',[w,id,d.atendimento.revisao,[{id:si,tipo:'servico',descricao:item.descricao,unidade:'serv',quantidade:2,preco_centavos:10000,custo_centavos:busca[0].custo_centavos,custo_informado:true,origem:'externa'}],1000]);d=await call('consultar_detalhes_atendimento',[w,id]);await call('salvar_atendimento_servico',[w,id,{...d.atendimento,situacao:'aprovado'},d.atendimento.revisao]);}
  let lucro=await call('consultar_lucro_documento',[w,id]);assert.equal(lucro.custo,6000);assert.equal(lucro.receita,19000);assert.equal(lucro.margem,13000);checks.push('OS desconta custo × quantidade e desconto na margem'); const financeiro=await call('consultar_custeio_servico',[w,id]);assert.equal(financeiro.custo,6000);assert.equal(financeiro.margem,13000);const listagem=await call('listar_custeio_servicos',[w,r.hoje,r.hoje,'',0]);assert.equal(listagem.itens.find(x=>x.id===id).custo,6000);checks.push('Financeiro em Custos e margens reflete o mesmo custo e resultado da OS');
  await call('salvar_servico_detalhado',[w,cat,{...cad,ficha:{...ficha,custos:[{descricao:'Novo custo',valor_centavos:5000}]}},cad.revisao]);assert.equal((await call('consultar_lucro_documento',[w,id])).custo,6000);
  await call('salvar_custo_item_documento',[w,id,si,lucro.revisao,4000]);lucro=await call('consultar_lucro_documento',[w,id]);assert.equal(lucro.custo,8000);assert.equal(lucro.margem,11000);assert.equal((await call('consultar_ficha_servico',[w,cat])).custo_centavos,5000);checks.push('Catálogo não altera OS antiga; custo da OS editável independentemente');
  await assert.rejects(()=>call('consultar_ficha_servico',[outro,cat]),e=>e.code==='42501');
  cad=await call('consultar_ficha_servico',[w,cat]);await assert.rejects(()=>call('salvar_servico_detalhado',[w,cat,{...cad,ficha:{...ficha,custos:[{descricao:'Invalido',valor_centavos:-1}]}},cad.revisao]),e=>e.code==='22023');
  await db.exec('reset role');await db.query("update public.membros_oficina set perfil='staff' where oficina_id=$1 and usuario_id=$2",[w,c.ids[perfil]]);await c.login(c.ids[perfil]);
  const staff=await call('consultar_ficha_servico',[w,cat]);assert.equal(staff.custo_centavos,undefined);assert.deepEqual(staff.ficha.custos,[]);
  await assert.rejects(()=>call('salvar_servico_detalhado',[w,cat,cad,cad.revisao]),e=>e.code==='42501');
  await db.exec('reset role');await db.query("update public.membros_oficina set perfil='owner' where oficina_id=$1 and usuario_id=$2",[w,c.ids[perfil]]);await c.login(c.ids[perfil]);checks.push('Ficha isolada por empresa; custos restritos à gerência; inválidos rejeitados');
  resultados.push({perfil,checks,ok:true});console.log('PASS',perfil,checks.length);
 }
 // Meses curtos e retomada sem retroativos usam datas históricas apenas no banco local.
 const r=Object.values(c.registros)[0];await c.login(Object.values(c.ids)[0]);
 const id=uuid();await call('salvar_conta_recorrente',[r.w,id,{descricao:'Fim do mês QA',natureza:'pagar',categoria:'aluguel',valor_centavos:100,dia:31,inicio:'2024-02-01',fim:'2024-03-31',ativa:true,valor_variavel:false},0]);
 await db.exec('reset role');const datas=(await db.query('select vencimento::text data from public.titulos_financeiros where recorrencia_id=$1 order by vencimento',[id])).rows.map(x=>x.data);assert.deepEqual(datas,['2024-02-29','2024-03-31']);
 resultados.push({perfil:'calendário',checks:['Dia 31 ajustado a fevereiro bissexto; fim da recorrência respeitado'],ok:true});
} catch(e){console.error(e.stack,e.code,e.where);process.exitCode=1;}finally{await db?.close();await mkdir(out,{recursive:true});await writeFile(resolve(out,'banco.json'),JSON.stringify({ok:!process.exitCode,resultados},null,2));}
