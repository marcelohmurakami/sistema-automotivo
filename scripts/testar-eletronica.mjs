import assert from "node:assert/strict";
import { test } from "node:test";
import {
  perfilAtendimento,
  novaFichaEspecialidade,
  validarFichaEspecialidade,
} from "../src/lib/perfisAtendimento.ts";
import {
  concluirReparo,
  registrarRetirada,
  aguardaRetirada,
} from "../src/lib/assistenciaTecnica.ts";
import { gerarPdfAtendimento } from "../src/services/pdfAtendimento.ts";
import { indicadoresEspecialidade } from "../src/lib/indicadoresEspecialidade.ts";

const p = perfilAtendimento("assistencia_eletronica");
test("Eletrônica preserva os campos históricos e identifica placa sem IMEI", () => {
  const f = novaFichaEspecialidade(p.id);
  f.campos = {
    placa: "PCB-001",
    fonte: "12 V",
    esquema: "Manual versão 1",
    ensaio: "30 min",
    diagnostico: "Teste anterior",
    testes: "Resultado anterior",
    componentes: "C12",
    identificacao: "SERIE-001",
  };
  validarFichaEspecialidade(f);
  assert.doesNotMatch(JSON.stringify(p), /IMEI|veículo|alinhamento/);
  assert.equal(
    new Set(p.grupos.flatMap((g) => g.campos.map((c) => c.id))).size,
    p.grupos.flatMap((g) => g.campos).length,
  );
});
test("Placa avulsa registra medição, rastreabilidade, alcance e limitação do ensaio", () => {
  const f = novaFichaEspecialidade(p.id);
  f.campos = {
    objeto_recebido: "Placa avulsa",
    placa: "PCB-002",
    revisao_placa: "REV-B",
    medicoes_entrada: "TP1: esperado 5 V, medido 0 V",
    componentes: "U3, PN-001 → PN-002, lote L1",
    medicoes_saida: "TP1: 5.01 V",
    diagnostico: "Fonte",
    condicao_ensaio: "Somente placa / módulo",
    resultado_teste: "Teste parcial",
    limitacoes_teste: "Sem o equipamento original",
    duracao_ensaio: "30",
    protecao_esd: "Conferido e registrado",
  };
  validarFichaEspecialidade(f);
  assert.equal(
    indicadoresEspecialidade([{ id: "a", nome: "Placa teste", ficha: f }]).grupos[0]
      .completos,
    1,
    "Mede registro documental, não aprovação automática",
  );
  const pronto = concluirReparo(
    { situacao: "em_execucao", ficha_especialidade: f },
    p.id,
  );
  assert.equal(pronto.ficha_especialidade.campos.resultado_teste, "Teste parcial");
  assert.equal(aguardaRetirada(pronto), true);
  const entregue = registrarRetirada(pronto, "Cliente", p.id);
  validarFichaEspecialidade(entregue.ficha_especialidade);
  assert.equal(
    entregue.ficha_especialidade.campos.limitacoes_teste,
    "Sem o equipamento original",
  );
  f.campos.duracao_ensaio = "-1";
  assert.throws(() => validarFichaEspecialidade(f), /número válido/);
});
test("Impressão do cliente identifica placa; medições e diagnóstico ficam na ficha técnica", () => {
  const f = novaFichaEspecialidade(p.id);
  f.campos = {
    placa: "PCB-TESTE-001",
    revisao_placa: "REV-B",
    diagnostico: "DIAGNOSTICO_INTERNO",
    medicoes_saida: "MEDICAO_INTERNA",
  };
  const d = {
    atendimento: {
      id: "a",
      numero: 9,
      data_servico: "2026-10-15",
      titulo: "Reparo de placa",
      valor_centavos: 10000,
      dados: {},
      ficha_especialidade: f,
    },
    cliente: { nome: "Cliente fictício" },
    objeto: { nome: "Placa de fonte", dados: { serie: "SERIE-001" } },
    itens: [],
    comercial: { desconto_centavos: 0 },
  };
  const publico = gerarPdfAtendimento(d, { nome: "Assistência teste" }).output();
  assert.match(publico, /PCB-TESTE-001/);
  assert.match(publico, /REV-B/);
  assert.doesNotMatch(publico, /DIAGNOSTICO_INTERNO|MEDICAO_INTERNA/);
  const tecnico = gerarPdfAtendimento(
    d,
    { nome: "Assistência teste" },
    "tecnica",
  ).output();
  assert.match(tecnico, /DIAGNOSTICO_INTERNO/);
  assert.match(tecnico, /MEDICAO_INTERNA/);
});
