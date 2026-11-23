import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  envDir: false,
  cacheDir: "output/.vite-conta-baixa-tests",
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
});
try {
  const { FormularioBaixaFinanceira } = await server.ssrLoadModule(
    "/src/components/financeiro/FormularioBaixaFinanceira.tsx",
  );
  for (const natureza of ["receber", "pagar"]) {
    const html = renderToStaticMarkup(
      h(FormularioBaixaFinanceira, {
        titulo: { natureza, aberto_centavos: 15000, descricao: "Serviço fictício" },
        ocupado: false,
        enviarBaixa() {},
      }),
    );
    assert.match(html, /<option value="pix" selected="">Pix<\/option>/);
    assert.match(
      html,
      /<option value="banco" selected="">Banco \/ conta digital<\/option>/,
    );
    assert.doesNotMatch(html, /<option value="caixa" selected/);
    assert.match(html, /Saldo a (receber|pagar)/);
    const contas = renderToStaticMarkup(
      h(FormularioBaixaFinanceira, {
        titulo: { natureza, aberto_centavos: 15000, descricao: "Serviço fictício" },
        ocupado: false,
        enviarBaixa() {},
        contas: {
          banco: "Banco anterior",
          caixa: "Caixa",
          "conta-qa": "Conta empresarial QA",
        },
      }),
    );
    assert.match(contas, /<option value="conta-qa">Conta empresarial QA<\/option>/);
    assert.match(contas, /<option value="banco" selected="">Banco anterior<\/option>/);
  }
  console.log(
    "PASS Pix sugere banco na baixa de receitas e despesas, preservando seleção explícita da conta.",
  );
} finally {
  await server.close();
}
