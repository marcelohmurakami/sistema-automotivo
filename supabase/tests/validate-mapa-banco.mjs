import assert from 'node:assert/strict';
import {criarBancoLocal} from './banco-local.mjs';
let db;
try {
 db=await criarBancoLocal('20260929000600');
 const uid='98000000-0000-4000-8000-000000000001',other='98000000-0000-4000-8000-000000000002';
 const scalar=async sql=>Object.values((await db.query(sql)).rows[0])[0];
 const login=async u=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${u}',false);set role authenticated`);
 await db.exec(`insert into auth.users values('${uid}'),('${other}')`);await login(uid);
 const w=await scalar("select public.criar_oficina('Mapa teste',null)");
 await db.exec(`reset role;update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id='${w}'`);await login(uid);
 const c=(await scalar(`select public.salvar_cliente('${w}','{"nome":"Cliente teste"}')`)).id;
 const v=await scalar(`select public.cadastrar_veiculo_orcamento('${w}','${c}','Gol','ABC1D23')`);
 const o=await scalar(`select public.salvar_ordem_servico('${w}','{"cliente_id":"${c}","veiculo_id":"${v}","responsavel":"João","entrega_prevista_em":"2026-10-01T15:00:00Z"}','98000000-0000-4000-8001-000000000001')`);
 await db.exec(`select public.registrar_parada_os('${w}','${o.id}','parts','Aguardando peça')`);
 const query=`select o.id,o.numero,o.situacao,o.veiculo_id,o.dados_cliente,o.dados_veiculo,o.responsavel,o.queixa_cliente,o.recebido_em,o.entrega_prevista_em,(select jsonb_agg(p) from (select id,motivo,detalhes,encerrado_em from public.paradas_ordem_servico where ordem_servico_id=o.id) p) paradas from public.ordens_servico o where oficina_id='${w}' and situacao in ('open','in_progress','quality_check','ready')`;
 const rows=(await db.query(query)).rows;assert.equal(rows.length,1);assert.equal(rows[0].responsavel,'João');assert.equal(rows[0].dados_veiculo.placa,'ABC1D23');assert.equal(rows[0].paradas[0].motivo,'parts');console.log('PASS dados reais da OS, placa, responsável e parada');
 await login(other);assert.equal((await db.query(query)).rows.length,0);assert.equal(await scalar('select count(*) from public.paradas_ordem_servico'),0);console.log('PASS isolamento de OS e paradas por oficina');
 await db.exec(`reset role;update public.assinaturas_oficina set codigo_plano='basic' where oficina_id='${w}'`);await login(uid);assert.equal((await db.query(query)).rows.length,0);assert.equal(await scalar('select count(*) from public.paradas_ordem_servico'),0);console.log('PASS plano Básico sem acesso aos dados operacionais');
} catch(e) {console.error(e.message);process.exitCode=1;} finally {await db?.close();}
