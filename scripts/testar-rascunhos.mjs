import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chaveRascunho,
  lerRascunho,
  gravarRascunho,
  limparRascunho,
} from "../src/lib/rascunhos.ts";
const agora = Date.now(),
  chave = chaveRascunho("usuario", "oficina");
const valor = {
  versao: 1,
  chave: "criacao-estavel",
  atualizado: agora,
  dados: {
    cliente_id: "cliente",
    veiculo_id: "veiculo",
    observacoes: "Ruído",
    condicoes: "Após aprovação",
    desconto_centavos: 0,
    itens: [
      {
        tipo: "service",
        descricao: "Diagnóstico",
        unidade: "un",
        quantidade: 1,
        preco_unitario_centavos: 10000,
      },
    ],
  },
};
const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
};
test("Recupera dados e chave após fechar o editor", () => {
  const s = storage();
  assert.equal(gravarRascunho(chave, valor, s), true);
  assert.deepEqual(lerRascunho(chave, s, agora), valor);
});
test("Isola usuários, oficinas e orçamentos no mesmo aparelho", () => {
  const s = storage();
  gravarRascunho(chave, valor, s);
  for (const k of [
    chaveRascunho("outro", "oficina"),
    chaveRascunho("usuario", "outra"),
    chaveRascunho("usuario", "oficina", "existente"),
  ])
    assert.equal(lerRascunho(k, s, agora), null);
});
test("Descarta rascunho vencido sem expor conteúdo", () => {
  const s = storage();
  gravarRascunho(chave, valor, s);
  assert.equal(lerRascunho(chave, s, agora + 8 * 86400000), null);
});
test("Falha de armazenamento informa que não salvou", () =>
  assert.equal(
    gravarRascunho(chave, valor, {
      setItem() {
        throw new Error("Quota");
      },
    }),
    false,
  ));
test("Armazenamento bloqueado não derruba editor", () =>
  assert.equal(
    lerRascunho(chave, {
      getItem() {
        throw new Error("Bloqueado");
      },
    }),
    null,
  ));
test("Confirmação do servidor limpa rascunho", () => {
  const s = storage();
  gravarRascunho(chave, valor, s);
  limparRascunho(chave, s);
  assert.equal(lerRascunho(chave, s), null);
});
for (const [nome, d] of Object.entries({
  json: "{",
  nulo: "null",
  versao: JSON.stringify({ ...valor, versao: 2 }),
  futuro: JSON.stringify({ ...valor, atualizado: agora + 86400000 }),
  itensInvalidos: JSON.stringify({
    ...valor,
    dados: { ...valor.dados, itens: [null] },
  }),
  quantidadeInvalida: JSON.stringify({
    ...valor,
    dados: {
      ...valor.dados,
      itens: [{ ...valor.dados.itens[0], quantidade: "erro" }],
    },
  }),
  limite: JSON.stringify({
    ...valor,
    dados: { ...valor.dados, itens: Array(101).fill(valor.dados.itens[0]) },
  }),
}))
  test("Conteúdo corrompido: " + nome, () =>
    assert.equal(lerRascunho(chave, { getItem: () => d }, agora), null),
  );
