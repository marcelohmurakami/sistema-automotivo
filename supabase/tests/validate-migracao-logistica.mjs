import assert from "node:assert/strict";
import { randomUUID as uuid } from "node:crypto";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { criarCenarioSubsistemas } from "./subsistemas-fixture.mjs";

// Dados anteriores às três migrações: saldos, séries, reservas e devoluções reais.
process.env.DB_VALIDATION_RUNTIME ||= resolve(
  "node_modules/@electric-sql/pglite/dist/index.js",
);
process.env.DB_VALIDATION_MIGRATION_LIMIT = "20261029000800";
const { db, ids, registros, login } = await criarCenarioSubsistemas();
const one = async (s, a = []) => Object.values((await db.query(s, a)).rows[0])[0];
const call = (f, a) =>
  one(
    `select public.${f}(${a.map((_, i) => "$" + (i + 1)).join(",")})`,
    a.map((v) => (v && typeof v === "object" ? JSON.stringify(v) : v)),
  );
const antes = {};
let verificacoes = 0;
const ok = (valor, mensagem) => {
  assert.ok(valor, mensagem);
  verificacoes++;
};
try {
  for (const [perfil, r] of Object.entries(registros)) {
    await login(ids[perfil]);
    const { w, produto, hoje } = r;
    const fornecedor = await call("salvar_fornecedor", [
      w,
      uuid(),
      { nome: "Fornecedor anterior" },
    ]);
    const pedido = uuid();
    await call("salvar_pedido_compra", [
      w,
      pedido,
      { fornecedor_id: fornecedor, referencia: "Compra anterior" },
      [{ produto_id: produto, quantidade: 3, custo_centavos: 2000 }],
    ]);
    for (const [tipo, quantidade] of [
      ["compra", 3],
      ["devolucao", 2],
      ["reposicao", 1],
    ]) {
      const p = await call("consultar_pedidos_compra", [w, "", 0, pedido]);
      await call("receber_pedido_compra", [
        w,
        pedido,
        uuid(),
        p.revisao,
        tipo,
        hoje,
        hoje,
        "",
        [{ item_id: p.itens[0].id, quantidade }],
        "Conferência anterior",
      ]);
    }
    const serial = uuid();
    await call("salvar_produto_estoque", [
      w,
      { descricao: "Série anterior", unidade: "un", custo_centavos: 1000 },
      serial,
    ]);
    await call("configurar_planejamento_estoque", [w, serial, 1, { rastreado: true }]);
    await call("movimentar_unidades_estoque", [
      w,
      serial,
      2,
      uuid(),
      "entrada",
      [{ serie: "ANTERIOR-001" }],
      "Entrada anterior",
    ]);
    let documento = r.atendimento,
      ramo = "atendimento";
    if (!documento) {
      ramo = "os";
      const os = await call("salvar_ordem_servico", [
        w,
        { cliente_id: r.cliente, veiculo_id: r.objeto },
        uuid(),
      ]);
      documento = os.id;
      await call("adicionar_peca_estoque_os", [w, documento, produto, 2, os.revisao]);
    }
    const reservas = await call("consultar_reservas_atendimento", [w, documento, ramo]);
    await call("reservar_estoque_atendimento", [
      w,
      documento,
      ramo,
      reservas.itens[0].item_id,
      1,
      reservas.revisao,
    ]);
    antes[perfil] = {
      pedido,
      serial,
      documento,
      ramo,
      produto: await call("consultar_produto_estoque", [w, produto]),
    };
  }
  await db.exec("reset role");
  for (const arquivo of (await readdir("supabase/migrations"))
    .filter(
      (n) =>
        n.endsWith(".sql") &&
        n.slice(0, 14) > "20261029000800" &&
        n.slice(0, 14) <= "20261029001100",
    )
    .sort())
    await db.exec(await readFile("supabase/migrations/" + arquivo, "utf8"));
  for (const [perfil, r] of Object.entries(registros)) {
    await login(ids[perfil]);
    const a = antes[perfil],
      { w, produto, hoje } = r;
    const p = await call("consultar_produto_estoque", [w, produto]),
      d = await call("consultar_depositos_estoque", [w, produto]);
    ok(
      p.saldo === a.produto.saldo && p.reservado === a.produto.reservado,
      "migração preserva saldo e reserva",
    );
    ok(
      d.itens.find((i) => i.padrao).saldo === p.saldo &&
        d.itens.find((i) => i.padrao).reservado === p.reservado,
      "principal recebe o saldo anterior",
    );
    const series = await call("consultar_unidades_deposito", [w, a.serial, d.padrao]);
    ok(
      series.itens.length === 1 && series.itens[0].serie === "ANTERIOR-001",
      "série antiga aparece no local principal",
    );
    const dev = await call("consultar_devolucoes_fornecedor", [w]);
    ok(
      dev.total === 1 && dev.itens[0].pendente === 1,
      "apenas saldo ainda pendente gera acompanhamento",
    );
    const pedido = await call("consultar_pedidos_compra", [w, "", 0, a.pedido]);
    await call("receber_pedido_deposito", [
      w,
      a.pedido,
      uuid(),
      pedido.revisao,
      "reposicao",
      hoje,
      hoje,
      "",
      [{ item_id: pedido.itens[0].id, quantidade: 1 }],
      d.padrao,
      "Reposição após migração",
    ]);
    ok(
      (await call("consultar_devolucoes_fornecedor", [w, "", 0, dev.itens[0].id]))
        .pendente === 0,
      "devolução anterior pode ser resolvida",
    );
    const reservas = await call("consultar_reservas_atendimento", [
      w,
      a.documento,
      a.ramo,
    ]);
    await call("reservar_estoque_deposito", [
      w,
      a.documento,
      a.ramo,
      reservas.itens[0].item_id,
      0,
      reservas.revisao,
      d.padrao,
      "{}",
      reservas.itens[0].reserva_revisao,
    ]);
    ok(
      (await call("consultar_depositos_estoque", [w, produto])).itens.find(
        (i) => i.padrao,
      ).reservado === 0,
      "reserva anterior pode ser liberada",
    );
  }
  await mkdir("output/logistica-estoque-20261029", { recursive: true });
  await writeFile(
    "output/logistica-estoque-20261029/migracao.json",
    JSON.stringify(
      { verificacoes, subsetores: Object.keys(registros), sucesso: true },
      null,
      2,
    ),
  );
  console.log(
    "PASS",
    verificacoes,
    "verificações com dados anteriores nos 26 subsetores",
  );
} catch (e) {
  console.error(e.message, e.where);
  process.exitCode = 1;
} finally {
  await db.close();
}
