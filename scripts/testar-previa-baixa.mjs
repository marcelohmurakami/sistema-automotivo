import assert from "node:assert/strict";
import { test } from "node:test";
import { importarTypescript } from "./lib/importar-typescript.mjs";
const { previaBaixaFinanceira: previa } = await importarTypescript(
  "src/lib/previaBaixaFinanceira.ts",
);

test("recebimento parcial separa taxa do saldo devedor", () => {
  assert.deepEqual(previa(10000, 4000, 120, "receber"), {
    liquido: 3880,
    restante: 6000,
  });
  assert.deepEqual(previa(10000, 10000, 300, "receber"), {
    liquido: 9700,
    restante: 0,
  });
  assert.deepEqual(previa(1, 1, 0, "receber"), { liquido: 1, restante: 0 });
});
test("taxa não pode consumir todo o recebimento, inclusive um centavo", () => {
  for (const valor of [1, 99, 100, 4000, 10000]) {
    assert.equal(previa(10000, valor, valor, "receber"), null);
    assert.equal(previa(10000, valor, valor + 1, "receber"), null);
    assert.equal(previa(10000, valor, valor - 1, "receber").liquido, 1);
  }
});
test("campos vazios, fracionários, negativos e excesso não geram prévia válida", () => {
  for (const valor of [
    NaN,
    Infinity,
    -Infinity,
    -1,
    0,
    0.1,
    10001,
    Number.MAX_SAFE_INTEGER + 1,
  ])
    assert.equal(previa(10000, valor, 0, "receber"), null);
  for (const taxa of [NaN, Infinity, -1, 0.1])
    assert.equal(previa(10000, 1000, taxa, "receber"), null);
  for (const aberto of [NaN, Infinity, -1, 0, 1.1])
    assert.equal(previa(aberto, 1, 0, "receber"), null);
});
test("despesa não permite desconto de taxa de recebimento", () => {
  assert.deepEqual(previa(10000, 4000, 0, "pagar"), { liquido: 4000, restante: 6000 });
  assert.equal(previa(10000, 4000, 100, "pagar"), null);
});
test("mil valores preservam os centavos entre caixa, taxa e saldo restante", () => {
  for (let valor = 1; valor <= 1000; valor++) {
    const taxa = Math.floor(valor * 0.029);
    const p = previa(10000, valor, taxa, "receber");
    assert.equal(p.liquido + taxa + p.restante, 10000);
    assert.ok(p.liquido > 0 && Number.isInteger(p.liquido));
  }
});
