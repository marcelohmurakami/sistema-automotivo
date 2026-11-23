import assert from "node:assert/strict";
import test from "node:test";
import {
  classificarEntrega,
  entregaDoCampo,
  entregaParaCampo,
} from "../src/lib/entregaPrometida.ts";
import { prepararMapa } from "../src/lib/mapaOficina.ts";

const agora = new Date("2026-10-05T15:00:00Z"); // 12h em São Paulo
const tipo = (data, situacao = "open", referencia = agora) =>
  classificarEntrega(data, situacao, referencia).tipo;
test("sem data ou data corrompida não inventa atraso", () => {
  for (const data of [null, undefined, "", "inválida"])
    assert.equal(tipo(data), "sem-data");
});
test("prazo passado hoje gera atraso, com prioridade sobre entrega hoje", () => {
  assert.equal(tipo("2026-10-05T14:59:59Z"), "atrasada");
  assert.equal(
    classificarEntrega("2026-10-05T14:59:59Z", "open", agora).hoje,
    true,
  );
});
test("no instante exato ainda está no prazo; um milissegundo depois, atrasa", () => {
  assert.equal(tipo(agora.toISOString()), "hoje");
  assert.equal(
    tipo(agora.toISOString(), "open", new Date(+agora + 1)),
    "atrasada",
  );
});
test("entrega hoje futura é amarela e entrega amanhã verde", () => {
  assert.equal(tipo("2026-10-05T23:00:00Z"), "hoje");
  assert.equal(tipo("2026-10-06T12:00:00Z"), "no-prazo");
});
test("hoje usa São Paulo, inclusive quando já virou o dia em UTC", () => {
  assert.equal(tipo("2026-10-06T02:59:00Z"), "hoje");
  assert.equal(tipo("2026-10-06T03:00:00Z"), "no-prazo");
});
test("a virada do dia muda automaticamente a classificação", () => {
  assert.equal(
    tipo("2026-10-06T12:00:00Z", "open", new Date("2026-10-06T02:59:59Z")),
    "no-prazo",
  );
  assert.equal(
    tipo("2026-10-06T12:00:00Z", "open", new Date("2026-10-06T03:00:00Z")),
    "hoje",
  );
});
for (const status of ["delivered", "cancelled"])
  test(`${status}: encerra alerta, preserva o prazo original`, () => {
    const r = classificarEntrega("2026-10-01T15:00:00Z", status, agora);
    assert.equal(r.tipo, "encerrada");
    assert.equal(r.atrasada, false);
    assert.equal(r.hoje, false);
    assert.equal(r.data, "01/10/2026 às 12:00");
    assert.equal(tipo(null, status), "encerrada");
  });
test("pronta continua acompanhando a promessa com aviso de retirada", () => {
  const r = classificarEntrega("2026-10-05T14:00:00Z", "ready", agora);
  assert.equal(r.tipo, "atrasada");
  assert.match(r.aviso, /retirada/);
});
test("todas as fases abertas acompanham o mesmo prazo", () => {
  for (const status of ["open", "in_progress", "quality_check", "ready"])
    assert.equal(tipo("2026-10-04T15:00:00Z", status), "atrasada");
});
test("campo converte ida e volta de São Paulo sem depender do fuso do aparelho", () => {
  assert.equal(entregaDoCampo("2026-10-05T17:30"), "2026-10-05T20:30:00.000Z");
  assert.equal(entregaParaCampo("2026-10-05T20:30:00Z"), "2026-10-05T17:30");
  assert.equal(
    entregaParaCampo("2026-10-05T17:30:00-03:00"),
    "2026-10-05T17:30",
  );
});
test("meia-noite não se transforma em 24h nem no dia seguinte", () => {
  assert.equal(entregaParaCampo("2026-10-06T03:00:00Z"), "2026-10-06T00:00");
  assert.equal(entregaDoCampo("2026-10-06T00:00"), "2026-10-06T03:00:00.000Z");
});
test("datas históricas respeitam o antigo horário de verão", () => {
  assert.equal(entregaDoCampo("2018-12-10T12:00"), "2018-12-10T14:00:00.000Z");
  assert.throws(() => entregaDoCampo("2018-11-04T00:30"));
});
test("campo vazio remove prazo; inválido não salva silenciosamente", () => {
  assert.equal(entregaDoCampo(""), null);
  assert.equal(entregaParaCampo("inválida"), "");
  for (const data of [
    "erro",
    "2026-02-30T12:00",
    "2026-13-01T12:00",
    "2026-10-05T25:00",
    "2026-10-05",
  ])
    assert.throws(() => entregaDoCampo(data));
});
test("mapa e lista compartilham situação, cor e texto", () => {
  const base = {
    id: "1",
    numero: 1,
    situacao: "open",
    veiculo_id: "v",
    dados_cliente: {},
    dados_veiculo: {},
    responsavel: null,
    queixa_cliente: null,
    recebido_em: null,
    paradas: [],
  };
  for (const entrega of [
    null,
    "inválida",
    "2026-10-01T15:00:00Z",
    "2026-10-05T20:00:00Z",
    "2026-10-06T20:00:00Z",
  ]) {
    const [mapa] = prepararMapa(
      [{ ...base, entrega_prevista_em: entrega }],
      agora,
    );
    assert.deepEqual(
      mapa.prazoEntrega,
      classificarEntrega(entrega, "open", agora),
    );
  }
});
test("mapa ordena pelo instante real mesmo com offsets diferentes e datas ausentes", () => {
  const base = {
    situacao: "open",
    veiculo_id: "v",
    dados_cliente: {},
    dados_veiculo: {},
    responsavel: null,
    queixa_cliente: null,
    recebido_em: null,
    paradas: [],
  };
  const ordens = [
    "2026-10-06T12:00:00-03:00",
    "2026-10-06T14:00:00Z",
    "inválida",
    null,
    "2026-10-04T20:00:00Z",
  ].map((d, i) => ({
    ...base,
    id: String(i),
    numero: i,
    entrega_prevista_em: d,
  }));
  assert.deepEqual(
    prepararMapa(ordens, agora).map((o) => o.id),
    [4, 1, 0, 2, 3],
  );
});
