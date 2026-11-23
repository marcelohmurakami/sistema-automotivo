import { test } from "node:test";
import assert from "node:assert/strict";
import {
  documentoExplicito,
  tipoDocumentoSolicitado,
  conversar,
  contextoTranscricao,
} from "../supabase/functions/assistente-operacional/protocolo.mjs";

test("áudio recebe vocabulário do ramo, sem misturar automotivo com assistência", () => {
  assert.match(contextoTranscricao({ ramo: "automotivo" }), /VW Gol/);
  assert.doesNotMatch(contextoTranscricao({ ramo: "automotivo" }), /iPhone|lavadora/);
  assert.match(contextoTranscricao({ ramo: "assistencia_tecnica" }), /iPhone/);
  assert.match(contextoTranscricao({ ramo: "manutencao_campo" }), /split/);
  assert.match(contextoTranscricao({ ramo: "limpeza" }), /pós-obra/);
  assert.doesNotMatch(contextoTranscricao({ ramo: "limpeza" }), /virabrequim|cabeçote/);
  assert.match(contextoTranscricao(), /apenas o que foi falado/);
});
import { comPrazoAssistente } from "../src/lib/prazoAssistente.ts";
import { rotuloConfirmacaoAssistente } from "../src/lib/assistente.ts";

test("pedido explícito distingue OS/orçamento, siglas, negação e correção", () => {
  for (const pedido of [
    "Faça uma ordem de serviço para Ana",
    "Crie OS para João",
    "quero uma os",
    "uma O.S. de troca de óleo",
    "Quero uma ordem de serviço, não orçamento. Mantenha os itens.",
    "Orçamento não, pedi OS!",
    "Não quero orçamento quero OS",
    "Em vez de orçamento, faça uma OS",
    "Troque para OS",
    "Faça uma OS com serviço orçamento de reparo",
  ])
    assert.equal(documentoExplicito(pedido), "ordem_servico", pedido);
  for (const pedido of [
    "Faça orçamento da troca de tela",
    "Agora quero orçamento, não OS",
    "Não crie OS. Quero orçamento",
    "No lugar de OS, faça orçamento",
  ])
    assert.equal(documentoExplicito(pedido), "orcamento", pedido);
  for (const pedido of [
    "Use os serviços encontrados",
    "Altere os valores",
    "Faça os serviços de revisão",
    "Aumente a quantidade do orçamento",
    "Não crie uma OS",
  ])
    assert.equal(documentoExplicito(pedido), null, pedido);
});

test("intenção do usuário prevalece sobre tela, IA e proposta incorreta", () => {
  const entrada = {
    texto: "Use duas unidades",
    contexto: { tela: "Orçamentos" },
    historico: [
      { role: "user", content: "Faça uma ordem de serviço" },
      { role: "assistant", content: "Vou criar orçamento" },
    ],
    propostaAnterior: { dados: { tipo: "orcamento" } },
  };
  assert.equal(tipoDocumentoSolicitado(entrada), "ordem_servico");
  assert.equal(
    tipoDocumentoSolicitado({ ...entrada, texto: "Agora quero um orçamento" }),
    "orcamento",
  );
  assert.equal(
    tipoDocumentoSolicitado({
      ...entrada,
      historico: [],
      propostaAnterior: { dados: { tipo: "ordem_servico" } },
    }),
    "ordem_servico",
  );
  assert.equal(
    tipoDocumentoSolicitado({ ...entrada, historico: [], propostaAnterior: null }),
    null,
  );
});

const documento = (tipo) => ({
  tipo,
  alvo_id: null,
  cliente_id: "cliente",
  objeto_id: null,
  identificacao: null,
  motor: null,
  motor_sugerido: false,
  opcionais: null,
  titulo: "Revisão",
  data: "2026-10-23",
  observacao: "",
  forma_pagamento: null,
  vencimento_pagamento: null,
  entrega_prevista: null,
  desconto_centavos: 0,
  itens: [
    {
      catalogo_id: "item",
      descricao: "Revisão",
      tipo: "service",
      quantidade: 1,
      preco_centavos: null,
    },
  ],
});
const chamada = (args) => ({
  status: "completed",
  output: [
    {
      type: "function_call",
      name: "preparar_documento",
      call_id: "preparar",
      arguments: JSON.stringify(args),
    },
  ],
});

for (const ramo of ["automotivo", "assistencia_tecnica", "manutencao_campo", "limpeza"])
  test(`${ramo}: ferramenta errada não chega ao banco; IA refaz no tipo solicitado`, async () => {
    for (const [pedido, correto, errado] of [
      ["Faça uma OS", "ordem_servico", "orcamento"],
      ["Faça orçamento, não OS", "orcamento", "ordem_servico"],
    ]) {
      let tentativas = 0,
        preparos = 0;
      const r = await conversar({
        entrada: { texto: pedido, historico: [], contexto: { tela: "Orçamentos" } },
        empresa: { ramo },
        pedir: async ({ input }) => {
          if (!tentativas++) return chamada(documento(errado));
          assert.match(
            JSON.parse(input.at(-1).output).erro,
            new RegExp(`tipo=${correto}`),
          );
          return chamada(documento(correto));
        },
        executar: async (_, args) => {
          preparos++;
          assert.equal(args.tipo, correto);
          return { id: "proposta", itens: args.itens };
        },
      });
      assert.equal(preparos, 1);
      assert.ok(r.proposta);
      assert.equal(tentativas, 2);
    }
  });

test("acrescentar itens a uma OS existente não vira criação de documento", async () => {
  await conversar({
    entrada: { texto: "Acrescente revisão na OS", historico: [], contexto: {} },
    empresa: {},
    pedir: async () =>
      chamada({ ...documento("adicionar_itens"), alvo_id: "existente" }),
    executar: async (_, args) => {
      assert.equal(args.tipo, "adicionar_itens");
      assert.equal(args.alvo_id, "existente");
      return { id: "proposta" };
    },
  });
});

test("conexão sem resposta tem prazo e aborta; próximo envio pode prosseguir", async () => {
  let sinal;
  await assert.rejects(
    comPrazoAssistente(
      (s) => {
        sinal = s;
        return new Promise(() => {});
      },
      new AbortController().signal,
      10,
    ),
    /pedido foi mantido/,
  );
  assert.ok(sinal.aborted);
  assert.equal(
    await comPrazoAssistente(
      async () => "nova resposta",
      new AbortController().signal,
      20,
    ),
    "nova resposta",
  );
});

test("cancelamento e erro liberam a espera, resposta tardia não substitui timeout", async () => {
  const controller = new AbortController();
  let resolver;
  const espera = comPrazoAssistente(
    () =>
      new Promise((r) => {
        resolver = r;
      }),
    controller.signal,
    100,
  );
  controller.abort(new Error("cancelado"));
  await assert.rejects(espera, /cancelado/);
  resolver("tardia");
  await assert.rejects(
    comPrazoAssistente(
      async () => {
        throw Error("falha");
      },
      new AbortController().signal,
      20,
    ),
    /falha/,
  );
  await assert.rejects(
    comPrazoAssistente(async () => "não executar", controller.signal, 20),
    /cancelado/,
  );
});

test("ação de confirmação identifica claramente o documento a salvar", () => {
  assert.equal(
    rotuloConfirmacaoAssistente({ titulo: "Criar ordem de serviço" }),
    "Confirmar e criar OS",
  );
  assert.equal(
    rotuloConfirmacaoAssistente({ titulo: "Criar orçamento" }),
    "Confirmar e criar orçamento",
  );
  assert.equal(
    rotuloConfirmacaoAssistente({ titulo: "Registrar pagamento recebido" }),
    "Confirmar e salvar",
  );
});

test("resumo explica o documento entendido e o cliente sem afirmar que já salvou", async () => {
  for (const [tipo, titulo, trecho] of [
    ["orcamento", "Criar orçamento", "um orçamento"],
    ["ordem_servico", "Criar ordem de serviço", "uma ordem de serviço"],
  ]) {
    const r = await conversar({
      entrada: { texto: `Prepare ${trecho} para Marina`, historico: [], contexto: {} },
      empresa: {},
      pedir: async () => chamada(documento(tipo)),
      executar: async () => ({
        id: "proposta",
        titulo,
        campos: [{ rotulo: "Cliente", valor: "Marina" }],
      }),
    });
    assert.ok(
      r.texto.includes(`Entendi que você quer preparar ${trecho} para Marina.`),
    );
    assert.match(r.texto, /confirme para salvar/);
    assert.doesNotMatch(r.texto, /salv[oa] com sucesso/i);
  }
});

test("normalização da identificação fica explícita e editável, sem alerta repetido após correção", async () => {
  const resposta = async (texto, historico = []) =>
    conversar({
      entrada: { texto, historico, contexto: {} },
      empresa: {},
      pedir: async () => chamada(documento("orcamento")),
      executar: async () => ({
        id: "proposta",
        titulo: "Criar orçamento",
        campos: [{ rotulo: "Veículo / peça", valor: "Toyota Corolla" }],
      }),
    });
  const interpretada = await resposta("Orçamento do Toyota Carala");
  assert.match(interpretada.texto, /Identificação interpretada: Toyota Corolla/);
  assert.match(interpretada.texto, /pode alterá-lo no chat/);
  const corrigida = await resposta("Duas unidades", [
    { role: "user", content: "Corrija para Toyota Corolla" },
  ]);
  assert.doesNotMatch(corrigida.texto, /Identificação interpretada/);
});
