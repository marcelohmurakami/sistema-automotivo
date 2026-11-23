import assert from "node:assert/strict";
import { randomUUID as uuid } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { criarCenarioSubsistemas } from "./subsistemas-fixture.mjs";
process.env.DB_VALIDATION_RUNTIME ||= resolve(
  "node_modules/@electric-sql/pglite/dist/index.js",
);
process.env.DB_VALIDATION_MIGRATION_LIMIT ||= "20261029001100";
const { db, ids, registros, login } = await criarCenarioSubsistemas();
const resultados = [],
  falhas = [];
const one = async (s, a = []) => Object.values((await db.query(s, a)).rows[0])[0];
const call = (f, a) =>
  one(
    `select public.${f}(${a.map((_, i) => "$" + (i + 1)).join(",")})`,
    a.map((v, i) =>
      f === "resolver_conciliacao" && i === 4
        ? "{" + v.join(",") + "}"
        : v && typeof v === "object"
          ? JSON.stringify(v)
          : v,
    ),
  );
try {
  for (const [perfil, r] of Object.entries(registros)) {
    await login(ids[perfil]);
    const { w, produto, hoje } = r,
      checks = [];
    const eq = (a, b, descricao) => {
      assert.deepEqual(a, b, perfil + ": " + descricao);
      checks.push(descricao);
    };
    const bloqueia = async (f, descricao, code = "22023") => {
      await assert.rejects(f, (e) => e.code === code, descricao);
      checks.push(descricao);
    };
    const estoque = () => call("consultar_produto_estoque", [w, produto]);
    const banco = uuid();
    await call("salvar_conta_financeira", [
      w,
      banco,
      { nome: "Banco operação integrada", tipo: "banco", ativo: true },
      null,
    ]);
    await call("registrar_saldo_inicial_conta", [w, uuid(), banco, 100000, hoje]);
    const saldo = async () =>
      (await call("consultar_contas_financeiras", [w, hoje])).find(
        (c) => c.codigo === banco,
      ).saldo;
    const deposito = await call("salvar_deposito_estoque", [
      w,
      uuid(),
      { nome: "Veículo da equipe", tipo: "veiculo" },
      null,
    ]);
    const fornecedor = await call("salvar_fornecedor", [
      w,
      uuid(),
      { nome: "Fornecedor auditoria integrada" },
    ]);
    const compra = uuid(),
      dadosCompra = [
        w,
        compra,
        fornecedor,
        hoje,
        hoje,
        "NF-INTEGRADA",
        "",
        [{ produto_id: produto, quantidade: 10, custo_centavos: 2000 }],
        0,
        banco,
        "pix",
        deposito,
      ];
    await call("registrar_compra_deposito", dadosCompra);
    await call("registrar_compra_deposito", dadosCompra);
    const consultar = () => call("consultar_compra_estoque", [w, compra]);
    let c = await consultar();
    eq(
      [
        c.total_centavos,
        c.titulo.aberto_centavos,
        await saldo(),
        (await estoque()).saldo,
      ],
      [20000, 20000, 100000, 20],
      "compra única integra saldo e conta sem pagamento",
    );
    const chave = uuid(),
      b1 = await call("baixar_titulo_financeiro", [
        w,
        c.titulo.id,
        chave,
        5000,
        0,
        hoje,
        banco,
        "pix",
        "Parcela inicial",
      ]);
    await call("baixar_titulo_financeiro", [
      w,
      c.titulo.id,
      chave,
      5000,
      0,
      hoje,
      banco,
      "pix",
      "Parcela inicial",
    ]);
    c = await consultar();
    eq(
      [c.titulo.baixado_centavos, c.titulo.aberto_centavos, await saldo()],
      [5000, 15000, 95000],
      "pagamento parcial não duplica caixa",
    );
    const dev = uuid();
    await call("abrir_devolucao_fornecedor", [
      w,
      dev,
      fornecedor,
      produto,
      deposito,
      2,
      (await estoque()).revisao,
      "Dois produtos defeituosos",
    ]);
    const devolucao = () => call("consultar_devolucoes_fornecedor", [w, "", 0, dev]);
    await call("atualizar_devolucao_fornecedor", [
      w,
      dev,
      1,
      "credito",
      {
        quantidade: 2,
        credito_centavos: 4000,
        observacoes: "Crédito pelo valor original confirmado",
      },
    ]);
    let d = await devolucao();
    const credito = await call("aplicar_credito_fornecedor", [
      w,
      uuid(),
      dev,
      c.titulo.id,
      4000,
      d.revisao,
      "Abater devolução na compra",
    ]);
    c = await consultar();
    eq(
      [
        c.total_centavos,
        c.titulo.valor_centavos,
        c.titulo.credito_fornecedor_centavos,
        c.titulo.aberto_centavos,
        await saldo(),
      ],
      [20000, 16000, 4000, 11000, 95000],
      "crédito reduz dívida sem mexer em dinheiro ou valor original",
    );
    const locais = await call("consultar_depositos_estoque", [w, produto]);
    eq(
      [
        locais.itens.reduce((s, v) => s + v.saldo, 0),
        (await estoque()).saldo,
        locais.itens.find((v) => v.id === deposito).saldo,
      ],
      [18, 18, 8],
      "devolução reduz apenas o estoque do veículo",
    );
    await bloqueia(
      () =>
        call("baixar_titulo_financeiro", [
          w,
          c.titulo.id,
          uuid(),
          11001,
          0,
          hoje,
          banco,
          "pix",
          "Acima do saldo",
        ]),
      "pagamento acima do saldo após crédito é recusado",
    );
    const b2 = await call("baixar_titulo_financeiro", [
      w,
      c.titulo.id,
      uuid(),
      11000,
      0,
      hoje,
      banco,
      "pix",
      "Quitação",
    ]);
    eq(
      [(await consultar()).titulo.aberto_centavos, await saldo()],
      [0, 84000],
      "quitação usa somente o restante após crédito",
    );
    d = await devolucao();
    await call("aplicar_credito_fornecedor", [
      w,
      uuid(),
      dev,
      c.titulo.id,
      4000,
      d.revisao,
      "Reverter crédito para conferência",
      credito,
    ]);
    eq(
      [(await consultar()).titulo.aberto_centavos, await saldo()],
      [4000, 84000],
      "reversão de crédito reabre a dívida, sem mexer no caixa",
    );
    d = await devolucao();
    await call("aplicar_credito_fornecedor", [
      w,
      uuid(),
      dev,
      c.titulo.id,
      4000,
      d.revisao,
      "Reaplicar crédito confirmado",
    ]);
    await call("importar_extrato", [
      w,
      uuid(),
      banco,
      "extrato-integrado.csv",
      [
        {
          identificador: "NF-1",
          data: hoje,
          descricao: "Parcela fornecedor",
          valor: -5000,
        },
        {
          identificador: "NF-2",
          data: hoje,
          descricao: "Quitação fornecedor",
          valor: -11000,
        },
      ],
    ]);
    const extrato = () =>
      call("consultar_conciliacao", [w, banco, hoje, hoje, "todos", 0]);
    for (const [codigo, baixa] of [
      ["NF-1", b1],
      ["NF-2", b2],
    ]) {
      const l = (await extrato()).itens.find((i) => i.identificador === codigo);
      await call("resolver_conciliacao", [
        w,
        l.id,
        l.revisao,
        "conciliado",
        [baixa],
        "",
      ]);
    }
    eq(
      (await extrato()).resumo.conciliados,
      2,
      "extrato concilia somente pagamentos reais, sem crédito fictício",
    );
    let exp = await call("exportar_movimentos_contador", [w, hoje, hoje, 0]);
    eq(
      exp.linhas
        .filter((l) => [b1, b2].includes(l.id))
        .reduce((s, l) => s + l.valor, 0),
      -16000,
      "exportação preserva valor líquido pago ao fornecedor",
    );
    const estorno = await call("estornar_baixa_financeira", [
      w,
      b2,
      hoje,
      "Pagamento retornado pelo banco",
    ]);
    eq(
      [(await consultar()).titulo.aberto_centavos, await saldo()],
      [11000, 95000],
      "estorno de pagamento reabre conta sem devolver estoque",
    );
    await call("importar_extrato", [
      w,
      uuid(),
      banco,
      "retorno-integrado.csv",
      [
        {
          identificador: "NF-RET",
          data: hoje,
          descricao: "Retorno pagamento fornecedor",
          valor: 11000,
        },
      ],
    ]);
    const ret = (await extrato()).itens.find((i) => i.identificador === "NF-RET");
    await call("resolver_conciliacao", [
      w,
      ret.id,
      ret.revisao,
      "conciliado",
      [estorno],
      "",
    ]);
    exp = await call("exportar_movimentos_contador", [w, hoje, hoje, 0]);
    eq(
      exp.linhas
        .filter((l) => [b1, b2, estorno].includes(l.id))
        .reduce((s, l) => s + l.valor, 0),
      -5000,
      "pagamento e retorno conciliados sem alterar o histórico bancário original",
    );
    await bloqueia(
      () => call("cancelar_compra_estoque", [w, compra, "Tentativa com histórico"]),
      "compra com pagamentos e devolução não pode ser apagada",
    );
    eq((await estoque()).saldo, 18, "operações financeiras não movimentam estoque");
    // O mesmo identificador com valores diferentes não pode aparentar um salvamento.
    let aceitouAlteracao = false;
    try {
      await call("registrar_compra_deposito", [
        ...dadosCompra.slice(0, 7),
        [{ produto_id: produto, quantidade: 9, custo_centavos: 2000 }],
        ...dadosCompra.slice(8),
      ]);
      aceitouAlteracao = true;
    } catch (e) {
      assert.equal(e.code, "PT409");
    }
    if (aceitouAlteracao)
      falhas.push({
        perfil,
        problema:
          "reenvio de compra com quantidade diferente foi aceito silenciosamente",
      });
    else checks.push("reenvio com dados divergentes é recusado");
    await bloqueia(
      () =>
        call("registrar_compra_deposito", [
          w,
          uuid(),
          fornecedor,
          hoje,
          hoje,
          "UN-FRACIONADA",
          "",
          [{ produto_id: produto, quantidade: 1.001, custo_centavos: 2000 }],
          0,
          banco,
          "pix",
          deposito,
        ]),
      "compra de unidade fracionada é recusada",
    );
    const litro = uuid();
    await call("salvar_produto_estoque", [
      w,
      { descricao: "Fluido teste fracionado", unidade: "l", custo_centavos: 1000 },
      litro,
    ]);
    await call("registrar_compra_deposito", [
      w,
      uuid(),
      fornecedor,
      hoje,
      hoje,
      "LITROS",
      "",
      [{ produto_id: litro, quantidade: 1.5, custo_centavos: 1000 }],
      0,
      banco,
      "pix",
      deposito,
    ]);
    eq(
      (await call("consultar_produto_estoque", [w, litro])).saldo,
      1.5,
      "produto em litros aceita quantidade fracionada",
    );
    const integral = uuid();
    await call("registrar_compra_deposito", [
      w,
      integral,
      fornecedor,
      hoje,
      hoje,
      "CREDITO-ZERO",
      "",
      [{ produto_id: produto, quantidade: 1, custo_centavos: 2000 }],
      0,
      banco,
      "pix",
      deposito,
    ]);
    let ci = await call("consultar_compra_estoque", [w, integral]);
    const di = uuid();
    await call("abrir_devolucao_fornecedor", [
      w,
      di,
      fornecedor,
      produto,
      deposito,
      1,
      (await estoque()).revisao,
      "Produto defeituoso integral",
    ]);
    await call("atualizar_devolucao_fornecedor", [
      w,
      di,
      1,
      "credito",
      { quantidade: 1, credito_centavos: 2000, observacoes: "Crédito integral" },
    ]);
    await call("aplicar_credito_fornecedor", [
      w,
      uuid(),
      di,
      ci.titulo.id,
      2000,
      2,
      "Abater valor integral",
    ]);
    ci = await call("consultar_compra_estoque", [w, integral]);
    await call("salvar_titulo_financeiro", [
      w,
      ci.titulo.id,
      { ...ci.titulo, descricao: "Compra abatida integralmente conferida" },
      ci.titulo.revisao,
    ]);
    eq(
      (await call("consultar_compra_estoque", [w, integral])).titulo.descricao,
      "Compra abatida integralmente conferida",
      "título integralmente abatido aceita edição das informações",
    );
    await bloqueia(
      () =>
        call("salvar_titulo_financeiro", [
          w,
          uuid(),
          {
            natureza: "pagar",
            categoria: "outras_despesas",
            valor_centavos: 0,
            descricao: "Valor zero manual indevido",
            competencia: hoje,
            vencimento: hoje,
          },
          null,
        ]),
      "lançamento manual continua exigindo valor positivo",
    );
    // Invariantes gerais: soma dos locais e créditos/pagamentos nunca geram saldos negativos.
    await db.exec("reset role");
    eq(
      await one(
        `select count(*)::int from public.estoque_produtos e where e.oficina_id=$1 and (e.saldo<>(select coalesce(sum(s.saldo),0) from public.saldos_deposito s where s.oficina_id=e.oficina_id and s.produto_id=e.item_catalogo_id) or e.reservado<>(select coalesce(sum(s.reservado),0) from public.saldos_deposito s where s.oficina_id=e.oficina_id and s.produto_id=e.item_catalogo_id))`,
        [w],
      ),
      0,
      "todos os produtos fecham saldo total e reservado por local",
    );
    eq(
      await one(
        "select count(*)::int from private.financeiro_saldos where oficina_id=$1 and aberto_centavos<0",
        [w],
      ),
      0,
      "nenhum título fica com saldo negativo",
    );
    resultados.push({ perfil, checks });
    console.log("PASS", perfil, checks.length);
  }
  if (falhas.length) {
    console.error("FALHAS", JSON.stringify(falhas));
    process.exitCode = 1;
  }
} catch (e) {
  console.error(e.message, e.code, e.where);
  falhas.push({ problema: e.message, code: e.code });
  process.exitCode = 1;
} finally {
  await mkdir("output/auditoria-financeiro-estoque-20261029", { recursive: true });
  await writeFile(
    "output/auditoria-financeiro-estoque-20261029/integracao.json",
    JSON.stringify({ resultados, falhas }, null, 2),
  );
  await db.close();
}
