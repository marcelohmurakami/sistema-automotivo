import { test } from "node:test";
import assert from "node:assert/strict";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { atualizarIntegracoes } from "../src/lib/atualizarIntegracoes.ts";
import { normalizarBuscaDocumento } from "../src/lib/buscaDocumentos.ts";
test("OS aceita número exibido e preserva clientes, placas e motores", () => {
  for (const valor of ["#0015", " # 0015 ", "0015", "15"])
    assert.equal(normalizarBuscaDocumento(valor), "15");
  for (const valor of [
    "ABC1D23",
    "João Silva",
    "AP 1.6",
    "Gol 2008",
    "#cliente",
    "99999999999999999999",
  ])
    assert.equal(normalizarBuscaDocumento(" " + valor + " "), valor);
});
test("Ficha confirmada não é consultada outra vez; demais integrações continuam atualizando", async () => {
  const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    }),
    confirmada = ["os-detalhe", false, "empresa-a", "os-1"];
  const chaves = [
    confirmada,
    ["os-detalhe", false, "empresa-a", "os-2"],
    ["os-detalhe", false, "empresa-b", "os-1"],
    ["os-detalhe", true, "empresa-a", "os-1"],
    ["os", false, "empresa-a"],
    ["financeiro-os", "empresa-a", "os-1"],
    ["mapa-oficina", "empresa-a"],
    ["fora-do-escopo"],
  ];
  let liberar;
  const espera = new Promise((ok) => (liberar = ok)),
    calls = new Map(),
    parar = [];
  for (const key of chaves) {
    qc.setQueryData(key, { revisao: 7 });
    const o = new QueryObserver(qc, {
      queryKey: key,
      staleTime: Infinity,
      queryFn: async () => {
        const k = JSON.stringify(key);
        calls.set(k, (calls.get(k) || 0) + 1);
        await espera;
        return { revisao: 8 };
      },
    });
    parar.push(o.subscribe(() => {}));
  }
  try {
    await atualizarIntegracoes(qc, [], [confirmada]);
    assert.equal(calls.get(JSON.stringify(confirmada)), undefined);
    assert.equal(qc.getQueryState(confirmada).isInvalidated, false);
    assert.equal(qc.getQueryData(confirmada).revisao, 7);
    for (const key of chaves.slice(1, -1)) {
      assert.equal(calls.get(JSON.stringify(key)), 1);
      assert.equal(qc.getQueryState(key).fetchStatus, "fetching");
    }
    assert.equal(calls.get(JSON.stringify(chaves.at(-1))), undefined);
    liberar();
    await new Promise((ok) => setTimeout(ok, 10));
    for (const key of chaves.slice(1, -1))
      assert.equal(qc.getQueryData(key).revisao, 8);
  } finally {
    liberar();
    parar.forEach((f) => f());
    qc.clear();
  }
});
