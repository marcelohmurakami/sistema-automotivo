import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { criarCenarioSubsistemas } from '../supabase/tests/subsistemas-fixture.mjs';
import { compararHistorico, camposHistorico } from '../src/lib/historico.ts';
process.env.DB_VALIDATION_RUNTIME = resolve('node_modules/@electric-sql/pglite/dist/index.js');
process.env.DB_VALIDATION_MIGRATION_LIMIT = '20261109204227';
const resultados = [], output = 'output/historico-detalhado-20261109';
let db;
try {
  const c = await criarCenarioSubsistemas(); db = c.db;
  const call = async (fn, args) => Object.values((await db.query(`select public.${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args)).rows[0])[0];
  for (const [perfil,r] of Object.entries(c.registros)) {
    await c.login(c.ids[perfil]);
    const checks=[];
    const evento = randomUUID();
    await db.exec('reset role');
    await db.query(`insert into public.registros_auditoria(id,oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,metadados,correlacao_id)
      values($1,$2,$3,'user','cliente.editado','cliente',$4,$5,gen_random_uuid())`,[evento,r.w,c.ids[perfil],r.cliente,JSON.stringify({
        antes:{nome:'Nome anterior',senha:'SEGREDO',token:'SEGREDO'},depois:{nome:'Nome atualizado',senha:'SEGREDO'},motivo:'Conferência QA',
        authorization:'SEGREDO',itens:[{descricao:'Peça de teste',quantidade:2,custo_centavos:1250,pin:'SEGREDO'}]
      })]);
    await c.login(c.ids[perfil]);
    const data = new Date().toISOString().slice(0,10);
    const titulo=randomUUID();
    await call('salvar_titulo_financeiro',[r.w,titulo,{natureza:'pagar',descricao:'Aluguel QA',categoria:'aluguel',valor_centavos:150000,competencia:data,vencimento:data}]);
    const financ=await call('consultar_historico_gestao',[r.w,data,data,'financeiro','',0]);
    const registro=financ.itens.find(e=>e.entidade===titulo);assert(registro);
    const financDetalhe=await call('consultar_evento_historico',[r.w,registro.origem,registro.id]);
    assert.equal(financDetalhe.contexto_atual.campos.valor_centavos,150000);
    assert.equal(financDetalhe.contexto_atual.identificacao,'Aluguel QA');
    assert(!('valor_centavos' in financDetalhe.detalhes));checks.push('Conta vinculada com valor atual separado do histórico');
    let lista = await call('consultar_historico_gestao',[r.w,data,data,'cliente','',0]);
    assert(lista.itens.some(e=>e.id===evento)); checks.push('Evento no módulo correto e período');
    assert(lista.itens.every(e=>!('metadados' in e)&&!('detalhes' in e))); checks.push('Lista leve, sem payload');
    const d = await call('consultar_evento_historico',[r.w,'auditoria',evento]);
    assert.equal(d.detalhes.antes.nome,'Nome anterior'); assert.equal(d.detalhes.depois.nome,'Nome atualizado'); checks.push('Antes e depois preservados');
    assert(!JSON.stringify(d).includes('SEGREDO')); checks.push('Segredos excluídos inclusive nos itens');
    assert(d.autor_nome); checks.push('Responsável identificado sem UUID truncado');
    const fmt = compararHistorico(d.detalhes); assert.equal(fmt.alteracoes[0].antes,'Nome anterior');
    assert(fmt.informacoes.some(x=>x.valor.includes('12,50'))); checks.push('Moeda e alterações formatadas');
    await assert.rejects(call('consultar_evento_historico',[r.w,'auditoria',randomUUID()])); checks.push('Ocorrência inexistente negada');
    const outro=Object.values(c.registros).find(x=>x.w!==r.w);
    await assert.rejects(call('consultar_evento_historico',[outro.w,'auditoria',evento])); checks.push('Outra empresa negada');
    await assert.rejects(call('consultar_historico_gestao',[outro.w,data,data,'','',0])); checks.push('Lista de outra empresa negada');
    const estoque=await call('consultar_historico_gestao',[r.w,data,data,'estoque','',0]);
    assert(estoque.itens.length); const mov=await call('consultar_evento_historico',[r.w,'estoque',estoque.itens[0].id]);
    assert('quantidade' in mov.detalhes && 'saldo_apos' in mov.detalhes); checks.push('Estoque: quantidade, saldo e motivo registrados');
    if(r.atendimento){
      const atend=await call('consultar_historico_gestao',[r.w,data,data,'ordem_servico','',0]);
      assert(atend.itens.some(x=>x.origem==='atendimento')); checks.push('Atendimento não automotivo incluído');
      const e=atend.itens.find(x=>x.origem==='atendimento'); const detalhe=await call('consultar_evento_historico',[r.w,'atendimento',e.id]);
      assert.equal(detalhe.entidade,r.atendimento); assert(detalhe.contexto_atual.cliente); checks.push('Detalhe vinculado ao atendimento certo');
    }
    await c.login('', 'anon'); await assert.rejects(call('consultar_evento_historico',[r.w,'auditoria',evento])); checks.push('Acesso anônimo bloqueado');
    await c.login(c.ids.stranger); await assert.rejects(call('consultar_evento_historico',[r.w,'auditoria',evento])); checks.push('Usuário sem vínculo bloqueado');
    resultados.push({perfil,ok:true,checks}); console.log(perfil,checks.length);
  }
  const r=c.registros.mecanica,u=c.ids.mecanica;
  await c.login(u);
  // Real automotive workflow produces the stage history used by the detail dialog.
  let p=await call('emitir_orcamento',[r.w,r.proposta.id,r.proposta.revisao,7,'a'.repeat(64)]);
  await call('aprovar_orcamento_interno',[r.w,p.id,p.revisao,p.versao.id]);
  const os=await call('converter_orcamento_em_os',[r.w,p.id]);
  const osId=typeof os==='string'?os:os.id;
  const dt=new Date().toISOString().slice(0,10);
  const lista=await call('consultar_historico_gestao',[r.w,dt,dt,'ordem_servico','',0]);
  assert(lista.itens.some(e=>e.origem==='os'));
  for(const e of lista.itens.filter(e=>e.origem==='os')) assert((await call('consultar_evento_historico',[r.w,'os',e.id])).contexto_atual.cliente);
  const id=randomUUID();
  await db.exec('reset role');
  await db.query(`insert into public.historico_ordem_servico(id,oficina_id,ordem_servico_id,tipo_evento,tipo_autor,descricao,metadados) values($1,$2,$3,'board_updated','user','Prazo e etapa alterados',$4)`,[id,r.w,osId,JSON.stringify({old_status:'received',new_status:'in_progress',old_stage_id:null,new_stage_id:null})]);
  await c.login(u);
  const board=await call('consultar_evento_historico',[r.w,'os',id]); assert.equal(compararHistorico(board.detalhes).alteracoes[0].depois,'Em execução');
  await assert.rejects(call('consultar_historico_gestao',[r.w,'2026-01-01','2028-01-01','','',0]));
  await db.exec('reset role');
  // Manager restrictions and staff roles are enforced by the actual access functions.
  await db.query(`update public.membros_oficina set perfil='manager' where oficina_id=$1 and usuario_id=$2`,[r.w,u]);
  await db.query(`insert into public.restricoes_acesso(oficina_id,usuario_id,autor,regras) values($1,$2,$2,'{"financeiro":"nenhum"}')`,[r.w,u]);
  await c.login(u); await assert.rejects(call('consultar_evento_historico',[r.w,'os',id]));
  await db.exec('reset role'); await db.query(`update public.restricoes_acesso set regras='{"estoque":"nenhum"}' where oficina_id=$1 and usuario_id=$2`,[r.w,u]);
  await c.login(u); const oculto=await call('consultar_historico_gestao',[r.w,dt,dt,'estoque','',0]); assert.equal(oculto.total,0);
  await db.exec('reset role'); await db.query(`update public.membros_oficina set perfil='staff' where oficina_id=$1 and usuario_id=$2`,[r.w,u]);
  await c.login(u); await assert.rejects(call('consultar_evento_historico',[r.w,'os',id]));
  assert.deepEqual(camposHistorico({senha:'segredo',url:'https://x'}),[]);
  assert.equal(compararHistorico({antes:{quantidade:1},depois:{quantidade:1}}).alteracoes.length,0);
  resultados.push({perfil:'cenarios_adicionais',ok:true,checks:['Conversão real em OS e detalhe','Mudança de situação automotiva','Período máximo validado','Restrição financeira aplicada','Módulo de estoque restrito oculto','Staff bloqueado','Campos locais sensíveis omitidos','Valores iguais não aparecem como alteração']});
  await writeFile(output+'/banco.json',JSON.stringify({ok:true,resultados},null,2));
} catch(e){await writeFile(output+'/banco.json',JSON.stringify({ok:false,erro:e.message,resultados},null,2));console.error(e);process.exitCode=1;}
finally{await db?.close();}



