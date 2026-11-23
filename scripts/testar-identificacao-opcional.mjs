import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";
import { cssRenderizacaoTeste } from "./css-renderizacao-teste.mjs";
import { especialidades } from "../src/lib/especialidades.ts";
import {
  novaFichaEspecialidade,
  perfilAtendimento,
} from "../src/lib/perfisAtendimento.ts";
import { campoTecnicoVisivel } from "../src/lib/camposFicha.ts";

// Renderiza os formulários completos: testar só RecepcaoEspecializada não detecta
// quando o chamador coloca seus campos fora da seção recolhida.
const storageOriginal = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: { getItem: () => null, setItem() {}, removeItem() {} },
});
const server = await createServer({
  configFile: false,
  plugins: [cssRenderizacaoTeste()],
  envDir: false,
  cacheDir: "output/.vite-identificacao-tests",
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
});

// O HTML é gerado pelo React. Guardar a pilha de <details> permite conferir
// a ascendência real de cada controle, inclusive em seções aninhadas.
function analisar(html) {
  const secoes = [],
    controles = [],
    pilha = [];
  for (const m of html.matchAll(/<(\/?)(details|input|textarea|select)\b[^>]*>/g)) {
    const [, fecha, tag] = m;
    if (tag === "details") {
      if (fecha) pilha.pop();
      else {
        const secao = {
          aberta: /\sopen(?:\s|=|>)/.test(m[0]),
          visual:
            /^\s*<summary>Identificação visual do serviço \(opcional\)<\/summary>/.test(
              html.slice(m.index + m[0].length),
            ),
        };
        secoes.push(secao);
        pilha.push(secao);
      }
    } else if (!fecha) {
      controles.push({
        tag: m[0],
        id: /\bid="([^"]+)"/.exec(m[0])?.[1],
        secoes: [...pilha],
        conteudo:
          tag === "input"
            ? m[0]
            : html.slice(m.index, html.indexOf(`</${tag}>`, m.index)),
      });
    }
  }
  return { secoes, controles };
}

try {
  const { ContextoAcesso } = await server.ssrLoadModule("/src/auth/contexto.ts");
  const { FormularioOS } = await server.ssrLoadModule(
    "/src/components/ordens-servico/FormularioOS.tsx",
  );
  const { EditorOrcamento } = await server.ssrLoadModule(
    "/src/components/orcamentos/EditorOrcamento.tsx",
  );
  const { FormularioServico } = await server.ssrLoadModule(
    "/src/components/servicos/FormularioServico.tsx",
  );
  const aux = { clientes: [], veiculos: [], vinculos: [], catalogo: [] };
  const dados = {
    objetos: [],
    recursos: [],
    atendimentos: [],
    agenda: [],
    cobrancas: [],
  };
  let formularios = 0,
    camposConferidos = 0;

  for (const [especialidade, { ramo }] of Object.entries(especialidades)) {
    const perfil = perfilAtendimento(especialidade);
    for (const editando of [false, true]) {
      const ficha = novaFichaEspecialidade(especialidade);
      const campos = perfil.grupos.flatMap((g) => g.campos);
      if (editando) {
        for (const c of campos) {
          ficha.campos[c.id] =
            c.tipo === "numero"
              ? "5"
              : c.tipo === "data"
                ? "2026-10-21"
                : c.opcoes?.[0] || "Registro preservado";
        }
      }
      const base = {
        id: "teste",
        data_servico: "2026-10-21",
        cliente_id: "cliente-teste",
        veiculo_id: "veiculo-teste",
        dados_cliente: { nome: "Cliente de teste" },
        dados_veiculo: { modelo: "Bem de teste" },
        itens: [],
        checklist: {},
        desconto_centavos: 0,
        ficha_especialidade: ficha,
        observacoes: "",
        condicoes: "",
        revisao: 1,
      };
      const comum = { ocupado: false, erro: "", salvar() {}, cancelar() {} };
      const variacoes =
        ramo === "automotivo"
          ? [
              [
                "OS",
                FormularioOS,
                { ...comum, aux, anterior: editando ? base : undefined },
              ],
              [
                "orçamento",
                EditorOrcamento,
                {
                  ...comum,
                  aux,
                  anterior: editando ? { ...base, versao: base } : undefined,
                },
              ],
            ]
          : ["ordem", "orcamento"].map((documento) => [
              documento,
              FormularioServico,
              {
                ...comum,
                ramo,
                dados,
                editor: {
                  tipo: "atendimento",
                  item: {
                    id: "teste",
                    cliente_id: "",
                    objeto_id: "",
                    titulo: "Atendimento de teste",
                    situacao: "orcamento",
                    valor_centavos: 0,
                    vencimento: "",
                    revisao: editando ? 1 : 0,
                    dados: { documento },
                    ficha_especialidade: ficha,
                  },
                },
              },
            ]);

      for (const [nome, Componente, props] of variacoes) {
        const contexto = `${especialidade}: ${nome} ${editando ? "existente" : "novo"}`;
        const cache = new QueryClient({
          defaultOptions: { queries: { retry: false, enabled: false } },
        });
        const acesso = {
          demo: true,
          usuario: "teste",
          permite: () => true,
          oficina: {
            id: "empresa-teste",
            ramo,
            especialidade,
            perfil: "owner",
            codigo_plano: "complete",
          },
        };
        let html;
        try {
          html = renderToStaticMarkup(
            h(
              QueryClientProvider,
              { client: cache },
              h(
                ContextoAcesso.Provider,
                { value: acesso },
                h(MemoryRouter, null, h(Componente, props)),
              ),
            ),
          );
        } finally {
          cache.clear();
        }
        const { secoes, controles } = analisar(html);
        const inicioOpcionais = html.search(
          ramo === "automotivo"
            ? /class="[^"]*\bformulario-opcionais\b[^"]*"/
            : /class="[^"]*\bservicos-opcionais\b[^"]*"/,
        );
        assert.ok(inicioOpcionais > 0, `${contexto}: bloco de opcionais agrupado`);
        const itensIndex = html.indexOf('class="os-editor-itens"');
        if (itensIndex >= 0)
          assert.ok(
            itensIndex < inicioOpcionais,
            `${contexto}: serviços e valores antes dos opcionais`,
          );
        const prontoIndex = html.indexOf('class="os-pronta-criacao"');
        if (prontoIndex >= 0)
          assert.ok(
            prontoIndex < inicioOpcionais,
            `${contexto}: decisão de conclusão antes dos opcionais`,
          );
        const fimOpcionais = html.lastIndexOf("</details>");
        assert.doesNotMatch(
          html.slice(fimOpcionais + 10),
          /<(?:input|select|textarea)\b/,
          `${contexto}: nenhum campo solto depois dos opcionais`,
        );
        if (ramo !== "automotivo") {
          assert.match(
            html,
            /aria-label="Fotos do atendimento"/,
            `${contexto}: fotos visíveis no formulário`,
          );
          assert.match(
            html,
            /value="fotos"[^>]*>Salvar e adicionar fotos<\/button>/,
            `${contexto}: salvar direto na galeria`,
          );
          assert.ok(
            html.indexOf('aria-label="Fotos do atendimento"') <
              inicioOpcionais,
            `${contexto}: fotos fora das seções recolhidas`,
          );
          assert.match(
            html,
            /Ficha técnica · [^<]*\(opcional\)<\/span>/,
            `${contexto}: opcional junto ao título`,
          );
        }
        const visuais = secoes.filter((s) => s.visual);
        assert.equal(visuais.length, 1, `${contexto}: uma única identificação visual`);
        assert.equal(
          visuais[0].aberta,
          false,
          `${contexto}: fechada inclusive ao editar`,
        );
        const esperados =
          especialidade === "estetica"
            ? campos
            : campos.filter((c) => perfil.recepcaoRapida?.includes(c.id));
        for (const c of esperados.filter((c) => campoTecnicoVisivel(c, ficha))) {
          const encontrados = controles.filter((el) => el.id?.endsWith(`-${c.id}`));
          assert.equal(encontrados.length, 1, `${contexto}: ${c.id} sem duplicação`);
          const el = encontrados[0];
          assert.ok(
            el.secoes.includes(visuais[0]),
            `${contexto}: ${c.id} dentro de identificação visual`,
          );
          assert.doesNotMatch(
            el.tag,
            /\srequired(?:\s|=|>)/,
            `${contexto}: ${c.id} opcional`,
          );
          if (editando)
            assert.ok(
              el.conteudo.includes(ficha.campos[c.id]),
              `${contexto}: ${c.id} mantém o valor salvo`,
            );
          camposConferidos++;
        }
        formularios++;
      }
    }
  }
  console.log(
    `PASS ${formularios} formulários de ${Object.keys(especialidades).length} subsetores; ${camposConferidos} controles opcionais dentro da identificação visual fechada, sem duplicação e com valores existentes preservados.`,
  );
} finally {
  await server.close();
  if (storageOriginal)
    Object.defineProperty(globalThis, "localStorage", storageOriginal);
  else delete globalThis.localStorage;
}
