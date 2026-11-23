import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compararNomeServico,
  sugerirServicosCatalogo,
  classificarServicos,
  buscarProdutoCatalogo,
} from "../supabase/functions/assistente-operacional/catalogo-assistente.mjs";

test("grafias shampoo/xampu encontram o produto real sem aproximar peças distintas", async () => {
  const consultas = [];
  const produto = {
    id: "xampu",
    tipo: "part",
    descricao: "Xampu automotivo",
    preco_padrao_centavos: 5000,
  };
  const buscar = async (busca) => {
    consultas.push(busca);
    return { linhas: busca === "xampu automotivo" ? [produto] : [] };
  };
  assert.deepEqual((await buscarProdutoCatalogo("shampoo automotivo", buscar)).linhas, [
    produto,
  ]);
  assert.deepEqual(consultas, ["shampoo automotivo", "xampu automotivo"]);
  consultas.length = 0;
  assert.deepEqual(
    (await buscarProdutoCatalogo("Peça incompatível", buscar)).linhas,
    [],
  );
  assert.deepEqual(consultas, ["Peça incompatível"]);
  consultas.length = 0;
  assert.deepEqual((await buscarProdutoCatalogo("xampu automotivo", buscar)).linhas, [
    produto,
  ]);
  assert.equal(consultas.length, 1);
});
import { sugerirServicosAutomotivos } from "../supabase/functions/assistente-operacional/aplicacao-automotiva.mjs";
import { conversar } from "../supabase/functions/assistente-operacional/protocolo.mjs";
const item = (id, descricao, tipo = "service", preco = 10000) => ({
  id,
  descricao,
  tipo,
  preco_padrao_centavos: preco,
});
const consultar = (linhas) => async () => ({
  tipo: "catalogo",
  linhas,
  pode_haver_mais: false,
});

test("erro de digitação sugere serviço real com preço do catálogo e avisa aproximação", async () => {
  const r = await sugerirServicosCatalogo(
    "Troca de tella",
    consultar([
      item("p", "Troca tela", "part"),
      item("outro", "Limpeza conector"),
      item("s", "Troca de tela", "service", 18000),
    ]),
  );
  assert.equal(r.sugerido_id, "s");
  assert.equal(r.aproximado, true);
  assert.equal(r.linhas[0].preco_padrao_centavos, 18000);
});
test("amplia busca limitada por palavras quando frase com erro não encontra nada", async () => {
  const buscas = [];
  const r = await sugerirServicosCatalogo(
    "Higienizassao de estofado",
    async (busca) => {
      buscas.push(busca);
      return {
        linhas: busca === "estofado" ? [item("s", "Higienização de estofado")] : [],
        pode_haver_mais: false,
      };
    },
  );
  assert.equal(r.sugerido_id, "s");
  assert.equal(r.aproximado, true);
  assert.ok(buscas.length <= 4);
  assert.ok(buscas.every((b) => b.trim()));
});
test("aplicação incompatível continua excluída mesmo com nome exato", async () => {
  const r = await sugerirServicosAutomotivos(
    { servico: "Retífica cabessote", veiculo: "Prisma", motor: null },
    consultar([
      item("diesel", "Retífica cabessote DIESEL 3 cilindros"),
      item("gm", "Retífica cabeçote GM"),
      item("ford", "Retífica cabeçote Ford"),
    ]),
  );
  assert.equal(r.sugerido_id, "gm");
  assert.equal(r.aproximado, true);
  assert.deepEqual(
    r.linhas.map((i) => i.id),
    ["gm"],
  );
});
test("nome exato tem prioridade e diferença de acento não cria falso aviso", () => {
  assert.equal(
    compararNomeServico("Retífica cabeçote", "Retifica de cabecote").exato,
    true,
  );
  const r = classificarServicos("Limpeza ar", [
    item("p", "Limpeza ar", "part"),
    item("v", "Limpeza geral"),
    item("e", "Limpeza ar"),
  ]);
  assert.equal(r.sugerido_id, "e");
  assert.equal(r.aproximado, false);
});
test("sem nome minimamente parecido não inventa serviço nem seleciona peça", async () => {
  for (const linhas of [[], [item("p", "Xyzqz", "part")], [item("s", "Troca tela")]]) {
    const r = await sugerirServicosCatalogo("Xyzqz", consultar(linhas));
    assert.equal(r.sugerido_id, null);
    assert.deepEqual(r.linhas, []);
  }
});
test("empate é estável e aviso permanece sem escolher pelo preço", () => {
  const lista = [
    item("b", "Reparo especial B", "service", 1),
    item("a", "Reparo especial A", "service", 90000),
  ];
  const a = classificarServicos("Reparo especial", lista),
    b = classificarServicos("Reparo especial", lista.toReversed());
  assert.equal(a.sugerido_id, "a");
  assert.equal(a.sugerido_id, b.sugerido_id);
  assert.equal(a.aproximado, true);
});
test("aviso e pedido original ficam no item e na conversa, sem poluir observações", async () => {
  for (const ramo of [
    "automotivo",
    "assistencia_tecnica",
    "manutencao_campo",
    "limpeza",
  ]) {
    let passo = 0;
    const descricao = "Embuchamento biela VW AP";
    const r = await conversar({
      entrada: { texto: "Embochar biela", historico: [], contexto: {} },
      empresa: { ramo },
      pedir: async () => {
        const name = passo++ ? "preparar_documento" : "buscar_itens_catalogo";
        const args =
          name === "buscar_itens_catalogo"
            ? {
                itens: [{ busca: "Embochar biela", tipo: "service" }],
                identificacao: null,
                motor: ramo === "automotivo" ? "AP" : null,
              }
            : {
                tipo: "orcamento",
                alvo_id: null,
                cliente_id: "c",
                objeto_id: null,
                identificacao: null,
                motor: ramo === "automotivo" ? "AP" : null,
                motor_sugerido: false,
                opcionais: null,
                titulo: "Serviço",
                data: "2026-10-23",
                observacao: "",
                forma_pagamento: null,
                vencimento_pagamento: null,
                entrega_prevista: null,
                desconto_centavos: 0,
                itens: [
                  {
                    catalogo_id: "s",
                    tipo: "service",
                    descricao: "Embochar biela",
                    quantidade: 1,
                    preco_centavos: null,
                  },
                ],
              };
        return {
          status: "completed",
          output: [
            {
              type: "function_call",
              call_id: String(passo),
              name,
              arguments: JSON.stringify(args),
            },
          ],
        };
      },
      executar: async (name, args) => {
        if (name === "consultar")
          return { tipo: "catalogo", linhas: [item("s", descricao)] };
        assert.equal(args.observacao, "");
        return {
          id: "p",
          itens: [
            {
              descricao,
              quantidade: 1,
              preco_centavos: 10000,
              origem: "Preço do catálogo",
            },
          ],
        };
      },
    });
    assert.equal(r.proposta.itens[0].aproximacao.pedido, "Embochar biela");
    assert.match(r.texto, /nome mais parecido/);
    assert.match(r.texto, /Trocar item/);
    assert.equal(r.proposta.itens[0].descricao, descricao);
  }
});
