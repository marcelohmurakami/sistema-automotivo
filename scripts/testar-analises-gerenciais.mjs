import test from "node:test";
import assert from "node:assert/strict";
import {
  formatarAnalise,
  taxaPrimeiraVisita,
  termosAnalise,
  analises,
} from "../src/lib/analisesGerenciais.ts";
test("Primeira visita sem denominador não apresenta sucesso fictício", () => {
  assert.equal(taxaPrimeiraVisita({ avaliaveis: 0, resolvidos: 0 }), null);
  assert.equal(taxaPrimeiraVisita({ avaliaveis: 4, resolvidos: 3 }), 75);
});
test("Valores de custo, tempo, ausência e cobertura são legíveis", () => {
  assert.match(formatarAnalise("margem", -12345), /-.*123,45/);
  assert.equal(formatarAnalise("trabalho", 90), "1,5 h");
  assert.equal(formatarAnalise("capacidade", null), "Não informado");
  assert.equal(formatarAnalise("cobertura", 0), "0%");
  assert.equal(
    formatarAnalise("criterio", "horas, receita"),
    "Horas trabalhadas, Receita do mês",
  );
  assert.match(
    formatarAnalise("primeira", "2026-09-07T13:00:00Z"),
    /07\/09\/2026.*10:00/,
  );
});
test("Nove análises com linguagem adequada ao ramo", () => {
  assert.equal(Object.keys(analises).length, 9);
  assert.match(termosAnalise("automotivo").ativo, /Veículo/);
  for (const ramo of ["assistencia_tecnica", "manutencao_campo", "limpeza"]) {
    assert.doesNotMatch(JSON.stringify(termosAnalise(ramo)), /Veículo|motor|box/i);
  }
});
