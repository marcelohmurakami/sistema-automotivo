import {readFile} from 'node:fs/promises';
import {criarBancoLocal} from '../supabase/tests/banco-local.mjs';
import assert from 'node:assert/strict';
const db=await criarBancoLocal('20261007000300');
try {
 let sql=await readFile(new URL('./popular-mes-testes.sql',import.meta.url),'utf8');
 for(const [w,u] of [['7d2e8401-b6fc-45b8-9582-e825e7c08681','ef17b401-a899-4a48-9452-99b34f53bf6b'],['01f25297-5779-41b7-8acb-e0138da4c8e8','59050245-8a3f-4551-a9ef-32fb7007d363']]) {
  await db.exec(`insert into auth.users values('${u}');select set_config('request.jwt.claim.sub','${u}',false)`);
  const id=(await db.query("select public.criar_oficina('Teste mensal',null) id")).rows[0].id;
  await db.query("update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id=$1",[id]);
  sql=sql.replaceAll(w,id);
 }
 await db.exec(sql);
 const contagens=async()=> (await db.query('select (select count(*)::int from public.titulos_financeiros) contas,(select count(*)::int from public.contas_recorrentes) recorrencias,(select count(*)::int from public.ordens_servico) ordens,(select count(*)::int from public.clientes) clientes,(select count(*)::int from public.compras_estoque) compras,(select count(*)::int from public.baixas_financeiras) baixas')).rows[0];
 const antes=await contagens();
 assert.equal(antes.ordens,60);assert.equal(antes.clientes,30);assert.equal(antes.recorrencias,16);assert.equal(antes.compras,8);assert.equal(antes.baixas,46);
 await db.exec(sql);assert.deepEqual(await contagens(),antes);
 assert.equal((await db.query("select count(distinct vencimento)::int n from public.titulos_financeiros where descricao like '%Venda avulsa%'")).rows[0].n,30);
 assert.equal((await db.query("select count(*)::int n from public.baixas_financeiras where data>current_date")).rows[0].n,0);
 assert.equal((await db.query("select count(*)::int n from public.ordens_servico where situacao='ready'")).rows[0].n,14);
 assert.equal((await db.query("select count(*)::int n from public.estoque_produtos where saldo>0")).rows[0].n,24);
 console.log('PASS 30 dias, duas oficinas, pagamentos, estoque, etapas e idempotência:',antes);
} finally {await db.close();}
