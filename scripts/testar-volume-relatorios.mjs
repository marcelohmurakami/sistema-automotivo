import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { importarTypescript } from "./lib/importar-typescript.mjs";
const { calcularGestao } = await importarTypescript("src/lib/relatoriosGestao.ts");
const quantidade = 3000;
const d = {
  agora: "2026-10-31T12:00:00-03:00",
  equipe_permitida: true,
  complementos: [],
  funcionarios: [],
  fornecedores: [],
  ordens: [],
  itens: [],
  historico: [],
  paradas: [],
  qualidade: [],
  orcamentos: [],
  titulos: [],
  pagamentos: [],
  produtos: [],
  movimentos: [],
  compras: [],
  agenda: [],
  comissoes: [],
  profissionais: [],
};
for (let i = 0; i < quantidade; i++) {
  const id = `os-${i}`;
  d.ordens.push({
    id,
    numero: i,
    cliente_id: `cliente-${i % 300}`,
    cliente: `Cliente ${i % 300}`,
    veiculo: "Gol",
    tipo: "cabecote",
    situacao: "delivered",
    total: 10000,
    entrada: "2026-10-01T08:00:00-03:00",
    inicio: "2026-10-02T08:00:00-03:00",
    pronta: "2026-10-03T08:00:00-03:00",
    entrega: "2026-10-04T08:00:00-03:00",
    cancelamento: null,
    prazo: "2026-10-04T08:00:00-03:00",
    orcado: 10000,
    orcamento: null,
    adicionais: 0,
    mao_obra: 1000,
  });
  d.itens.push({
    id: `item-${i}`,
    os: id,
    catalogo: "servico",
    produto: null,
    tipo: "service",
    nome: "Retífica",
    quantidade: 1,
    receita: 10000,
  });
  d.complementos.push({
    entidade: "os",
    registro_id: id,
    revisao: 1,
    dados: { custos_conferidos: true },
  });
  d.historico.push(
    { os: id, data: "2026-10-02T08:00:00-03:00", de: "open", para: "in_progress" },
    { os: id, data: "2026-10-03T08:00:00-03:00", de: "in_progress", para: "ready" },
    { os: id, data: "2026-10-04T08:00:00-03:00", de: "ready", para: "delivered" },
  );
  d.paradas.push({
    os: id,
    motivo: "parts",
    inicio: "2026-10-01T10:00:00-03:00",
    fim: "2026-10-01T12:00:00-03:00",
  });
}
const inicio = performance.now();
const r = calcularGestao(d, "2026-10-01", "2026-10-31");
const duracaoMs = performance.now() - inicio;
assert.equal(r.osFinanceiro.length, quantidade);
assert.equal(r.clientes.length, 300);
assert.equal(r.servicos[0].receita, quantidade * 10000);
assert.equal(
  r.osFinanceiro.reduce((n, o) => n + o.margem, 0),
  quantidade * 9000,
);
assert.equal(r.tempoEtapas.find((e) => e.etapa === "ready").dias, 1);
assert.equal(r.motivosParada[0].horas, quantidade * 2);
assert.equal(r.paradas.length, quantidade);
await mkdir("output", { recursive: true });
const resultado = {
  ordens: quantidade,
  itens: d.itens.length,
  eventos: d.historico.length,
  duracaoMs: Math.round(duracaoMs),
};
if (process.argv.includes("--comparar")) {
  const anterior = await importarTypescript(
    "output/refatoracao-antes/lib/relatoriosGestao.ts",
  );
  const antes = performance.now();
  const esperado = anterior.calcularGestao(d, "2026-10-01", "2026-10-31");
  resultado.anteriorMs = Math.round(performance.now() - antes);
  assert.deepEqual(
    r,
    esperado,
    "A otimização deve preservar todos os resultados e a ordenação",
  );
}
await writeFile(
  "output/desempenho-relatorios.json",
  JSON.stringify(resultado, null, 2),
);
console.log("OK: volume, totais, clientes, etapas e paradas:", resultado);
