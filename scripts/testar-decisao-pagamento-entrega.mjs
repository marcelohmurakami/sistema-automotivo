import assert from "node:assert/strict";
import test from "node:test";
import { pagamentoDefinidoNaEntrega } from "../src/lib/decisaoPagamentoEntrega.ts";
const dados = (t = {}) => ({
  total: 15000,
  cancelado: false,
  titulo: { cancelado_em: null, baixado_centavos: 0, pagamento_combinado: false, ...t },
});
for (const [nome, d, esperado] of [
  ["quitação total", dados({ baixado_centavos: 15000 }), true],
  [
    "taxa não reduz a quitação do cliente",
    dados({ baixado_centavos: 15000, taxa_centavos: 300 }),
    true,
  ],
  ["data combinada não é quitação", dados({ pagamento_combinado: true }), false],
  [
    "parcial com prazo precisa conferir restante na entrega",
    dados({ baixado_centavos: 5000, pagamento_combinado: true }),
    false,
  ],
  ["parcial sem combinar restante", dados({ baixado_centavos: 5000 }), false],
  ["não respondeu ao criar", dados(), false],
  ["nenhuma cobrança", { ...dados(), titulo: null }, false],
  ["valor zero", { ...dados(), total: 0, titulo: null }, true],
  ["pagamento estornado", dados({ baixado_centavos: 0 }), false],
  [
    "valor aumentado após quitar",
    { ...dados({ baixado_centavos: 15000 }), total: 18000 },
    false,
  ],
  [
    "desconto e quitação",
    { ...dados({ baixado_centavos: 13500 }), total: 13500 },
    true,
  ],
  ["OS cancelada", { ...dados(), cancelado: true }, true],
  ["cobrança cancelada", dados({ cancelado_em: "2026-11-06" }), true],
])
  test(nome, () => assert.equal(pagamentoDefinidoNaEntrega(d), esperado));
