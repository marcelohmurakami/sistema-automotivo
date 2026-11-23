import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contextoAplicacaoAutomotiva,
  avaliarAplicacaoAutomotiva,
  sugerirServicosAutomotivos,
} from "../supabase/functions/assistente-operacional/aplicacao-automotiva.mjs";
import { conversar } from "../supabase/functions/assistente-operacional/protocolo.mjs";
const item = (id, descricao, preco = 10000) => ({
  id,
  descricao,
  tipo: "service",
  preco_padrao_centavos: preco,
});
const consultar = (linhas) => async () => ({ linhas, pode_haver_mais: false });
test("Prisma favorece cabeçote GM, exclui diesel/Fiat/operação diferente/peça e usa preço real", async () => {
  const r = await sugerirServicosAutomotivos(
    { servico: "Retífica de cabeçote", veiculo: "Prisma", motor: null },
    consultar([
      item("diesel", "Retífica cabeçote DIESEL 3 cilindros", 100),
      item("fiat", "Retífica cabeçote Fiat Fire", 200),
      item("gm", "Retífica cabeçote GM", 37500),
      item("geral", "Retífica cabeçote", 1000),
      item("outra", "Troca de junta cabeçote GM"),
      { ...item("peca", "Retífica cabeçote GM"), tipo: "part" },
    ]),
  );
  assert.equal(r.sugerido_id, "gm");
  assert.equal(r.linhas[0].preco_padrao_centavos, 37500);
  assert.deepEqual(
    r.linhas.map((l) => l.id),
    ["gm", "geral"],
  );
  assert.equal(r.aplicacao.veiculo, "GM Prisma");
  assert.equal(r.aplicacao.motor, "GM Família 1");
  assert.equal(r.aplicacao.motor_sugerido, true);
});
test("motor explícito define aplicação; correção Rocam troca Sigma por Rocam", async () => {
  const linhas = [
    item("sigma", "Retificar cabeçotes Ford Sigma"),
    item("rocam", "Retífica cabeçote Ford Rocam"),
  ];
  const r = await sugerirServicosAutomotivos(
    { servico: "Retífica cabeçote", veiculo: "Ford Fiesta", motor: "Rocam" },
    consultar(linhas),
  );
  assert.equal(r.sugerido_id, "rocam");
  assert.equal(r.aplicacao.motor_sugerido, false);
});
test("Fiesta/Palio não presumem motor e empate vira sugestão avisada, sem escolher pelo preço", async () => {
  for (const veiculo of ["Ford Fiesta", "Fiat Palio"])
    assert.equal(contextoAplicacaoAutomotiva(veiculo).motor, null);
  const r = await sugerirServicosAutomotivos(
    { servico: "Retífica cabeçote", veiculo: "Palio", motor: null },
    consultar([
      item("fire", "Retífica cabeçote Fiat Fire", 100),
      item("fiasa", "Retífica cabeçote Fiat Fiasa", 90000),
    ]),
  );
  assert.equal(r.sugerido_id, "fiasa");
  assert.equal(r.aproximado, true);
  assert.equal(r.aplicacao.motor, null);
  assert.equal(r.linhas.length, 2);
});
test("famílias, combustível e cilindros incompatíveis não passam pela triagem", () => {
  const prisma = contextoAplicacaoAutomotiva("Prisma");
  for (const descricao of [
    "Retífica cabeçote GM Família 2",
    "Retífica cabeçote 3 cilindros",
    "Retífica cabeçote Diesel",
    "Retífica cabeçote Ford",
  ])
    assert.equal(
      avaliarAplicacaoAutomotiva(item("x", descricao), prisma).compativel,
      false,
      descricao,
    );
  assert.equal(
    avaliarAplicacaoAutomotiva(item("x", "Retífica cabeçote GM / Fiat"), prisma)
      .compativel,
    true,
  );
  const adaptado = contextoAplicacaoAutomotiva("Prisma", "Diesel 3 cilindros");
  assert.equal(
    avaliarAplicacaoAutomotiva(
      item("x", "Retífica cabeçote Diesel 3 cilindros"),
      adaptado,
    ).compativel,
    true,
  );
});
test("catálogo vazio não inventa serviço e marca desconhecida não inventa motor", async () => {
  const r = await sugerirServicosAutomotivos(
    { servico: "Retífica cabeçote", veiculo: "Veículo desconhecido", motor: null },
    consultar([]),
  );
  assert.equal(r.sugerido_id, null);
  assert.equal(r.aplicacao.motor, null);
  assert.deepEqual(r.linhas, []);
});
test("preparação bloqueia seleção incompatível mesmo quando o modelo tenta ignorar a triagem", async () => {
  const catalogo = [
    item("diesel", "Retífica cabeçote Diesel 3 cilindros"),
    item("gm", "Retífica cabeçote GM"),
  ];
  const documento = {
    tipo: "orcamento",
    alvo_id: null,
    cliente_id: "cliente",
    objeto_id: null,
    identificacao: "GM Prisma",
    motor: "GM Família 1",
    motor_sugerido: true,
    opcionais: null,
    titulo: "Retífica cabeçote",
    data: "2026-10-23",
    observacao: "",
    forma_pagamento: null,
    vencimento_pagamento: null,
    entrega_prevista: null,
    desconto_centavos: 0,
    itens: [
      {
        catalogo_id: "diesel",
        descricao: null,
        tipo: "service",
        quantidade: 1,
        preco_centavos: null,
      },
    ],
  };
  let rodada = 0;
  const gravacoes = [];
  const chamada = (name, args) => ({
    status: "completed",
    output: [
      {
        type: "function_call",
        name,
        call_id: String(rodada),
        arguments: JSON.stringify(args),
      },
    ],
  });
  const r = await conversar({
    entrada: { texto: "Orçamento do Prisma", historico: [], contexto: {} },
    empresa: { ramo: "automotivo" },
    pedir: async ({ input }) => {
      if (rodada++ === 0)
        return chamada("consultar", {
          tipo: "catalogo",
          busca: "cabeçote",
          id: null,
          cliente_id: null,
          inicio: null,
          fim: null,
        });
      if (rodada === 2) return chamada("preparar_documento", documento);
      assert.match(input.at(-1).output, /diesel|cilindros/i);
      return chamada("preparar_documento", {
        ...documento,
        itens: [{ ...documento.itens[0], catalogo_id: "gm" }],
      });
    },
    executar: async (nome, args) => {
      if (nome === "consultar") return { tipo: "catalogo", linhas: catalogo };
      gravacoes.push(args);
      return { id: "proposta", titulo: "Conferir", campos: [] };
    },
  });
  assert.ok(r.proposta);
  assert.equal(gravacoes.length, 1);
  assert.equal(gravacoes[0].itens[0].catalogo_id, "gm");
});
test("busca automotiva não é executada em assistência, manutenção ou limpeza", async () => {
  for (const ramo of ["assistencia_tecnica", "manutencao_campo", "limpeza"]) {
    let rodada = 0;
    const r = await conversar({
      entrada: { texto: "Catálogo", historico: [], contexto: {} },
      empresa: { ramo },
      pedir: async ({ input }) => {
        if (!rodada++)
          return {
            status: "completed",
            output: [
              {
                type: "function_call",
                name: "sugerir_servicos_automotivos",
                call_id: "1",
                arguments: JSON.stringify({
                  servico: "Reparo",
                  veiculo: "Prisma",
                  motor: null,
                }),
              },
            ],
          };
        assert.match(input.at(-1).output, /exclusiva do ramo automotivo/);
        return {
          status: "completed",
          output: [
            {
              content: [
                { type: "output_text", text: "Vou consultar o catálogo da empresa." },
              ],
            },
          ],
        };
      },
      executar: () => assert.fail("Não deve consultar veículo em outro ramo"),
    });
    assert.equal(r.proposta, null);
  }
});
