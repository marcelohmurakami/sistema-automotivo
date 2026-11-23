import assert from "node:assert/strict";
import { createServer } from "vite";

const valores = new Map();
globalThis.localStorage = {
  getItem: (k) => valores.get(k) ?? null,
  setItem: (k, v) => valores.set(k, String(v)),
  removeItem: (k) => valores.delete(k),
};
globalThis.window = new EventTarget();
const server = await createServer({
  configFile: false,
  envDir: false,
  appType: "custom",
  cacheDir: "output/.vite-origem-pecas-tests",
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const { faltaOrigemPeca, pecasSemOrigem, validarOrigensPecas } =
    await server.ssrLoadModule("/src/lib/origemPecas.ts");
  assert.ok(
    faltaOrigemPeca({
      code: "22023",
      message:
        'Defina a origem da peça "Pastilha de regulagem FIRE" na aba Execução antes de entregar.',
    }),
  );
  assert.ok(
    faltaOrigemPeca(new Error("Defina a origem de Pastilha antes de entregar.")),
  );
  for (const e of [null, new Error("Saldo insuficiente"), { message: "OS alterada" }])
    assert.equal(faltaOrigemPeca(e), false);
  const produto = {
    id: "estoque",
    descricao: "Peça fictícia do estoque",
    unidade: "un",
    saldo: 8,
    arquivado_em: null,
    custo_centavos: 500,
    preco_padrao_centavos: 1500,
    codigo: null,
    revisao: 1,
  };
  const produtos = [
    produto,
    { ...produto, id: "zero", saldo: 0 },
    { ...produto, id: "legado", saldo: null },
  ];
  const peca = (dados = {}) => ({
    id: crypto.randomUUID(),
    tipo: "part",
    descricao: "Peça fictícia",
    unidade: "un",
    quantidade: 2,
    preco_unitario_centavos: 1500,
    situacao: "done",
    ...dados,
  });
  const pendentes = [peca(), peca({ item_catalogo_id: "legado" })];
  const itens = [
    ...pendentes,
    peca({ tipo: "service" }),
    peca({ situacao: "cancelled" }),
    peca({ origem_peca: "cliente" }),
    peca({ origem_peca: "externa" }),
    peca({ item_catalogo_id: "estoque" }),
    peca({ produto_estoque_id: "zero" }),
  ];
  assert.deepEqual(pecasSemOrigem({ itens }, produtos), pendentes);
  const i = pendentes[0],
    escolha = (e) => ({ [i.id]: e });
  assert.throws(() => validarOrigensPecas([i], {}, produtos), /Informe/);
  for (const origem of ["cliente", "externa"])
    assert.doesNotThrow(() => validarOrigensPecas([i], escolha({ origem }), produtos));
  assert.doesNotThrow(() =>
    validarOrigensPecas(
      [i],
      escolha({ origem: "estoque", produto: "estoque" }),
      produtos,
    ),
  );
  for (const id of [undefined, "legado", "inexistente"])
    assert.throws(
      () =>
        validarOrigensPecas([i], escolha({ origem: "estoque", produto: id }), produtos),
      /Selecione/,
    );
  for (const alteracao of [{ unidade: "litro" }, { arquivado_em: "2026-10-14" }])
    assert.throws(
      () =>
        validarOrigensPecas([i], escolha({ origem: "estoque", produto: "estoque" }), [
          { ...produto, ...alteracao },
        ]),
      /Selecione/,
    );
  console.log(
    "PASS identificação do erro, peças pendentes e escolhas explícitas válidas",
  );

  const s = await server.ssrLoadModule("/src/services/ordensServico.ts");
  const estoque = await server.ssrLoadModule("/src/services/estoque.ts");
  const mapa = await server.ssrLoadModule("/src/services/mapaOficina.ts");
  const oficina = "demonstracao";
  const ler = (os) => s.consultarOS(true, oficina, os.id);
  const entregar = (os) =>
    mapa.moverOSNoMapa(true, oficina, os.id, os.revisao, "avancar");
  const criar = () =>
    s.salvarOS(
      true,
      oficina,
      {
        cliente_nome_livre: "Cliente fictício — entrega",
        carro_livre: "Carro de teste",
        motor_livre: "Teste",
        servico_pronto: true,
        forma_pagamento: "Carteira",
        desconto_centavos: 0,
        itens: [peca(), peca({ situacao: "cancelled", descricao: "Peça cancelada" })],
      },
      crypto.randomUUID(),
    );
  for (const origem of ["cliente", "externa", "estoque"]) {
    localStorage.setItem(
      "patio_estoque_v1",
      JSON.stringify({ produtos, movimentos: [] }),
    );
    let os = await criar();
    assert.equal(os.situacao, "ready");
    const antes = localStorage.getItem("patio_estoque_v1"),
      total = os.total_centavos;
    await assert.rejects(entregar(os), faltaOrigemPeca);
    assert.equal((await ler(os)).situacao, "ready");
    assert.equal(localStorage.getItem("patio_estoque_v1"), antes);
    await s.operarOS(true, oficina, os, "vincular_estoque_item_os", {
      p_item: os.itens[0].id,
      p_origem: origem,
      p_produto: origem === "estoque" ? produto.id : null,
      p_revisao: os.revisao,
    });
    await assert.rejects(entregar(os), /alterad/i);
    os = await ler(os);
    assert.equal(pecasSemOrigem(os, produtos).length, 0);
    await entregar(os);
    os = await ler(os);
    assert.equal(os.situacao, "delivered");
    assert.equal(os.total_centavos, total);
    let dados = estoque.lerEstoqueDemo();
    assert.equal(dados.produtos[0].saldo, origem === "estoque" ? 6 : 8);
    assert.equal(dados.movimentos.length, origem === "estoque" ? 1 : 0);
    estoque.baixarEstoqueDemo(os, () => {});
    dados = estoque.lerEstoqueDemo();
    assert.equal(dados.produtos[0].saldo, origem === "estoque" ? 6 : 8);
    console.log(
      `PASS entrega ${origem}, revisão atualizada, valores preservados e sem baixa duplicada`,
    );
  }
  const insuficiente = {
    id: "falha",
    numero: 1,
    itens: [peca({ produto_estoque_id: "zero" })],
  };
  const antes = localStorage.getItem("patio_estoque_v1");
  assert.throws(
    () => estoque.baixarEstoqueDemo(insuficiente, () => assert.fail("Não deve salvar")),
    /Saldo insuficiente/,
  );
  assert.equal(localStorage.getItem("patio_estoque_v1"), antes);
  assert.throws(
    () =>
      estoque.baixarEstoqueDemo(
        { ...insuficiente, itens: [peca({ item_catalogo_id: "legado" })] },
        () => {},
      ),
    faltaOrigemPeca,
  );
  console.log(
    "PASS saldo insuficiente preserva estoque e peça sem controle exige origem",
  );
} finally {
  await server.close();
}
