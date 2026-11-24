import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
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
  const { AndamentoOS } = await server.ssrLoadModule(
    "/src/components/ordens-servico/AndamentoOS.tsx",
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
        permitePagamento,
        verSecao() {},
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
  assert.match(html, /Dados do atendimento/);
  assert.match(html, /Ver pagamento/);
  assert.doesNotMatch(resumo({}, false), /Ver pagamento/);
  console.log(
    "PASS resumo preserva valores, distingue serviços realizados e pendentes e não expõe dados internos",
  );
  const andamento = (dados = {}, ocupado = false) =>
    renderToStaticMarkup(
      h(
        MemoryRouter,
        null,
        h(AndamentoOS, {
          os: { ...base, ...dados },
          ocupado,
          erro: "",
          avancar() {},
          operar: async () => true,
          limparErro() {},
        }),
      ),
    );
  assert.match(andamento(), /Iniciar serviço/);
  assert.match(andamento(), /Pausar serviço/);
  assert.match(andamento({ situacao: "in_progress" }), /Conferir serviço/);
  assert.match(andamento({ situacao: "quality_check" }), /Concluir serviço/);
  for (const situacao of ["delivered", "cancelled"])
    assert.doesNotMatch(
      andamento({ situacao }),
      /Editar OS|Iniciar serviço|Registrar entrega/,
    );
  assert.doesNotMatch(
    andamento({ arquivado_em: "2026-10-14" }),
    /Editar OS|Iniciar serviço/,
  );
  assert.doesNotMatch(
    andamento({ orcamento_aguardando_id: "pendente" }),
    /Iniciar serviço|Retomar serviço|<button\b/,
  );
  const parado = andamento({
    paradas: [
      {
        id: "parada",
        motivo: "parts",
        detalhes: "Peça chega amanhã",
        encerrado_em: null,
      },
    ],
  });
  assert.match(parado, /Ver motivo da pausa/);
  assert.match(parado, /Peça chega amanhã/);
  assert.match(parado, /Retomar serviço/);
  assert.doesNotMatch(parado, /Iniciar serviço/);
  assert.match(andamento({ situacao: "ready" }), /Registrar entrega/);
  assert.doesNotMatch(andamento({ situacao: "ready" }), />Pausar serviço</);
  assert.match(andamento({}, true), /disabled/);
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
