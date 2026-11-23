import { test } from "node:test";
import assert from "node:assert/strict";
import { conversar } from "../supabase/functions/assistente-operacional/protocolo.mjs";
import { criarConsultasDoTurno } from "../supabase/functions/assistente-operacional/consultas-turno.mjs";
import { pedidoAjustesItens } from "../src/lib/ajustesItensAssistente.ts";

const consulta = (busca, tipo = "catalogo") => ({
  tipo,
  busca,
  id: null,
  cliente_id: null,
  inicio: null,
  fim: null,
});
const chamada = (name, args, call_id = name) => ({
  type: "function_call",
  name,
  arguments: JSON.stringify(args),
  call_id,
});
const resposta = (output) => ({ status: "completed", output });
const mensagem = () =>
  resposta([
    {
      type: "message",
      content: [{ type: "output_text", text: "Confira os resultados." }],
    },
  ]);
const entrada = {
  texto: "Consulte o cliente e os serviços",
  historico: [],
  contexto: {},
};
const medidas = () => ({ consultas_banco: 0, consultas_ms: 0, reusos_consulta: 0 });
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("cliente e catálogo avançam juntos, retornos mantêm call_id e ordem mesmo quando terminam invertidos", async () => {
  const liberacoes = new Map();
  let rodada = 0;
  const operacao = conversar({
    entrada,
    empresa: { ramo: "assistencia_tecnica" },
    pedir: async ({ parallel_tool_calls, input }) => {
      assert.equal(parallel_tool_calls, true);
      if (!rodada++)
        return resposta([
          chamada("consultar", consulta("Marina", "clientes"), "cliente"),
          chamada("consultar", consulta("Tela"), "item"),
        ]);
      const outputs = input.filter((i) => i.type === "function_call_output");
      assert.deepEqual(
        outputs.map((i) => i.call_id),
        ["cliente", "item"],
      );
      assert.deepEqual(
        outputs.map((i) => JSON.parse(i.output).linhas[0].id),
        ["Marina", "Tela"],
      );
      return mensagem();
    },
    executar: async (_, args) => {
      await new Promise((resolve) => liberacoes.set(args.busca, resolve));
      return { tipo: args.tipo, linhas: [{ id: args.busca }] };
    },
  });
  await tick();
  assert.equal(
    liberacoes.size,
    2,
    "ambas as leituras iniciaram antes de liberar a primeira",
  );
  liberacoes.get("Tela")();
  await tick();
  liberacoes.get("Marina")();
  const r = await operacao;
  assert.deepEqual(
    r.consultas.map((c) => c.tipo),
    ["clientes", "catalogo"],
  );
  assert.equal(r.desempenho.rodadas_modelo, 2);
  assert.equal(r.desempenho.consultas_banco, 2);
});

test("lotes aninhados e buscas automotivas respeitam três consultas simultâneas no total", async () => {
  let ativas = 0,
    pico = 0,
    rodada = 0;
  const r = await conversar({
    entrada,
    empresa: { ramo: "automotivo" },
    pedir: async () =>
      !rodada++
        ? resposta([
            chamada("consultar", consulta("Marina", "clientes")),
            chamada("buscar_itens_catalogo", {
              identificacao: "GM Prisma",
              motor: null,
              itens: [
                "Retífica cabeçote",
                "Polir virabrequim",
                "Trocar válvula",
                "Reparar freio",
              ].map((busca) => ({ busca, tipo: "service" })),
            }),
            chamada("sugerir_servicos_automotivos", {
              servico: "Retificar bloco",
              veiculo: "GM Prisma",
              motor: null,
            }),
          ])
        : mensagem(),
    executar: async (_, args) => {
      pico = Math.max(pico, ++ativas);
      await tick();
      ativas--;
      return { tipo: args.tipo, linhas: [], pode_haver_mais: false };
    },
  });
  assert.equal(pico, 3);
  assert.ok(r.desempenho.consultas_banco > 10);
});

test("cache deduplica promessas em andamento mesmo com chaves reordenadas e não atravessa turnos", async () => {
  let chamadas = 0;
  const m = medidas();
  const executar = async () => {
    chamadas++;
    await tick();
    return { preco: chamadas * 100 };
  };
  const buscar = criarConsultasDoTurno(executar, undefined, m);
  const a = buscar(consulta("Tela")),
    b = buscar(Object.fromEntries(Object.entries(consulta("Tela")).reverse()));
  assert.equal(a, b);
  assert.deepEqual(await a, await b);
  assert.equal(chamadas, 1);
  assert.equal(m.reusos_consulta, 1);
  const outraEmpresaOuTurno = criarConsultasDoTurno(executar, undefined, medidas());
  assert.deepEqual(await outraEmpresaOuTurno(consulta("Tela")), { preco: 200 });
});

test("preparação espera leituras anteriores e duas preparações nunca executam juntas", async () => {
  let liberar,
    preparacoes = 0,
    rodada = 0;
  const operacao = conversar({
    entrada,
    empresa: {},
    pedir: async () =>
      !rodada++
        ? resposta([
            chamada("consultar", consulta("Marina", "clientes")),
            chamada(
              "preparar_anotacao",
              { alvo_id: "os-ficticia", texto: "Conferir" },
              "p1",
            ),
            chamada(
              "preparar_anotacao",
              { alvo_id: "os-ficticia", texto: "Outra" },
              "p2",
            ),
          ])
        : mensagem(),
    executar: async (nome) => {
      if (nome === "consultar") {
        await new Promise((resolve) => (liberar = resolve));
        return { linhas: [] };
      }
      preparacoes++;
      return { id: "unica" };
    },
  });
  await tick();
  assert.equal(preparacoes, 0);
  liberar();
  assert.equal((await operacao).proposta.id, "unica");
  assert.equal(preparacoes, 1);
});

test("cancelamento impede consultas enfileiradas e nova rodada de IA", async () => {
  const ac = new AbortController();
  const liberacoes = [];
  let chamadas = 0;
  const buscar = criarConsultasDoTurno(
    async () => {
      chamadas++;
      await new Promise((resolve) => liberacoes.push(resolve));
      return {};
    },
    ac.signal,
    medidas(),
  );
  const todas = Promise.allSettled(
    Array.from({ length: 10 }, (_, i) => buscar(consulta(String(i)))),
  );
  await tick();
  ac.abort();
  liberacoes.forEach((resolve) => resolve());
  const resultados = await todas;
  assert.equal(chamadas, 3);
  assert.equal(resultados.filter((r) => r.status === "rejected").length, 7);
  await assert.rejects(() =>
    conversar({
      entrada,
      empresa: {},
      signal: ac.signal,
      pedir: () => assert.fail("não deve chamar IA"),
      executar: () => assert.fail(),
    }),
  );
});

test("erro em uma consulta não perde resultados das outras nem é repetido no banco", async () => {
  let rodada = 0,
    erros = 0;
  const r = await conversar({
    entrada,
    empresa: {},
    pedir: async ({ input }) => {
      if (!rodada++)
        return resposta([
          chamada("consultar", consulta("negada")),
          chamada("consultar", consulta("permitida")),
          chamada("consultar", consulta("negada"), "repetida"),
        ]);
      const outputs = input
        .filter((i) => i.type === "function_call_output")
        .map((i) => JSON.parse(i.output));
      assert.equal(outputs[0].erro, "Sem permissão");
      assert.equal(outputs[2].erro, "Sem permissão");
      return mensagem();
    },
    executar: async (_, args) => {
      if (args.busca === "negada") {
        erros++;
        throw Error("Sem permissão");
      }
      return { linhas: [{ id: "permitida" }] };
    },
  });
  assert.equal(erros, 1);
  assert.equal(r.consultas.length, 1);
});

test("ajustes de vários itens usam uma mensagem, conservam índices originais e protegem inteiros", () => {
  const proposta = {
    itens: [
      { descricao: "Serviço A", quantidade: 1 },
      { descricao: "Peça B", quantidade: 1 },
      { descricao: "Serviço C", quantidade: 2 },
    ],
  };
  const pedido = pedidoAjustesItens(proposta, { 0: null, 2: "4" });
  assert.match(pedido, /Remova o item 1/);
  assert.match(pedido, /item 3.*para 4/);
  assert.match(pedido, /ANTES das remoções/);
  assert.match(pedido, /data, os preços unitários/);
  assert.equal(pedidoAjustesItens(proposta, { 0: "1" }), "");
  for (const invalido of ["1,001", "1.5", "0", "-2", "1e3", "", "10001"])
    assert.throws(() => pedidoAjustesItens(proposta, { 0: invalido }));
  assert.throws(
    () => pedidoAjustesItens(proposta, { 0: null, 1: null, 2: null }),
    /pelo menos um item/,
  );
  assert.throws(() => pedidoAjustesItens(proposta, { 999: "2" }));
  const trinta = {
    itens: Array.from({ length: 30 }, () => ({
      descricao: "Nome longo ".repeat(30),
      quantidade: 1,
    })),
  };
  assert.ok(
    pedidoAjustesItens(trinta, Object.fromEntries(trinta.itens.map((_, i) => [i, "2"])))
      .length < 3000,
  );
});
