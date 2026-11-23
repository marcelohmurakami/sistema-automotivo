import assert from "node:assert/strict";
import { createServer } from "vite";

const anterior = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const memoria = new Map();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k) => memoria.get(k) ?? null,
    setItem: (k, v) => memoria.set(k, v),
    removeItem: (k) => memoria.delete(k),
  },
});
const server = await createServer({
  configFile: false,
  envDir: false,
  cacheDir: "output/.vite-pagamento-retirada-tests",
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
});
try {
  const { prepararPagamentoAtendimento } = await server.ssrLoadModule(
    "/src/services/pagamentoAtendimento.ts",
  );
  const { lerServicosDemo } = await server.ssrLoadModule("/src/services/servicos.ts");
  const { baixarTitulo, salvarTitulo, historicoFinanceiro, hoje } =
    await server.ssrLoadModule("/src/services/financeiro.ts");
  for (const ramo of ["assistencia_tecnica", "manutencao_campo", "limpeza"]) {
    const oficina = `demo-${ramo}`;
    const painel = lerServicosDemo(oficina);
    const ordem = painel.atendimentos[0];
    ordem.situacao = "concluido";
    ordem.valor_centavos = 30000;
    localStorage.setItem(`patio_servicos:${oficina}`, JSON.stringify(painel));
    let dados = await prepararPagamentoAtendimento(true, oficina, ordem.id);
    const id = dados.titulo.id;
    assert.equal(dados.titulo.aberto_centavos, 30000);
    assert.equal(
      dados.titulo.baixado_centavos,
      0,
      "Preparar a retirada nunca registra dinheiro recebido",
    );
    assert.equal(
      (await prepararPagamentoAtendimento(true, oficina, ordem.id)).titulo.id,
      id,
      "Reabrir reutiliza a cobrança",
    );
    await salvarTitulo(true, oficina, {
      ...dados.titulo,
      vencimento: "2099-12-01",
      pagamento_combinado: true,
    });
    dados = await prepararPagamentoAtendimento(true, oficina, ordem.id);
    assert.equal(
      dados.titulo.vencimento,
      "2099-12-01",
      "Preserva o vencimento combinado",
    );
    const parcial = {
      chave: `${ramo}-parcial`,
      valor_centavos: 10000,
      taxa_centavos: 0,
      data: hoje(),
      conta: "caixa",
      forma: "pix",
      observacao: "Teste isolado",
      vencimento_restante: "2099-12-02",
    };
    await baixarTitulo(true, oficina, dados.titulo, parcial);
    await baixarTitulo(true, oficina, dados.titulo, parcial);
    dados = await prepararPagamentoAtendimento(true, oficina, ordem.id);
    assert.equal(
      dados.titulo.baixado_centavos,
      10000,
      "Repetição não duplica pagamento",
    );
    assert.equal(dados.titulo.aberto_centavos, 20000);
    assert.equal(dados.titulo.vencimento, "2099-12-02");
    await assert.rejects(
      () =>
        baixarTitulo(true, oficina, dados.titulo, {
          ...parcial,
          chave: `${ramo}-excedente`,
          valor_centavos: 21000,
        }),
      /Confira/,
    );
    await baixarTitulo(true, oficina, dados.titulo, {
      ...parcial,
      chave: `${ramo}-restante`,
      valor_centavos: 20000,
      vencimento_restante: undefined,
    });
    dados = await prepararPagamentoAtendimento(true, oficina, ordem.id);
    assert.equal(dados.titulo.aberto_centavos, 0);
    assert.equal(dados.titulo.id, id);
    assert.equal((await historicoFinanceiro(true, oficina, id)).length, 2);
    for (const [situacao, valor] of [
      ["concluido", 0],
      ["cancelado", 10000],
      ["orcamento", 10000],
    ]) {
      const atual = lerServicosDemo(oficina);
      atual.atendimentos.push({
        ...ordem,
        id: `${situacao}-${valor}`,
        situacao,
        valor_centavos: valor,
      });
      localStorage.setItem(`patio_servicos:${oficina}`, JSON.stringify(atual));
      assert.equal(
        (await prepararPagamentoAtendimento(true, oficina, `${situacao}-${valor}`))
          .titulo,
        null,
      );
      assert.equal(
        lerServicosDemo(oficina).cobrancas.length,
        1,
        "Não fatura serviço gratuito, cancelado ou sem aprovação",
      );
    }
  }
  console.log(
    "PASS retirada nos 3 ramos: conta única, sem baixa automática, vencimento, parcial, quitação, repetição, valor excessivo, gratuito, cancelado e orçamento.",
  );
} finally {
  await server.close();
  if (anterior) Object.defineProperty(globalThis, "localStorage", anterior);
  else delete globalThis.localStorage;
}
