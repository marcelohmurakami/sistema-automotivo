import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createServer } from "vite";
import {
  colunasAssistencia,
  acaoCartaoAssistencia,
  avancarAssistencia,
  etapaPainelAssistencia,
  pararAssistencia,
  motivosParadaAssistencia,
} from "../src/lib/fluxoAssistencia.ts";
import { novaFichaEspecialidade } from "../src/lib/perfisAtendimento.ts";
import { lerCatalogoDemo, salvarCatalogoDemo } from "../src/lib/catalogo.ts";

const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const memoria = new Map();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k) => memoria.get(k) || null,
    setItem: (k, v) => memoria.set(k, v),
    removeItem: (k) => memoria.delete(k),
  },
});
const server = await createServer({
  configFile: false,
  envDir: false,
  cacheDir: "output/.vite-painel-agrupado-tests",
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
});
try {
  assert.equal(colunasAssistencia.length, 5);
  assert.ok(!colunasAssistencia.some((c) => c.id === "aprovacao"));
  const aprovadoPendente = {
    id: "aprovacao",
    numero: 1,
    cliente_id: "c",
    objeto_id: "o",
    titulo: "Troca de tela",
    valor_centavos: 30000,
    data_servico: "2026-10-21",
    situacao: "orcamento",
    dados: { documento: "orcamento", orcamento_enviado: "sim" },
    ficha_especialidade: novaFichaEspecialidade("assistencia_celulares"),
  };
  const parado = {
    ...aprovadoPendente,
    id: "parado",
    numero: 2,
    situacao: "aguardando",
    ficha_especialidade: {
      ...aprovadoPendente.ficha_especialidade,
      campos: { pendencia: "Aguardando display" },
    },
  };
  for (const especialidade of [
    "assistencia_celulares",
    "assistencia_informatica",
    "assistencia_eletrodomesticos",
    "assistencia_eletronica",
    "assistencia_geral",
  ]) {
    for (const motivo of motivosParadaAssistencia) {
      const recebido = {
        ...aprovadoPendente,
        dados: { documento: "ordem", orcamento_enviado: "nao" },
        ficha_especialidade: novaFichaEspecialidade(especialidade),
      };
      const pausado = pararAssistencia(recebido, especialidade, motivo);
      assert.equal(
        pausado.situacao,
        "orcamento",
        "Parar não pode aprovar um orçamento",
      );
      assert.equal(etapaPainelAssistencia(pausado), "aprovacao");
      assert.equal(pausado.ficha_especialidade.campos.pendencia, motivo);
      assert.equal(acaoCartaoAssistencia(pausado), "Registrar autorização");
      const aprovado = avancarAssistencia(pausado, especialidade);
      assert.equal(aprovado.situacao, "aprovado");
      assert.equal(avancarAssistencia(aprovado, especialidade).situacao, "em_execucao");
      assert.equal(
        recebido.dados.orcamento_enviado,
        "nao",
        "Não altera o registro original",
      );
    }
  }
  assert.throws(() =>
    pararAssistencia(
      { ...parado, situacao: "concluido" },
      "assistencia_celulares",
      "Peças",
    ),
  );
  assert.throws(() => pararAssistencia(aprovadoPendente, "assistencia_celulares", " "));
  assert.equal(acaoCartaoAssistencia(aprovadoPendente), "Aprovar e abrir OS");
  assert.equal(
    avancarAssistencia(aprovadoPendente, "assistencia_celulares").situacao,
    "aprovado",
    "Aprovar não inicia o reparo automaticamente",
  );
  assert.equal(acaoCartaoAssistencia(parado), "Retomar serviço");
  assert.equal(
    etapaPainelAssistencia(avancarAssistencia(parado, "assistencia_celulares")),
    "producao",
  );
  const { ContextoAcesso } = await server.ssrLoadModule("/src/auth/contexto.ts");
  const { PainelAssistencia } = await server.ssrLoadModule(
    "/src/components/servicos/PainelAssistencia.tsx",
  );
  const cache = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  const acesso = {
    demo: true,
    usuario: "qa",
    oficina: {
      id: "qa",
      ramo: "assistencia_tecnica",
      especialidade: "assistencia_celulares",
    },
    permite: () => true,
  };
  for (const fluxo of [...colunasAssistencia.map((c) => c.id), "aprovacao"]) {
    const pagina = {
      atendimentos:
        fluxo === "aprovacao"
          ? [aprovadoPendente]
          : fluxo === "parados"
            ? [parado]
            : [],
      clientes: [{ id: "c", nome: "Cliente fictício" }],
      objetos: [{ id: "o", nome: "Samsung A54" }],
      proximo: fluxo === "aprovacao" ? { id: "proximo" } : null,
    };
    cache.setQueryData(["servicos", "qa", true, "quadro", fluxo, ""], {
      pages: [pagina],
      pageParams: [null],
    });
  }
  const html = renderToStaticMarkup(
    h(
      QueryClientProvider,
      { client: cache },
      h(
        ContextoAcesso.Provider,
        { value: acesso },
        h(PainelAssistencia, { abrir() {} }),
      ),
    ),
  );
  assert.equal(
    (html.match(/<article /g) || []).length,
    2,
    "As duas consultas alimentam a mesma coluna sem perder cards",
  );
  assert.match(
    html,
    /<h2>Parados<\/h2>[\s\S]*?2\+[\s\S]*?Aguardando display[\s\S]*?Aguardando aprovação do cliente/,
  );
  assert.match(html, /Aprovar e abrir OS/);
  assert.match(html, /Retomar serviço/);
  assert.match(
    html,
    /Carregar mais/,
    "Paginação continua disponível quando a consulta de aprovação tem outras páginas",
  );
  assert.doesNotMatch(html, /<h2>Aguardando aprovação<\/h2>/);
  cache.clear();
  for (const ramo of ["assistencia_tecnica", "manutencao_campo", "limpeza"]) {
    const itens = lerCatalogoDemo(`demo-${ramo}`);
    assert.equal(itens.length, 2);
    assert.ok(
      itens.every((i) => !/óleo|alinhamento|virabrequim/i.test(i.descricao)),
      `${ramo}: catálogo de demonstração sem exemplos automotivos`,
    );
  }
  const item = lerCatalogoDemo("demo-manutencao_campo")[0];
  salvarCatalogoDemo(
    { ...item, descricao: "Manutenção personalizada" },
    false,
    "demo-manutencao_campo",
  );
  assert.ok(
    lerCatalogoDemo("demo-manutencao_campo").some(
      (i) => i.descricao === "Manutenção personalizada",
    ),
  );
  assert.ok(
    !lerCatalogoDemo("demo-limpeza").some(
      (i) => i.descricao === "Manutenção personalizada",
    ),
  );
  assert.ok(
    lerCatalogoDemo().some((i) => i.id === "alinhamento"),
    "Catálogo automotivo preservado",
  );
  console.log(
    "PASS cinco colunas, aprovação e parada agrupadas com ações distintas, paginação preservada e exemplos isolados nos três ramos não automotivos.",
  );
} finally {
  await server.close();
  if (original) Object.defineProperty(globalThis, "localStorage", original);
  else delete globalThis.localStorage;
}
