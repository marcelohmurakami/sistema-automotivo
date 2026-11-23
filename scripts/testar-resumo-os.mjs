import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  envDir: false,
  appType: "custom",
  cacheDir: "output/.vite-resumo-os-tests",
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const { ResumoOS } = await server.ssrLoadModule(
    "/src/components/ordens-servico/ResumoOS.tsx",
  );
  const item = (id, situacao = "pending", tipo = "service") => ({
    id,
    descricao: id,
    tipo,
    situacao,
    unidade: "un",
    quantidade: 2,
    preco_unitario_centavos: 1500,
  });
  const base = {
    situacao: "open",
    total_centavos: 8000,
    desconto_centavos: 1000,
    itens: [
      item("Serviço concluído", "done"),
      item("Serviço pendente"),
      item("Peça incluída", "done", "part"),
      item("Item cancelado", "cancelled"),
    ],
    paradas: [],
    diagnostico: "Diagnóstico reservado",
    observacoes_internas: "Anotação interna",
  };
  const resumo = (dados = {}, permitePagamento = true) =>
    renderToStaticMarkup(
      h(ResumoOS, {
        os: { ...base, ...dados },
        ocupado: false,
        permitePagamento,
        verSecao() {},
        editar() {},
        avancar() {},
      }),
    );
  const html = resumo();
  assert.match(html, /1 de 2 serviços concluídos/);
  assert.match(html, /A realizar/);
  assert.match(html, /Serviço concluído/);
  assert.match(html, /Peça incluída/);
  assert.doesNotMatch(html, /Item cancelado|Diagnóstico reservado|Anotação interna/);
  assert.match(html.replaceAll("\u00a0", " "), /R\$ 80,00/);
  assert.match(html, /Desconto de/);
  assert.match(html, /Iniciar serviço/);
  assert.match(html, /Ver pagamento/);
  assert.doesNotMatch(resumo({}, false), /Ver pagamento/);
  console.log(
    "PASS resumo preserva valores, distingue serviços realizados e pendentes e não expõe dados internos",
  );
  for (const situacao of ["delivered", "cancelled"])
    assert.doesNotMatch(
      resumo({ situacao }),
      /Editar OS|Iniciar serviço|Registrar entrega/,
    );
  assert.doesNotMatch(
    resumo({ arquivado_em: "2026-10-14" }),
    /Editar OS|Iniciar serviço/,
  );
  assert.doesNotMatch(
    resumo({ orcamento_aguardando_id: "pendente" }),
    /Iniciar serviço/,
  );
  const parado = resumo({ paradas: [{ encerrado_em: null }] });
  assert.match(parado, /Ver pendência/);
  assert.doesNotMatch(parado, /Iniciar serviço/);
  assert.match(resumo({ situacao: "ready" }), /Registrar entrega/);
  console.log("PASS ações respeitam OS encerrada, excluída, sem aprovação e parada");
  const muitos = resumo({
    itens: Array.from({ length: 30 }, (_, i) => item(`Serviço ${i + 1}`)),
  });
  assert.match(muitos, /Ver todos os 30 itens/);
  assert.doesNotMatch(muitos, />Serviço 7</);
  assert.match(resumo({ itens: [] }), /Nenhum serviço ou peça incluído/);
  assert.match(
    resumo({ itens: [], orcamento_aguardando_id: "pendente" }),
    /após a aprovação do orçamento/,
  );
  console.log(
    "PASS OS longa tem acesso à lista completa e estados vazios explicam o próximo passo",
  );
} finally {
  await server.close();
}
