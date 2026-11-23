import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {criarBancoLocal} from '../supabase/tests/banco-local.mjs';
const db=await criarBancoLocal('20261008000200');
try {
 // A fixture foi planejada para 08/10/2026. Fixar somente o relógio da geração
 // de recorrências evita alterar a contagem conforme o dia de execução da suíte.
 const original=(await db.query("select pg_get_functiondef('private.gerar_contas_recorrentes(uuid)'::regprocedure) fonte")).rows[0].fonte;
 const fixo=original.replace("limite date:=(now() at time zone 'America/Sao_Paulo')::date+5", "limite date:=date '2026-10-13'");
 assert.notEqual(fixo,original);await db.exec(fixo);
 await db.exec(`alter table auth.users add column email_confirmed_at timestamptz;
 insert into auth.users(id,email_confirmed_at) values('1138bc6f-f05b-4b29-979a-b7e8d2ac6f16',now());
 insert into public.oficinas(id,nome,ramo) values
 ('e25d59bc-c20c-4aa1-bd57-c1b1d77aa0f2','ZZ [TESTE MULTIRRAMOS] Assistência técnica','assistencia_tecnica'),
 ('5218bdd8-0191-4f42-9d01-5db4fb3fe3ea','ZZ [TESTE MULTIRRAMOS] Manutenção de campo','manutencao_campo'),
 ('5fb21ca1-a81f-4898-a00b-eb30be57f964','ZZ [TESTE MULTIRRAMOS] Limpeza','limpeza');
 insert into public.membros_oficina(oficina_id,usuario_id,perfil) select id,'1138bc6f-f05b-4b29-979a-b7e8d2ac6f16','owner' from public.oficinas;`);
 const sql=await readFile(new URL('./popular-multirramos-real.sql',import.meta.url),'utf8');
 await db.exec(sql);
 const contar=async()=> (await db.query(`select
 (select count(*)::int from public.clientes) clientes,
 (select count(*)::int from public.objetos_atendimento) cadastros,
 (select count(*)::int from public.atendimentos_servicos) atendimentos,
 (select count(*)::int from public.agenda_servicos) agenda,
 (select count(*)::int from public.recursos_agenda) equipes,
 (select count(*)::int from public.titulos_financeiros) contas,
 (select count(*)::int from public.baixas_financeiras) baixas,
 (select count(*)::int from public.contas_recorrentes) recorrencias`)).rows[0];
 const primeiro=await contar();
 assert.deepEqual(primeiro,{clientes:36,cadastros:36,atendimentos:72,agenda:147,equipes:9,contas:96,baixas:27,recorrencias:9});
 await db.exec(sql);assert.deepEqual(await contar(),primeiro);
 assert.equal((await db.query("select count(distinct (inicio at time zone 'America/Sao_Paulo')::date)::int n from public.agenda_servicos where inicio>='2026-10-08T00:00:00-03:00' and inicio<'2026-11-07T00:00:00-03:00'")).rows[0].n,30);
 assert.equal((await db.query('select count(*)::int n from public.ordens_servico')).rows[0].n,0);
 console.log('PASS: totais, 30 dias de agenda, reexecução sem duplicação e ausência de OS automotivas.',primeiro);
} catch(e){console.error(e.message,e.query||'');process.exitCode=1;}finally{await db.close();}
