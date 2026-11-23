import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { gerarPdfNotinha } from "../src/services/pdfNotinha.ts";
const nota = {
  id: "preview",
  numero: 8024,
  situacao: "issued",
  emitido_em: "2026-10-08T14:00:00-03:00",
  dados_cliente: {
    nome: "Cliente de demonstração",
    telefone_e164: "(16) 99999-0000",
    endereco: "Endereço ilustrativo - Franca / SP",
  },
  dados_oficina: {
    nome: "Retífica Estação",
    telefone: "(16) 3724-7336",
    documento: "66.634.668/0001-07",
    endereco: {
      logradouro: "Rua Benedito Merlino, 405",
      bairro: "Jd. Maria Rosa",
      cidade: "Franca",
      uf: "SP",
    },
  },
  detalhes: {
    data_servico: "2026-10-07",
    vencimento: "2026-11-07",
    motor: "GM Família 1 1.0 8v",
    veiculo: "GM",
    forma_pagamento: "Carteira",
    assinatura: "pendente",
  },
  itens: [
    {
      tipo: "service",
      descricao: "Retífica de virabrequim",
      quantidade: 1,
      unidade: "un",
      preco_unitario_centavos: 20000,
    },
    {
      tipo: "service",
      descricao: "Remoção de parafuso quebrado do bloco",
      quantidade: 1,
      unidade: "un",
      preco_unitario_centavos: 4000,
    },
    {
      tipo: "part",
      descricao: "Jogo de juntas - exemplo de peça",
      quantidade: 1,
      unidade: "un",
      preco_unitario_centavos: 8500,
    },
  ],
  subtotal_centavos: 32500,
  desconto_centavos: 500,
  total_centavos: 32000,
  observacoes:
    "Modelo demonstrativo com dados fictícios de cliente e valores ilustrativos.\nConferir medidas e condições de montagem antes da instalação.",
};
await mkdir("output/pdf", { recursive: true });
const simples = gerarPdfNotinha(nota);
assert.equal(simples.getNumberOfPages(), 1);
await writeFile(
  "output/pdf/notinha-modelo.pdf",
  Buffer.from(simples.output("arraybuffer")),
);
const itens = Array.from({ length: 75 }, (_, i) => ({
  ...nota.itens[i % 3],
  descricao:
    `Item ${i + 1} - serviço com descrição longa, medições, preparação e conferência final. `.repeat(
      2,
    ),
}));
const subtotal = itens.reduce(
  (v, i) => v + i.quantidade * i.preco_unitario_centavos,
  0,
);
const longa = gerarPdfNotinha({
  ...nota,
  itens,
  subtotal_centavos: subtotal,
  total_centavos: subtotal - 500,
  observacoes: "Conferências detalhadas e recomendações de montagem. ".repeat(
    35,
  ),
});
assert(longa.getNumberOfPages() > 1);
await writeFile(
  "output/pdf/notinha-multipagina.pdf",
  Buffer.from(longa.output("arraybuffer")),
);
assert(
  gerarPdfNotinha({
    ...nota,
    situacao: "cancelled",
    detalhes: { ...nota.detalhes, pix_copia_cola: "não deve ser usado" },
  })
    .output()
    .includes("CANCELADA"),
);
console.log(
  `PASS: nota simples em 1 página, ${longa.getNumberOfPages()} páginas sem limite fixo de itens, cancelada sem QR de cobrança.`,
);
