import assert from "node:assert/strict";
import { test } from "node:test";
import {
  perfilAtendimento,
  novaFichaEspecialidade,
  validarFichaEspecialidade,
  gruposFichaEspecialidade,
} from "../src/lib/perfisAtendimento.ts";
import { campoTecnicoVisivel } from "../src/lib/camposFicha.ts";
import {
  concluirReparo,
  registrarRetirada,
  aguardaRetirada,
  aguardaAceite,
  apresentacaoEntrega,
} from "../src/lib/assistenciaTecnica.ts";

const perfil = perfilAtendimento("assistencia_eletrodomesticos");
const campos = perfil.grupos.flatMap((g) => g.campos);
test("Ficha de eletrodomésticos preserva campos antigos e usa identificação do produto", () => {
  const f = novaFichaEspecialidade(perfil.id);
  f.campos = {
    identificacao: "SERIE",
    modalidade: "Bancada",
    endereco_visita: "Endereço anterior",
    tensao: "220 V",
    codigo_erro: "E01",
    instalacao: "Registrada",
    diagnostico: "Bomba defeituosa",
    ciclo: "Completo",
    componentes: "Bomba",
    testes: "Sem vazamento",
    orientacoes: "Orientado",
  };
  validarFichaEspecialidade(f);
  assert.doesNotMatch(JSON.stringify(perfil), /IMEI|alinhamento|veículo/);
  assert.equal(new Set(campos.map((c) => c.id)).size, campos.length);
  assert.ok(
    gruposFichaEspecialidade(f).some((g) =>
      g.campos.some((c) => c.valor === "Endereço anterior"),
    ),
  );
});
test("Conferências aparecem conforme aparelho, sem perder medições existentes", () => {
  const f = novaFichaEspecialidade(perfil.id);
  const campo = (id) => campos.find((c) => c.id === id);
  f.campos.familia = "Lavadora";
  assert.equal(campoTecnicoVisivel(campo("lavagem"), f), true);
  assert.equal(campoTecnicoVisivel(campo("refrigeracao"), f), false);
  f.campos.familia = "Geladeira / freezer";
  f.campos.refrigeracao = "Freezer: -18 °C, 2 h";
  validarFichaEspecialidade(f);
  assert.equal(campoTecnicoVisivel(campo("lavagem"), f), false);
  assert.equal(campoTecnicoVisivel(campo("refrigeracao"), f), true);
  f.campos.lavagem = "Anotação anterior";
  assert.equal(campoTecnicoVisivel(campo("lavagem"), f), true);
  f.campos.familia = "Inválida";
  assert.throws(() => validarFichaEspecialidade(f), /Opção inválida/);
});
test("Endereço só aparece para visita ou quando já possui histórico", () => {
  const f = novaFichaEspecialidade(perfil.id),
    c = campos.find((c) => c.id === "endereco_visita");
  assert.equal(campoTecnicoVisivel(c, f), false);
  f.campos.modalidade = "Domicílio";
  assert.equal(campoTecnicoVisivel(c, f), true);
  f.campos.modalidade = "Bancada";
  f.campos.endereco_visita = "Já registrado";
  assert.equal(campoTecnicoVisivel(c, f), true);
});
test("Visita concluída pede aceite no local, nunca retirada de equipamento", () => {
  const ficha = novaFichaEspecialidade(perfil.id);
  ficha.campos.modalidade = "Domicílio";
  const original = {
    situacao: "em_execucao",
    valor_centavos: 15000,
    ficha_especialidade: ficha,
  };
  const pronto = concluirReparo(original, perfil.id);
  validarFichaEspecialidade(pronto.ficha_especialidade);
  assert.equal(aguardaRetirada(pronto), false);
  assert.equal(aguardaAceite(pronto), true);
  assert.match(apresentacaoEntrega(pronto).acao, /aceite no local/);
  const fim = registrarRetirada(pronto, "Pessoa presente", perfil.id);
  validarFichaEspecialidade(fim.ficha_especialidade);
  assert.equal(fim.ficha_especialidade.etapa, "Aceite registrado");
  assert.equal(aguardaAceite(fim), false);
  assert.equal(fim.valor_centavos, 15000);
  assert.equal(original.situacao, "em_execucao");
  assert.equal(aguardaAceite({ ...pronto, situacao: "cancelado" }), false);
});
test("Bancada mantém retirada e não cria aceite de visita", () => {
  const ficha = novaFichaEspecialidade(perfil.id);
  ficha.campos.modalidade = "Bancada";
  const pronto = concluirReparo(
    { situacao: "em_execucao", ficha_especialidade: ficha },
    perfil.id,
  );
  assert.equal(aguardaRetirada(pronto), true);
  assert.equal(aguardaAceite(pronto), false);
  assert.equal(
    registrarRetirada(pronto, "Cliente", perfil.id).ficha_especialidade.etapa,
    "Entregue",
  );
});
