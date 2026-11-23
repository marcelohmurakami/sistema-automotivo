import test from "node:test";
import assert from "node:assert/strict";
import { prepararMapa } from "../src/lib/mapaOficina.ts";
import {
  ordenarVeiculosMapa,
  lerOrdenacoesMapa,
  salvarOrdenacoesMapa,
} from "../src/lib/ordenacaoMapa.ts";

const base = {
  revisao: 1,
  situacao: "in_progress",
  veiculo_id: "v",
  dados_veiculo: { modelo: "Carro" },
  responsavel: null,
  queixa_cliente: "",
  paradas: [],
};
const ordens = [
  {
    ...base,
    id: "antiga",
    numero: 3,
    recebido_em: "2026-10-01T01:30:00Z",
    entrega_prevista_em: "2026-10-09T12:00:00Z",
    dados_cliente: { nome: "Érica" },
  },
  {
    ...base,
    id: "recente",
    numero: 1,
    recebido_em: "2026-10-05T12:00:00Z",
    entrega_prevista_em: "2026-10-07T12:00:00Z",
    dados_cliente: { nome: "bruno" },
  },
  {
    ...base,
    id: "empate",
    numero: 2,
    recebido_em: "2026-10-05T12:00:00Z",
    entrega_prevista_em: null,
    dados_cliente: { nome: "Álvaro" },
  },
  {
    ...base,
    id: "ausente",
    numero: 4,
    recebido_em: null,
    entrega_prevista_em: "2026-10-08T12:00:00Z",
    dados_cliente: { nome: "Carla" },
  },
  {
    ...base,
    id: "invalida",
    numero: 5,
    recebido_em: "inválida",
    entrega_prevista_em: "inválida",
    dados_cliente: { nome: "Daniel" },
  },
];
const veiculos = prepararMapa(ordens, new Date("2026-10-06T12:00:00Z"));
const ids = (ordem) => ordenarVeiculosMapa(veiculos, ordem).map((v) => v.osId);

test("Entrada usa o horário de São Paulo, inclusive na virada do dia", () => {
  const v = veiculos.find((v) => v.osId === "antiga");
  assert.equal(v.entradaTexto, "30/09/2026 às 22:30");
  assert.equal(v.entrada, "2026-10-01T01:30:00Z");
  for (const id of ["ausente", "invalida"]) {
    const semData = veiculos.find((v) => v.osId === id);
    assert.equal(semData.entrada, null);
    assert.equal(semData.entradaTexto, "");
    assert.equal(semData.entradaInstante, null);
  }
});

test("Mais antigos usa entrada real e mantém sem entrada no final", () => {
  assert.deepEqual(ids("antigos"), [
    "antiga",
    "recente",
    "empate",
    "ausente",
    "invalida",
  ]);
});

test("Mais recentes inverte datas sem colocar ausentes na frente e desempata por OS", () => {
  assert.deepEqual(ids("recentes"), [
    "recente",
    "empate",
    "antiga",
    "ausente",
    "invalida",
  ]);
});

test("Entrega próxima ordena prazos, sem previsão fica no final", () => {
  assert.deepEqual(ids("entrega"), [
    "recente",
    "ausente",
    "antiga",
    "empate",
    "invalida",
  ]);
});

test("Cliente ordena nomes em português sem distinguir maiúsculas e acentos", () => {
  assert.deepEqual(ids("cliente"), [
    "empate",
    "recente",
    "ausente",
    "invalida",
    "antiga",
  ]);
});

test("Ordenar uma coluna não altera a lista original ou datas dos cards", () => {
  const antes = structuredClone(veiculos);
  const ordenados = ordenarVeiculosMapa(veiculos, "antigos");
  assert.notEqual(ordenados, veiculos);
  assert.deepEqual(veiculos, antes);
  assert.deepEqual(ordenarVeiculosMapa([], "recentes"), []);
});

test("Preferências independentes por coluna e chave sobrevivem à releitura", () => {
  const dados = new Map();
  const storage = {
    getItem: (k) => dados.get(k) ?? null,
    setItem: (k, v) => dados.set(k, v),
  };
  salvarOrdenacoesMapa(
    "usuario-a:oficina-a",
    { execucao: "antigos", aguardando: "recentes", lista: "cliente" },
    storage,
  );
  salvarOrdenacoesMapa("usuario-b:oficina-a", { execucao: "entrega" }, storage);
  salvarOrdenacoesMapa(
    "usuario-a:oficina-b",
    { execucao: "recentes" },
    storage,
  );
  assert.deepEqual(lerOrdenacoesMapa("usuario-a:oficina-a", storage), {
    execucao: "antigos",
    aguardando: "recentes",
    lista: "cliente",
  });
  assert.deepEqual(lerOrdenacoesMapa("usuario-b:oficina-a", storage), {
    execucao: "entrega",
  });
  assert.deepEqual(lerOrdenacoesMapa("usuario-a:oficina-b", storage), {
    execucao: "recentes",
  });
});

test("Preferências inválidas e armazenamento bloqueado não quebram o mapa", () => {
  for (const valor of ["{", "null", "[]", "42"])
    assert.deepEqual(lerOrdenacoesMapa("teste", { getItem: () => valor }), {});
  assert.deepEqual(
    lerOrdenacoesMapa("teste", {
      getItem: () =>
        '{"execucao":"antigos","aguardando":"desconhecida","invasor":"entrega"}',
    }),
    { execucao: "antigos" },
  );
  const bloqueado = {
    getItem() {
      throw new Error("Bloqueado");
    },
    setItem() {
      throw new Error("Bloqueado");
    },
  };
  assert.deepEqual(lerOrdenacoesMapa("teste", bloqueado), {});
  assert.doesNotThrow(() =>
    salvarOrdenacoesMapa("teste", { execucao: "antigos" }, bloqueado),
  );
});
