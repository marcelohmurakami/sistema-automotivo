import { test } from "node:test";
import assert from "node:assert/strict";
import { rotuloSituacaoDocumento } from "../src/lib/apresentacaoDocumentoServico.ts";
import {
  gruposDoAtendimento,
  itensDaProposta,
  selecionarGrupoAtendimento,
  totalAutorizado,
} from "../src/lib/aprovacaoServicos.ts";
const itens = [
  {
    id: "1",
    tipo: "servico",
    descricao: "Troca de tela",
    quantidade: 1,
    unidade: "un",
    preco_centavos: 10000,
    grupo_servico: "Tela",
  },
  {
    id: "2",
    tipo: "material",
    descricao: "Tela",
    quantidade: 1,
    unidade: "un",
    preco_centavos: 5000,
    grupo_servico: "Tela",
  },
  {
    id: "3",
    tipo: "servico",
    descricao: "Proteção",
    quantidade: 1,
    unidade: "un",
    preco_centavos: 10000,
    grupo_servico: "Proteção",
    depende_grupo: "Tela",
  },
];
test("recusa aparece no atendimento e deixa de valer após revisar os dados", () => {
  const a = {
    situacao: "orcamento",
    revisao: 4,
    dados: { orcamento_recusado_em: "2026-10-26", orcamento_recusado_revisao: "4" },
  };
  assert.equal(rotuloSituacaoDocumento(a, "Orçamento"), "Orçamento recusado");
  assert.equal(rotuloSituacaoDocumento({ ...a, revisao: 5 }, "Orçamento"), "Orçamento");
});
test("serviço e peça são selecionados juntos e desconto é proporcional", () => {
  assert.equal(gruposDoAtendimento(itens).length, 2);
  assert.deepEqual(totalAutorizado(itens, 2500, ["Tela"]), {
    subtotal: 15000,
    desconto: 1500,
    total: 13500,
  });
});
test("selecionar dependente inclui o serviço necessário; remover base remove dependentes", () => {
  assert.deepEqual(selecionarGrupoAtendimento(itens, [], "Proteção", true), [
    "Proteção",
    "Tela",
  ]);
  assert.deepEqual(
    selecionarGrupoAtendimento(itens, ["Tela", "Proteção"], "Tela", false),
    [],
  );
});
test("orçamento antigo sem itens preserva o valor e permite autorização", () => {
  const lista = itensDaProposta([], "Limpeza", 12345, "a");
  assert.equal(gruposDoAtendimento(lista)[0].nome, "Atendimento");
  assert.equal(totalAutorizado(lista, 0, ["Atendimento"]).total, 12345);
});
test("zero, desconto integral e nenhuma seleção não produzem valores negativos", () => {
  assert.equal(totalAutorizado(itens, 25000, ["Tela"]).total, 0);
  assert.equal(totalAutorizado(itens, 2500, []).total, 0);
  assert.equal(
    totalAutorizado([{ ...itens[0], preco_centavos: 0 }], 0, ["Tela"]).total,
    0,
  );
});
test("quantidades fracionadas e centavos são arredondados por item como no banco", () => {
  assert.deepEqual(
    totalAutorizado([{ ...itens[0], quantidade: 1.25, preco_centavos: 999 }], 111, [
      "Tela",
    ]),
    { subtotal: 1249, desconto: 111, total: 1138 },
  );
});
