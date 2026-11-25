import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "vite";

const memoria = new Map();
const armazenamentoAnterior = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);
const janelaAnterior = Object.getOwnPropertyDescriptor(globalThis, "window");
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k) => memoria.get(k) ?? null,
    setItem: (k, v) => memoria.set(k, v),
    removeItem: (k) => memoria.delete(k),
  },
});
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: new EventTarget(),
});
const avisos = [];
window.addEventListener("patio:atendimento-concluido", (e) => avisos.push(e.detail));
const server = await createServer({
  configFile: false,
  envDir: false,
  cacheDir: "output/.vite-aviso-criacao-pronta",
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
});
try {
  const { gravarServico, lerServicosDemo } = await server.ssrLoadModule(
    "/src/services/servicos.ts",
  );
  const { novaFichaEspecialidade } = await server.ssrLoadModule(
    "/src/lib/perfisAtendimento.ts",
  );
  const { concluirReparo } = await server.ssrLoadModule(
    "/src/lib/assistenciaTecnica.ts",
  );
  const { especialidades } = await server.ssrLoadModule("/src/lib/especialidades.ts");
  for (const [perfil, config] of Object.entries(especialidades)) {
    if (!["assistencia_tecnica", "manutencao_campo"].includes(config.ramo)) continue;
    const oficina = `demo-${config.ramo}`;
    const modelo = lerServicosDemo(oficina).atendimentos[0];
    for (const avisarConclusao of [false, true]) {
      const id = randomUUID();
      const ficha = novaFichaEspecialidade(perfil);
      const dados = {
        ...modelo,
        id,
        revisao: 0,
        concluido_em: null,
        titulo: "QA criação pronta",
        situacao: "concluido",
        ficha_especialidade:
          config.ramo === "assistencia_tecnica"
            ? concluirReparo({ ...modelo, ficha_especialidade: ficha }, perfil)
                .ficha_especialidade
            : ficha,
        dados: { documento: "ordem" },
      };
      const antes = avisos.length;
      await gravarServico(
        "criar_atendimento_com_itens",
        oficina,
        {
          p_id: id,
          p_dados: dados,
          p_itens: [
            {
              id: randomUUID(),
              tipo: "servico",
              descricao: "Revisão QA",
              quantidade: 1,
              unidade: "un",
              preco_centavos: 10000,
              custo_centavos: 0,
              origem: "externa",
            },
          ],
          p_desconto: 0,
        },
        true,
        { avisarConclusao },
      );
      assert.equal(
        avisos.length - antes,
        avisarConclusao ? 1 : 0,
        `${perfil}: respeita a escolha de não abrir o aviso no fluxo de entrega`,
      );
      const salva = lerServicosDemo(oficina).atendimentos.find((a) => a.id === id);
      assert.equal(salva.situacao, "concluido");
      assert.equal(salva.valor_centavos, 10000);
    }
    console.log(
      `PASS ${perfil}: aviso opcional preservado e criação pronta sem janela extra`,
    );
  }
} finally {
  await server.close();
  if (armazenamentoAnterior)
    Object.defineProperty(globalThis, "localStorage", armazenamentoAnterior);
  else delete globalThis.localStorage;
  if (janelaAnterior) Object.defineProperty(globalThis, "window", janelaAnterior);
  else delete globalThis.window;
}
