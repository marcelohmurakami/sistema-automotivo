import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const fonte = await readFile(
  new URL("../src/lib/graficosRelatorios.ts", import.meta.url),
  "utf8",
);
const js = ts.transpile(fonte, {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ES2022,
});
const {
  agruparGrafico,
  agrupamentoInicial,
  escalaGrafico,
  indicesRotulos,
  rotuloGrupo,
} = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
const pontos = Array.from({ length: 366 }, (_, i) => ({
  data: new Date(Date.UTC(2024, 0, i + 1)).toISOString().slice(0, 10),
  valores: [i % 11, (i % 7) - 4, 1234],
}));
for (const modo of ["dia", "semana", "mes"]) {
  const grupos = agruparGrafico([...pontos].reverse(), modo);
  for (let s = 0; s < 3; s++)
    assert.equal(
      grupos.reduce((v, g) => v + g.valores[s], 0),
      pontos.reduce((v, p) => v + p.valores[s], 0),
      `Totais preservados por ${modo}`,
    );
  assert.equal(grupos[0].data, "2024-01-01");
  assert.equal(grupos.at(-1).fim, "2024-12-31");
}
assert.equal(agruparGrafico(pontos, "mes")[1].fim, "2024-02-29");
const virada = agruparGrafico(
  [
    { data: "2026-12-31", valores: [10] },
    { data: "2027-01-01", valores: [20] },
    { data: "2027-01-04", valores: [30] },
  ],
  "semana",
);
assert.equal(virada.length, 2);
assert.equal(virada[0].valores[0], 30);
assert.equal(rotuloGrupo(virada[0], "semana", true), "31/12/2026 a 01/01/2027");
assert.deepEqual(agruparGrafico([], "mes"), []);
assert.equal(agrupamentoInicial(1), "dia");
assert.equal(agrupamentoInicial(31), "semana");
assert.equal(agrupamentoInicial(365), "mes");
for (const valores of [
  [],
  [0],
  [1, 2],
  [-50100, 1234000],
  [-2, -1],
  [100000000, 900000000],
]) {
  const e = escalaGrafico(valores);
  assert(e.min <= Math.min(0, ...valores));
  assert(e.max >= Math.max(0, ...valores));
  assert(e.max > e.min);
  assert(e.marcas.includes(0));
  assert(e.marcas.every(Number.isInteger));
}
for (const n of [0, 1, 7, 31, 366])
  for (const w of [240, 400, 1000]) {
    const r = indicesRotulos(n, w);
    assert.equal(new Set(r).size, r.length);
    assert(r.every((i) => i >= 0 && i < n));
    if (n > 0) {
      assert.equal(r[0], 0);
      assert.equal(r.at(-1), n - 1);
    }
    assert(r.length <= Math.max(2, Math.floor(w / 92)));
  }
console.log(
  "OK: gráficos preservam totais, virada de ano, fevereiro bissexto, valores negativos, escalas e densidade das datas.",
);
