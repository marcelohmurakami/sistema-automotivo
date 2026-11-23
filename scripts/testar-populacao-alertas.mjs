import {readFile} from 'node:fs/promises';
import {criarBancoLocal} from '../supabase/tests/banco-local.mjs';
import assert from 'node:assert/strict';
const db=await criarBancoLocal('20261007000300');
const dono='ef17b401-a899-4a48-9452-99b34f53bf6b';
try {
 await db.exec(`insert into auth.users values('${dono}');select set_config('request.jwt.claim.sub','${dono}',false)`);
 const oficina=(await db.query("select public.criar_oficina('Oficina de teste local',null) id")).rows[0].id;
 await db.query("update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id=$1",[oficina]);
 const sql=(await readFile(new URL('./popular-alertas-teste.sql',import.meta.url),'utf8')).replaceAll('7d2e8401-b6fc-45b8-9582-e825e7c08681',oficina);
 await db.exec(sql);
 const contagens=async()=> (await db.query('select (select count(*)::int from public.titulos_financeiros) contas,(select count(*)::int from public.contas_recorrentes) recorrencias,(select count(*)::int from public.ordens_servico) ordens,(select count(*)::int from public.clientes) clientes')).rows[0];
 const antes=await contagens();
 assert.equal(antes.ordens,4); assert.equal(antes.recorrencias,3); assert.equal(antes.clientes,1);assert.ok(antes.contas>=18);
 await db.exec(sql);assert.deepEqual(await contagens(),antes);
 const alertas=(await db.query('select public.consultar_alertas($1) dados',[oficina])).rows[0].dados;
 assert.equal(alertas.filter(a=>a.tipo==='entrega').length,4);
 assert.equal(alertas.filter(a=>a.natureza==='receber').length,9);
 assert.ok(alertas.some(a=>a.pronto));
 console.log('PASS população completa e reexecução sem duplicações',antes);
} finally {await db.close();}
