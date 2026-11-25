import assert from "node:assert/strict";
import { test } from "node:test";
import {
  lerEntradaDesconto,
  validarEntradaDesconto,
} from "../src/lib/entradaDesconto.ts";
import { calcularDesconto } from "../src/lib/desconto.ts";

test("digitação gradual aceita vírgula, ponto, zeros e campo vazio", () => {
  for (const [texto, esperado] of [
    ["", ""],
    ["1", 1],
    ["12", 12],
    ["12,", 12],
    ["12,5", 12.5],
    ["12,50", 12.5],
    ["12.", 12],
    ["12.5", 12.5],
    [",5", 0.5],
    ["0,", 0],
    ["0,05", 0.05],
    ["00", 0],
  ]) {
    assert.equal(lerEntradaDesconto(texto), esperado, texto);
    assert.equal(validarEntradaDesconto(texto, 100), "", texto);
  }
});

test("mantém limites financeiros e rejeita texto de preenchimento automático", () => {
  for (const texto of ["qa@example.com", ",", "1,2,3", "1.000,00", "1e2", "Infinity"]) {
    assert.equal(lerEntradaDesconto(texto), null, texto);
    assert.notEqual(validarEntradaDesconto(texto, 100), "", texto);
  }
  for (const texto of ["-1", "100,01", "12,345"])
    assert.notEqual(validarEntradaDesconto(texto, 100), "", texto);
  assert.equal(validarEntradaDesconto("100", 100), "");
  assert.equal(validarEntradaDesconto("400", 400), "");
  assert.notEqual(validarEntradaDesconto("400,01", 400), "");
  assert.notEqual(validarEntradaDesconto("10", 0), "");
});

test("desconto digitado recalcula o recebimento sem perder centavos", () => {
  assert.equal(
    calcularDesconto({ tipo: "percentual", valor: lerEntradaDesconto("12,5") }, 40000),
    5000,
  );
  assert.equal(
    calcularDesconto({ tipo: "valor", valor: lerEntradaDesconto("12,50") }, 40000),
    1250,
  );
  assert.equal(
    calcularDesconto({ tipo: "valor", valor: lerEntradaDesconto("0,01") }, 40000),
    1,
  );
});
