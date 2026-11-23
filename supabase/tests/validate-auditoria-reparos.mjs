import { codigoConflitoRevisao } from './banco-local.mjs';
import assert from 'node:assert/strict';
import { criarCenarioReparos } from './reparos-fixture.mjs';
import { concluirReparo, registrarRetirada } from '../../src/lib/assistenciaTecnica.ts';
let c;
try {
  c=await criarCenarioReparos();
  const one=async(sql,args=[])=>Object.values((await c.db.query(sql,args)).rows[0])[0];
  for(const nome of ['eletro','placas']) {
    await c.login(c.ids[nome]); const w=c.empresas[nome];
    const painel=await one('select public.consultar_servicos($1)',[w]);
    const a=painel.atendimentos.find(a=>a.titulo==='Reparo pronto QA');
    const get=()=>one('select public.consultar_detalhes_atendimento($1,$2)',[w,a.id]);
    const saldo=async()=>(await one('select public.listar_estoque($1)',[w])).itens[0].saldo;
    let d=await get(); assert.equal(await saldo(),8);
    const conclusao=d.atendimento.concluido_em;
    const save=async(t)=>{await one('select public.salvar_atendimento_servico($1,$2,$3,$4)',[w,a.id,t,t.revisao]);return get();};
    d=await save({...d.atendimento,dados:{...d.atendimento.dados,observacoes_cliente:'Observações editadas'}});
    assert.equal(d.atendimento.concluido_em,conclusao); assert.equal(await saldo(),8);
    d=await save(registrarRetirada(d.atendimento,'Cliente QA',d.atendimento.ficha_especialidade.especialidade));
    assert.equal(d.atendimento.concluido_em,conclusao); assert.equal(await saldo(),8);
    const ficha=d.atendimento.ficha_especialidade;
    await one('select public.reabrir_atendimento_servico($1,$2,$3,$4)',[w,a.id,d.atendimento.revisao,'Conferência adicional de bancada']);
    d=await get(); assert.equal(d.atendimento.situacao,'em_execucao'); assert.equal(d.atendimento.concluido_em,null);
    assert.match(d.atendimento.ficha_especialidade.etapa,/Reparo/); assert.deepEqual(d.atendimento.ficha_especialidade.campos,ficha.campos); assert.equal(await saldo(),9);
    assert.ok(d.eventos.some(e=>e.tipo==='etapa'&&e.depois===d.atendimento.ficha_especialidade.etapa));
    await assert.rejects(()=>save({...d.atendimento,revisao:1}),e=>e.code===codigoConflitoRevisao); assert.equal(await saldo(),9);
    d=await save(concluirReparo(d.atendimento,ficha.especialidade)); assert.equal(await saldo(),8);
    assert.equal(d.atendimento.dados.observacoes_cliente,'Observações editadas');
    assert.equal(d.atendimento.ficha_especialidade.campos.resultado_teste,nome==='placas'?'Teste parcial':'Aprovado nos testes');
    const conta=await one('select public.faturar_atendimento_servico($1,$2)',[w,a.id]);
    assert.equal(await one('select public.faturar_atendimento_servico($1,$2)',[w,a.id]),conta);
    await c.login(c.ids.stranger);await assert.rejects(()=>get(),e=>e.code==='42501');
    if(nome==='eletro'){
      await c.login(c.ids.staff); const restrito=await get();
      assert.ok(restrito.itens.every(i=>!('custo_centavos' in i)));
      assert.equal(restrito.qualidade.length,0);
      await assert.rejects(()=>one('select public.reabrir_atendimento_servico($1,$2,$3,$4)',[w,a.id,d.atendimento.revisao,'Sem permissão']),e=>e.code==='42501');
    }
    console.log(`PASS ${nome}: edição concluída, entrega, reabertura, estoque, reconclusão, histórico, fatura única e isolamento`);
  }
} finally {await c?.db.close();}
