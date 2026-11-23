import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { criarBancoLocal } from './banco-local.mjs';
const db = await criarBancoLocal('20261013000800');
try {
  await db.exec("alter table auth.users add column email text; insert into auth.users(id,email) values('97000000-0000-4000-8000-000000000001','marcelomurakami.dev@gmail.com');");
  const seed=await readFile(new URL('../seeds/oficina-marcelo.sql',import.meta.url),'utf8');
  await db.exec(seed); await db.exec(seed);
  const resultado=(await db.query(`select (select count(*)::int from public.oficinas) as oficinas,(select count(*)::int from public.membros_oficina) as membros,(select count(*)::int from public.clientes) as clientes,(select count(*)::int from public.veiculos) as veiculos,(select count(*)::int from public.clientes_veiculos) as vinculos,(select count(*)::int from public.itens_catalogo) as catalogo,(select count(*)::int from public.eventos_negocio) as eventos`)).rows[0];
  assert.deepEqual(resultado,{oficinas:1,membros:1,clientes:8,veiculos:8,vinculos:8,catalogo:12,eventos:20});
  await db.exec("select set_config('request.jwt.claim.sub','97000000-0000-4000-8000-000000000001',false);set role authenticated;");
  const acesso=(await db.query('select public.consultar_meu_acesso() as acesso')).rows[0].acesso;
  assert.equal(acesso[0].perfil,'owner'); assert.equal(acesso[0].codigo_plano,'basic');
  const lista=(await db.query("select public.listar_clientes('7d2e8401-b6fc-45b8-9582-e825e7c08681') as lista")).rows[0].lista;
  assert.equal(lista.total,8);
  console.log('Carga reaplicada sem duplicações; proprietário acessa os oito clientes no plano Básico.'); console.log(resultado);
} catch(e) { console.error(e.message,e.where??''); process.exitCode=1; } finally { await db.close(); }
