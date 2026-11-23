import assert from "node:assert/strict";
import { randomUUID as uuid } from "node:crypto";
import { resolve } from "node:path";
import { criarCenarioSubsistemas } from "./subsistemas-fixture.mjs";
process.env.DB_VALIDATION_RUNTIME ||= resolve(
  "node_modules/@electric-sql/pglite/dist/index.js",
);
process.env.DB_VALIDATION_MIGRATION_LIMIT ||= "20261029001100";
const { db, ids, registros, login } = await criarCenarioSubsistemas();
let n = 0;
const one = async (sql, a = []) => Object.values((await db.query(sql, a)).rows[0])[0];
const call = (fn, a) =>
  one(
    `select public.${fn}(${a.map((_, i) => "$" + (i + 1)).join(",")})`,
    a.map((v, i) =>
      (fn === "transferir_estoque" && i === 7) ||
      (fn === "reservar_estoque_deposito" && i === 7)
        ? "{" + v.join(",") + "}"
        : v && typeof v === "object"
          ? JSON.stringify(v)
          : v,
    ),
  );
const ok = (v, m) => {
  assert.ok(v, m);
  n++;
};
const fail = async (f) => {
  await assert.rejects(f);
  n++;
};
try {
  for (const [perfil, r] of Object.entries(registros)) {
    const { w, produto } = r;
    await login(ids[perfil]);
    const p = () => call("consultar_produto_estoque", [w, produto]);
    const d = uuid();
    await call("salvar_deposito_estoque", [
      w,
      d,
      { nome: "Veículo de atendimento", tipo: "veiculo", identificacao: "QA-001" },
    ]);
    let deps = await call("consultar_depositos_estoque", [w, produto]);
    const principal = deps.padrao;
    ok(
      deps.itens.find((x) => x.id === principal).saldo === 10,
      "saldo inicial principal",
    );
    const args = [
      w,
      uuid(),
      produto,
      principal,
      d,
      6,
      (await p()).revisao,
      [],
      "Abastecer equipe",
    ];
    await call("transferir_estoque", args);
    await call("transferir_estoque", args);
    ok((await p()).saldo === 10, "transferência não aumenta estoque");
    deps = await call("consultar_depositos_estoque", [w, produto]);
    ok(deps.itens.find((x) => x.id === d).saldo === 6, "transferência idempotente");
    await fail(() =>
      call("transferir_estoque", [...args.slice(0, 5), 7, ...args.slice(6)]),
    );
    await fail(async () =>
      call("movimentar_estoque", [
        w,
        produto,
        "saida",
        5,
        "Origem sem saldo",
        uuid(),
        (await p()).revisao,
      ]),
    );
    const m = await call("movimentar_estoque_deposito", [
      w,
      produto,
      d,
      uuid(),
      (await p()).revisao,
      "saida",
      2,
      "Consumo externo",
    ]);
    ok((await p()).saldo === 8, "saída localizada");
    await call("estornar_movimentacao_estoque", [w, m, "Reposição de teste"]);
    deps = await call("consultar_depositos_estoque", [w, produto]);
    ok(deps.itens.find((x) => x.id === d).saldo === 6, "estorno preserva origem");
    let doc = r.atendimento,
      ramo = "atendimento";
    if (!doc) {
      ramo = "os";
      const x = await call("salvar_ordem_servico", [
        w,
        { cliente_id: r.cliente, veiculo_id: r.objeto },
        uuid(),
      ]);
      doc = x.id;
      await call("adicionar_peca_estoque_os", [w, doc, produto, 2, x.revisao]);
    }
    let rr = await call("consultar_reservas_atendimento", [w, doc, ramo]),
      item = rr.itens[0];
    await call("reservar_estoque_deposito", [
      w,
      doc,
      ramo,
      item.item_id,
      item.quantidade,
      rr.revisao,
      d,
    ]);
    deps = await call("consultar_depositos_estoque", [w, produto]);
    ok(
      deps.itens.find((x) => x.id === d).reservado === item.quantidade,
      "reserva no veículo",
    );
    await fail(async () =>
      call("transferir_estoque", [
        w,
        uuid(),
        produto,
        d,
        principal,
        6,
        (await p()).revisao,
        [],
        "Saldo reservado",
      ]),
    );
    const tag = await call("preparar_etiqueta_estoque", [w, produto]);
    ok(
      tag.codigo === (await call("preparar_etiqueta_estoque", [w, produto])).codigo,
      "etiqueta estável",
    );
    ok(
      (await call("localizar_codigo_estoque", [w, tag.codigo]))[0].produto_id ===
        produto,
      "leitura seleciona produto",
    );
    await call("preparar_etiqueta_estoque", [w, produto, null, "7891234567890"]);
    ok(
      (await call("localizar_codigo_estoque", [w, "7891234567890"]))[0].produto_id ===
        produto,
      "código fabricante",
    );
    await fail(() =>
      call("salvar_deposito_estoque", [
        w,
        d,
        { nome: "Veículo desativado", ativo: false },
        1,
      ]),
    );
    await login(ids.stranger);
    await fail(() => call("localizar_codigo_estoque", [w, tag.codigo]));
    await fail(() => call("consultar_depositos_estoque", [w]));
    await login(ids[perfil]);
    const serial = uuid();
    await call("salvar_produto_estoque", [
      w,
      { descricao: "Unidade transferível QA", unidade: "un", custo_centavos: 1000 },
      serial,
    ]);
    await call("configurar_planejamento_estoque", [w, serial, 1, { rastreado: true }]);
    const sp = () => call("consultar_produto_estoque", [w, serial]);
    const ent = [
      w,
      serial,
      null,
      uuid(),
      2,
      "entrada",
      2,
      "Unidades de teste",
      [{ serie: "UN-A" }, { serie: "UN-B", imei: "123456789012345" }],
    ];
    await call("movimentar_estoque_deposito", ent);
    await call("movimentar_estoque_deposito", ent);
    await fail(() =>
      call("movimentar_estoque_deposito", [...ent.slice(0, 6), 1, ...ent.slice(7)]),
    );
    let un = await call("consultar_unidades_estoque", [w, serial]),
      uid = un.itens[0].id;
    await call("transferir_estoque", [
      w,
      uuid(),
      serial,
      principal,
      d,
      1,
      (await sp()).revisao,
      [uid],
      "Identidade no veículo",
    ]);
    ok(
      (await call("consultar_unidades_deposito", [w, serial, d])).itens[0].id === uid,
      "série transferida preserva identidade",
    );
    await fail(async () =>
      call("movimentar_estoque_deposito", [
        w,
        serial,
        principal,
        uuid(),
        (await sp()).revisao,
        "saida",
        1,
        "Unidade do local errado",
        [uid],
      ]),
    );
    if (ramo === "os") {
      let os = await call("consultar_ordem_servico", [w, doc]);
      await call("adicionar_peca_estoque_os", [w, doc, serial, 1, os.revisao]);
    } else {
      let at = await call("consultar_detalhes_atendimento", [w, doc]);
      await call("salvar_itens_atendimento", [
        w,
        doc,
        at.atendimento.revisao,
        [
          {
            id: uuid(),
            tipo: "material",
            descricao: "Unidade transferível QA",
            quantidade: 1,
            unidade: "un",
            preco_centavos: 2000,
            origem: "estoque",
            produto_id: serial,
          },
        ],
        0,
        0,
        "",
      ]);
    }
    rr = await call("consultar_reservas_atendimento", [w, doc, ramo]);
    const si = rr.itens.find((x) => x.produto_id === serial);
    await fail(() =>
      call("reservar_estoque_deposito", [
        w,
        doc,
        ramo,
        si.item_id,
        1,
        rr.revisao,
        principal,
        [uid],
      ]),
    );
    await call("reservar_estoque_deposito", [
      w,
      doc,
      ramo,
      si.item_id,
      1,
      rr.revisao,
      d,
      [uid],
    ]);
    await fail(async () =>
      call("transferir_estoque", [
        w,
        uuid(),
        serial,
        d,
        principal,
        1,
        (await sp()).revisao,
        [uid],
        "Unidade já reservada",
      ]),
    );
    if (ramo === "os") {
      let os = await call("consultar_ordem_servico", [w, doc]);
      for (const i of os.itens) {
        await call("salvar_item_os", [w, doc, os.revisao, { situacao: "done" }, i.id]);
        os = await call("consultar_ordem_servico", [w, doc]);
      }
      for (const s of ["in_progress", "quality_check", "ready", "delivered"]) {
        os = await call("consultar_ordem_servico", [w, doc]);
        await call("atualizar_mapa_ordem_servico", [
          w,
          doc,
          os.revisao,
          s,
          null,
          null,
          null,
          os.recebido_em,
        ]);
      }
    } else
      for (const s of ["aprovado", "concluido"]) {
        const at = await call("consultar_detalhes_atendimento", [w, doc]);
        await call("salvar_atendimento_servico", [
          w,
          doc,
          { ...at.atendimento, situacao: s },
          at.atendimento.revisao,
        ]);
      }
    un = await call("consultar_unidades_estoque", [w, serial]);
    const usada = un.itens.find((x) => x.id === uid);
    ok(
      usada.estado === "utilizado" && usada.deposito_id === d,
      "atendimento consome série do veículo",
    );
    ok(
      (await call("consultar_depositos_estoque", [w, serial])).itens.find(
        (x) => x.id === d,
      ).saldo === 0,
      "baixa no local reservado",
    );
    if (ramo === "os")
      await call("estornar_movimentacao_estoque", [
        w,
        usada.movimento_id,
        "Conferência de retorno",
      ]);
    else {
      const at = await call("consultar_detalhes_atendimento", [w, doc]);
      await call("reabrir_atendimento_servico", [
        w,
        doc,
        at.atendimento.revisao,
        "Retorno para conferência",
      ]);
    }
    ok(
      (await call("consultar_depositos_estoque", [w, serial])).itens.find(
        (x) => x.id === d,
      ).saldo === 1,
      "reabertura restaura origem",
    );
    const fabricante = await call("preparar_etiqueta_estoque", [w, serial, uid]);
    ok(
      (await call("localizar_codigo_estoque", [w, fabricante.codigo]))[0].unidade_id ===
        uid,
      "etiqueta individual seleciona série",
    );
    const fornecedor = await call("salvar_fornecedor", [
      w,
      uuid(),
      { nome: "Fornecedor logística" },
    ]);
    await call("registrar_compra_deposito", [
      w,
      uuid(),
      fornecedor,
      r.hoje,
      r.hoje,
      "",
      "",
      [{ produto_id: produto, quantidade: 2, custo_centavos: 3000 }],
      0,
      "banco",
      "outro",
      d,
    ]);
    ok(
      (await call("consultar_depositos_estoque", [w, produto])).itens.find(
        (x) => x.id === d,
      ).saldo === (ramo === "os" ? 6 - item.quantidade + 2 : 8),
      "compra direta entra no local escolhido",
    );
    console.log(perfil, n);
  }
  console.log("OK", n, "verificações");
} catch (e) {
  console.error(e.message, e.where);
  process.exitCode = 1;
} finally {
  await db.close();
}
