import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";
const fonte = await fs.readFile(
  new URL("../src/lib/atalhosOficina.ts", import.meta.url),
  "utf8",
);
const js = ts.transpile(fonte, {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ES2022,
});
const { filtrarAtalhos } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
const total = filtrarAtalhos("", () => true, true);
assert.equal(total.length, 14);
assert.equal(new Set(total.map((a) => a.rota)).size, total.length);
assert(!filtrarAtalhos("", () => true, false).some((a) => a.gerencia));
assert.deepEqual(
  filtrarAtalhos("", (r) => ["catalog", "customers"].includes(r), true).map(
    (a) => a.nome,
  ),
  ["Consultar clientes"],
);
assert(
  !filtrarAtalhos("", (r) => r !== "finance", true).some((a) =>
    a.rota.includes("financeiro"),
  ),
);
assert.equal(
  filtrarAtalhos("COTAÇÃO", () => true, true)[0].nome,
  "Novo orçamento",
);
assert.equal(
  filtrarAtalhos("os nova", () => true, true)[0].rota,
  "/ordens-servico?nova=1",
);
assert.equal(
  filtrarAtalhos("relatorio lucro", () => true, true)[0].rota,
  "/relatorios?aba=financeiro",
);
assert.equal(filtrarAtalhos("relatorio lucro", () => true, false).length, 0);
assert.equal(filtrarAtalhos("inexistente", () => true, true).length, 0);
console.log(
  "OK: atalhos por plano/perfil, busca sem acentos, sinônimos, rotas e pesquisa por múltiplas palavras.",
);
const fonteSelecao = await fs.readFile(
  new URL("../src/lib/selecaoCliente.ts", import.meta.url),
  "utf8",
);
const jsSelecao = ts.transpile(fonteSelecao, {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ES2022,
});
const { veiculoUnicoDoCliente } = await import(
  "data:text/javascript;base64," + Buffer.from(jsSelecao).toString("base64")
);
const carros = [{ id: "a" }, { id: "b" }],
  vinculos = [
    { cliente_id: "joao", veiculo_id: "a" },
    { cliente_id: "ana", veiculo_id: "a" },
    { cliente_id: "ana", veiculo_id: "b" },
  ];
assert.equal(veiculoUnicoDoCliente("joao", carros, vinculos), "a");
assert.equal(veiculoUnicoDoCliente("ana", carros, vinculos), "");
assert.equal(veiculoUnicoDoCliente("sem-carro", carros, vinculos), "");
assert.equal(
  veiculoUnicoDoCliente("avulso", carros, [
    { cliente_id: "avulso", veiculo_id: "a" },
  ]),
  "",
);
assert.equal(veiculoUnicoDoCliente("joao", [], vinculos), "");
assert.equal(
  veiculoUnicoDoCliente("joao", carros, [...vinculos, vinculos[0]]),
  "a",
);
console.log(
  "OK: veículo único, vários veículos, cliente avulso, sem veículo, vínculos duplicados e veículo indisponível.",
);
