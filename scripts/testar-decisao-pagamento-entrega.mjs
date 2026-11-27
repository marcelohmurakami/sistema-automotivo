import assert from "node:assert/strict";
import test from "node:test";
import { situacaoPagamentoRegistro } from "../src/lib/decisaoPagamentoEntrega.ts";
const dados = (t = {}) => ({
  total: 15000,
  cancelado: false,
  titulo: { cancelado_em: null, baixado_centavos: 0, pagamento_combinado: false, ...t },
});
for (const [nome, d, esperado] of [
  ["quitação total informa pago", dados({ baixado_centavos: 15000 }), "pago"],
  [
    "taxa não reduz a quitação do cliente",
    dados({ baixado_centavos: 15000, taxa_centavos: 300 }),
    "pago",
  ],
  ["data combinada não é quitação", dados({ pagamento_combinado: true }), "pendente"],
  [
    "parcial com prazo precisa conferir restante na entrega",
    dados({ baixado_centavos: 5000, pagamento_combinado: true }),
    "pendente",
  ],
  ["parcial sem combinar restante", dados({ baixado_centavos: 5000 }), "pendente"],
  ["não respondeu ao criar", dados(), "pendente"],
  ["nenhuma cobrança", { ...dados(), titulo: null }, "pendente"],
  [
    "OS 8263/8264: total zero sem cobrança não significa pago",
    { ...dados(), total: 0, titulo: null },
    "sem_valor",
  ],
  ["pagamento estornado", dados({ baixado_centavos: 0 }), "pendente"],
  [
    "valor aumentado após quitar",
    { ...dados({ baixado_centavos: 15000 }), total: 18000 },
    "pendente",
  ],
  [
    "desconto e quitação",
    { ...dados({ baixado_centavos: 13500 }), total: 13500 },
    "pago",
  ],
  ["OS cancelada", { ...dados(), cancelado: true }, "cancelado"],
  ["cobrança cancelada", dados({ cancelado_em: "2026-11-06" }), "cancelado"],
])
  test(nome, () => assert.equal(situacaoPagamentoRegistro(d), esperado));
