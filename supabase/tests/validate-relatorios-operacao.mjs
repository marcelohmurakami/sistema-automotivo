import assert from "node:assert/strict";
import { criarBancoLocal } from "./banco-local.mjs";
let db;
const uid = "99000000-0019-4000-8000-000000000001",
  other = "99000000-0019-4000-8000-000000000002",
  staff = "99000000-0019-4000-8000-000000000003";
const login = async (id) =>
  db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${id}',false);set role authenticated`,
  );
const scalar = async (sql) => Object.values((await db.query(sql)).rows[0])[0];
try {
  db = await criarBancoLocal("20261009001900");
  await db.exec(
    `insert into auth.users values('${uid}'),('${other}'),('${staff}')`,
  );
  await login(uid);
  const w = await scalar(
    "select public.criar_oficina('Oficina dos relatórios',null)",
  );
  const hoje = await scalar(
    "select (now() at time zone 'America/Sao_Paulo')::date::text",
  );
  const consultar = (inicio = hoje, fim = hoje) =>
    scalar(`select public.consultar_relatorios('${w}','${inicio}','${fim}')`);
  await assert.rejects(consultar, (e) => e.code === "42501");
  await db.exec(
    `reset role;update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id='${w}';insert into public.membros_oficina(oficina_id,usuario_id,perfil) values('${w}','${staff}','staff')`,
  );
  await login(uid);
  let r = await consultar();
  assert.deepEqual(r.paradas_motivos, []);
  assert.equal(r.atual.prazo_medio, null);
  assert.equal(r.operacao.paradas, 0);
  const c = (
    await scalar(
      `select public.salvar_cliente('${w}','{"nome":"Cliente teste relatórios"}')`,
    )
  ).id;
  let numero = 0;
  const criar = async () => {
    const v = await scalar(
      `select public.cadastrar_veiculo_orcamento('${w}','${c}','Motor teste ${++numero}',null)`,
    );
    return (
      await scalar(
        `select public.salvar_ordem_servico('${w}','{"cliente_id":"${c}","veiculo_id":"${v}"}',gen_random_uuid())`,
      )
    ).id;
  };
  const parada = await criar(),
    pronta = await criar(),
    entregue = await criar(),
    cancelada = await criar();
  await db.exec(
    `select public.registrar_parada_os('${w}','${parada}','parts','Aguardando peças');select public.registrar_parada_os('${w}','${parada}','parts','Pedido em transporte');select public.registrar_parada_os('${w}','${parada}','approval','Aguardando resposta');select public.registrar_parada_os('${w}','${entregue}','parts','Histórico encerrado');select public.registrar_parada_os('${w}','${cancelada}','parts','Atendimento cancelado')`,
  );
  await db.exec(
    `reset role;update public.ordens_servico set entrega_prevista_em=now()-interval '2 days' where id='${parada}';update public.ordens_servico set situacao='ready',concluido_em=now()-interval '1 day' where id='${pronta}';update public.ordens_servico set situacao='delivered',subtotal_centavos=15000,recebido_em=now()-interval '3 days',entregue_em=now(),entrega_prevista_em=now()+interval '1 day' where id='${entregue}';update public.ordens_servico set situacao='cancelled',cancelado_em=now(),motivo_cancelamento='Cancelamento de teste' where id='${cancelada}'`,
  );
  await login(uid);
  r = await consultar();
  assert.equal(r.operacao.ativas, 2);
  assert.equal(r.operacao.paradas, 1);
  assert.equal(r.operacao.atrasadas, 1);
  assert.equal(r.operacao.prontas, 1);
  assert.deepEqual(r.paradas_motivos, [
    { motivo: "approval", quantidade: 1 },
    { motivo: "parts", quantidade: 1 },
  ]);
  assert.equal(r.atencao[0].id, parada);
  assert.equal(r.atencao[0].parada, true);
  assert.equal(r.atencao[0].atrasada, true);
  assert.match(r.atencao[0].motivo, /Aguardando peças/);
  assert.equal(r.atencao[1].id, pronta);
  assert.equal(r.atencao[1].parada, false);
  assert.equal(r.atencao[1].atrasada, false);
  assert.equal(r.atual.entregues, 1);
  assert.equal(r.atual.vendido, 15000);
  assert.equal(r.atual.ticket, 15000);
  assert.equal(r.atual.prazo_medio, 3);
  assert.equal(r.atual.no_prazo, 1);
  const passado = await consultar("2020-01-01", "2020-01-03");
  assert.equal(passado.atual.entregues, 0);
  assert.equal(passado.operacao.paradas, 1);
  assert.equal(passado.operacao.prontas, 1);
  assert.equal(passado.inicio_anterior, "2019-12-29");
  assert.equal(passado.fim_anterior, "2019-12-31");
  console.log(
    "PASS: período, valores, prazo, paradas distintas, motivos e retiradas",
  );
  await db.exec(
    `reset role;update public.paradas_ordem_servico set encerrado_em=now() where ordem_servico_id='${parada}'`,
  );
  await login(uid);
  r = await consultar();
  assert.equal(r.operacao.paradas, 0);
  assert.deepEqual(r.paradas_motivos, []);
  assert.equal(r.atencao.find((o) => o.id === parada).parada, false);
  for (let i = 0; i < 18; i++) {
    const id = await criar();
    await db.exec(
      `select public.registrar_parada_os('${w}','${id}','third_party','Retífica terceirizada')`,
    );
  }
  r = await consultar();
  assert.equal(r.operacao.paradas, 18);
  assert.equal(r.paradas_motivos[0].quantidade, 18);
  assert.equal(r.atencao.length, 15);
  console.log(
    "PASS: paradas encerradas saem; agregados não são limitados às 15 OS exibidas",
  );
  await assert.rejects(
    () => consultar("2020-01-01", "2026-01-01"),
    (e) => e.code === "22023",
  );
  await login(staff);
  await assert.rejects(consultar, (e) => e.code === "42501");
  await login(other);
  await assert.rejects(consultar, (e) => e.code === "42501");
  await db.exec("reset role;set role anon");
  await assert.rejects(consultar, (e) => e.code === "42501");
  console.log(
    "PASS: limites e isolamento entre oficinas, perfis e acesso anônimo",
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  if (db) await db.close();
}
