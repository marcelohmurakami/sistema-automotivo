import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { cssRenderizacaoTeste } from "./css-renderizacao-teste.mjs";
import { quantidadeItemValida } from "../src/lib/quantidadeItem.ts";

for (const n of [1, 2, 99999, 100000]) assert.equal(quantidadeItemValida(n), true);
for (const n of [0, -1, 0.001, 1.001, 1.5, 100001, NaN, Infinity])
  assert.equal(quantidadeItemValida(n), false);

const server = await createServer({
  configFile: false,
  // Esta suíte confere HTML e regras dos controles. O CSS é validado pelo build
  // e pela inspeção visual; evitar sua transformação reduz o custo do SSR local.
  plugins: [cssRenderizacaoTeste()],
  envDir: false,
  cacheDir: "output/.vite-campos-atendimento-tests",
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
});
try {
  const { CamposPagamentoAtendimento } = await server.ssrLoadModule(
    "/src/components/CamposAtendimento.tsx",
  );
  const pagamento = (forma_pagamento, vencimento_pagamento = "2026-11-14") =>
    renderToStaticMarkup(
      h(CamposPagamentoAtendimento, {
        inicial: { forma_pagamento, vencimento_pagamento },
      }),
    );
  const carteira = pagamento("Carteira");
  assert.match(carteira, /Vencimento do pagamento/);
  const campoData = carteira
    .match(/<input[^>]+>/g)
    .find((tag) => tag.includes('name="vencimento_pagamento"'));
  for (const atributo of ['type="date"', 'required=""', 'value="2026-11-14"'])
    assert.ok(campoData.includes(atributo));
  const automatico = pagamento("Carteira", null);
  assert.match(automatico, /Um mês após a conclusão do serviço/);
  assert.doesNotMatch(automatico, /type="date"/);
  for (const forma of [
    "Pix",
    "Cartão de débito",
    "Cartão de crédito",
    "Crédito parcelado",
    "Cheque",
    "Dinheiro",
  ]) {
    const html = pagamento(forma);
    assert.doesNotMatch(html, /Vencimento do pagamento|Data de vencimento|type="date"/);
    assert.match(html, /type="hidden" name="vencimento_pagamento" value=""/);
  }
  const { QuantidadeItem } = await server.ssrLoadModule(
    "/src/components/QuantidadeItem.tsx",
  );
  const quantidade = (n, desabilitado = false) =>
    renderToStaticMarkup(
      h(QuantidadeItem, {
        quantidade: n,
        descricao: "Retífica de cabeçote",
        desabilitado,
        alterar: () => {},
      }),
    );
  const minima = quantidade(1);
  assert.match(
    minima,
    /type="number"[^>]+inputMode="numeric"[^>]+min="1"[^>]+max="100000"[^>]+step="1"/,
  );
  assert.match(
    minima,
    /aria-label="Diminuir quantidade de Retífica de cabeçote" disabled=""/,
  );
  assert.doesNotMatch(
    minima,
    /aria-label="Aumentar quantidade de Retífica de cabeçote" disabled/,
  );
  assert.match(
    quantidade(100000),
    /aria-label="Aumentar quantidade de Retífica de cabeçote" disabled=""/,
  );
  assert.equal((quantidade(2, true).match(/disabled=""/g) || []).length, 3);
  console.log(
    "PASS vencimento só em Carteira, campos ocultos sem data residual, quantidade inteira e limites dos controles",
  );
} finally {
  await server.close();
}
