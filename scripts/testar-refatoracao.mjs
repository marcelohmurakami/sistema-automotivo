import test from "node:test";
import assert from "node:assert/strict";
import { importarTypescript } from "./lib/importar-typescript.mjs";
const { bloquearRolagem } = await importarTypescript("src/lib/bloqueioRolagem.ts");
const { gerarCSV } = await importarTypescript("src/lib/csv.ts");
const { dinheiro } = await importarTypescript("src/lib/formatacao.ts");
const { lerObjetoLocal, nomeOficinaDemo } = await importarTypescript(
  "src/lib/armazenamentoLocal.ts",
);

for (const ordem of [
  [0, 1],
  [1, 0],
])
  test(`Janelas sobrepostas liberam rolagem na ordem ${ordem}`, () => {
    const body = { style: { overflow: "auto" } };
    const liberar = [bloquearRolagem(body), bloquearRolagem(body)];
    liberar[ordem[0]]();
    assert.equal(body.style.overflow, "hidden");
    liberar[ordem[0]](); // limpeza duplicada não libera o bloqueio de outra janela
    assert.equal(body.style.overflow, "hidden");
    liberar[ordem[1]]();
    assert.equal(body.style.overflow, "auto");
    const novamente = bloquearRolagem(body);
    novamente();
    assert.equal(body.style.overflow, "auto");
  });
test("Bloqueios são independentes e preservam estilo anterior", () => {
  const a = { style: { overflow: "" } },
    b = { style: { overflow: "scroll" } };
  const x = bloquearRolagem(a),
    y = bloquearRolagem(b);
  x();
  assert.equal(a.style.overflow, "");
  assert.equal(b.style.overflow, "hidden");
  y();
  assert.equal(b.style.overflow, "scroll");
});
test("CSV preserva acentos, aspas, separadores, quebras e valores ausentes", () => {
  assert.equal(
    gerarCSV([['Peça; "nova"', "João\nSilva", null, 0]]),
    '\ufeff"Peça; ""nova""";"João\nSilva";"";"0"',
  );
});
test("CSV não permite execução de fórmulas fornecidas como texto", () => {
  for (const prefixo of ["=", "+", "-", "@", "  =", "\t=", "\r="])
    assert.ok(gerarCSV([[prefixo + "1+1"]]).startsWith("\ufeff\"'"));
});
test("CSV mantém valores negativos numéricos importáveis sem liberar fórmulas",()=>{
 assert.equal(gerarCSV([[-12.34,"-12,34"]]),'\ufeff"-12.34";"-12,34"');
 assert.equal(gerarCSV([["-1+1"]]),'\ufeff"\'-1+1"');
});
test("Moeda mantém centavos, valores negativos e arredondamento", () => {
  for (const v of [0, 1, 99, 100, -999, 150.5, 987654321])
    assert.equal(
      dinheiro(v),
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
        v / 100,
      ),
    );
});
test("Preferências corrompidas não derrubam o provedor de acesso", () => {
  const anterior = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  try {
    for (const valor of [
      "{invalido",
      "null",
      "[]",
      "42",
      '"nome"',
      '{"nome":{}}',
      '{"nome":""}',
    ]) {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: { getItem: () => valor },
      });
      assert.equal(nomeOficinaDemo(), "Oficina do Marcelo");
      assert.equal(Array.isArray(lerObjetoLocal("teste")), false);
    }
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: () => '{"nome":"Oficina Horizonte"}' },
    });
    assert.equal(nomeOficinaDemo(), "Oficina Horizonte");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => {
          throw Error("Bloqueado");
        },
      },
    });
    assert.deepEqual(lerObjetoLocal("teste"), {});
  } finally {
    if (anterior) Object.defineProperty(globalThis, "localStorage", anterior);
    else delete globalThis.localStorage;
  }
});
