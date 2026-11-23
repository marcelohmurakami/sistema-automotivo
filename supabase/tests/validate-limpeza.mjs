import { codigoConflitoRevisao } from './banco-local.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { criarCenarioSubsistemas } from './subsistemas-fixture.mjs';
import { camposPlanejamentoLimpeza } from '../../src/lib/limpeza.ts';
import { aceiteServicoPendente } from '../../src/lib/aceiteServico.ts';
let c;
try {
 c=await criarCenarioSubsistemas();
 const call=async(fn,args)=>Object.values((await c.db.query(`select public.${fn}(${args.map((_,i)=>`$${i+1}`).join(',')})`,args)).rows[0])[0];
 await c.db.exec('reset role');assert.deepEqual((await c.db.query('select private.campos_planejamento_limpeza() as c')).rows[0].c,camposPlanejamentoLimpeza);
 const especificos={
  residencial:{ocupacao:'Ocupado',restricoes_produtos:'Cliente informou restrição a fragrâncias',organizacao:'Preservar documentos'},
  comercial:{supervisor:'Supervisor QA',periodicidades:'Piso diário; vidros quinzenais',areas_criticas:'Recepção'},
  pos_obra:{tipo_limpeza:'Limpeza fina',entulho:'Retirada pelo contratante',superficies_sensiveis:'Pedra natural'},
  estofados:{tipo_bem:'Sofá',quantidade_lugares:'3',modalidade:'No cliente',secagem_horas:'12',condicoes_secagem:'Estimativa conforme ventilação',resultado_manchas:'Marca antiga remanescente'},
  vidros:{tipo_acesso:'A partir do piso',condicao_execucao:'Liberada pelo responsável',responsavel_liberacao:'Encarregado QA',restricoes_vidro:'Película interna'},
  geral:{prioridades:'Banheiro e cozinha',fornecimento:'Prestador'},
 };
 for(const [nome,extra] of Object.entries(especificos)) {
  const perfil='limpeza_'+nome,{w,atendimento:id,funcionario,recurso,hoje}=c.registros[perfil];await c.login(c.ids[perfil]);
  const get=()=>call('consultar_detalhes_atendimento',[w,id]);
  const save=async(a)=>{await call('salvar_atendimento_servico',[w,id,a,a.revisao]);return get();};
  const saldo=async()=>(await call('listar_estoque',[w])).itens[0].saldo;
  let d=await get();
  const campos={...extra,area:'120.5',frequencia:'Semanal',endereco_visita:'Rua QA, 14 · unidade 3',pessoas_previstas:'2',horas_previstas:'4',exclusoes:'Não inclui caixa d’água',produtos:'Aplicação conforme rótulo do fabricante',resultado_vistoria:'Com pendências',pendencias_finais:'Revisar canto do corredor',liberacao_uso:'Uso com restrições',restricoes_uso:'Respeitar a orientação registrada'};
  d=await save({...d.atendimento,ficha_especialidade:{...d.atendimento.ficha_especialidade,campos}});
  await assert.rejects(()=>save({...d.atendimento,ficha_especialidade:{...d.atendimento.ficha_especialidade,campos:{...campos,pessoas_previstas:'1.5'}}}),/quantidade inteira/);
  await assert.rejects(()=>save({...d.atendimento,ficha_especialidade:{...d.atendimento.ficha_especialidade,campos:{...campos,imei:'123'}}}),/Campo|campo|ficha/i);
  d=await save({...d.atendimento,situacao:'aprovado'});d=await save({...d.atendimento,situacao:'em_execucao'});
  await call('salvar_equipe_atendimento',[w,id,d.atendimento.revisao,[{funcionario_id:funcionario,percentual:10,custo_hora_centavos:2500}]]);d=await get();
  await call('registrar_horas_atendimento',[w,id,randomUUID(),funcionario,'2026-01-01T12:00:00Z','2026-01-01T14:00:00Z','Execução QA']);
  const itens=d.itens.map(i=>({...i})),material=itens.find(i=>i.tipo==='material');material.unidade='l';material.quantidade=1.5;
  await call('salvar_itens_atendimento',[w,id,d.atendimento.revisao,itens,500,700,'Deslocamento']);d=await get();
  if(nome==='vidros') await assert.rejects(()=>save({...d.atendimento,situacao:'concluido',ficha_especialidade:{...d.atendimento.ficha_especialidade,campos:{...campos,condicao_execucao:'Suspensa'}}}),/suspenso/);
  await assert.rejects(()=>save({...d.atendimento,ficha_especialidade:{...d.atendimento.ficha_especialidade,campos:{...campos,situacao_aceite:'Aceito',aceite:'Ana',data_aceite:hoje}}}),/Conclua/);
  d=await save({...d.atendimento,situacao:'concluido'});assert.equal(await saldo(),8.5);assert.ok(aceiteServicoPendente(d.atendimento));
  const aceite={...campos,situacao_aceite:'Aceito com ressalvas',aceite:'Cliente QA',data_aceite:hoje};
  await assert.rejects(()=>save({...d.atendimento,ficha_especialidade:{...d.atendimento.ficha_especialidade,campos:aceite}}),/ressalvas/);
  aceite.ressalvas_aceite='Canto do corredor a revisar';d=await save({...d.atendimento,ficha_especialidade:{...d.atendimento.ficha_especialidade,campos:aceite}});
  assert.equal(await saldo(),8.5);assert.ok(!aceiteServicoPendente(d.atendimento));
  // A série não copia execução, aceite, horas, custos extras ou títulos.
  const ag={atendimento_id:id,recurso_id:recurso,inicio:'2026-11-01T09:00:00-03:00',fim:'2026-11-01T11:00:00-03:00',situacao:'agendado',nova_situacao:'aprovado',observacoes:'Visitas semanais QA'};
  const args=[w,randomUUID(),ag,3,7,d.atendimento.revisao];
  const serie=await call('programar_visitas_limpeza',args);assert.equal(serie.length,3);assert.deepEqual(await call('programar_visitas_limpeza',args),serie);
  await assert.rejects(()=>call('programar_visitas_limpeza',[...args.slice(0,3),4,7,d.atendimento.revisao]),/outros dados/);
  const novas=[];
  for(const [i,novo] of serie.entries()){
   const v=await call('consultar_detalhes_atendimento',[w,novo]);novas.push(v);
   assert.equal(v.atendimento.situacao,'aprovado');assert.equal(v.atendimento.valor_centavos,17000);assert.equal(v.atendimento.data_servico,`2026-11-${String(1+7*i).padStart(2,'0')}`);assert.equal(v.atendimento.ficha_especialidade.campos.prazo_servico,v.atendimento.data_servico);
   assert.equal(v.atendimento.ficha_especialidade.campos.endereco_visita,campos.endereco_visita);assert.equal(v.atendimento.ficha_especialidade.campos.resultado_vistoria,undefined);assert.equal(v.atendimento.ficha_especialidade.campos.situacao_aceite,undefined);assert.equal(v.atendimento.ficha_especialidade.campos.produtos,undefined);
   assert.equal(v.comercial.custo_extra_centavos,0);assert.equal(v.comercial.desconto_centavos,500);assert.equal(v.equipe.length,1);assert.equal(v.equipe[0].comissao_centavos,0);assert.equal(v.horas.length,0);assert.equal(v.qualidade.length,0);assert.deepEqual(v.atendimento.ficha_especialidade.checklist,{});
  }
  assert.equal(await saldo(),8.5);assert.equal((await get()).atendimento.revisao,d.atendimento.revisao);
  // Conflito só na segunda visita precisa desfazer também a primeira.
  const antes=await call('consultar_servicos',[w]);
  await assert.rejects(()=>call('programar_visitas_limpeza',[w,randomUUID(),{...ag,inicio:'2026-10-25T09:00:00-03:00',fim:'2026-10-25T11:00:00-03:00'},2,7,d.atendimento.revisao]),/horário/);
  const depois=await call('consultar_servicos',[w]);assert.equal(depois.atendimentos.length,antes.atendimentos.length);assert.equal(depois.agenda.length,antes.agenda.length);
  await assert.rejects(()=>call('programar_visitas_limpeza',[w,randomUUID(),ag,53,7,d.atendimento.revisao]),/repetição/);
  await assert.rejects(()=>call('programar_visitas_limpeza',[w,randomUUID(),ag,3,7,0]),e=>e.code===codigoConflitoRevisao);
  // Concluir/cobrar uma visita não altera as demais.
  let v=novas[0].atendimento;await call('salvar_atendimento_servico',[w,v.id,{...v,situacao:'concluido'},v.revisao]);assert.equal(await saldo(),7);
  assert.equal((await call('consultar_detalhes_atendimento',[w,serie[1]])).atendimento.situacao,'aprovado');
  const titulo=await call('faturar_atendimento_servico',[w,serie[0]]);assert.equal(await call('faturar_atendimento_servico',[w,serie[0]]),titulo);
  const pagamento=[w,titulo,randomUUID(),5000,0,hoje,'caixa','pix','QA'];await call('baixar_titulo_financeiro',pagamento);await call('baixar_titulo_financeiro',pagamento);
  await call('reabrir_atendimento_servico',[w,id,d.atendimento.revisao,'Revisar canto']);d=await get();assert.equal(await saldo(),8.5);assert.equal(d.atendimento.ficha_especialidade.campos.situacao_aceite,'Pendente');assert.equal(d.atendimento.ficha_especialidade.campos.liberacao_uso,'Não liberado');assert.ok(d.eventos.some(e=>e.tipo==='aceite' && e.antes?.includes('Cliente QA') && e.depois==='Conferência: Pendente'));
  await call('salvar_qualidade_atendimento',[w,id,randomUUID(),{tipo:'retrabalho',motivo:'Canto do corredor',aberto_em:hoje,custo_centavos:2500,minutos:30,funcionario_id:funcionario,nota:4},null]);
  const r=await call('consultar_relatorios_servicos',[w,'2026-01-01','2026-12-31']);assert.equal(r.devedores.find(x=>x.atendimento_id===serie[0]).saldo,12000);assert.ok(r.qualidade.some(x=>x.custo_centavos===2500));
  await c.login(c.ids.stranger);await assert.rejects(()=>call('programar_visitas_limpeza',args),e=>e.code==='42501');await assert.rejects(get,e=>e.code==='42501');
  console.log(`PASS ${nome}: orçamento, particularidades, aprovação, horas, produtos fracionados, vistoria, aceite, recorrência independente/idempotente/atômica, pagamento parcial, reabertura, retrabalho e isolamento`);
 }
 await c.login(c.ids.assistencia_celulares);const celular=c.registros.assistencia_celulares;
 await assert.rejects(()=>call('programar_visitas_limpeza',[celular.w,randomUUID(),{atendimento_id:celular.atendimento},2,7,1]),/exclusiva/);
 const w=c.registros.limpeza_geral.w;
 await c.db.exec('reset role');await c.db.query("insert into public.membros_oficina(oficina_id,usuario_id,perfil) values($1,$2,'staff')",[w,c.ids.stranger]);
 await c.login(c.ids.stranger);await assert.rejects(()=>call('programar_visitas_limpeza',[w,randomUUID(),{},2,7,1]),e=>e.code==='42501');
 await assert.rejects(()=>c.db.query('select * from public.series_visitas_limpeza'),e=>e.code==='42501');
 await c.login('', 'anon');await assert.rejects(()=>call('programar_visitas_limpeza',[w,randomUUID(),{},2,7,1]),e=>e.code==='42501');
 console.log('PASS permissões: equipe sem gerência, anônimo e acesso direto à tabela não podem criar ou ler séries');
} finally {await c?.db.close();}
