import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID as uuid } from "node:crypto";
import { resolve } from "node:path";
import { criarCenarioSubsistemas } from "./subsistemas-fixture.mjs";
process.env.DB_VALIDATION_RUNTIME ||= resolve(
  "node_modules/@electric-sql/pglite/dist/index.js",
);
process.env.DB_VALIDATION_MIGRATION_LIMIT = "20261029001100";
const { db, ids, registros, login } = await criarCenarioSubsistemas();
let n = 0;
const one = async (s, a = []) => Object.values((await db.query(s, a)).rows[0])[0];
const call = (f, a) =>
  one(
    `select public.${f}(${a.map((_, i) => "$" + (i + 1)).join(",")})`,
    a.map((v) => (v && typeof v === "object" ? JSON.stringify(v) : v)),
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
    const { w, produto, hoje } = r;
    await login(ids[perfil]);
    const p = () => call("consultar_produto_estoque", [w, produto]);
    const fornecedor = await call("salvar_fornecedor", [
        w,
        uuid(),
        { nome: "Fornecedor de teste" },
      ]),
      pedido = uuid();
    await call("salvar_pedido_compra", [
      w,
      pedido,
      { fornecedor_id: fornecedor, referencia: "Compra QA" },
      [{ produto_id: produto, quantidade: 5, custo_centavos: 2000 }],
    ]);
    const receber = async (tipo, quantidade) => {
      const p = await call("consultar_pedidos_compra", [w, "", 0, pedido]);
      return call("receber_pedido_deposito", [
        w,
        pedido,
        uuid(),
        p.revisao,
        tipo,
        hoje,
        hoje,
        "",
        [{ item_id: p.itens[0].id, quantidade }],
        null,
        "Defeito na peça",
      ]);
    };
    await receber("compra", 5);
    await receber("devolucao", 3);
    let lista = await call("consultar_devolucoes_fornecedor", [w]);
    ok(lista.total === 1, "devolução automática no pedido");
    const id = lista.itens[0].id,
      det = () => call("consultar_devolucoes_fornecedor", [w, "", 0, id]);
    await call("atualizar_devolucao_fornecedor", [
      w,
      id,
      1,
      "acompanhar",
      {
        estado: "analise",
        protocolo: "RMA-123",
        prazo: hoje,
        observacoes: "Recebido pelo fornecedor",
      },
    ]);
    await fail(() =>
      call("atualizar_devolucao_fornecedor", [
        w,
        id,
        1,
        "encerrar",
        { observacoes: "Encerrar cedo" },
      ]),
    );
    await receber("reposicao", 1);
    ok((await det()).substituido === 1, "reposição parcial");
    let d = await det();
    await call("atualizar_devolucao_fornecedor", [
      w,
      id,
      d.revisao,
      "credito",
      {
        quantidade: 2,
        credito_centavos: 4000,
        observacoes: "Crédito confirmado pelo fornecedor",
      },
    ]);
    d = await det();
    ok(
      d.pendente === 0 && d.credito_centavos === 4000,
      "crédito resolve apenas pendência",
    );
    ok(
      (await call("consultar_pedidos_compra", [w, "", 0, pedido])).itens[0].pendente ===
        0,
      "pedido não espera peça já creditada",
    );
    await fail(() => receber("reposicao", 1));
    ok((await p()).saldo === 13, "crédito não aumenta estoque");
    const t = d.contas[0],
      args = [w, uuid(), id, t.id, 4000, d.revisao, "Abatimento acordado"];
    const mov = await call("aplicar_credito_fornecedor", args);
    ok((await call("aplicar_credito_fornecedor", args)) === mov, "crédito idempotente");
    d = await det();
    ok(
      d.usado_centavos === 4000 && d.contas[0].aberto_centavos === 6000,
      "conta reduzida sem caixa",
    );
    ok(
      (await one("select count(*) from public.baixas_financeiras where titulo_id=$1", [
        t.id,
      ])) === 0,
      "sem baixa bancária fictícia",
    );
    await fail(() =>
      call("aplicar_credito_fornecedor", [
        w,
        uuid(),
        id,
        t.id,
        1,
        d.revisao,
        "Crédito duplicado",
      ]),
    );
    await call("aplicar_credito_fornecedor", [
      w,
      uuid(),
      id,
      t.id,
      4000,
      d.revisao,
      "Desfazer abatimento",
      mov,
    ]);
    d = await det();
    ok(
      d.usado_centavos === 0 && d.contas[0].aberto_centavos === 10000,
      "estorno de crédito",
    );
    await call("atualizar_devolucao_fornecedor", [
      w,
      id,
      d.revisao,
      "encerrar",
      { observacoes: "Processo concluído com crédito disponível" },
    ]);
    ok((await det()).estado === "encerrado", "encerramento preserva crédito");
    // Devolução avulsa, sem inventar compra ou conta a pagar.
    const av = uuid(),
      argsAv = [
        w,
        av,
        fornecedor,
        produto,
        null,
        2,
        (await p()).revisao,
        "Material com defeito",
      ];
    await call("abrir_devolucao_fornecedor", argsAv);
    await call("abrir_devolucao_fornecedor", argsAv);
    ok((await p()).saldo === 11, "saída avulsa idempotente");
    const ar = [w, av, 1, uuid(), null, 1];
    await call("repor_devolucao_fornecedor", ar);
    await call("repor_devolucao_fornecedor", ar);
    ok((await p()).saldo === 12, "reposição avulsa idempotente");
    let ad = await call("consultar_devolucoes_fornecedor", [w, "", 0, av]);
    await call("atualizar_devolucao_fornecedor", [
      w,
      av,
      ad.revisao,
      "sem_reposicao",
      { quantidade: 1, observacoes: "Garantia negada, perda reconhecida" },
    ]);
    // Crédito integral deve zerar a conta, sem simular entrada ou saída bancária.
    const compraIntegral = uuid();
    await call("registrar_compra_deposito", [
      w,
      compraIntegral,
      fornecedor,
      hoje,
      hoje,
      "Integral QA",
      "",
      [{ produto_id: produto, quantidade: 2, custo_centavos: 2000 }],
      0,
      "banco",
      "outro",
    ]);
    let ci = await call("consultar_compra_estoque", [w, compraIntegral]);
    d = await det();
    const integral = await call("aplicar_credito_fornecedor", [
      w,
      uuid(),
      id,
      ci.titulo.id,
      4000,
      d.revisao,
      "Crédito integral confirmado",
    ]);
    ci = await call("consultar_compra_estoque", [w, compraIntegral]);
    ok(
      ci.titulo.valor_centavos === 0 &&
        ci.titulo.aberto_centavos === 0 &&
        ci.titulo.credito_fornecedor_centavos === 4000,
      "abatimento integral explícito nos detalhes",
    );
    await fail(() =>
      call("cancelar_compra_estoque", [
        w,
        compraIntegral,
        "Tentativa de apagar crédito",
      ]),
    );
    d = await det();
    await call("aplicar_credito_fornecedor", [
      w,
      uuid(),
      id,
      ci.titulo.id,
      4000,
      d.revisao,
      "Reverter para conferência",
      integral,
    ]);
    const outroFornecedor = await call("salvar_fornecedor", [
        w,
        uuid(),
        { nome: "Outro fornecedor QA" },
      ]),
      outraCompra = uuid();
    await call("registrar_compra_deposito", [
      w,
      outraCompra,
      outroFornecedor,
      hoje,
      hoje,
      "Outro QA",
      "",
      [{ produto_id: produto, quantidade: 1, custo_centavos: 2000 }],
      0,
      "banco",
      "outro",
    ]);
    const oc = await call("consultar_compra_estoque", [w, outraCompra]);
    d = await det();
    await fail(() =>
      call("aplicar_credito_fornecedor", [
        w,
        uuid(),
        id,
        oc.titulo.id,
        1000,
        d.revisao,
        "Fornecedor diferente",
      ]),
    );
    // Reposição avulsa devolve a mesma série/IMEI, sem criar identidade duplicada.
    const serial = uuid();
    await call("salvar_produto_estoque", [
      w,
      { descricao: "Unidade avulsa QA", unidade: "un", custo_centavos: 1000 },
      serial,
    ]);
    await call("configurar_planejamento_estoque", [w, serial, 1, { rastreado: true }]);
    await call("movimentar_estoque_deposito", [
      w,
      serial,
      null,
      uuid(),
      2,
      "entrada",
      1,
      "Entrada de teste",
      [{ serie: "DEV-SERIE", imei: "123456789012345" }],
    ]);
    let sp = await call("consultar_produto_estoque", [w, serial]),
      u = (await call("consultar_unidades_estoque", [w, serial])).itens[0],
      ds = uuid();
    await call("abrir_devolucao_fornecedor", [
      w,
      ds,
      fornecedor,
      serial,
      null,
      1,
      sp.revisao,
      "Defeito de fábrica",
      [u.id],
    ]);
    await call("repor_devolucao_fornecedor", [
      w,
      ds,
      1,
      uuid(),
      null,
      1,
      [{ serie: "DEV-SERIE", imei: "123456789012345" }],
    ]);
    const us = await call("consultar_unidades_estoque", [w, serial]);
    ok(
      us.itens.length === 1 &&
        us.itens[0].id === u.id &&
        us.itens[0].estado === "estoque",
      "mesma unidade retorna sem duplicação",
    );
    // Catálogo por arquivo: data, preço, disponibilidade, vínculo e pedido revisável.
    const importar = [
      w,
      uuid(),
      fornecedor,
      "catalogo-qa.csv",
      hoje,
      [
        {
          codigo: "COD-01",
          descricao: "Material de teste",
          unidade: "un",
          preco_centavos: 3500,
          aplicacao: "Aplicação específica " + perfil,
          disponibilidade: "disponivel",
          quantidade_disponivel: 8,
          prazo_dias: 2,
        },
        {
          codigo: "COD-02",
          descricao: "Outro material",
          unidade: "un",
          preco_centavos: 2300,
          disponibilidade: "sob_encomenda",
        },
      ],
    ];
    ok((await call("importar_catalogo_fornecedor", importar)) === 2, "importação");
    ok(
      (await call("importar_catalogo_fornecedor", importar)) === 2,
      "importação idempotente",
    );
    let cat = await call("consultar_catalogo_fornecedor", [w, "COD-01"]);
    let c = cat.itens[0];
    ok(
      c.aplicacao.includes(perfil) && c.preco_centavos === 3500,
      "aplicação e preço do fornecedor",
    );
    const prod = await call("vincular_catalogo_fornecedor", [w, c.id, c.revisao]);
    ok(
      (await call("consultar_produto_estoque", [w, prod])).saldo === 0,
      "cadastro sem inventar saldo",
    );
    cat = await call("consultar_catalogo_fornecedor", [w, "COD-01"]);
    c = cat.itens[0];
    const pc = uuid(),
      pedir = [
        w,
        pc,
        [{ id: c.id, revisao: c.revisao, quantidade: 2 }],
        "Pedido do catálogo",
      ];
    await call("pedir_itens_catalogo", pedir);
    await call("pedir_itens_catalogo", pedir);
    ok(
      (await call("consultar_pedidos_compra", [w, "", 0, pc])).itens[0]
        .custo_centavos === 3500,
      "pedido preserva preço",
    );
    await fail(() =>
      call("importar_catalogo_fornecedor", [
        w,
        uuid(),
        fornecedor,
        "repetido.csv",
        hoje,
        [importar[5][0], importar[5][0]],
      ]),
    );
    await fail(() =>
      call("importar_catalogo_fornecedor", [
        w,
        uuid(),
        fornecedor,
        "antigo.csv",
        "2000-01-01",
        importar[5],
      ]),
    );
    await call("importar_catalogo_fornecedor", [
      w,
      uuid(),
      fornecedor,
      "atualizado.csv",
      hoje,
      [{ ...importar[5][0], preco_centavos: 4000 }],
      true,
    ]);
    await fail(() =>
      call("pedir_itens_catalogo", [w, uuid(), pedir[2], "Preço antigo"]),
    );
    ok(
      (await call("consultar_catalogo_fornecedor", [w, "COD-02"])).itens[0]
        .disponibilidade === "indisponivel",
      "arquivo completo desativa ausentes",
    );
    await call("importar_catalogo_fornecedor", [
      w,
      uuid(),
      fornecedor,
      "unidade-alterada.csv",
      hoje,
      [{ ...importar[5][0], unidade: "l" }],
    ]);
    const unidadeAlterada = (await call("consultar_catalogo_fornecedor", [w, "COD-01"]))
      .itens[0];
    ok(unidadeAlterada.produto_id === null, "mudança de unidade exige novo vínculo");
    await fail(() =>
      call("pedir_itens_catalogo", [
        w,
        uuid(),
        [{ id: unidadeAlterada.id, revisao: unidadeAlterada.revisao, quantidade: 2 }],
        "Unidade incompatível",
      ]),
    );
    await login(ids.stranger);
    await fail(() => call("consultar_devolucoes_fornecedor", [w]));
    await fail(() => call("consultar_catalogo_fornecedor", [w]));
    console.log(perfil, n);
  }
  mkdirSync("output/logistica-estoque-20261029", { recursive: true });
  writeFileSync(
    "output/logistica-estoque-20261029/devolucoes-catalogos.json",
    JSON.stringify(
      { verificacoes: n, subsetores: Object.keys(registros), sucesso: true },
      null,
      2,
    ),
  );
  console.log("OK", n, "verificações");
} catch (e) {
  console.error(e.message, e.where);
  process.exitCode = 1;
} finally {
  await db.close();
}
