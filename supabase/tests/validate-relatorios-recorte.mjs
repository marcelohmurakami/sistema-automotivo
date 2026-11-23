import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {criarCenarioSubsistemas} from './subsistemas-fixture.mjs';
import {calcularGestao,filtrosGestaoVazios} from '../../src/lib/relatoriosGestao.ts';

const ultima=process.env.DB_VALIDATION_MIGRATION_LIMIT;
process.env.DB_VALIDATION_MIGRATION_LIMIT='20261019001000';
const c=await criarCenarioSubsistemas();
if(ultima)process.env.DB_VALIDATION_MIGRATION_LIMIT=ultima;else delete process.env.DB_VALIDATION_MIGRATION_LIMIT;
const r=c.registros.mecanica;
const one=async(sql,args=[])=>Object.values((await c.db.query(sql,args)).rows[0])[0];
try {
 await c.login(c.ids.mecanica);
 const criar=async()=> (await one('select public.salvar_os_com_itens($1,$2,$3)',[r.w,{cliente_id:r.cliente,veiculo_id:r.objeto,itens:[{id:randomUUID(),tipo:'service',situacao:'done',descricao:'Revisão QA',quantidade:1,unidade:'un',preco_unitario_centavos:10000}]},randomUUID()])).id;
 const criadas=[];
 for(let i=0;i<3;i++){const id=await criar();criadas.push(id);await c.db.exec('reset role');await c.db.query("update public.ordens_servico set situacao='delivered',entregue_em=now(),concluido_em=now() where id=$1",[id]);await c.login(c.ids.mecanica)}
 const [antiga,nova,garantia]=criadas;
 const inicio=r.hoje.slice(0,8)+'01',fim=r.hoje;
 await c.db.exec('reset role');
 const passada=await one("select ($1::date - interval '2 years')::text",[inicio]);
 await c.db.query("update public.ordens_servico set recebido_em=$2::timestamp,iniciado_em=$2::timestamp+interval '1 hour',concluido_em=$2::timestamp+interval '2 hours',entregue_em=$2::timestamp+interval '3 hours',situacao='delivered' where id=any($1::uuid[])",[[antiga,garantia],passada]);
 await c.db.query("update public.ordens_servico set situacao='delivered',entregue_em=now(),concluido_em=now() where id=$1",[nova]);
 // Somente a fixture histórica local recebe datas anteriores; o livro real permanece imutável.
 await c.db.exec('alter table public.movimentacoes_estoque disable trigger user');
 await c.db.query('update public.movimentacoes_estoque set criado_em=$2::timestamp where oficina_id=$1',[r.w,passada]);
 await c.db.exec('alter table public.movimentacoes_estoque enable trigger user');
 await c.login(c.ids.mecanica);
 await one('select public.salvar_ocorrencia_qualidade($1,$2,$3)',[r.w,randomUUID(),{ordem_original_id:garantia,motivo:'execucao',descricao:'Retorno antigo com ocorrência no último dia',horas_retrabalho:2,custo_hora_centavos:3000,houve_retrabalho:true}]);
 await one('select public.salvar_complemento_gestao($1,$2,$3,$4)',[r.w,'oficina',r.w,{capacidade:5,abertura:'08:00',fechamento:'18:00',dias:[1,2,3,4,5]}]);
 await one('select public.salvar_complemento_gestao($1,$2,$3,$4)',[r.w,'os',nova,{custo_externo_centavos:1234,custos_conferidos:true}]);
 // Congela o instante para comparar indicadores de permanência e agenda.
 await c.db.exec('begin');
 const antes=await one('select public.consultar_relatorios_gestao($1,$2,$3)',[r.w,inicio,fim]);
 const relatoriosServicos = new Map();
 for(const [perfil,registro] of Object.entries(c.registros)) if(registro.atendimento) {
   await c.login(c.ids[perfil]);
   relatoriosServicos.set(perfil,await one('select public.consultar_relatorios_servicos($1,$2,$3)',[registro.w,inicio,fim]));
 }
 await c.db.exec('reset role');
 await c.db.exec(await readFile(new URL('../migrations/20261019001100_relatorios_recorte_historico.sql',import.meta.url),'utf8'));
 await c.login(c.ids.mecanica);
 const depois=await one('select public.consultar_relatorios_gestao($1,$2,$3)',[r.w,inicio,fim]);
 assert.equal(antes.ordens.length,3);assert.equal(depois.ordens.length,2);
 assert(!depois.ordens.some(o=>o.id===antiga));assert(depois.ordens.some(o=>o.id===garantia));
 assert.equal(depois.movimentos.length,0);assert.equal(depois.produtos[0].ultima_movimentacao,antes.movimentos[0].data);
 for(const filtro of [{},{cliente:r.cliente},{tipo:'sem_tipo'},{situacao:'delivered'},{estoque:'sem_movimento'}]) {
   const a=calcularGestao(antes,inicio,fim,{...filtrosGestaoVazios,...filtro}),b=calcularGestao(depois,inicio,fim,{...filtrosGestaoVazios,...filtro});
   // Metadado novo não é um indicador; o restante deve ser idêntico.
   for(const p of b.produtos) delete p.ultima_movimentacao;
   assert.deepEqual(b,a,JSON.stringify(filtro));
 }
 assert.equal(calcularGestao(depois,inicio,fim).retornoClientes,100);
 assert.equal(calcularGestao(depois,inicio,fim).resumoFinanceiro.margem,8766);
 for(const [perfil,anterior] of relatoriosServicos) {
   await c.login(c.ids[perfil]);
   const atual = await one('select public.consultar_relatorios_servicos($1,$2,$3)',[c.registros[perfil].w,inicio,fim]);
   assert.deepEqual(atual,anterior,perfil);
 }
 await c.db.exec('commit');
 console.log('Relatórios: recorte histórico preserva valores, custos, retornos, última movimentação e filtros.');
}finally{await c.db.close()}
