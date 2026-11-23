import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import {
  barrasEtiqueta,
  gerarEtiquetasEstoque,
} from "../src/services/pdfEtiquetasEstoque.ts";
import { prepararCatalogoFornecedor } from "../src/lib/catalogoFornecedor.ts";
const require = createRequire(import.meta.url),
  { Code128Reader, BitArray } = require("@zxing/library");
test("cada Code128 gerado é decodificado pelo leitor independente", () => {
  for (const codigo of ["PTE-0000000001", "PTE-1234567890", "PTE-9999999999"]) {
    const s = "0".repeat(30) + barrasEtiqueta(codigo) + "0".repeat(30),
      linha = new BitArray(s.length * 3);
    for (let i = 0; i < s.length; i++)
      if (s[i] === "1") for (let j = 0; j < 3; j++) linha.set(i * 3 + j);
    assert.equal(new Code128Reader().decodeRow(1, linha).getText(), codigo);
  }
  assert.throws(() => barrasEtiqueta("https://externo.example"));
});
test("PDF respeita papel, quantidade e paginação", () => {
  const itens = Array.from({ length: 11 }, (_, i) => ({
    codigo: "PTE-" + String(i + 1).padStart(10, "0"),
    descricao: "Peça de teste com descrição longa para verificar quebras e margens",
    serie: "ABC-" + i,
    imei: "123456789012345",
  }));
  assert.equal(gerarEtiquetasEstoque(itens, "Empresa de teste").getNumberOfPages(), 2);
  const t = gerarEtiquetasEstoque(itens, "Empresa de teste", "termica");
  assert.equal(t.getNumberOfPages(), 11);
  assert.equal(Math.round(t.internal.pageSize.getWidth()), 80);
  assert.equal(Math.round(t.internal.pageSize.getHeight()), 50);
  assert.throws(() => gerarEtiquetasEstoque([], "QA"));
});
test("CSV lê preços BR, campos opcionais, aspas e aplicação", () => {
  const itens = prepararCatalogoFornecedor(
    'codigo;descricao;preco;unidade;aplicacao;disponibilidade;prazo_dias\nABC;"Peça; modelo especial";"1.200,50";un;"Aplicação\nem duas linhas";sob encomenda;5',
  );
  assert.equal(itens[0].preco_centavos, 120050);
  assert.equal(itens[0].aplicacao, "Aplicação\nem duas linhas");
  assert.equal(itens[0].disponibilidade, "sob_encomenda");
  assert.equal(itens[0].quantidade_disponivel, null);
});
test("arquivo inválido falha por inteiro com linha identificada", () => {
  const inicio = "codigo;descricao;preco\n";
  for (const linha of [
    "ABC;Peça;abc",
    ";Peça;10",
    "ABC;Peça;-5",
    "ABC;Peça;10\nabc;Peça;20",
  ])
    assert.throws(() => prepararCatalogoFornecedor(inicio + linha), /Linha/);
  assert.throws(() =>
    prepararCatalogoFornecedor("codigo;descricao;preco;prazo_dias\nABC;Peça;10;1,5"),
  );
  assert.throws(() =>
    prepararCatalogoFornecedor(
      "codigo;descricao;preco;disponibilidade\nABC;Peça;10;talvez",
    ),
  );
});
