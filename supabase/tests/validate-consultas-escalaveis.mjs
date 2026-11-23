import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import { criarCenarioSubsistemas } from './subsistemas-fixture.mjs';
import { resumoOperacao } from '../../src/lib/operacaoServicos.ts';

process.env.DB_VALIDATION_MIGRATION_LIMIT ||= '20261019001100';
const c=await criarCenarioSubsistemas({realista:true});
const rpc=async(fn,...args)=>Object.values((await c.db.query(`select public.${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args)).rows[0])[0];
try {
 for(const [perfil,r] of Object.entries(c.registros)) {
  await c.login(c.ids[perfil]);
  const clientes=await rpc('buscar_cadastros_operacao',r.w,'clientes','');
  assert.ok(clientes.some(x=>x.id===r.cliente),perfil);
  assert.ok((await rpc('buscar_cadastros_operacao',r.w,'catalogo','')).some(x=>x.id===r.produto),perfil);
  if(!r.atendimento)continue;
  const painel=await rpc('pagina_servicos',r.w,{});
  assert.ok(painel.atendimentos.some(x=>x.id===r.atendimento),perfil);
  const resumo=await rpc('resumo_operacao_servicos',r.w,'');
  assert.equal(resumo.abertos,1,perfil);
  const amanha=new Date(Date.parse(r.hoje)+86400000).toISOString().slice(0,10);
  const reserva=randomUUID();
  await rpc('salvar_agenda_servico',r.w,reserva,{atendimento_id:r.atendimento,recurso_id:r.recurso,inicio:r.hoje+'T14:00:00-03:00',fim:r.hoje+'T15:00:00-03:00',situacao:'agendado'});
  const agenda = await rpc('pagina_servicos',r.w,{tela:'agenda',inicio:r.hoje,fim:amanha});
  assert.ok(agenda.recursos.some(x=>x.id===r.recurso),perfil+' recursos da agenda');
  assert.ok(agenda.agenda.some(x=>x.id===reserva),perfil+' reserva visível');
  assert.ok(agenda.atendimentos.some(x=>x.id===r.atendimento),perfil+' identificação da reserva');
  assert.ok(agenda.clientes.some(x=>x.id===r.cliente),perfil+' cliente na reserva');
  const original=painel.atendimentos.find(x=>x.id===r.atendimento);
  await c.db.exec('reset role');
  for(const situacao of ['orcamento','aguardando','concluido','cancelado']) {
   for(const campos of [ {}, {prazo_servico:'2020-01-01',motivo_espera:'Peça / material',proxima_data:'2020-01-02'}, {modalidade:'Domicílio',situacao_aceite:'Aceito',proxima_data:''} ]) {
    const a={...original,situacao,ficha_especialidade:{...original.ficha_especialidade,campos},retorno_agendado:undefined};
    const js=resumoOperacao(a,r.hoje,agenda.agenda);
    const sql=(await c.db.query('select * from private.operacao_servico(jsonb_populate_record(null::public.atendimentos_servicos,$1::jsonb),$2::date)',[a,r.hoje])).rows[0];
    for(const k of ['aberto','espera','atrasados','retirada','retornos','aceite','prazo'])assert.equal(sql[k],js[k],`${perfil} ${situacao} ${k}`);
   }
  }
 }
 const r=c.registros.assistencia_celulares;
 await c.db.exec('reset role');
 await c.db.query(`insert into public.clientes(oficina_id,nome) select $1,'Cliente escala '||lpad(n::text,5,'0') from generate_series(1,120) n`,[r.w]);
 await c.db.query(`insert into public.itens_catalogo(oficina_id,tipo,descricao,unidade,preco_padrao_centavos,favorito) select $1,'service','Serviço escala '||lpad(n::text,5,'0'),'serv',10000,n%3=0 from generate_series(1,80) n`,[r.w]);
 await c.db.query(`insert into public.atendimentos_servicos(id,oficina_id,cliente_id,objeto_id,titulo,situacao,vencimento) select gen_random_uuid(),$1,$2,$3,'Atendimento de escala '||n,'orcamento',current_date from generate_series(1,130) n`,[r.w,r.cliente,r.objeto]);
 await c.login(c.ids.assistencia_celulares);
 assert.equal((await rpc('buscar_cadastros_operacao',r.w,'clientes','')).length,30);
 const ultimo=await rpc('buscar_cadastros_operacao',r.w,'clientes','escala 00120');
 assert.equal(ultimo.length,1);
 assert.equal((await rpc('buscar_cadastros_operacao',r.w,'clientes','',null,ultimo[0].id))[0].id,ultimo[0].id);
 assert.equal((await rpc('pagina_servicos',r.w,{cliente:ultimo[0].id})).atendimentos.length,0,'filtro de cliente não mostra atendimentos alheios');
 const produto=(await rpc('buscar_cadastros_operacao',r.w,'catalogo','',null,r.produto))[0];
 assert.equal((await rpc('buscar_cadastros_operacao',r.w,'catalogo','QA-assistencia_celulares'))[0].id,r.produto,'busca por código de estoque');
 const nfe=await rpc('buscar_itens_nfe',r.w,[{descricao:produto.descricao.toUpperCase(),unidade:produto.unidade},{descricao:'Não cadastrado QA',unidade:'un'}]);
 assert.deepEqual(nfe,[{indice:0,id:r.produto}]);
 const ids=new Set();let cursor=null;
 do {
  const pagina=await rpc('pagina_servicos',r.w,{busca:'Atendimento de escala'},cursor);
  assert.ok(pagina.atendimentos.length<=30);
  for(const a of pagina.atendimentos){assert.ok(!ids.has(a.id),'sem repetição');ids.add(a.id)}
  assert.ok(pagina.clientes.length<=30);assert.ok(pagina.objetos.length<=30);
  cursor=pagina.proximo;
 }while(cursor);
 assert.equal(ids.size,130,'nenhum atendimento perdido entre páginas');
 assert.equal((await rpc('pagina_servicos',r.w,{busca:'Atendimento de escala 130'})).atendimentos.length,1);
 assert.equal((await rpc('resumo_operacao_servicos',r.w,'')).abertos,131,'indicador não usa só a página');
 const catalogo=new Set();cursor=null;
 do {
  const pagina=await rpc('listar_catalogo_paginado',r.w,'escala',false,false,cursor);
  assert.ok(pagina.itens.length<=24);
  for(const item of pagina.itens){assert.ok(!catalogo.has(item.id));catalogo.add(item.id)}
  cursor=pagina.proximo;
 }while(cursor);
 assert.equal(catalogo.size,80,'todos os serviços entre favoritos e não favoritos');
 const favoritos=await rpc('listar_catalogo_paginado',r.w,'escala',false,true,null);
 assert.ok(favoritos.itens.every(x=>x.favorito));
 await assert.rejects(()=>rpc('pagina_servicos',r.w,{tela:'agenda',inicio:'2026-01-01',fim:'2026-12-31'}),e=>e.code==='22023');
 await c.login(c.ids.stranger);
 for(const [fn,args] of [ ['buscar_cadastros_operacao',[r.w,'clientes']],['pagina_servicos',[r.w,{}]],['resumo_operacao_servicos',[r.w,'']],['listar_catalogo_paginado',[r.w]],['buscar_selecao_servicos',[r.w,'objetos']] ])await assert.rejects(()=>rpc(fn,...args),e=>e.code==='42501');
 console.log('Consultas limitadas, cursores, pesquisa, totais completos, paridade dos 16 subsetores e isolamento: OK');
} finally {await c.db.close()}
