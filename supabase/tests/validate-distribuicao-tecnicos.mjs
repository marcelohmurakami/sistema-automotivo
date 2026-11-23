import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {criarCenarioSubsistemas} from './subsistemas-fixture.mjs';
process.env.DB_VALIDATION_MIGRATION_LIMIT ||= '20261028000100';
process.env.DB_VALIDATION_RUNTIME ||= resolve('node_modules/@electric-sql/pglite/dist/index.js');
const {db,login,ids,registros}=await criarCenarioSubsistemas();
const call=async(n,a)=>Object.values((await db.query(`select public.${n}(${a.map((_,i)=>'$'+(i+1)).join(',')})`,a)).rows[0])[0];
const resultado=[];
try {
 for(const [perfil,r] of Object.entries(registros)){
  await login(ids[perfil]);const checks=[];const auto=!!r.proposta;
  const nomes=['Equipe próxima','Equipe distante','Equipe sem habilidade'];const equipes=[];
  for(const [n,nome] of nomes.entries()){
   const recurso=auto?null:uuid();if(!auto)await call('salvar_recurso_agenda',[r.w,recurso,nome,true]);
   const p={id:uuid(),nome,recurso_id:recurso,funcionario_id:null,ativo:true,habilidades:n===2?['outra habilidade']:['Diagnóstico','Manutenção'],ferramentas:['Ferramenta QA'],regioes:['Centro'],base_endereco:'Base QA, São Paulo, SP',base_ponto:n===1?[-46.8,-23.7]:[-46.65,-23.56],jornada:[{dia:2,inicio:'08:00',fim:'12:00'},{dia:2,inicio:'13:00',fim:'18:00'}],bloqueios:[]};
   await call('salvar_perfil_distribuicao',[r.w,p.id,p,null]);equipes.push(p);
  }
  const [perto,longe,sem]=equipes;
  const base={id:uuid(),cliente_id:r.cliente,identificacao:'Objeto QA',veiculo_id:null,servico:'Distribuição QA',atendimento_id:auto?null:r.atendimento,recurso_id:perto.recurso_id,recurso:perto.nome,inicio:'2026-11-10T10:00:00-03:00',fim:'2026-11-10T11:00:00-03:00',situacao:'agendado',visita:true,deslocamento_minutos:20,logistica:{origem:'Base QA, São Paulo, SP',destino:'Cliente QA, São Paulo, SP',origem_ponto:perto.base_ponto,destino_ponto:[-46.64,-23.55],margem_minutos:10,retorno_minutos:15},distribuicao:{habilidades:['diagnóstico'],ferramentas:['ferramenta qa'],regiao:'CENTRO',materiais:[]}};
  const sugerir=d=>call('sugerir_tecnico_agenda',[r.w,d]);
  let s=await sugerir(base);assert.equal(s.candidatos[0].id,perto.id);assert.equal(s.candidatos[0].apto,true);assert(s.candidatos[0].distancia_km<s.candidatos[1].distancia_km);assert.equal(s.candidatos.find(x=>x.id===sem.id).apto,false);checks.push('habilidade, acentos e proximidade');
  const edit=async(p,delta)=>{const conf=await call('consultar_distribuicao_agenda',[r.w]);const atual=conf.perfis.find(x=>x.id===p.id);await call('salvar_perfil_distribuicao',[r.w,p.id,{...atual,...delta},atual.revisao]);};
  await edit(perto,{ativo:false});s=await sugerir(base);assert.equal(s.candidatos[0].id,longe.id);await edit(perto,{ativo:true});checks.push('perfil inativo excluído');
  s=await sugerir({...base,distribuicao:{...base.distribuicao,ferramentas:['Ferramenta inexistente']}});assert(s.candidatos.every(x=>!x.apto));checks.push('ferramentas exigidas');
  s=await sugerir({...base,distribuicao:{...base.distribuicao,regiao:'outro bairro'}});assert(s.candidatos.every(x=>!x.apto));checks.push('região de atendimento');
  s=await sugerir({...base,distribuicao:{...base.distribuicao,habilidades:['DIAGNÓSTICO','MANUTENÇÃO']}});assert(s.candidatos.find(x=>x.id===perto.id).apto);checks.push('habilidades com acentos em maiúsculas');
  for(const [inicio,fim] of [['2026-11-10T08:10:00-03:00','2026-11-10T09:00:00-03:00'],['2026-11-10T11:00:00-03:00','2026-11-10T12:00:00-03:00'],['2026-11-10T12:30:00-03:00','2026-11-10T13:30:00-03:00'],['2026-11-11T10:00:00-03:00','2026-11-11T11:00:00-03:00']]){s=await sugerir({...base,inicio,fim});assert(s.candidatos.every(x=>!x.apto));}checks.push('jornada, pausa, dia e retorno');
  await edit(perto,{bloqueios:[{inicio:'2026-11-10T09:00:00-03:00',fim:'2026-11-10T11:00:00-03:00',motivo:'Treinamento'}]});s=await sugerir(base);assert.equal(s.candidatos[0].id,longe.id);await edit(perto,{bloqueios:[]});checks.push('indisponibilidade da equipe');
  await edit(perto,{funcionario_id:r.funcionario});await db.exec('reset role');const ferias=uuid();await db.query("insert into public.registros_funcionario(id,oficina_id,funcionario_id,tipo,inicio,fim,descricao,situacao,criado_por) values($1,$2,$3,'ferias','2026-11-10','2026-11-12','QA','pendente',$4)",[ferias,r.w,r.funcionario,ids[perfil]]);await login(ids[perfil]);s=await sugerir(base);assert.equal(s.candidatos[0].id,longe.id);await db.exec('reset role');await db.query("update public.registros_funcionario set situacao='cancelado' where id=$1",[ferias]);await login(ids[perfil]);checks.push('férias e vínculo ao funcionário');
  const materiais=[{produto_id:r.produto,quantidade:999999}];s=await sugerir({...base,distribuicao:{...base.distribuicao,materiais}});assert(s.candidatos.every(x=>!x.apto));assert(s.materiais_faltantes.length);checks.push('estoque insuficiente');
  s=await sugerir({...base,distribuicao:{...base.distribuicao,materiais:[{produto_id:r.produto,quantidade:1}]}});assert(s.candidatos[0].apto);checks.push('estoque suficiente');
  await assert.rejects(()=>sugerir({...base,distribuicao:{...base.distribuicao,materiais:[{produto_id:registros[perfil==='mecanica'?'retifica':'mecanica'].produto,quantidade:1}]}}),e=>e.code==='22023');checks.push('material de outra empresa recusado');
  const save=(d,rev)=>auto?call('operar_produtividade',[r.w,'salvar_agenda',{...d,revisao:rev}]):call('salvar_agenda_servico',[r.w,d.id,d,rev??null]);
  const escolhido={...base,distribuicao:{...base.distribuicao,perfil_id:perto.id}};
  await save(escolhido);checks.push('salvamento da equipe selecionada');
  await db.exec('reset role');const tabela=auto?'agenda_atendimentos':'agenda_servicos';const row=(await db.query(`select * from public.${tabela} where id=$1`,[base.id])).rows[0];assert.equal(row.distribuicao.escolha.id,perto.id);assert(row.distribuicao.verificado_em);assert.deepEqual(row.logistica.destino_ponto,base.logistica.destino_ponto);await login(ids[perfil]);checks.push('registro dos critérios e coordenadas');
  s=await sugerir({...base,id:uuid()});assert.equal(s.candidatos[0].id,longe.id);checks.push('conflito de horário');
  await assert.rejects(()=>save({...escolhido,id:uuid()}),e=>['23P01','22023'].includes(e.code));checks.push('nova disputa pelo horário recusada');
  s=await sugerir(escolhido);assert(s.candidatos.find(x=>x.id===perto.id).apto);checks.push('edição não conflita consigo mesma');
  const cancel={...escolhido,situacao:'cancelado'};if(auto)await call('operar_produtividade',[r.w,'cancelar_agenda',{id:base.id,revisao:row.revisao}]);else await save(cancel,row.revisao);
  s=await sugerir({...base,id:uuid()});assert.equal(s.candidatos[0].id,perto.id);checks.push('cancelamento libera disponibilidade');
  await edit(perto,{habilidades:['Outra']});await assert.rejects(()=>save({...escolhido,id:uuid()}),e=>e.code==='22023');await edit(perto,{habilidades:perto.habilidades});checks.push('habilidade alterada após sugerir');
  await assert.rejects(()=>save({...escolhido,id:uuid(),recurso_id:longe.recurso_id,recurso:longe.nome}),e=>e.code==='22023');checks.push('troca de equipe detectada');
  const presencial={...base,visita:false,deslocamento_minutos:0,logistica:{},distribuicao:{...base.distribuicao,regiao:''}};
  s=await sugerir(presencial);assert(s.candidatos.find(x=>x.id===perto.id).apto);checks.push('atendimento interno não exige região de visita');
  const previa={...base,id:uuid(),inicio:'2026-11-10T08:30:00-03:00',fim:'2026-11-10T09:00:00-03:00',recurso:longe.nome,recurso_id:longe.recurso_id,deslocamento_minutos:0,logistica:{...base.logistica,origem:'Base distante QA',origem_ponto:longe.base_ponto,destino:'Visita anterior QA',margem_minutos:0,retorno_minutos:0},distribuicao:{}};
  await save(previa);
  s=await sugerir({...base,atendimento_id:null});assert.equal(s.candidatos[0].id,longe.id);assert.equal(s.candidatos[0].distancia_km,0);assert.equal(s.candidatos[0].origem,'Visita anterior QA');checks.push('local da visita anterior sem retorno');
  s=await sugerir({...base,distribuicao:{...base.distribuicao,materiais:[{produto_id:r.produto,quantidade:1}]}});assert.equal(s.candidatos[0].id,perto.id);assert(s.candidatos.find(x=>x.id===longe.id).avisos.some(x=>x.includes('materiais na base')));checks.push('materiais exigem saída da base');
  s=await sugerir(presencial);assert.equal(s.candidatos[0].id,perto.id);assert.equal(s.candidatos.find(x=>x.id===longe.id).carga_minutos,30);checks.push('desempate por menor carga de trabalho');
  await db.exec('reset role');let prevRow=(await db.query(`select revisao from public.${tabela} where id=$1`,[previa.id])).rows[0];await login(ids[perfil]);
  await save({...previa,logistica:{...previa.logistica,retorno_minutos:10}},prevRow.revisao);
  s=await sugerir({...base,atendimento_id:null});assert.equal(s.candidatos.find(x=>x.id===longe.id).origem,'Base distante QA');assert(s.candidatos.find(x=>x.id===longe.id).distancia_km>10);checks.push('local após retorno da visita anterior');
  await db.exec('reset role');const saldo=(await db.query('select saldo from public.estoque_produtos where oficina_id=$1 and item_catalogo_id=$2',[r.w,r.produto])).rows[0].saldo;await login(ids[perfil]);let estoqueQa=await call('consultar_produto_estoque',[r.w,r.produto]);await call('movimentar_estoque',[r.w,r.produto,'ajuste',0,'Simular consumo do material',uuid(),estoqueQa.revisao]);
  await assert.rejects(()=>save({...escolhido,id:uuid(),distribuicao:{...escolhido.distribuicao,materiais:[{produto_id:r.produto,quantidade:1}]}}),e=>e.code==='22023');if(!auto){s=await sugerir(base);assert(s.candidatos.every(x=>!x.apto));}
  estoqueQa=await call('consultar_produto_estoque',[r.w,r.produto]);await call('movimentar_estoque',[r.w,r.produto,'ajuste',saldo,'Restaurar saldo do cenário',uuid(),estoqueQa.revisao]);await db.exec('reset role');await db.query("update public.membros_oficina set perfil='staff' where oficina_id=$1 and usuario_id=$2",[r.w,ids[perfil]]);await login(ids[perfil]);checks.push('estoque alterado após sugerir e materiais vinculados');
  await call('consultar_distribuicao_agenda',[r.w]);await sugerir(base);await assert.rejects(()=>call('salvar_perfil_distribuicao',[r.w,perto.id,perto,null]),e=>e.code==='42501');await db.exec('reset role');await db.query("update public.membros_oficina set perfil='owner' where oficina_id=$1 and usuario_id=$2",[r.w,ids[perfil]]);await login(ids[perfil]);checks.push('equipe consulta, gerência configura');
  await edit(perto,{base_ponto:null});s=await sugerir(base);assert.equal(s.candidatos[0].id,longe.id);assert.equal(s.candidatos.find(x=>x.id===perto.id).distancia_km,null);checks.push('ausência de localização declarada');
  await assert.rejects(()=>sugerir({...base,distribuicao:{habilidades:[]}}),e=>e.code==='22023');await assert.rejects(()=>sugerir({...base,fim:null}),e=>e.code==='22023');checks.push('dados obrigatórios validados');
  await assert.rejects(()=>edit(perto,{base_ponto:[200,0]}),e=>e.code==='22023');await assert.rejects(()=>edit(perto,{jornada:[{dia:2,inicio:'18:00',fim:'08:00'}]}),e=>e.code==='22023');checks.push('configuração inválida recusada');
  await assert.rejects(()=>call('salvar_perfil_distribuicao',[r.w,perto.id,perto,1]),e=>e.code==='PT409');checks.push('revisão antiga recusada');
  const outra=registros[perfil==='mecanica'?'retifica':'mecanica'];await assert.rejects(()=>call('sugerir_tecnico_agenda',[outra.w,base]),e=>e.code==='42501');checks.push('isolamento entre empresas');
  resultado.push({perfil,passou:true,checks});console.log('PASS',perfil,checks.length);
 }
 await login(ids.stranger);await assert.rejects(()=>call('consultar_distribuicao_agenda',[registros.mecanica.w]),e=>e.code==='42501');
 await login('','anon');await assert.rejects(()=>call('sugerir_tecnico_agenda',[registros.mecanica.w,{}]),e=>e.code==='42501');
 await db.exec('reset role');for(const papel of ['anon','authenticated']){const t=(await db.query("select has_table_privilege($1,'public.perfis_distribuicao','select,insert,update,delete') ok",[papel])).rows[0];assert.equal(t.ok,false);}assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.perfis_distribuicao'::regclass")).rows[0].relrowsecurity,true);
 await mkdir('output/distribuicao-tecnicos-20261028',{recursive:true});await writeFile('output/distribuicao-tecnicos-20261028/banco.json',JSON.stringify({data:new Date().toISOString(),subsetores:resultado.length,verificacoes:resultado.reduce((s,x)=>s+x.checks.length,0),controle_acesso:true,resultado},null,2));console.log('Distribuição validada nos',resultado.length,'subsetores');
}finally{await db.close();}
