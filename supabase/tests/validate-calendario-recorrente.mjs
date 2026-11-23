import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {criarCenarioSubsistemas} from './subsistemas-fixture.mjs';
process.env.DB_VALIDATION_MIGRATION_LIMIT ||= '20261028000300';
process.env.DB_VALIDATION_RUNTIME ||= resolve('node_modules/@electric-sql/pglite/dist/index.js');
const {db,login,ids,registros}=await criarCenarioSubsistemas();
const call=async(n,a)=>Object.values((await db.query(`select public.${n}(${a.map((_,i)=>'$'+(i+1)).join(',')})`,a)).rows[0])[0];
const resultados=[];
try{
for(const [perfil,r]of Object.entries(registros)){
 await login(ids[perfil]);const checks=[];const auto=!!r.proposta,eq=auto?'QA Recorrência':uuid();if(!auto)await call('salvar_recurso_agenda',[r.w,eq,'Equipe recorrente',true]);
 const d={cliente_id:r.cliente,identificacao:'Objeto QA',veiculo_id:null,servico:'Recorrência QA',atendimento_id:auto?null:r.atendimento,recurso_id:eq,recurso:eq,inicio:'2030-01-31T10:00:00-03:00',fim:'2030-01-31T11:00:00-03:00',situacao:'agendado',visita:false,recursos_reservados:[],regra_calendario:{frequencia:'mensal',intervalo:1,feriado:'manter',dias_fechados:[]}};
 const prever=(x=d,n=3)=>call('prever_visitas_calendario',[r.w,x,n]);
 let ds=await prever();assert.deepEqual(ds.map(x=>x.data),['2030-01-31','2030-02-28','2030-03-31']);checks.push('mensal preserva dia e ajusta mês curto');
 ds=await prever({...d,inicio:'2032-01-31T10:00:00-03:00',fim:'2032-01-31T11:00:00-03:00'});assert.equal(ds[1].data,'2032-02-29');checks.push('ano bissexto');
 await call('salvar_calendario_operacao',[r.w,[{data:'2030-02-28',nome:'Fechamento QA',anual:false}],0]);
 ds=await prever({...d,regra_calendario:{...d.regra_calendario,feriado:'proximo',dias_fechados:[0,6]}});assert.equal(ds[1].data,'2030-03-01');assert.equal(ds[2].data,'2030-04-01');checks.push('feriados e fins de semana movem para dia útil');
 ds=await prever({...d,regra_calendario:{...d.regra_calendario,feriado:'pular'}});assert.equal(ds[1].data,null);checks.push('feriado excluído aparece na prévia');
 ds=await prever({...d,regra_calendario:{...d.regra_calendario,excecoes:{'2030-02-28':{acao:'mover',data:'2030-03-05'},'2030-03-31':{acao:'pular'}}}});assert.equal(ds[1].data,'2030-03-05');assert.equal(ds[2].data,null);checks.push('exceção remarca ou exclui somente a ocorrência');
 await assert.rejects(()=>prever({...d,regra_calendario:{...d.regra_calendario,excecoes:{'2030-02-28':{acao:'mover',data:'2030-01-31'}}}}),e=>e.code==='22023');checks.push('datas duplicadas recusadas');
 ds=await prever({...d,regra_calendario:{frequencia:'semanal',intervalo:1,dias_semana:[1,3],dias_fechados:[],feriado:'manter'}});assert.deepEqual(ds.map(x=>x.data),['2030-02-04','2030-02-06','2030-02-11']);checks.push('semanal com múltiplos dias');
 ds=await prever({...d,regra_calendario:{...d.regra_calendario,mensal:'semana'}});assert.deepEqual(ds.map(x=>x.data),['2030-01-31','2030-02-28','2030-03-28']);checks.push('quinta ocorrência usa última quando o mês é menor');
 ds=await prever({...d,inicio:'2030-02-04T10:00:00-03:00',fim:'2030-02-04T11:00:00-03:00',regra_calendario:{frequencia:'semanal',intervalo:2,dias_semana:[1,3],dias_fechados:[],feriado:'manter'}},4);assert.deepEqual(ds.map(x=>x.data),['2030-02-04','2030-02-06','2030-02-18','2030-02-20']);checks.push('quinzenal mantém semana do calendário');
 if(perfil.startsWith('limpeza_')){const det=await call('consultar_detalhes_atendimento',[r.w,r.atendimento]),key=uuid(),ag={...d,inicio:'2031-01-31T10:00:00-03:00',fim:'2031-01-31T11:00:00-03:00',nova_situacao:'aprovado'};const vs=await call('programar_visitas_limpeza',[r.w,key,ag,3,7,det.atendimento.revisao]);assert.equal(vs.length,3);assert.ok((await call('listar_series_calendario',[r.w,0])).some(x=>x.id===key&&x.proxima));assert.equal(await call('cancelar_serie_calendario',[r.w,key,'2031-02-01']),2);checks.push('limpeza independente participa do calendário e cancelamento');}
 const chave=uuid();ds=await call('programar_agenda_calendario',[r.w,chave,d,3]);assert.equal(ds.filter(x=>x.id).length,3);assert.deepEqual(await call('programar_agenda_calendario',[r.w,chave,d,3]),ds);checks.push('programação atômica e idempotente');
 await assert.rejects(()=>call('programar_agenda_calendario',[r.w,chave,{...d,servico:'Alterado'},3]),e=>e.code==='PT409');checks.push('mesma chave não reescreve programação');
 await assert.rejects(()=>call('programar_agenda_calendario',[r.w,uuid(),d,3]),e=>e.code==='23P01');checks.push('conflito na série não salva ocorrências parciais');
 assert.equal(await call('cancelar_serie_calendario',[r.w,chave,'2030-02-01']),2);assert.equal(await call('cancelar_serie_calendario',[r.w,chave,'2030-02-01']),0);checks.push('cancelamento futuro preserva primeira ocorrência e é repetível');
 const outra=registros[perfil==='mecanica'?'retifica':'mecanica'];await assert.rejects(()=>call('consultar_calendario_operacao',[outra.w]),e=>e.code==='42501');checks.push('isolamento entre empresas');
 resultados.push({perfil,checks});console.log('PASS',perfil,checks.length);
}
await login('','anon');await assert.rejects(()=>call('consultar_calendario_operacao',[registros.mecanica.w]),e=>e.code==='42501');
await mkdir('output/operacao-completa-20261028',{recursive:true});await writeFile('output/operacao-completa-20261028/calendario.json',JSON.stringify({subsetores:resultados.length,verificacoes:resultados.reduce((n,r)=>n+r.checks.length,0),resultados},null,2));
}finally{await db.close();}
