import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import ts from "typescript";
import { criarBancoLocal } from "./banco-local.mjs";
const js = ts.transpile(readFileSync("src/lib/relatorioOficina.ts", "utf8"), {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
});
const {
  detalharOficina,
  mesDoRelatorio,
  serieOficinaAgrupada,
  linhasOficinaCSV,
  validarPeriodoOficina,
} = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`
);
const uid = "99000000-1304-4000-8000-000000000001",
  other = "99000000-1304-4000-8000-000000000002",
  staff = "99000000-1304-4000-8000-000000000003";
let db;
const scalar = async (sql) => Object.values((await db.query(sql)).rows[0])[0];
const login = async (id) =>
  db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${id}',false);set role authenticated`,
  );
try {
  assert.deepEqual(mesDoRelatorio("2026-10-13"), {
    inicio: "2026-10-01",
    fim: "2026-10-31",
  });
  assert.deepEqual(mesDoRelatorio("2026-01-03", -1), {
    inicio: "2025-12-01",
    fim: "2025-12-31",
  });
  assert.deepEqual(mesDoRelatorio("2024-02-29"), {
    inicio: "2024-02-01",
    fim: "2024-02-29",
  });
  for (const p of [
    ["2026-02-30", "2026-03-01"],
    ["", "2026-10-01"],
    ["2026-10-02", "2026-10-01"],
    ["2020-01-01", "2026-01-01"],
  ])
    assert.throws(() => validarPeriodoOficina(...p));
  db = await criarBancoLocal("20261013000400");
  await db.exec(
    `insert into auth.users values('${uid}'),('${other}'),('${staff}')`,
  );
  await login(uid);
  const w = await scalar(
    "select public.criar_oficina('Relatório operacional de teste',null)",
  );
  const hoje = await scalar(
    "select (now() at time zone 'America/Sao_Paulo')::date::text",
  );
  const dia = (n) =>
    new Date(Date.parse(hoje) + n * 86400000).toISOString().slice(0, 10);
  const inicio = dia(-12),
    fim = hoje,
    hora = (n, h = "09:00") => dia(n) + "T" + h + ":00-03:00";
  const consultar = (i = inicio, f = fim) =>
    scalar(`select public.consultar_relatorio_oficina('${w}','${i}','${f}')`);
  await assert.rejects(consultar, (e) => e.code === "42501");
  await db.exec(
    `reset role;update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id='${w}';insert into public.membros_oficina(oficina_id,usuario_id,perfil) values('${w}','${staff}','staff')`,
  );
  await login(uid);
  let base = await consultar(),
    r = detalharOficina(base, inicio, fim);
  assert.deepEqual(r.atual, {
    entradas: 0,
    concluidas: 0,
    entregues: 0,
    canceladas: 0,
  });
  assert.equal(r.tempo_entrega.dias, null);
  assert.equal(r.serie.length, 13);
  const c = (
    await scalar(
      `select public.salvar_cliente('${w}','{"nome":"Cliente de teste"}')`,
    )
  ).id;
  let numero = 0;
  const criar = async () => {
    await login(uid);
    const v = await scalar(
      `select public.cadastrar_veiculo_orcamento('${w}','${c}','Motor ${++numero}',null)`,
    );
    return (
      await scalar(
        `select public.salvar_ordem_servico('${w}','{"cliente_id":"${c}","veiculo_id":"${v}"}',gen_random_uuid())`,
      )
    ).id;
  };
  const ids = [];
  for (let i = 0; i < 9; i++) ids.push(await criar());
  const [
    aberta,
    pronta,
    entregue,
    cancelada,
    anterior,
    arquivada,
    semData,
    regredida,
    avulsa,
  ] = ids;
  await db.exec(`reset role;
    update public.ordens_servico set data_servico='${dia(-11)}',recebido_em='${hora(-11)}',entrega_prevista_em='${hora(-1)}',responsavel='João' where id='${aberta}';
    update public.ordens_servico set data_servico='${dia(-10)}',recebido_em='${hora(-10)}',concluido_em='${hora(-8)}',entrega_prevista_em='${hora(-9)}',situacao='ready',responsavel='Danilo' where id='${pronta}';
    update public.ordens_servico set data_servico='${dia(-20)}',recebido_em='${hora(-20)}',concluido_em='${hora(-5)}',entregue_em='${hora(-3)}',entrega_prevista_em='${hora(-4)}',situacao='delivered',responsavel='João' where id='${entregue}';
    update public.ordens_servico set data_servico='${dia(-9)}',recebido_em='${hora(-9)}',cancelado_em='${hora(-6)}',motivo_cancelamento='Teste',situacao='cancelled' where id='${cancelada}';
    update public.ordens_servico set data_servico='${dia(-30)}',recebido_em='${hora(-30)}',concluido_em='${hora(-25)}',situacao='ready' where id='${anterior}';
    update public.ordens_servico set data_servico='${dia(-8)}',arquivado_em=now(),situacao='cancelled',cancelado_em=now(),motivo_cancelamento='Teste',motivo_exclusao='Teste',excluido_por='${uid}' where id='${arquivada}';
    update public.ordens_servico set data_servico=null,recebido_em=null,criado_em='${hora(-7)}' where id='${semData}';
    update public.ordens_servico set data_servico='${dia(-6)}',recebido_em='${hora(-6)}',concluido_em='${hora(-4)}',situacao='quality_check' where id='${regredida}';
    update public.ordens_servico set cliente_id=null,dados_cliente='{"nome":"Antônio particular"}',data_servico='${dia(-2)}',recebido_em='${hora(-2)}',situacao='in_progress' where id='${avulsa}';
    insert into public.paradas_ordem_servico(oficina_id,ordem_servico_id,motivo,detalhes,iniciado_em,encerrado_em,criado_por) values
      ('${w}','${aberta}','parts','Teste','${hora(-10)}','${hora(-8)}','${uid}'),
      ('${w}','${aberta}','parts','Teste','${hora(-9)}','${hora(-7)}','${uid}'),
      ('${w}','${aberta}','approval','Teste','${hora(-8)}','${hora(-6)}','${uid}'),
      ('${w}','${aberta}','third_party','Teste','${hora(-1, "00:00")}',null,'${uid}'),
      ('${w}','${entregue}','parts','Teste','${hora(-15, "00:00")}','${hora(-11, "00:00")}','${uid}'),
      ('${w}','${cancelada}','other','Teste','${hora(-8)}',null,'${uid}');
    insert into public.itens_ordem_servico(oficina_id,ordem_servico_id,posicao,tipo,descricao,quantidade,preco_unitario_centavos,situacao) values
      ('${w}','${entregue}',0,'service','Retífica de cabeçote',2,10000,'done'),
      ('${w}','${entregue}',1,'service','Retífica de cabeçote',1,10000,'done'),
      ('${w}','${entregue}',2,'part','Válvula',4,2000,'done'),
      ('${w}','${entregue}',3,'service','Serviço cancelado',1,5000,'cancelled');
  `);
  await login(uid);
  base = await consultar();
  // Congela apenas o relógio da agregação para testar durações exatas.
  base.agora = hora(0, "12:00");
  r = detalharOficina(base, inicio, fim);
  assert.deepEqual(r.atual, {
    entradas: 6,
    concluidas: 2,
    entregues: 1,
    canceladas: 1,
  });
  assert.equal(r.anterior.entradas, 1);
  assert.equal(r.anteriores.length, 1);
  assert.equal(r.anteriores[0].id, anterior);
  assert.equal(r.situacao.abertas, 5);
  assert.equal(r.situacao.paradas, 1);
  assert.equal(r.situacao.atrasadas, 2);
  assert.equal(
    r.ordens.find((o) => o.id === avulsa).cliente,
    "Antônio particular",
  );
  assert.equal(
    r.etapas.reduce((s, e) => s + e.quantidade, 0),
    6,
  );
  assert.equal(r.tempo_conclusao.dias, 8.5);
  assert.equal(r.tempo_conclusao.amostra, 2);
  assert.equal(r.tempo_retirada.dias, 2);
  assert.equal(r.tempo_entrega.dias, 17);
  assert.equal(r.prazo_conclusao.no_prazo, 1);
  assert.equal(r.prazo_conclusao.atrasadas, 1);
  assert.equal(r.prazo_entrega.atrasadas, 1);
  assert.equal(r.paradas.ordens, 3);
  assert.equal(r.paradas.horas, 204);
  assert.deepEqual(
    r.paradas.motivos.find((m) => m.motivo === "parts"),
    { motivo: "parts", quantidade: 2, horas: 96 },
  );
  assert.deepEqual(r.servicos, [
    { nome: "Retífica de cabeçote", quantidade: 3, ordens: 1 },
  ]);
  assert.equal(r.responsaveis.find((x) => x.nome === "João").entregues, 1);
  assert.equal(r.responsaveis.find((x) => x.nome === "João").abertas, 1);
  assert.equal(r.situacao.sem_entrada, 1);
  assert.equal(r.ordens.find((o) => o.id === semData).dias_na_oficina, null);
  assert.equal(
    serieOficinaAgrupada(r.serie, true).reduce((s, x) => s + x.entradas, 0),
    6,
  );
  assert.equal(
    r.serie.reduce((s, x) => s + x.entregues, 0),
    1,
  );
  assert.ok(
    linhasOficinaCSV(r).some(
      (l) =>
        l[0] === "Pendências anteriores" && l[1] === r.anteriores[0].numero,
    ),
  );
  assert.equal(
    base.ordens.some((o) => o.id === arquivada),
    false,
  );
  assert.equal("observacoes_internas" in base.ordens[0], false);
  console.log(
    "PASS: datas de serviço/conclusão/entrega distintas, clientes avulsos, responsáveis, exclusões, tempos e prazos",
  );
  console.log(
    "PASS: paradas resolvidas/abertas, recorte no período, cancelamento e sobreposições sem duplicar horas",
  );
  const diaUnico = detalharOficina(
    await consultar(dia(-3), dia(-3)),
    dia(-3),
    dia(-3),
  );
  assert.equal(diaUnico.atual.entradas, 0);
  assert.equal(diaUnico.atual.entregues, 1);
  assert.equal(diaUnico.ordens.length, 0);
  const vazio = detalharOficina(
    await consultar("2020-01-01", "2020-01-03"),
    "2020-01-01",
    "2020-01-03",
  );
  assert.equal(vazio.atual.entradas, 0);
  assert.equal(vazio.paradas.ordens, 0);
  assert.equal(vazio.anteriores.length, 0);
  // Fronteira civil: 02:59 UTC ainda é o dia anterior em Brasília.
  const fronteira = {
    ...base.ordens.find((o) => o.id === avulsa),
    data_servico: null,
    recebido_em: dia(-2) + "T02:59:00Z",
  };
  const rFuso = detalharOficina(
    { agora: base.agora, ordens: [fronteira] },
    dia(-3),
    dia(-3),
  );
  assert.equal(rFuso.atual.entradas, 1);
  // Todos os registros participam dos agregados e do CSV, além da paginação da UI.
  for (let i = 0; i < 105; i++) await criar();
  base = await consultar();
  r = detalharOficina(base, inicio, fim);
  assert.equal(r.atual.entradas, 111);
  assert.equal(r.ordens.length, 111);
  assert.equal(
    linhasOficinaCSV(r).filter((x) => x[0] === "Entradas do período").length,
    111,
  );
  await assert.rejects(
    () => consultar("2020-01-01", "2026-01-01"),
    (e) => e.code === "22023",
  );
  await login(staff);
  await assert.rejects(consultar, (e) => e.code === "42501");
  await login(other);
  await assert.rejects(consultar, (e) => e.code === "42501");
  const outra = await scalar(
    "select public.criar_oficina('Outra oficina',null)",
  );
  await db.exec(
    `reset role;update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id='${outra}'`,
  );
  await login(other);
  assert.equal(
    (
      await scalar(
        `select public.consultar_relatorio_oficina('${outra}','${inicio}','${fim}')`,
      )
    ).ordens.length,
    0,
  );
  await db.exec("reset role;set role anon");
  await assert.rejects(consultar, (e) => e.code === "42501");
  console.log(
    "PASS: períodos personalizados, mês padrão/bissexto/virada do ano, série/CSV completos e isolamento entre oficinas/perfis",
  );
  // Massa visual pequena e fictícia, proveniente dos mesmos dados verificados.
  mkdirSync("output", { recursive: true });
  writeFileSync(
    "output/relatorio-oficina-fixture.json",
    JSON.stringify(
      detalharOficina(
        { ...base, ordens: base.ordens.filter((o) => ids.includes(o.id)) },
        inicio,
        fim,
      ),
      null,
      2,
    ),
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  if (db) await db.close();
}
