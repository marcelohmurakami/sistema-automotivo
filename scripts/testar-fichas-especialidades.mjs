import assert from "node:assert/strict";
import { especialidades } from "../src/lib/especialidades.ts";
import {
  perfisAtendimento,
  novaFichaEspecialidade,
  validarFichaEspecialidade,
  temFichaEspecialidade,
  gruposFichaEspecialidade,
} from "../src/lib/perfisAtendimento.ts";

assert.deepEqual(
  Object.keys(perfisAtendimento).sort(),
  Object.keys(especialidades).sort(),
);
for (const [id, p] of Object.entries(perfisAtendimento)) {
  const f = novaFichaEspecialidade(id);
  validarFichaEspecialidade(f);
  assert.equal(temFichaEspecialidade(f), false);
  assert.deepEqual(gruposFichaEspecialidade(f), []);
  assert.equal(new Set(p.etapas).size, p.etapas.length);
  assert.equal(new Set(p.checklist).size, p.checklist.length);
  const campos = p.grupos.flatMap((g) => g.campos);
  assert.equal(new Set(campos.map((c) => c.id)).size, campos.length);
  assert.ok(p.indicador.campos.every((k) => campos.some((c) => c.id === k)));
  for (const c of campos)
    f.campos[c.id] =
      c.tipo === "data"
        ? "2028-02-29"
        : c.tipo === "numero"
          ? "4.125"
          : c.opcoes?.[0] || "Registro técnico <teste>";
  f.etapa = p.etapas[0];
  f.checklist[p.checklist[0]] = true;
  validarFichaEspecialidade(f);
  assert.equal(temFichaEspecialidade(f), true);
  const grupos = gruposFichaEspecialidade(f);
  assert.ok(grupos.length >= 3);
  assert.ok(grupos.flatMap((g) => g.campos).some((c) => c.valor === "Conferido"));
  assert.ok(grupos.flatMap((g) => g.campos).some((c) => c.valor === "Não marcado"));
  assert.throws(() =>
    validarFichaEspecialidade({ ...f, campos: { estranho: "dado" } }),
  );
  assert.throws(() =>
    validarFichaEspecialidade({ ...f, checklist: { [p.checklist[0]]: "true" } }),
  );
  assert.throws(() => validarFichaEspecialidade({ ...f, etapa: "Etapa inexistente" }));
  assert.throws(() =>
    validarFichaEspecialidade({ ...f, campos: { [campos[0].id]: "x".repeat(1501) } }),
  );
  for (const c of campos) {
    if (c.tipo === "numero")
      for (const v of ["-1", "NaN", "1e4", "1,2", "1.0001", "1000000000"])
        assert.throws(() => validarFichaEspecialidade({ ...f, campos: { [c.id]: v } }));
    if (c.tipo === "data")
      for (const v of ["2026-02-29", "14/10/2026", "0000-01-01"])
        assert.throws(() => validarFichaEspecialidade({ ...f, campos: { [c.id]: v } }));
  }
}
for (const v of [
  null,
  [],
  {},
  { ...novaFichaEspecialidade("mecanica"), especialidade: "toString" },
  { ...novaFichaEspecialidade("mecanica"), extra: true },
])
  assert.throws(() => validarFichaEspecialidade(v));
console.log(
  "PASS 26 perfis completos, IDs, fichas vazias, medidas decimais, datas, listas, campos inválidos e apresentação sem dados inventados",
);
import { normalizarColecoesOSDemo } from "../src/lib/ordensDemo.ts";
const legado = {
  id: "legado",
  ficha_especialidade: {
    versao: 1,
    especialidade: "retifica",
    campos: {},
    checklist: {},
    etapa: "",
  },
};
const normalizado = normalizarColecoesOSDemo(legado);
assert.deepEqual(normalizado.historico, []);
assert.deepEqual(normalizado.paradas, []);
assert.deepEqual(normalizado.itens, []);
assert.equal(normalizado.recebido_em, undefined);
assert.equal(normalizado.ficha_especialidade, legado.ficha_especialidade);
assert.equal(legado.historico, undefined);
