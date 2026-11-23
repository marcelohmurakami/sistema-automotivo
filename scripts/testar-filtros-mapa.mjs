import test from "node:test";
import assert from "node:assert/strict";
import { filtrarVeiculosMapa, prepararMapa } from "../src/lib/mapaOficina.ts";

const base = {
  revisao: 1,
  situacao: "in_progress",
  veiculo_id: "veiculo",
  dados_veiculo: { modelo: "Gol", placa: "ABC-1234" },
  dados_cliente: { nome: "João" },
  responsavel: "Márcio",
  queixa_cliente: "",
  recebido_em: "2026-10-01T12:00:00Z",
  entrega_prevista_em: null,
  paradas: [],
};
const ordens = [
  { ...base, id: "executando", numero: 1 },
  { ...base, id: "pronta", numero: 2, situacao: "ready" },
  { ...base, id: "sem-entrada", numero: 3, situacao: "open", recebido_em: null },
  { ...base, id: "atrasada", numero: 4, entrega_prevista_em: "2026-10-05T12:00:00Z" },
  { ...base, id: "hoje", numero: 5, entrega_prevista_em: "2026-10-13T22:00:00Z" },
  {
    ...base,
    id: "parada",
    numero: 6,
    paradas: [
      { id: "pendencia", motivo: "parts", detalhes: "Retentor", encerrado_em: null },
    ],
  },
  { ...base, id: "entregue", numero: 7, situacao: "delivered" },
];
const mapa = prepararMapa(ordens, new Date("2026-10-13T15:00:00Z"));
const ids = (filtro, busca = "") =>
  filtrarVeiculosMapa(mapa, filtro, busca)
    .map((v) => v.osId)
    .sort();

test("atalhos do mapa respeitam presença, etapa e pendências", () => {
  assert.deepEqual(ids("presentes"), [
    "atrasada",
    "executando",
    "hoje",
    "parada",
    "pronta",
  ]);
  assert.deepEqual(ids("execucao"), ["atrasada", "executando", "hoje"]);
  assert.deepEqual(ids("prontos"), ["pronta"]);
  assert.deepEqual(ids("parados"), ["parada"]);
  assert.equal(ids("todos").includes("entregue"), false);
});
test("filtros de prazo continuam corretos", () => {
  assert.deepEqual(ids("atrasados"), ["atrasada"]);
  assert.deepEqual(ids("hoje"), ["hoje"]);
  assert.deepEqual(ids("sem-prazo"), ["executando", "parada", "pronta", "sem-entrada"]);
});
test("busca combina com o filtro e ignora acentos e pontuação", () => {
  assert.deepEqual(ids("prontos", "joao"), ["pronta"]);
  assert.deepEqual(ids("execucao", "abc1234"), ["atrasada", "executando", "hoje"]);
  assert.deepEqual(ids("parados", "retentor"), ["parada"]);
  assert.deepEqual(ids("prontos", "marcio"), ["pronta"]);
  assert.deepEqual(ids("prontos", "inexistente"), []);
});
test("busca e seleção não alteram os dados ou a ordenação original", () => {
  const antes = structuredClone(mapa);
  filtrarVeiculosMapa(mapa, "atrasados", "Gol");
  assert.deepEqual(mapa, antes);
  assert.deepEqual(filtrarVeiculosMapa([], "todos", ""), []);
});

test("buscas sucessivas reutilizam dados sem esconder atualizações de cliente e parada", () => {
  assert.equal(filtrarVeiculosMapa(mapa, "todos", "João").length, 6);
  assert.equal(filtrarVeiculosMapa(mapa, "todos", "JOAO").length, 6);
  const atualizado = prepararMapa([
    { ...ordens[0], dados_cliente: { nome: "Maria" }, paradas: [{ id: "p", motivo: "approval", detalhes: "Orçamento novo", encerrado_em: null }] },
  ]);
  assert.equal(filtrarVeiculosMapa(atualizado, "todos", "joao").length, 0);
  assert.equal(filtrarVeiculosMapa(atualizado, "parados", "maria").length, 1);
  assert.equal(filtrarVeiculosMapa(atualizado, "todos", "orcamento novo").length, 1);
});
