import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {criarCenarioSubsistemas} from './subsistemas-fixture.mjs';
process.env.DB_VALIDATION_MIGRATION_LIMIT ||= '20261028000200';
process.env.DB_VALIDATION_RUNTIME ||= resolve('node_modules/@electric-sql/pglite/dist/index.js');
const {db,login,ids,registros}=await criarCenarioSubsistemas();
const call=async(n,a)=>Object.values((await db.query(`select public.${n}(${a.map((_,i)=>'$'+(i+1)).join(',')})`,a)).rows[0])[0];
const resultados=[];
try {
 for(const [perfil,r] of Object.entries(registros)) {
  await login(ids[perfil]);const checks=[],auto=!!r.proposta,tabela=auto?'agenda_atendimentos':'agenda_servicos';
  const equipeA=auto?'Técnico A':uuid(),equipeB=auto?'Técnico B':uuid(),equipeC=auto?'Técnico C':uuid();
  if(!auto)for(const [i,id]of[equipeA,equipeB,equipeC].entries())await call('salvar_recurso_agenda',[r.w,id,`Equipe QA ${i}`,true]);
  const ativos=[];
  for(const [nome,tipo,movel] of [['Box A','box',false],['Box B','box',false],['Equipamento móvel','equipamento',true],['Equipamento fixo','equipamento',false]]) {
   const a={id:uuid(),nome,tipo,movel,ativo:true,bloqueios:[]};await call('salvar_ativo_agenda',[r.w,a.id,a,null]);ativos.push(a);
  }
  const [box,boxB,movel,fixo]=ativos;
  const conf=()=>call('consultar_recursos_reserva',[r.w,null]);
  const dispo=d=>call('consultar_recursos_reserva',[r.w,d]);
  const editar=async(a,delta)=>{const atual=(await conf()).find(x=>x.id===a.id);return call('salvar_ativo_agenda',[r.w,a.id,{...atual,...delta},atual.revisao]);};
  assert.equal((await conf()).filter(x=>ativos.some(a=>a.id===x.id)).length,4);checks.push('cadastro e listagem de boxes e equipamentos');
  const base={id:uuid(),cliente_id:r.cliente,identificacao:'Objeto QA',veiculo_id:null,servico:'Reserva de recursos QA',atendimento_id:auto?null:r.atendimento,recurso_id:equipeA,recurso:equipeA,inicio:'2030-11-12T10:00:00-03:00',fim:'2030-11-12T11:00:00-03:00',situacao:'agendado',visita:false,deslocamento_minutos:0,logistica:{},distribuicao:{},recursos_reservados:[box.id,movel.id,fixo.id]};
  const save=(d,rev)=>auto?call('operar_produtividade',[r.w,'salvar_agenda',{...d,revisao:rev}]):call('salvar_agenda_servico',[r.w,d.id,d,rev??null]);
  const raw=async(sql,args=[])=>{await db.exec('reset role');const result=await db.query(sql,args);await login(ids[perfil]);return result.rows;};
  const row=async id=>(await raw(`select * from public.${tabela} where id=$1`,[id]))[0];
  const cancelar=async d=>{const x=await row(d.id);if(auto)await call('operar_produtividade',[r.w,'cancelar_agenda',{id:d.id,revisao:x.revisao}]);else await save({...x,situacao:'cancelado'},x.revisao);};
  const outro=(delta={})=>({...base,id:uuid(),recurso:equipeB,recurso_id:equipeB,...delta});
  const falha=d=>assert.rejects(()=>save(d),e=>['23P01','22023'].includes(e.code));
  const saldo=(await raw('select saldo from public.estoque_produtos where oficina_id=$1 and item_catalogo_id=$2',[r.w,r.produto]))[0].saldo;
  const documentos=await raw(auto?'select total_centavos from public.ordens_servico where oficina_id=$1':'select valor_centavos from public.atendimentos_servicos where oficina_id=$1',[r.w]);
  assert((await dispo(base)).every(x=>x.disponivel));await save(base);
  let gravado=await row(base.id);assert.equal(gravado.recursos_reservados.length,3);assert.equal(gravado.resumo_recursos.length,3);checks.push('técnico, box e equipamentos salvos juntos');
  await falha(outro({recursos_reservados:[box.id]}));checks.push('mesmo box, outro técnico recusado');
  await falha(outro({recursos_reservados:[boxB.id,movel.id]}));checks.push('mesmo equipamento, outro box recusado');
  await falha(outro({recurso:equipeA,recurso_id:equipeA,recursos_reservados:[boxB.id]}));checks.push('mesmo técnico, outros recursos recusado');
  if(auto)await falha(outro({recurso:'  TÉCNICO A  ',recursos_reservados:[]}));checks.push('identidade do responsável preservada');
  assert((await dispo(base)).every(x=>x.disponivel));checks.push('edição não conflita consigo mesma');
  assert(!(await dispo(outro())).find(x=>x.id===box.id).disponivel);checks.push('consulta antecipada informa indisponibilidade');
  const fronteira=outro({inicio:'2030-11-12T11:00:00-03:00',fim:'2030-11-12T12:00:00-03:00'});await save(fronteira);await cancelar(fronteira);checks.push('horários consecutivos permitidos');
  await assert.rejects(()=>editar(box,{ativo:false}),e=>e.code==='22023');await assert.rejects(()=>editar(movel,{movel:false}),e=>e.code==='22023');checks.push('configuração não invalida reserva futura');
  await assert.rejects(()=>editar(box,{bloqueios:[{inicio:base.inicio,fim:base.fim,motivo:'Manutenção'}]}),e=>e.code==='23P01');checks.push('bloqueio sobre reserva existente recusado');
  // A falha de um dos recursos não pode deixar o outro ocupado.
  assert((await dispo(outro())).find(x=>x.id===boxB.id).disponivel);checks.push('falha não deixa reserva parcial');
  const semCampo={...base};delete semCampo.recursos_reservados;await save(semCampo,gravado.revisao);gravado=await row(base.id);assert.equal(gravado.recursos_reservados.length,3);checks.push('clientes antigos preservam recursos omitidos');
  await assert.rejects(()=>save({...base,recursos_reservados:[]},1),e=>e.code==='PT409');checks.push('edição antiga recusada');
  await save({...base,recursos_reservados:[boxB.id]},gravado.revisao);gravado=await row(base.id);
  assert((await dispo(outro())).find(x=>x.id===box.id).disponivel);assert(!(await dispo(outro())).find(x=>x.id===boxB.id).disponivel);checks.push('troca libera antigos e reserva novos');
  await cancelar({...base,recursos_reservados:[boxB.id]});assert((await dispo(outro())).every(x=>x.disponivel));checks.push('cancelamento libera todos os recursos');
  await editar(box,{bloqueios:[{inicio:base.inicio,fim:base.fim,motivo:'Manutenção'}]});await falha(outro({recursos_reservados:[box.id]}));await editar(box,{bloqueios:[]});checks.push('manutenção impede reserva');
  await editar(box,{ativo:false});await falha(outro({recursos_reservados:[box.id]}));await editar(box,{ativo:true});checks.push('recurso inativo recusado');
  await falha(outro({recursos_reservados:[box.id,box.id]}));await falha(outro({recursos_reservados:['inválido']}));await falha(outro({recursos_reservados:Array.from({length:21},uuid)}));checks.push('duplicatas, identificadores e limites validados');
  await falha(outro({fim:null}));checks.push('fim obrigatório apenas com reserva física');
  const visita=outro({visita:true,deslocamento_minutos:30,logistica:{margem_minutos:10,retorno_minutos:20},recursos_reservados:[movel.id,fixo.id]});await save(visita);
  const antes=outro({recurso:equipeC,recurso_id:equipeC,inicio:'2030-11-12T09:20:00-03:00',fim:'2030-11-12T09:50:00-03:00',recursos_reservados:[movel.id]});await falha(antes);
  const depois=outro({recurso:equipeC,recurso_id:equipeC,inicio:'2030-11-12T11:05:00-03:00',fim:'2030-11-12T11:15:00-03:00',recursos_reservados:[movel.id]});await falha(depois);checks.push('equipamento móvel ocupado durante ida, margem e volta');
  const antesFixo={...antes,id:uuid(),recursos_reservados:[fixo.id]};await save(antesFixo);await cancelar(antesFixo);checks.push('equipamento fixo livre fora do serviço');
  const estado=(await dispo({...visita,id:uuid()})).find(x=>x.id===movel.id);assert.equal(Date.parse(estado.inicio),Date.parse(base.inicio)-40*60000);assert.equal(Date.parse(estado.fim),Date.parse(base.fim)+20*60000);checks.push('intervalo ocupado informado corretamente');
  if(!auto){
   const serie=outro({recurso:equipeC,recurso_id:equipeC,inicio:'2030-11-11T10:00:00-03:00',fim:'2030-11-11T11:00:00-03:00',recursos_reservados:[movel.id]});
   const antesCount=(await raw(`select count(*) n from public.${tabela} where oficina_id=$1`,[r.w]))[0].n;
   await assert.rejects(()=>call('agendar_serie_servico',[r.w,uuid(),serie,2,1]),e=>e.code==='23P01');
   assert.equal((await raw(`select count(*) n from public.${tabela} where oficina_id=$1`,[r.w]))[0].n,antesCount);
  }
  checks.push(auto?'fluxo automotivo validado':'série com conflito não salva visitas parciais');
  await cancelar(visita);
  if(!auto){const concluido=outro({recursos_reservados:[box.id]});await save(concluido);const cr=await row(concluido.id);await save({...concluido,situacao:'concluido'},cr.revisao);assert((await dispo(outro())).find(x=>x.id===box.id).disponivel);const ocupacao=outro({recursos_reservados:[box.id]});await save(ocupacao);await assert.rejects(()=>save({...concluido,situacao:'agendado'},cr.revisao+1),e=>e.code==='23P01');await cancelar(ocupacao);}
  checks.push(auto?'cancelamento automotivo validado':'conclusão libera; reabertura valida conflitos');
  const perfilTecnico=uuid();await call('salvar_perfil_distribuicao',[r.w,perfilTecnico,{nome:'Técnico A',recurso_id:auto?null:equipeA,ativo:true,habilidades:['Reparo QA'],ferramentas:[],regioes:[],jornada:[0,1,2,3,4,5,6].map(dia=>({dia,inicio:'08:00',fim:'18:00'})),bloqueios:[]},null]);
  const automatico={...base,id:uuid(),distribuicao:{perfil_id:perfilTecnico,habilidades:['Reparo QA'],ferramentas:[],regiao:'',materiais:[]}};
  const sugestao=await call('sugerir_tecnico_agenda',[r.w,automatico]);assert(sugestao.candidatos.find(x=>x.id===perfilTecnico).apto);await save(automatico);const ar=await row(automatico.id);assert.equal(ar.distribuicao.escolha.id,perfilTecnico);assert.equal(ar.recursos_reservados.length,3);await cancelar(automatico);checks.push('distribuição automática e reserva física no mesmo salvamento');
  if(perfil.startsWith('limpeza_')){
   const impedimento=outro({recursos_reservados:[movel.id]});await save(impedimento);
   const modelo=(await raw('select * from public.atendimentos_servicos where id=$1',[r.atendimento]))[0];
   const qtdAntes=(await raw('select count(*) n from public.atendimentos_servicos where oficina_id=$1',[r.w]))[0].n;
   const repeticao={...base,inicio:'2030-11-11T10:00:00-03:00',fim:'2030-11-11T11:00:00-03:00',recursos_reservados:[movel.id],nova_situacao:'orcamento'};
   await assert.rejects(()=>call('programar_visitas_limpeza',[r.w,uuid(),repeticao,2,1,modelo.revisao]),e=>e.code==='23P01');
   assert.equal((await raw('select count(*) n from public.atendimentos_servicos where oficina_id=$1',[r.w]))[0].n,qtdAntes);await cancelar(impedimento);
   checks.push('visitas independentes da limpeza revertidas em caso de conflito');
  }
  const outra=registros[perfil==='mecanica'?'retifica':'mecanica'];await assert.rejects(()=>call('consultar_recursos_reserva',[outra.w,null]),e=>e.code==='42501');
  const externo=uuid();await raw("insert into public.ativos_agenda(id,oficina_id,nome,tipo) values($1,$2,'Externo '||($1::uuid)::text,'box')",[externo,outra.w]);await falha(outro({recursos_reservados:[externo]}));await assert.rejects(()=>call('salvar_ativo_agenda',[r.w,externo,box,1]),e=>e.code==='42501');checks.push('isolamento entre empresas na leitura, seleção e edição');
  await raw("update public.membros_oficina set perfil='staff' where oficina_id=$1 and usuario_id=$2",[r.w,ids[perfil]]);await conf();await dispo(base);await assert.rejects(()=>editar(box,{nome:'Tentativa'}),e=>e.code==='42501');await raw("update public.membros_oficina set perfil='owner' where oficina_id=$1 and usuario_id=$2",[r.w,ids[perfil]]);checks.push('equipe consulta, gerência configura');
  assert.equal((await raw('select saldo from public.estoque_produtos where oficina_id=$1 and item_catalogo_id=$2',[r.w,r.produto]))[0].saldo,saldo);
  assert.deepEqual(await raw(auto?'select total_centavos from public.ordens_servico where oficina_id=$1':'select valor_centavos from public.atendimentos_servicos where oficina_id=$1',[r.w]),documentos);checks.push('documentos e estoque preservados');
  resultados.push({perfil,checks,passou:true});console.log('PASS',perfil,checks.length);
 }
 await login('','anon');await assert.rejects(()=>call('consultar_recursos_reserva',[registros.mecanica.w,null]),e=>e.code==='42501');
 await db.exec('reset role');for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_table_privilege($1,'public.ativos_agenda','select,insert,update,delete') ok",[role])).rows[0].ok,false);
 await mkdir('output/reserva-recursos-20261028',{recursive:true});await writeFile('output/reserva-recursos-20261028/banco.json',JSON.stringify({data:new Date().toISOString(),subsetores:resultados.length,verificacoes:resultados.reduce((s,x)=>s+x.checks.length,0),controle_acesso:true,resultados},null,2));
 console.log('CONCLUÍDO',resultados.length,'subsetores');
} finally {await db.close();}


