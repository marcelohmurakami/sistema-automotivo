import { codigoConflitoRevisao } from './banco-local.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { criarCenarioReparos } from './reparos-fixture.mjs';
import { concluirReparo, registrarRetirada } from '../../src/lib/assistenciaTecnica.ts';
import { perfisAtendimento } from '../../src/lib/perfisAtendimento.ts';
let c;
try {
  c=await criarCenarioReparos({digitais:true});
  const call=async(nome,args)=>Object.values((await c.db.query(`select public.${nome}(${args.map((_,i)=>`$${i+1}`).join(',')})`,args)).rows[0])[0];
  await c.db.exec('reset role');
  const contrato=(await c.db.query('select private.perfis_atendimento() as valor')).rows[0].valor;
  for(const [id,p] of Object.entries(perfisAtendimento)) assert.deepEqual(Object.keys(contrato[id].campos).sort(),p.grupos.flatMap(g=>g.campos.map(c=>c.id)).sort(),id);
  for(const nome of ['celulares','informatica']) {
    const w=c.empresas[nome],perfil=`assistencia_${nome}`;
    await c.login(c.ids[nome]);
    const painel=await call('consultar_servicos',[w]),a=painel.atendimentos.find(a=>a.titulo==='Orçamento QA');
    const get=()=>call('consultar_detalhes_atendimento',[w,a.id]);
    const save=async(d)=>{await call('salvar_atendimento_servico',[w,a.id,d,d.revisao]);return get();};
    const saldo=async()=>(await call('listar_estoque',[w])).itens[0].saldo;
    let d=await get();assert.equal(await saldo(),8);
    await c.login(c.ids.customer);
    const portal=await call('consultar_meus_atendimentos',[w]);assert.equal(portal.length,1);assert.equal(portal[0].id,a.id);
    // A taxa comercial é pública; diagnóstico técnico, custos e permissões de dados não são.
    assert.doesNotMatch(JSON.stringify(portal),/"(?:diagnostico|autorizacao_dados|custo_centavos|backup_escopo)"\s*:/);
    await call('aprovar_meu_atendimento',[w,a.id,portal[0].revisao]);
    await c.login(c.ids[nome]);d=await get();assert.equal(d.atendimento.situacao,'aprovado');
    assert.equal(d.atendimento.ficha_especialidade.campos.autorizacao_dados,'Não autorizada','aprovação comercial não autoriza apagar dados');
    const f=d.atendimento.ficha_especialidade;
    f.etapa=nome==='celulares'?'Reparo':'Reparo de hardware';
    f.campos={...f.campos,tipo_aparelho:nome==='celulares'?'Tablet':'Notebook',identificacao:'QA-IDENTIFICACAO',backup:'Não foi possível realizar',backup_escopo:'Preservar arquivos sem acessar conteúdo',referencia_autorizacao:'Cliente não autorizou apagar',resultado_teste:'Teste parcial',limitacoes_teste:'Conferência acompanhada pendente',...(nome==='celulares'?{imei_secundario:'SEGUNDO-QA',sim_memoria:'Retirados pelo cliente',bateria:'Carga estável por 30 min',funcoes_saida:'Toque conferido; rede sem chip'}:{criptografia:'Ativada — acesso indisponível',perifericos:'USB e teclado conferidos',estabilidade:'Inicialização conferida por 30 min'})};
    d=await save({...d.atendimento,situacao:'em_execucao',ficha_especialidade:f});
    for (const etapa of ['Pronto para retirada','Entregue']) {
      await assert.rejects(()=>save({...d.atendimento,ficha_especialidade:{...f,etapa}}),/Conclua o reparo/);
      assert.equal((await get()).atendimento.ficha_especialidade.etapa,f.etapa);
      assert.equal(await saldo(),8);
    }
    await assert.rejects(()=>save({...d.atendimento,revisao:1}),e=>e.code===codigoConflitoRevisao);
    const equipe=d.equipe[0];
    await call('registrar_horas_atendimento',[w,a.id,randomUUID(),equipe.funcionario_id,'2026-10-15T12:00:00Z','2026-10-15T12:30:00Z','Diagnóstico QA']);
    d=await get();assert.equal(d.horas.length,1);
    const itens=d.itens.map(i=>({...i})),peca=itens.find(i=>i.tipo==='material');
    peca.quantidade=99;
    await call('salvar_itens_atendimento',[w,a.id,d.atendimento.revisao,itens,0,0,'Teste de saldo']);
    d=await get();await assert.rejects(()=>save(concluirReparo(d.atendimento,perfil)),/estoque|saldo/i);assert.equal(await saldo(),8);
    d=await get();assert.equal(d.atendimento.situacao,'em_execucao');
    peca.quantidade=1;
    await call('salvar_itens_atendimento',[w,a.id,d.atendimento.revisao,itens,0,0,'Saldo corrigido']);
    d=await get();d=await save(concluirReparo(d.atendimento,perfil));assert.equal(await saldo(),7);
    assert.equal(d.atendimento.ficha_especialidade.campos.resultado_teste,'Teste parcial');
    const concluido=d.atendimento.concluido_em;
    await assert.rejects(()=>save({...d.atendimento,ficha_especialidade:{...d.atendimento.ficha_especialidade,etapa:'Entregue'}}),/Informe quem recebeu/);
    d=await save({...d.atendimento,dados:{...d.atendimento.dados,observacoes_cliente:'Conferência na retirada'}});
    assert.equal(d.atendimento.concluido_em,concluido);assert.equal(await saldo(),7);
    d=await save(registrarRetirada(d.atendimento,'Pessoa autorizada QA',perfil));
    assert.equal(d.atendimento.ficha_especialidade.etapa,'Entregue');assert.equal(await saldo(),7);
    await call('reabrir_atendimento_servico',[w,a.id,d.atendimento.revisao,'Verificação adicional']);
    d=await get();assert.match(d.atendimento.ficha_especialidade.etapa,/Reparo/);assert.equal(await saldo(),8);
    assert.equal(d.atendimento.ficha_especialidade.campos.backup,'Não foi possível realizar');
    d=await save(concluirReparo(d.atendimento,perfil));assert.equal(await saldo(),7);
    const titulo=await call('faturar_atendimento_servico',[w,a.id]);assert.equal(await call('faturar_atendimento_servico',[w,a.id]),titulo);
    const baixa=[w,titulo,randomUUID(),10000,0,'2026-10-15','caixa','pix','Recebimento parcial QA'];
    await call('baixar_titulo_financeiro',baixa);await call('baixar_titulo_financeiro',baixa);
    await assert.rejects(()=>call('baixar_titulo_financeiro',[w,titulo,randomUUID(),999999,0,'2026-10-15','caixa','pix','Valor excedente']),/valor|saldo/i);
    d=await get();await call('reabrir_atendimento_servico',[w,a.id,d.atendimento.revisao,'Reabertura com recebimento']);
    d=await get();assert.equal(d.atendimento.situacao,'em_execucao');assert.equal(await saldo(),8);
    assert.equal(await call('faturar_atendimento_servico',[w,a.id]),titulo,'reabertura preserva cobrança');
    await assert.rejects(()=>call('salvar_itens_atendimento',[w,a.id,d.atendimento.revisao,itens,0,0,'Alteração bloqueada']),/cobrança/i);
    const baixas=(await c.db.query('select count(*)::int as quantidade,sum(valor_centavos)::int as valor from public.baixas_financeiras where titulo_id=$1',[titulo])).rows[0];
    assert.equal(baixas.quantidade,1);assert.equal(baixas.valor,10000);
    d=await save(concluirReparo(d.atendimento,perfil));assert.equal(await saldo(),7);
    const q=randomUUID();
    await call('salvar_qualidade_atendimento',[w,a.id,q,{tipo:'garantia',motivo:'Intermitência após entrega',aberto_em:'2026-10-16',custo_centavos:3500,minutos:30,funcionario_id:equipe.funcionario_id,nota:4},null]);
    d=await get();assert.equal(d.qualidade[0].custo_centavos,3500);assert.equal(d.qualidade[0].minutos,30);
    await c.login(c.ids.stranger);await assert.rejects(()=>get(),e=>e.code==='42501');
    await c.login(c.ids.customer);await assert.rejects(()=>get(),e=>e.code==='42501');
    console.log(`PASS ${nome}: portal, autorização separada, diagnóstico, horas, saldo insuficiente, conclusão, entrega, reabertura, fatura, pagamento parcial, garantia e isolamento`);
  }
} finally {await c?.db.close();}
