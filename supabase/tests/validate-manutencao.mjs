import { codigoConflitoRevisao } from './banco-local.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { criarCenarioManutencao } from './manutencao-fixture.mjs';
import { perfisAtendimento } from '../../src/lib/perfisAtendimento.ts';
import { aceiteManutencaoPendente } from '../../src/lib/manutencao.ts';
import { resultadoAtendimento } from '../../src/lib/calculosAtendimento.ts';
let c;
try {
 c=await criarCenarioManutencao();
 const call=async(fn,args)=>Object.values((await c.db.query(`select public.${fn}(${args.map((_,i)=>`$${i+1}`).join(',')})`,args)).rows[0])[0];
 await c.db.exec('reset role');
 const contratos=(await c.db.query('select private.perfis_atendimento() as p')).rows[0].p;
 for(const [id,p] of Object.entries(perfisAtendimento)) assert.deepEqual(Object.keys(contratos[id].campos).sort(),p.grupos.flatMap(g=>g.campos.map(c=>c.id)).sort(),id);
 for (const nome of ['climatizacao','eletrica','hidraulica','equipamentos','geral']) {
  const w=c.empresas[nome]; await c.login(c.ids[nome]);
  const painel=await call('consultar_servicos',[w]), a=painel.atendimentos.find(a=>a.titulo==='Orçamento QA');
  const get=()=>call('consultar_detalhes_atendimento',[w,a.id]);
  const save=async(a)=>{await call('salvar_atendimento_servico',[w,a.id,a,a.revisao]);return get();};
  const saldo=async()=>(await call('listar_estoque',[w])).itens[0].saldo;
  // Este roteiro usa horas, aceite, pagamento e relatório de outubro. Fixar
  // também a data do serviço evita depender do mês em que o teste é executado.
  const historico=await get();await save({...historico.atendimento,data_servico:'2026-10-19',vencimento:'2026-10-19'});
  assert.equal(await saldo(),7);
  await c.login(c.ids.customer); const portal=await call('consultar_meus_atendimentos',[w]);
  assert.equal(portal.length,1);assert.doesNotMatch(JSON.stringify(portal),/medicoes_entrada|custo_centavos|restricoes_uso/);
  await call('aprovar_meu_atendimento',[w,a.id,portal[0].revisao]); await c.login(c.ids[nome]);
  let d=await get(); assert.equal(d.atendimento.situacao,'aprovado');assert.equal(d.atendimento.valor_centavos,32250);
  d=await save({...d.atendimento,situacao:'em_execucao'});
  const campos={...d.atendimento.ficha_especialidade.campos,resultado_teste:'Reprovado nos testes',condicao_uso:'Não liberado'};
  const especificos={climatizacao:{tipo_sistema:'Split',refrigerante:'R-32',registro_pmoc:'Plano QA rotina 1',circuito_refrigerante:'Condição registrada pelo técnico'},eletrica:{circuito:'QDC circuito 3',referencia_procedimento:'Procedimento QA',responsavel_liberacao:'Técnico QA'},hidraulica:{rede:'Água quente',tubulacao:'PPR 25 mm',condicoes_teste:'Condição e unidades registradas',recomposicao:'Acabamento contratado à parte'},equipamentos:{horimetro:'1250.5',proximo_horimetro:'1500',horas_parado:'3.5',lubrificacao:'Referência do manual QA'},geral:{danos_anteriores:'Piso já trincado',recomposicao:'Acabamento conforme proposta'}}[nome];
  Object.assign(campos,especificos); const ficha={...d.atendimento.ficha_especialidade,campos};
  await assert.rejects(()=>save({...d.atendimento,ficha_especialidade:{...ficha,campos:{...campos,situacao_aceite:'Aceito',aceite:'Cliente',data_aceite:'2026-10-19'}}}),/Conclua o serviço/);
  d=await save({...d.atendimento,ficha_especialidade:ficha});
  await assert.rejects(()=>save({...d.atendimento,revisao:1}),e=>e.code===codigoConflitoRevisao);
  const equipe=d.equipe[0];
  await call('registrar_horas_atendimento',[w,a.id,randomUUID(),equipe.funcionario_id,'2026-10-19T12:00:00Z','2026-10-19T12:30:00Z','Diagnóstico local']);
  const reserva={atendimento_id:a.id,recurso_id:painel.recursos[0].id,inicio:'2026-10-21T09:00:00-03:00',fim:'2026-10-21T10:00:00-03:00',situacao:'agendado'};
  await call('salvar_agenda_servico',[w,randomUUID(),reserva]);
  await assert.rejects(()=>call('salvar_agenda_servico',[w,randomUUID(),reserva]),/horário|reserva|ocupado|conflit/i);
  d=await get();const itens=d.itens.map(i=>({...i})),material=itens.find(i=>i.tipo==='material');
  material.quantidade=99;await call('salvar_itens_atendimento',[w,a.id,d.atendimento.revisao,itens,0,0,'Teste saldo']);d=await get();
  await assert.rejects(()=>save({...d.atendimento,situacao:'concluido'}),/saldo|estoque/i);assert.equal(await saldo(),7);assert.equal((await get()).atendimento.situacao,'em_execucao');
  material.quantidade=1.5;d=await get();await call('salvar_itens_atendimento',[w,a.id,d.atendimento.revisao,itens,0,0,'']);d=await get();
  d=await save({...d.atendimento,situacao:'concluido'});assert.equal(await saldo(),5.5);assert.ok(aceiteManutencaoPendente(d.atendimento));
  assert.equal(d.atendimento.ficha_especialidade.campos.resultado_teste,'Reprovado nos testes');assert.equal(d.atendimento.ficha_especialidade.campos.condicao_uso,'Não liberado');
  const conclusao=d.atendimento.concluido_em;
  const aceite={...d.atendimento.ficha_especialidade.campos,situacao_aceite:'Aceito com ressalvas',aceite:'Ana QA',data_aceite:'2026-10-19'};
  await assert.rejects(()=>save({...d.atendimento,ficha_especialidade:{...ficha,campos:aceite}}),/ressalvas/);
  aceite.ressalvas_aceite='Aguardar peça; equipamento permanece sem liberação';
  d=await save({...d.atendimento,ficha_especialidade:{...ficha,campos:aceite}});assert.equal(d.atendimento.concluido_em,conclusao);assert.equal(await saldo(),5.5);assert.ok(!aceiteManutencaoPendente(d.atendimento));
  assert.ok(d.eventos.some(e=>e.tipo==='aceite' && e.depois.includes('Aceito com ressalvas') && e.depois.includes('Ana QA')));
  const resultado=resultadoAtendimento(d);assert.equal(resultado.receita,32250);assert.ok(resultado.custo>=7500);
  const titulo=await call('faturar_atendimento_servico',[w,a.id]);assert.equal(await call('faturar_atendimento_servico',[w,a.id]),titulo);
  const baixa=[w,titulo,randomUUID(),10000,0,'2026-10-19','caixa','pix','Recebimento fictício'];await call('baixar_titulo_financeiro',baixa);await call('baixar_titulo_financeiro',baixa);
  await assert.rejects(()=>call('baixar_titulo_financeiro',[w,titulo,randomUUID(),999999,0,'2026-10-19','caixa','pix','Excesso']),/saldo|valor/i);
  d=await get();await call('reabrir_atendimento_servico',[w,a.id,d.atendimento.revisao,'Retorno técnico QA']);d=await get();
  assert.equal(await saldo(),7);assert.equal(d.atendimento.ficha_especialidade.campos.situacao_aceite,'Pendente');assert.equal(d.atendimento.ficha_especialidade.campos.data_aceite,'');assert.equal(d.atendimento.ficha_especialidade.campos.condicao_uso,'Não avaliado');assert.equal(d.atendimento.ficha_especialidade.campos.medicoes_saida,campos.medicoes_saida);
  assert.ok(d.eventos.some(e=>e.tipo==='aceite' && e.antes.includes('Ana QA') && e.depois==='Conferência: Pendente'));
  assert.equal(await call('faturar_atendimento_servico',[w,a.id]),titulo);
  d=await save({...d.atendimento,situacao:'concluido'});assert.equal(await saldo(),5.5);
  await call('salvar_qualidade_atendimento',[w,a.id,randomUUID(),{tipo:'retrabalho',motivo:'Vazamento / falha recorrente QA',aberto_em:'2026-10-19',custo_centavos:3500,minutos:30,funcionario_id:equipe.funcionario_id,nota:3},null]);
  d=await get();assert.equal(d.qualidade[0].custo_centavos,3500);
  const relatorio=await call('consultar_relatorios_servicos',[w,'2026-10-01','2026-10-31']);
  assert.ok(relatorio.detalhes.some(x=>x.atendimento.id===a.id));assert.ok(relatorio.qualidade.some(x=>x.custo_centavos===3500));assert.equal(relatorio.devedores.find(x=>x.atendimento_id===a.id).saldo,22250);
  await c.login(c.ids.stranger);await assert.rejects(get,e=>e.code==='42501');await c.login(c.ids.customer);await assert.rejects(get,e=>e.code==='42501');
  console.log(`PASS ${nome}: proposta/portal, execução, campos específicos, agenda/conflito, horas, material fracionado, conclusão atômica, aceite/ressalvas, reabertura, cobrança idempotente, pagamento parcial, retrabalho e isolamento`);
 }
} finally {await c?.db.close();}
