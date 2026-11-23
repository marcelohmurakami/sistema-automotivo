// Jornada integrada pelas mesmas RPCs da aplicação, sem escrever os resultados
// financeiros/estoque diretamente. Só identidade, plano e relógio são fixtures.
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { criarBancoLocal } from "./banco-local.mjs";
import { importarTypescript } from "../../scripts/lib/importar-typescript.mjs";
const { calcularGestao } = await importarTypescript("src/lib/relatoriosGestao.ts");
const { rankingDevedores, totaisConta } = await importarTypescript(
  "src/lib/contasClientes.ts",
);
const db = await criarBancoLocal("20261013000800");
const scalar = async (sql, args = []) =>
  Object.values((await db.query(sql, args)).rows[0])[0];
const rpc = (name, ...args) =>
  scalar(
    `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")})`,
    args.map((x) => (x !== null && typeof x === "object" ? JSON.stringify(x) : x)),
  );
const login = (id, role = "authenticated") =>
  db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${id}',false);set role ${role}`,
  );
let n = 0;
const check = (name, fn) => {
  fn();
  n++;
  console.log("PASS", name);
};
try {
  const owner = randomUUID(),
    stranger = randomUUID();
  await db.query("insert into auth.users(id) values($1),($2)", [owner, stranger]);
  await login(owner);
  const w = await rpc("criar_oficina", "Jornada completa fictícia", null);
  await db.exec("reset role");
  await db.query(
    "update public.assinaturas_oficina set codigo_plano='complete' where oficina_id=$1",
    [w],
  );
  await login(owner);
  const day = await scalar(
    "select (now() at time zone 'America/Sao_Paulo')::date::text",
  );
  const client = (await rpc("salvar_cliente", w, { nome: "Ana da bancada" })).id;
  const vehicle = await rpc(
    "cadastrar_veiculo_orcamento",
    w,
    client,
    "Motor da bancada",
    null,
  );
  const product = randomUUID(),
    supplier = randomUUID(),
    purchase = randomUUID();
  await rpc(
    "salvar_produto_estoque",
    w,
    {
      descricao: "Filtro da bancada",
      unidade: "un",
      custo_centavos: 1700,
      preco_padrao_centavos: 3500,
      minimo: 5,
    },
    product,
  );
  await rpc(
    "movimentar_estoque",
    w,
    product,
    "entrada",
    20,
    "Saldo inicial conferido",
    randomUUID(),
    1,
  );
  await rpc("salvar_fornecedor", w, supplier, { nome: "Fornecedor fictício" });
  const buy = () =>
    rpc(
      "registrar_compra_estoque",
      w,
      purchase,
      supplier,
      day,
      day,
      "QA-001",
      "",
      [{ produto_id: product, quantidade: 10, custo_centavos: 2300 }],
      0,
      "banco",
      "pix",
    );
  await buy();
  await buy();
  const stock = async () =>
    (await rpc("listar_estoque", w)).itens.find(
      (p) => p.id === product || p.item_catalogo_id === product,
    );
  const purchased = await stock();
  check("compra a prazo repetida não duplica saldo nem custo médio", () => {
    assert.equal(Number(purchased.saldo), 30);
    assert.equal(purchased.custo_centavos, 1900);
  });
  assert.equal(
    (await rpc("consultar_compra_estoque", w, purchase)).titulo.aberto_centavos,
    23000,
  );

  const key = randomUUID();
  const draft = {
    cliente_id: client,
    veiculo_id: vehicle,
    desconto_centavos: 157,
    itens: [
      {
        tipo: "service",
        descricao: "Revisão completa",
        unidade: "un",
        quantidade: 1,
        preco_unitario_centavos: 12657,
      },
      {
        tipo: "part",
        descricao: "Filtro da bancada",
        unidade: "un",
        quantidade: 2,
        preco_unitario_centavos: 3500,
      },
    ],
  };
  let quote = await rpc("salvar_orcamento", w, draft, key);
  assert.equal((await rpc("salvar_orcamento", w, draft, key)).id, quote.id);
  const token = randomUUID().replaceAll("-", "").repeat(2);
  quote = await rpc(
    "emitir_orcamento",
    w,
    quote.id,
    quote.revisao,
    7,
    createHash("sha256").update(token).digest("hex"),
  );
  await login("", "anon");
  const publicQuote = await rpc("consultar_orcamento_publico", token);
  check("orçamento público mantém desconto e não expõe custo interno", () => {
    assert.equal(publicQuote.versao.total_centavos, 19500);
    assert.equal(JSON.stringify(publicQuote).includes("custo_centavos"), false);
  });
  await rpc("responder_orcamento", token, "Ana da bancada", "approved", true);
  await login(owner);
  const osId = await rpc("converter_orcamento_em_os", w, quote.id);
  assert.equal(await rpc("converter_orcamento_em_os", w, quote.id), osId);
  const order = () => rpc("consultar_ordem_servico", w, osId);
  let os = await order();
  assert.equal(os.total_centavos, 19500);
  // O aceite do orçamento não significa que o veículo já chegou à oficina.
  assert.equal(os.recebido_em, null);
  await rpc(
    "atualizar_mapa_ordem_servico",
    w,
    osId,
    os.revisao,
    os.situacao,
    null,
    null,
    null,
    new Date().toISOString(),
  );
  os = await order();
  const part = os.itens.find((i) => i.tipo === "part");
  await rpc(
    "vincular_estoque_item_os",
    w,
    osId,
    part.id,
    product,
    "estoque",
    os.revisao,
  );
  const pause = await rpc(
    "registrar_parada_os",
    w,
    osId,
    "parts",
    "Aguardando conferência das peças",
  );
  await rpc("resolver_parada_os", w, osId, pause);
  const title = await rpc("preparar_financeiro_os", w, osId);
  const report = () => rpc("consultar_relatorio_financeiro", w, day, day);
  const balance = () => rpc("consultar_financeiro_os", w, osId);
  const pay = (amount, fee, id = randomUUID()) =>
    rpc("baixar_titulo_financeiro", w, title, id, amount, fee, day, "banco", "credito");
  const paymentKey = randomUUID();
  const signal = await pay(6000, 100, paymentKey);
  assert.equal(await pay(6000, 100, paymentKey), signal);
  let finance = await report();
  check("sinal antes da entrega só movimenta caixa e deixa saldo correto", () => {
    assert.equal(finance.resumo.receitas, 0);
    assert.equal(finance.saldo_final, 5900);
  });
  assert.equal((await balance()).aberto_centavos, 13500);
  assert.equal(Number((await stock()).saldo), 30);
  for (const [amount, fee] of [
    [13501, 0],
    [100, 100],
    [100, 101],
    [100, -1],
    [0, 0],
  ]) {
    await assert.rejects(
      () => pay(amount, fee),
      (e) => e.code === "22023",
    );
    assert.equal((await balance()).aberto_centavos, 13500);
    assert.equal((await report()).saldo_final, 5900);
  }
  check("pagamentos inválidos revertem integralmente caixa e saldo devedor", () => {});

  for (const item of (await order()).itens) {
    os = await order();
    await rpc("salvar_item_os", w, osId, os.revisao, { situacao: "done" }, item.id);
  }
  for (const status of ["in_progress", "quality_check", "ready", "delivered"]) {
    os = await order();
    await rpc(
      "atualizar_mapa_ordem_servico",
      w,
      osId,
      os.revisao,
      status,
      null,
      null,
      null,
      os.recebido_em,
    );
  }
  await assert.rejects(() =>
    rpc(
      "atualizar_mapa_ordem_servico",
      w,
      osId,
      os.revisao,
      "delivered",
      null,
      null,
      null,
      os.recebido_em,
    ),
  );
  finance = await report();
  check("entrega reconhece a receita, baixa as peças e mantém o sinal", () => {
    assert.equal(finance.resumo.receitas, 19500);
    assert.equal(finance.resumo.pecas, 3800);
    assert.equal(finance.resumo.taxas, 100);
    assert.equal(finance.resumo.despesas, 0); // compra de estoque não é consumo
  });
  assert.equal(Number((await stock()).saldo), 28);
  assert.equal((await balance()).id, title);
  assert.equal((await balance()).aberto_centavos, 13500);
  const debt = rankingDevedores(await rpc("consultar_contas_clientes", w));
  check("ranking e conta para envio usam saldo descontando o que já foi pago", () => {
    assert.equal(debt.length, 1);
    assert.equal(debt[0].aberto, 13500);
    assert.deepEqual(totaisConta(debt[0].ordens), {
      total: 19500,
      pago: 6000,
      aberto: 13500,
      vencido: 0,
    });
  });
  const second = await pay(13500, 0);
  assert.equal(rankingDevedores(await rpc("consultar_contas_clientes", w)).length, 0);
  const reversal = await rpc(
    "estornar_baixa_financeira",
    w,
    second,
    day,
    "Forma de pagamento incorreta",
  );
  assert.equal(
    await rpc(
      "estornar_baixa_financeira",
      w,
      second,
      day,
      "Forma de pagamento incorreta",
    ),
    reversal,
  );
  assert.equal((await balance()).aberto_centavos, 13500);
  await pay(13500, 405);
  const expense = randomUUID();
  await rpc("salvar_titulo_financeiro", w, expense, {
    natureza: "pagar",
    categoria: "terceiros",
    descricao: "Frete da bancada",
    valor_centavos: 500,
    competencia: day,
    vencimento: day,
  });
  await rpc(
    "baixar_titulo_financeiro",
    w,
    expense,
    randomUUID(),
    500,
    0,
    day,
    "banco",
    "pix",
  );
  finance = await report();
  check("estorno e nova quitação conciliam receita, custos, taxas e caixa", () => {
    assert.equal(finance.resumo.receitas, 19500);
    assert.equal(finance.resumo.pecas, 3800);
    assert.equal(finance.resumo.taxas, 505);
    assert.equal(finance.resumo.despesas, 500);
    assert.equal(finance.saldo_final, 18495);
    assert.equal(
      finance.serie.reduce((s, d) => s + d.receitas - d.custos, 0),
      14695,
    );
    assert.equal(
      finance.saldo_inicial + finance.resumo.entradas - finance.resumo.saidas,
      finance.saldo_final,
    );
  });
  await rpc("salvar_complemento_gestao", w, "os", osId, { custos_conferidos: true }, 0);
  const qualityId = randomUUID();
  await rpc("salvar_ocorrencia_qualidade", w, qualityId, {
    ordem_original_id: osId,
    motivo: "execucao",
    descricao: "Vazamento identificado na entrega",
    horas_retrabalho: 0.5,
    custo_hora_centavos: 4000,
    houve_retrabalho: true,
    reclamacao: true,
  });
  await rpc(
    "salvar_ocorrencia_qualidade",
    w,
    qualityId,
    {
      situacao: "resolvida",
      solucao: "Ajuste realizado e conferido",
      nota_cliente: 5,
      custos_conferidos: true,
    },
    1,
  );
  const management = calcularGestao(
    await rpc("consultar_relatorios_gestao", w, day, day),
    day,
    day,
  );
  check("relatórios de gestão conciliam venda, consumo, compra e garantia", () => {
    assert.equal(management.resumoFinanceiro.receita, 19500);
    assert.equal(management.servicos[0].receita + management.pecas[0].receita, 19500);
    assert.equal(management.pecas[0].custo, 3800);
    assert.equal(management.qualidadeResumo.custo, 2000);
    assert.equal(management.qualidadeResumo.retrabalhos, 1);
    assert.equal(management.qualidadeResumo.nota, 5);
    assert.equal(management.clientes[0].garantia, 2000);
    assert.equal(management.compras[0].total, 23000);
    assert.equal(management.produtos[0].saldo, 28);
    assert.equal(management.produtos[0].reservado, 0);
  });
  await login(stranger);
  for (const [name, args] of [
    ["consultar_ordem_servico", [w, osId]],
    ["consultar_contas_clientes", [w]],
    ["consultar_relatorio_financeiro", [w, day, day]],
    ["consultar_relatorios_gestao", [w, day, day]],
  ])
    await assert.rejects(
      () => rpc(name, ...args),
      (e) => e.code === "42501",
    );
  check(
    "outra oficina não consegue consultar nenhum resultado desta jornada",
    () => {},
  );
  console.log(
    `${n} etapas integradas aprovadas: orçamento público → estoque → OS → caixa → conta do cliente → qualidade → relatórios.`,
  );
} catch (e) {
  console.error("FAIL", e.message, e.code || "", e.where || "");
  process.exitCode = 1;
} finally {
  await db.close();
}
