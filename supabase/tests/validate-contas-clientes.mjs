import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import ts from "typescript";
import { criarBancoLocal } from "./banco-local.mjs";
const js = ts.transpile(readFileSync("src/lib/contasClientes.ts", "utf8"), {
  module: ts.ModuleKind.ESNext,
});
const { rankingDevedores, totaisConta, assinaturaConta } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`
);
const db = await criarBancoLocal("20261013000800");
const uid = "99000000-1308-4000-8000-000000000001",
  staff = "99000000-1308-4000-8000-000000000002",
  other = "99000000-1308-4000-8000-000000000003";
const scalar = async (sql, args = []) =>
  Object.values((await db.query(sql, args)).rows[0])[0];
const login = async (id) =>
  db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${id}',false);set role authenticated`,
  );
try {
  await db.exec(
    `insert into auth.users values('${uid}'),('${staff}'),('${other}')`,
  );
  await login(uid);
  const w = await scalar(
    "select public.criar_oficina('Teste contas de clientes',null)",
  );
  const consultar = () =>
    scalar("select public.consultar_contas_clientes($1)", [w]);
  await assert.rejects(consultar, (e) => e.code === "42501");
  await db.exec(
    `reset role;update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id='${w}';insert into public.membros_oficina(oficina_id,usuario_id,perfil) values('${w}','${staff}','staff')`,
  );
  await login(uid);
  assert.deepEqual((await consultar()).ordens, []);
  const hoje = (await consultar()).hoje;
  const data = (n) =>
    new Date(Date.parse(hoje) + n * 86400000).toISOString().slice(0, 10);
  const c1 = (
    await scalar("select public.salvar_cliente($1,$2)", [
      w,
      { nome: "José da Silva" },
    ])
  ).id;
  const c2 = (
    await scalar("select public.salvar_cliente($1,$2)", [
      w,
      { nome: "José da Silva" },
    ])
  ).id;
  const criarOS = async (c) => {
    const v = await scalar(
      "select public.cadastrar_veiculo_orcamento($1,$2,$3,null)",
      [w, c, "Volkswagen Gol"],
    );
    return (
      await scalar(
        "select public.salvar_ordem_servico($1,$2,gen_random_uuid())",
        [w, { cliente_id: c, veiculo_id: v }],
      )
    ).id;
  };
  const os1 = await criarOS(c1),
    os2 = await criarOS(c1),
    os3 = await criarOS(c2),
    os4 = await criarOS(c1),
    os5 = await criarOS(c1),
    os6 = await criarOS(c1),
    os7 = await criarOS(c1);
  // Fixtures SQL representam títulos reais integrados, sem disparar entrega/estoque alheios à consulta.
  const titulo = async (os, valor, vencimento = data(-10), extras = {}) => {
    await db.exec("reset role");
    const id = await scalar(
      `insert into public.titulos_financeiros(oficina_id,ordem_servico_id,natureza,categoria,descricao,valor_centavos,competencia,vencimento,provisorio,cancelado_em)
     values($1,$2,$3,'servicos','Pagamento de serviço',$4,$5,$6,$7,$8) returning id`,
      [
        w,
        os,
        extras.natureza || "receber",
        valor,
        data(-400),
        vencimento,
        extras.provisorio || false,
        extras.cancelado ? new Date().toISOString() : null,
      ],
    );
    await login(uid);
    return id;
  };
  const t1 = await titulo(os1, 100000),
    t2 = await titulo(os2, 30000, data(10));
  const pagar = (id, v, taxa = 0) =>
    scalar(
      "select public.baixar_titulo_financeiro($1,$2,gen_random_uuid(),$3,$4,$5,'banco','pix')",
      [w, id, v, taxa, hoje],
    );
  const b1 = await pagar(t1, 40000, 1000);
  // Importado conta como recebido, sem inventar nova baixa de caixa.
  await db.exec("reset role");
  await db.query(
    "insert into private.saldos_importados(oficina_id,titulo_id,valor_centavos) values($1,$2,10000)",
    [w, t1],
  );
  await login(uid);
  await titulo(os3, 60000, data(0));
  await titulo(os4, 70000);
  await titulo(os5, 80000);
  await db.exec(
    `reset role;update public.ordens_servico set cliente_id=null,dados_cliente='{"nome":"Particular"}' where id in ('${os4}','${os5}')`,
  );
  await login(uid);
  await titulo(os6, 900000);
  await db.exec(
    `reset role;update public.ordens_servico set situacao='cancelled',cancelado_em=now(),motivo_cancelamento='Cancelamento de teste' where id='${os6}';update public.ordens_servico set situacao='delivered',entregue_em=now(),arquivado_em=now(),motivo_exclusao='Arquivo de teste',excluido_por='${uid}' where id='${os2}';update public.titulos_financeiros set cancelado_em=now() where ordem_servico_id='${os2}' and automatico`,
  );
  await login(uid);
  await titulo(os7, 900000, hoje, { provisorio: true });
  await titulo(os7, 900000, hoje, { cancelado: true });
  await titulo(os7, 900000, hoje, { natureza: "pagar" });
  await titulo(null, 900000);
  const quitado = await titulo(os1, 20000);
  await pagar(quitado, 20000);
  let d = await consultar();
  let ranking = rankingDevedores(d);
  assert.equal(d.ordens.length, 5);
  assert.equal(ranking.length, 4);
  const conta = ranking.find((c) => c.chave === `cliente:${c1}`);
  assert.equal(conta.ordens.length, 2);
  assert.equal(conta.aberto, 80000);
  assert.equal(conta.vencido, 50000);
  assert.equal(d.ordens.find((o) => o.id === os1).pago_centavos, 70000);
  assert.equal(d.ordens.find((o) => o.id === os1).total_centavos, 120000);
  assert.equal(ranking.find((c) => c.chave === `cliente:${c2}`).vencido, 0); // Hoje ainda não está atrasado.
  assert.equal(ranking.filter((c) => c.avulso).length, 2); // Avulsos de mesmo nome nunca se misturam.
  assert.deepEqual(totaisConta(conta.ordens.filter((o) => o.id === os2)), {
    total: 30000,
    pago: 0,
    aberto: 30000,
    vencido: 0,
  });
  assert.deepEqual(totaisConta([]), {
    total: 0,
    pago: 0,
    aberto: 0,
    vencido: 0,
  });
  const antes = assinaturaConta(conta.ordens);
  await scalar("select public.estornar_baixa_financeira($1,$2,$3,$4)", [
    w,
    b1,
    hoje,
    "Estorno para validar o saldo",
  ]);
  d = await consultar();
  assert.equal(d.ordens.find((o) => o.id === os1).aberto_centavos, 90000);
  assert.notEqual(
    antes,
    assinaturaConta(d.ordens.filter((o) => o.cliente_id === c1)),
  );
  assert.equal(
    assinaturaConta(d.ordens),
    assinaturaConta([...d.ordens].reverse()),
  );
  assert.equal(rankingDevedores(d)[0].chave, `cliente:${c1}`);
  mkdirSync("output", { recursive: true });
  writeFileSync(
    "output/contas-clientes-db-fixture.json",
    JSON.stringify(d, null, 2),
  );
  await login(staff);
  await assert.rejects(consultar, (e) => e.code === "42501");
  await login(other);
  await assert.rejects(consultar, (e) => e.code === "42501");
  // Outra oficina tem dados, mas o resultado só inclui os registros do tenant autorizado.
  const w2 = await scalar("select public.criar_oficina('Outra oficina',null)");
  await db.exec(
    `reset role;update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id='${w2}'`,
  );
  await login(other);
  assert.deepEqual(
    (await scalar("select public.consultar_contas_clientes($1)", [w2])).ordens,
    [],
  );
  await db.exec("reset role;set role anon");
  await assert.rejects(consultar, (e) => e.code === "42501");
  await login(uid);
  // Não truncar os saldos no limite de paginação da API.
  await db.exec("reset role");
  await db.query(
    `insert into public.titulos_financeiros(oficina_id,ordem_servico_id,natureza,categoria,descricao,valor_centavos,competencia,vencimento) select $1,$2,'receber','servicos','Parcela de teste',1,$3,$3 from generate_series(1,1001)`,
    [w, os2, hoje],
  );
  await login(uid);
  assert.equal(
    (await consultar()).ordens.find((o) => o.id === os2).aberto_centavos,
    31001,
  );
  // Liquidar uma OS remove sua seleção e invalida a assinatura anterior.
  await pagar(t1, 90000);
  assert.equal(
    (await consultar()).ordens.some((o) => o.id === os1),
    false,
  );
  console.log(
    "PASS: ranking, seleção, parcial, taxas, estorno, saldo importado, vencimento hoje, histórico, quitados/cancelados/provisórios, avulsos, homônimos, revisão e >1000 títulos.",
  );
  console.log("PASS: plano, perfil, anon e isolamento entre oficinas.");
} finally {
  await db.close();
}
