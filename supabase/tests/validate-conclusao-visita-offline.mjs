import assert from 'node:assert/strict';
import { randomUUID as uuid, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { criarCenarioSubsistemas } from './subsistemas-fixture.mjs';
process.env.DB_VALIDATION_MIGRATION_LIMIT ||= '20261028000700';
process.env.DB_VALIDATION_RUNTIME ||= resolve('node_modules/@electric-sql/pglite/dist/index.js');
const {db,login,ids,registros}=await criarCenarioSubsistemas();
const call=async(n,a)=>Object.values((await db.query(`select public.${n}(${a.map((_,i)=>'$'+(i+1)).join(',')})`,a)).rows[0])[0];
const resultados=[];
try {
 for(const [perfil,r] of Object.entries(registros)){
  await login(ids[perfil]);const auto=!!r.proposta,checks=[];let documento=r.atendimento;
  if(auto){const q=await call('emitir_orcamento',[r.w,r.proposta.id,r.proposta.revisao,7,randomBytes(32).toString('hex')]);await call('aprovar_orcamento_interno',[r.w,q.id,q.revisao,q.versao.id]);documento=await call('converter_orcamento_em_os',[r.w,q.id]);}
  const eq=auto?'Equipe conclusão QA':r.recurso;
  const dados={cliente_id:r.cliente,identificacao:'QA conclusão',servico:'QA visita',atendimento_id:auto?null:documento,recurso:eq,recurso_id:eq,inicio:'2026-11-24T10:00:00-03:00',fim:'2026-11-24T11:00:00-03:00',situacao:'agendado',regra_calendario:{frequencia:'diaria',intervalo:1,dias_fechados:[],feriado:'manter'}};
  const lista=await call('programar_agenda_calendario',[r.w,uuid(),dados,2]);const gid=lista[0].id;
  let b=(await call('preparar_execucao_offline',[r.w,null,null,gid,null])).itens[0];
  const trabalho={situacao:b.situacao,ficha:b.ficha,anotacoes:'QA visita concluída sem encerrar a OS',iniciado_em:new Date(Date.now()-120000).toISOString(),finalizado_em:new Date(Date.now()-60000).toISOString()};
  await assert.rejects(()=>call('sincronizar_execucao_offline',[r.w,uuid(),b,{...trabalho,finalizado_em:'',visita_concluida:true}]),e=>e.code==='22023');checks.push('conclusão exige horários reais');
  assert.equal((await call('preparar_execucao_offline',[r.w,null,null,gid,null])).itens[0].documento_revisao,b.documento_revisao);checks.push('erro desfaz alterações da OS');
  b=await call('sincronizar_execucao_offline',[r.w,uuid(),b,trabalho]);assert.equal(b.agenda_situacao,'agendado');checks.push('fim registrado não conclui sem confirmação');
  const chave=uuid(),pedido={...trabalho,visita_concluida:true};const resposta=await call('sincronizar_execucao_offline',[r.w,chave,b,pedido]);assert.equal(resposta.agenda_situacao,'concluido');assert.equal(resposta.situacao,b.situacao);checks.push('conclusão da visita preserva situação da OS');
  assert.deepEqual(await call('sincronizar_execucao_offline',[r.w,chave,b,pedido]),resposta);checks.push('reenvio não duplica conclusão');
  let outra=(await call('preparar_execucao_offline',[r.w,null,null,lista[1].id,null])).itens[0];
  if(auto)await call('operar_produtividade',[r.w,'cancelar_agenda',{id:outra.id,revisao:outra.agenda_revisao}]);
  else await call('salvar_agenda_servico',[r.w,outra.id,{...dados,inicio:lista[1].inicio,fim:lista[1].fim,situacao:'cancelado'},outra.agenda_revisao]);
  await assert.rejects(()=>call('sincronizar_execucao_offline',[r.w,uuid(),outra,pedido]),e=>e.code==='PT409');checks.push('cancelamento remoto exige comparação');
  outra=(await call('preparar_execucao_offline',[r.w,null,null,outra.id,null])).itens[0];
  await assert.rejects(()=>call('sincronizar_execucao_offline',[r.w,uuid(),outra,pedido]),e=>e.code==='22023');checks.push('visita cancelada não é reaberta offline');
  const doc=(await call('preparar_execucao_offline',[r.w,null,null,null,documento])).itens[0];
  await assert.rejects(()=>call('sincronizar_execucao_offline',[r.w,uuid(),doc,{...trabalho,situacao:doc.situacao,ficha:doc.ficha,visita_concluida:true}]),e=>e.code==='22023');checks.push('OS sem visita não aceita conclusão de agenda');
  resultados.push({perfil,checks});console.log('PASS',perfil,checks.length);
 }
 await mkdir('output/bancada-quatro-modulos-20261028',{recursive:true});await writeFile('output/bancada-quatro-modulos-20261028/conclusao-visita-banco.json',JSON.stringify({subsetores:resultados.length,verificacoes:resultados.reduce((n,x)=>n+x.checks.length,0),resultados},null,2));
} finally {await db.close();}
