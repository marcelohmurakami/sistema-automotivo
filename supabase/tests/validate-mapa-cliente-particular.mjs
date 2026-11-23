import { codigoConflitoRevisao } from './banco-local.mjs';
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { criarBancoLocal } from "./banco-local.mjs";
const db = await criarBancoLocal("20261013000100");
const scalar = async (sql, args = []) =>
  Object.values((await db.query(sql, args)).rows[0])[0];
const owner = randomUUID(),
  outsider = randomUUID();
const login = async (id, role = "authenticated") =>
  db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${id}',false);set role ${role}`,
  );
try {
  await db.exec(`insert into auth.users values('${owner}'),('${outsider}')`);
  await login(owner);
  const w = await scalar(
    "select public.criar_oficina('Retífica particulares',null)",
  );
  await db.exec(
    `reset role;update public.oficinas set especialidade='retifica' where id='${w}';update public.assinaturas_oficina set codigo_plano='complete' where oficina_id='${w}'`,
  );
  await login(owner);
  const dados = {
    cliente_id: null,
    cliente_nome_livre: "Cliente particular",
    carro_livre: "Volkswagen",
    motor_livre: "AP",
    itens: [
      {
        id: randomUUID(),
        situacao: "pending",
        tipo: "service",
        descricao: "Retífica",
        unidade: "un",
        quantidade: 1,
        preco_unitario_centavos: 10000,
      },
    ],
    desconto_centavos: 0,
  };
  const novosDados = () => ({
    ...dados,
    itens: dados.itens.map((i) => ({ ...i, id: randomUUID() })),
  });
  const ler = (id) =>
    scalar("select public.consultar_ordem_servico($1,$2)", [w, id]);
  const mover = async (o, direcao) => {
    const r = await scalar("select public.mover_ordem_no_mapa($1,$2,$3,$4)", [
      w,
      o.id,
      o.revisao,
      direcao,
    ]);
    assert.equal(r.revisao, o.revisao + 1);
    return ler(o.id);
  };
  const contar = async (tabela, id) => {
    await db.exec("reset role");
    const n = await scalar(
      `select count(*)::int from public.${tabela} where ordem_servico_id=$1`,
      [id],
    );
    await login(owner);
    return n;
  };
  for (const telefone of [null, "+5516999991111"]) {
    let o = await scalar("select public.salvar_os_com_itens($1,$2,$3)", [
      w,
      { ...novosDados(), cliente_telefone_livre: telefone },
      randomUUID(),
    ]);
    const snapshot = o.dados_cliente,
      valor = o.total_centavos,
      revisao = o.revisao;
    await login(outsider);
    await assert.rejects(
      () => mover(o, "avancar"),
      (e) => e.code === "42501",
    );
    await login(owner);
    o = await mover(o, "avancar");
    assert.equal(o.situacao, "in_progress");
    await assert.rejects(
      () =>
        scalar("select public.mover_ordem_no_mapa($1,$2,$3,'avancar')", [
          w,
          o.id,
          revisao,
        ]),
      (e) => e.code === codigoConflitoRevisao,
    );
    o = await mover(o, "voltar");
    assert.equal(o.situacao, "open");
    o = await mover(o, "avancar");
    await scalar(
      "select public.operar_mapa_rapido($1,$2,$3,'parar','parts','Peça em transporte')",
      [w, o.id, o.revisao],
    );
    o = await ler(o.id);
    await assert.rejects(
      () => mover(o, "avancar"),
      (e) => e.code === "23514",
    );
    await scalar("select public.operar_mapa_rapido($1,$2,$3,'retomar')", [
      w,
      o.id,
      o.revisao,
    ]);
    o = await ler(o.id);
    o = await mover(o, "avancar");
    assert.equal(o.situacao, "quality_check");
    await scalar("select public.operar_mapa_rapido($1,$2,$3,'concluir')", [
      w,
      o.id,
      o.revisao,
    ]);
    o = await ler(o.id);
    assert.equal(o.situacao, "ready");
    assert.equal(o.itens[0].situacao, "done");
    assert.ok(o.concluido_em);
    o = await mover(o, "avancar");
    assert.equal(o.situacao, "delivered");
    assert.ok(o.entregue_em);
    assert.equal(o.cliente_id, null);
    assert.deepEqual(o.dados_cliente, snapshot);
    assert.equal(o.total_centavos, valor);
    assert.ok(o.historico.some((h) => h.descricao === "Serviço em andamento"));
    assert.ok(o.historico.some((h) => h.descricao === "Pronto para entrega"));
    assert.ok(o.historico.some((h) => h.descricao === "Veículo entregue"));
    assert.equal(await contar("avisos_automaticos", o.id), 0);
    assert.equal(await contar("titulos_financeiros", o.id), 1);
    console.log(
      "PASS fluxo particular completo, histórico, valor e financeiro preservados; telefone:",
      telefone ? "informado" : "ausente",
    );
  }
  const chave = randomUUID(),
    dadosRapida = novosDados();
  const rapida = await scalar("select public.criar_os_pronta($1,$2,$3)", [
    w,
    dadosRapida,
    chave,
  ]);
  assert.equal(rapida.situacao, "ready");
  assert.equal(rapida.cliente_id, null);
  assert.equal(
    (
      await scalar("select public.criar_os_pronta($1,$2,$3)", [
        w,
        dadosRapida,
        chave,
      ])
    ).id,
    rapida.id,
  );
  assert.equal(await contar("avisos_automaticos", rapida.id), 0);
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select count(*)::int from public.clientes where oficina_id=$1",
      [w],
    ),
    0,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from public.baixas_financeiras where oficina_id=$1",
      [w],
    ),
    0,
  );
  await login(owner);
  console.log(
    "PASS criação rápida pronta funciona com automações, sem cadastro ou recebimento automático",
  );
  const c = (
    await scalar("select public.salvar_cliente($1,$2)", [
      w,
      { nome: "Cliente cadastrado", telefone_e164: "+5516999992222" },
    ])
  ).id;
  let normal = await scalar("select public.salvar_os_com_itens($1,$2,$3)", [
    w,
    { ...novosDados(), cliente_id: c },
    randomUUID(),
  ]);
  normal = await mover(normal, "avancar");
  normal = await mover(normal, "avancar");
  await scalar("select public.operar_mapa_rapido($1,$2,$3,'concluir')", [
    w,
    normal.id,
    normal.revisao,
  ]);
  normal = await ler(normal.id);
  normal = await mover(normal, "avancar");
  assert.equal(await contar("avisos_automaticos", normal.id), 3);
  await db.exec("reset role");
  const avisos = (
    await db.query(
      "select cliente_id,situacao,situacao_os from public.avisos_automaticos where ordem_servico_id=$1",
      [normal.id],
    )
  ).rows;
  assert.ok(
    avisos.every((x) => x.cliente_id === c && x.situacao === "revisao"),
  );
  assert.deepEqual(avisos.map((x) => x.situacao_os).sort(), [
    "delivered",
    "in_progress",
    "ready",
  ]);
  console.log(
    "PASS automações de clientes cadastrados mantêm destinatário e revisão antes do envio",
  );
} catch (e) {
  console.error(e.message, e.code, e.where);
  process.exitCode = 1;
} finally {
  await db.close();
}
