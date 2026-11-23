import { test } from "node:test";
import assert from "node:assert/strict";
import {
  conversar,
  validarArgumentos,
} from "../supabase/functions/assistente-operacional/protocolo.mjs";
import { sugerirServicosAutomotivos } from "../supabase/functions/assistente-operacional/aplicacao-automotiva.mjs";

const chamada = (name, args) => ({
  status: "completed",
  output: [
    { type: "function_call", name, call_id: name, arguments: JSON.stringify(args) },
  ],
});
const doc = (itens) => ({
  tipo: "ordem_servico",
  alvo_id: null,
  cliente_id: "cliente",
  objeto_id: null,
  identificacao: null,
  motor: "AP",
  motor_sugerido: false,
  opcionais: null,
  titulo: "Serviços do motor AP",
  data: "2026-10-23",
  observacao: "",
  forma_pagamento: null,
  vencimento_pagamento: null,
  entrega_prevista: null,
  desconto_centavos: 0,
  itens,
});

for (const n of [7, 30])
  test(`${n} serviços na mesma OS, motor AP sem carro, sem pesquisar objetos`, async () => {
    const itens = Array.from({ length: n }, (_, i) => ({
      busca: `Operação ${i + 1}`,
      tipo: "service",
    }));
    const catalogo = itens.map((i, n) => ({
      id: `item-${n}`,
      descricao: `${i.busca} VW AP`,
      tipo: "service",
      preco_padrao_centavos: 10000,
    }));
    let chamadas = 0,
      consultas = 0,
      ativas = 0,
      maxAtivas = 0;
    const r = await conversar({
      entrada: { texto: "Todos os serviços, sem carro", historico: [], contexto: {} },
      empresa: { ramo: "automotivo" },
      pedir: async ({ input }) => {
        if (!chamadas++)
          return chamada("buscar_itens_catalogo", {
            itens,
            identificacao: null,
            motor: "AP",
          });
        const lote = JSON.parse(input.at(-1).output);
        assert.equal(lote.resultados.length, n);
        assert.ok(lote.resultados.every((r, i) => r.sugerido_id === catalogo[i].id));
        return chamada(
          "preparar_documento",
          doc(
            catalogo.map((i) => ({
              catalogo_id: i.id,
              tipo: "service",
              descricao: null,
              quantidade: 1,
              preco_centavos: null,
            })),
          ),
        );
      },
      executar: async (nome, args) => {
        if (nome === "consultar") {
          assert.equal(args.tipo, "catalogo");
          consultas++;
          maxAtivas = Math.max(maxAtivas, ++ativas);
          await new Promise((r) => setTimeout(r, 1));
          ativas--;
          return {
            tipo: "catalogo",
            linhas: catalogo.filter((i) => i.descricao.startsWith(args.busca + " ")),
            pode_haver_mais: false,
          };
        }
        assert.equal(args.identificacao, null);
        assert.equal(args.motor, "AP");
        assert.equal(args.itens.length, n);
        return { id: "proposta", itens: args.itens };
      },
    });
    assert.equal(r.proposta.itens.length, n);
    assert.equal(chamadas, 2);
    assert.equal(consultas, n);
    assert.ok(maxAtivas <= 3);
  });

test("motor AP basta para sugerir serviço e flex não seleciona diesel", async () => {
  const r = await sugerirServicosAutomotivos(
    { servico: "Embuchar bielas", veiculo: null, motor: "AP" },
    async () => ({
      linhas: [
        { id: "ap", descricao: "Embuchamento biela VW AP", tipo: "service" },
        { id: "diesel", descricao: "Embuchamento biela Diesel", tipo: "service" },
      ],
    }),
  );
  assert.equal(r.sugerido_id, "ap");
  assert.equal(r.aplicacao.veiculo, "");
  assert.equal(r.aplicacao.motor, "AP");
});

test("lote dos demais ramos não usa filtro de motor e mantém material separado", async () => {
  for (const ramo of ["assistencia_tecnica", "manutencao_campo", "limpeza"]) {
    let rodada = 0;
    const r = await conversar({
      entrada: { texto: "Reparo e produto", historico: [], contexto: {} },
      empresa: { ramo },
      pedir: async ({ input }) => {
        if (!rodada++)
          return chamada("buscar_itens_catalogo", {
            identificacao: "Nome livre",
            motor: null,
            itens: [
              { busca: "Reparo", tipo: "service" },
              { busca: "Produto", tipo: "part" },
            ],
          });
        const lote = JSON.parse(input.at(-1).output);
        assert.equal(lote.resultados[0].linhas[0].tipo, "service");
        assert.equal(lote.resultados[1].linhas[0].tipo, "part");
        return {
          status: "completed",
          output: [{ content: [{ type: "output_text", text: "Itens encontrados." }] }],
        };
      },
      executar: async (nome, args) => {
        assert.equal(nome, "consultar");
        assert.equal(args.tipo, "catalogo");
        return {
          tipo: "catalogo",
          linhas: [
            { id: "s", descricao: "Reparo", tipo: "service" },
            { id: "p", descricao: "Produto", tipo: "part" },
          ],
        };
      },
    });
    assert.equal(r.consultas.length, 2);
  }
});

test("lotes e opcionais têm contratos fechados e limite de 30 itens", () => {
  assert.throws(() =>
    validarArgumentos("buscar_itens_catalogo", {
      identificacao: null,
      motor: null,
      itens: Array(31).fill({ busca: "Teste", tipo: "service" }),
    }),
  );
  assert.throws(() =>
    validarArgumentos("preparar_documento", {
      ...doc([]),
      opcionais: { sql: "select 1" },
    }),
  );
  assert.doesNotThrow(() => validarArgumentos("preparar_documento", doc([])));
});
