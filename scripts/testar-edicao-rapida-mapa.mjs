import assert from "node:assert/strict";
import { createServer } from "vite";
const memoria = new Map();
const anterior = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
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
  cacheDir: "output/.vite-atalhos-mapa-tests",
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
});
try {
  const {
    consultarEdicaoRapidaMapa,
    salvarEdicaoRapidaMapa,
    dadosAlteracaoRapidaMapa,
    camposPreservadosMapa,
  } = await server.ssrLoadModule("/src/services/edicaoRapidaMapa.ts");
  const { entregaDoCampo } = await server.ssrLoadModule("/src/lib/entregaPrometida.ts");
  const base = {
    id: "qa-atalhos",
    numero: 1,
    revisao: 1,
    situacao: "ready",
    cliente_id: "qa-cliente",
    veiculo_id: "qa-veiculo",
    dados_cliente: { nome: "QA" },
    dados_veiculo: { modelo: "QA", motor: "Teste" },
    tipo_servico: "cabecote",
    entrega_prevista_em: "2026-12-01T15:00:00.000Z",
    queixa_cliente: "Queixa preservada",
    diagnostico: "Diagnóstico preservado",
    observacoes_internas: "Observações preservadas",
    resumo_cliente: "Resumo preservado",
    responsavel: "Técnico QA",
    prioridade: "normal",
    quilometragem_entrada: 100,
    quilometragem_saida: 102,
    combustivel_percentual: 50,
    pertences: "Chave",
    condicoes_garantia: "Condições preservadas",
    garantia_ate: "2027-01-01",
    checklist: { conferido: true },
    itens: [
      {
        id: "item",
        descricao: "Serviço",
        quantidade: 1,
        preco_unitario_centavos: 15000,
        situacao: "done",
      },
    ],
    total_centavos: 14000,
    subtotal_centavos: 15000,
    desconto_centavos: 1000,
    mostrar_desconto_nota: true,
    fotos: [{ id: "foto", caminho: "qa.jpg" }],
    paradas: [],
    historico: [],
    forma_pagamento: "Pix",
    vencimento_pagamento: "2026-12-27",
    data_servico: "2026-11-27",
    recebido_em: "2026-11-27T12:00:00.000Z",
  };
  localStorage.setItem("patio_os_v1", JSON.stringify([base]));
  const foto = await consultarEdicaoRapidaMapa(true, "demo", base.id);
  const payload = dadosAlteracaoRapidaMapa(foto, { campo: "tipo", valor: "bloco" });
  for (const campo of camposPreservadosMapa)
    assert.deepEqual(payload[campo], base[campo], campo + " preservado no pedido");
  assert.equal(payload.itens, undefined, "Atalho não regrava itens");
  assert.equal(payload.desconto_centavos, undefined, "Atalho não regrava preços");
  const icone = await salvarEdicaoRapidaMapa(true, "demo", foto, {
    campo: "tipo",
    valor: "bloco",
  });
  assert.equal(icone.tipo_servico, "bloco");
  assert.equal(icone.situacao, "ready");
  for (const campo of [
    ...camposPreservadosMapa,
    "itens",
    "fotos",
    "total_centavos",
    "desconto_centavos",
    "mostrar_desconto_nota",
    "dados_cliente",
    "dados_veiculo",
  ])
    assert.deepEqual(
      icone[campo],
      base[campo],
      campo + " preservado após trocar ícone",
    );
  await assert.rejects(
    () => salvarEdicaoRapidaMapa(true, "demo", foto, { campo: "entrega", valor: null }),
    /alterada/,
    "Conflito impede sobrescrever edição simultânea",
  );
  const prazo = entregaDoCampo("2026-12-02T16:30");
  assert.equal(prazo, "2026-12-02T19:30:00.000Z");
  const entrega = await salvarEdicaoRapidaMapa(true, "demo", icone, {
    campo: "entrega",
    valor: prazo,
  });
  assert.equal(entrega.entrega_prevista_em, prazo);
  assert.equal(entrega.tipo_servico, "bloco");
  assert.equal(entrega.total_centavos, 14000);
  const semPrazo = await salvarEdicaoRapidaMapa(true, "demo", entrega, {
    campo: "entrega",
    valor: null,
  });
  assert.equal(semPrazo.entrega_prevista_em, null);
  const semIcone = await salvarEdicaoRapidaMapa(true, "demo", semPrazo, {
    campo: "tipo",
    valor: "",
  });
  assert.equal(semIcone.tipo_servico, "");
  assert.equal(semIcone.total_centavos, 14000);
  for (const situacao of ["delivered", "cancelled"]) {
    localStorage.setItem("patio_os_v1", JSON.stringify([{ ...semIcone, situacao }]));
    await assert.rejects(
      () =>
        salvarEdicaoRapidaMapa(
          true,
          "demo",
          { ...semIcone, situacao },
          { campo: "tipo", valor: "cabecote" },
        ),
      /encerrada/,
    );
  }
  console.log(
    "PASS: troca e remoção de ícone; prazo, fuso e remoção; dados, fotos, itens, valores e etapa preservados; revisão concorrente e OS encerrada protegidas.",
  );
} finally {
  await server.close();
  if (anterior) Object.defineProperty(globalThis, "localStorage", anterior);
  else delete globalThis.localStorage;
}
