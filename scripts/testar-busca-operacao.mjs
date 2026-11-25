import assert from "node:assert/strict";
import { test } from "node:test";
import { filtrarBuscaAgenda, exemploBuscaOperacao } from "../src/lib/buscaOperacao.ts";
import { prepararMapa, filtrarVeiculosMapa } from "../src/lib/mapaOficina.ts";
import { diasCalendario, agruparAgendaPorDia } from "../src/lib/calendarioAgenda.ts";
import { especialidades } from "../src/lib/especialidades.ts";

const agenda = [
  {
    id: "hoje",
    cliente: "João da Silva",
    identificacao: "Volkswagen Gol",
    placa: "ABC-1D23",
    servico: "Revisão",
    inicio: "2026-11-25T09:00:00-03:00",
    fim: "2026-11-25T10:00:00-03:00",
  },
  {
    id: "semana",
    cliente: "João da Silva",
    identificacao: "Toyota Corolla",
    inicio: "2026-11-26T09:00:00-03:00",
    fim: "2026-11-26T10:00:00-03:00",
  },
  {
    id: "mes",
    cliente: "João da Silva",
    identificacao: "Honda Civic",
    inicio: "2026-11-03T09:00:00-03:00",
    fim: "2026-11-03T10:00:00-03:00",
  },
  {
    id: "fora",
    cliente: "João da Silva",
    identificacao: "Honda Civic",
    inicio: "2026-12-15T09:00:00-03:00",
    fim: "2026-12-15T10:00:00-03:00",
  },
  {
    id: "outro",
    cliente: "Ana Souza",
    identificacao: "Chevrolet Onix",
    inicio: "2026-11-25T09:00:00-03:00",
    fim: "2026-11-25T10:00:00-03:00",
  },
].map((x) => ({ ...x, situacao: "agendado" }));
const ids = (itens) => itens.map((x) => x.id);

test("agenda busca cliente, carro, placa e palavras combinadas sem exigir acentos", () => {
  assert.deepEqual(ids(filtrarBuscaAgenda(agenda, "  JOAO gol ")), ["hoje"]);
  assert.deepEqual(ids(filtrarBuscaAgenda(agenda, "abc1d23")), ["hoje"]);
  assert.deepEqual(ids(filtrarBuscaAgenda(agenda, "revisao")), ["hoje"]);
  assert.deepEqual(ids(filtrarBuscaAgenda(agenda, "inexistente")), []);
  assert.deepEqual(ids(filtrarBuscaAgenda(agenda, "")), ids(agenda));
  assert.equal(agenda[0].cliente, "João da Silva");
});

test("busca mantém o período: dia, semana e mês", () => {
  const encontrados = filtrarBuscaAgenda(agenda, "joao");
  for (const [visao, quantidade] of [
    ["dia", 1],
    ["semana", 2],
    ["mes", 3],
  ]) {
    const agrupado = agruparAgendaPorDia(
      encontrados,
      diasCalendario("2026-11-25", visao),
      "America/Sao_Paulo",
    );
    assert.equal(agrupado.quantidade, quantidade, visao);
    assert(![...agrupado.porDia.values()].flat().some((x) => x.id === "fora"));
  }
  assert.equal(
    agruparAgendaPorDia(encontrados, ["2026-12-15"], "America/Sao_Paulo").quantidade,
    1,
  );
});

test("normalização e vocabulário atendem os 26 subsistemas", () => {
  assert.equal(Object.keys(especialidades).length, 26);
  for (const [perfil, config] of Object.entries(especialidades)) {
    const identificacao =
      config.ramo === "automotivo"
        ? "Volkswagen Gol"
        : config.ramo === "assistencia_tecnica"
          ? "Notebook Dell"
          : config.ramo === "manutencao_campo"
            ? "Ar-condicionado Loja São José"
            : "Escritório São José";
    const item = { ...agenda[0], identificacao };
    assert.equal(
      filtrarBuscaAgenda([item], identificacao.toLowerCase()).length,
      1,
      perfil,
    );
    assert.equal(filtrarBuscaAgenda([item], "joao").length, 1, perfil);
    assert.equal(
      exemploBuscaOperacao(config.ramo).includes("carro"),
      config.ramo === "automotivo",
      perfil,
    );
  }
});

test("mapa combina cliente e carro sem perder o filtro de etapa", () => {
  const base = {
    revisao: 1,
    veiculo_id: "v",
    responsavel: null,
    queixa_cliente: "",
    recebido_em: null,
    entrega_prevista_em: null,
    paradas: [],
  };
  const mapa = prepararMapa([
    {
      ...base,
      id: "a",
      numero: 1,
      situacao: "ready",
      dados_cliente: { nome: "João Silva" },
      dados_veiculo: { modelo: "Volkswagen Gol", placa: "ABC1D23" },
    },
    {
      ...base,
      id: "b",
      numero: 2,
      situacao: "open",
      dados_cliente: { nome: "João Silva" },
      dados_veiculo: { modelo: "Fiat Uno", placa: "XYZ1D23" },
    },
  ]);
  assert.deepEqual(
    filtrarVeiculosMapa(mapa, "todos", "joao gol").map((x) => x.osId),
    ["a"],
  );
  assert.deepEqual(
    filtrarVeiculosMapa(mapa, "prontos", "joao").map((x) => x.osId),
    ["a"],
  );
  assert.deepEqual(filtrarVeiculosMapa(mapa, "execucao", "joao"), []);
  assert.equal(filtrarVeiculosMapa(mapa, "todos", "").length, 2);
});

test("uma atualização da identificação invalida o índice anterior", () => {
  const antes = { ...agenda[0] };
  assert.equal(filtrarBuscaAgenda([antes], "gol").length, 1);
  const depois = { ...antes, identificacao: "Ford Ka" };
  assert.equal(filtrarBuscaAgenda([depois], "gol").length, 0);
  assert.equal(filtrarBuscaAgenda([depois], "ka").length, 1);
});
