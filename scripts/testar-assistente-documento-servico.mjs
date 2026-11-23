import assert from "node:assert/strict";
import { test } from "node:test";
import { ordemSemAutorizacao, rotuloSituacaoDocumento } from "../src/lib/apresentacaoDocumentoServico.ts";
import { avancarAssistencia, acaoCartaoAssistencia } from "../src/lib/fluxoAssistencia.ts";
import { novaFichaEspecialidade } from "../src/lib/perfisAtendimento.ts";

test("OS recebida não aparece como orçamento nem muda de documento ao pedir autorização", () => {
  const os = { situacao: "orcamento", dados: { documento: "ordem", orcamento_enviado: "nao" }, ficha_especialidade: novaFichaEspecialidade("assistencia_celulares") };
  assert.equal(rotuloSituacaoDocumento(os, "Orçamento"), "Recebido");
  assert.equal(ordemSemAutorizacao(os), true);
  const enviada = avancarAssistencia(os, "assistencia_celulares");
  assert.equal(enviada.dados.documento, "ordem");
  assert.equal(enviada.situacao, "orcamento", "Ainda não há autorização para executar");
  assert.equal(rotuloSituacaoDocumento(enviada, "Orçamento"), "Aguardando autorização");
  assert.equal(acaoCartaoAssistencia(enviada), "Registrar autorização");
  assert.equal(avancarAssistencia(enviada, "assistencia_celulares").situacao, "aprovado");
});

test("orçamentos e situações já aprovadas conservam sua apresentação", () => {
  const orcamento = { situacao: "orcamento", dados: { documento: "orcamento", orcamento_enviado: "sim" } };
  assert.equal(rotuloSituacaoDocumento(orcamento, "Orçamento"), "Orçamento");
  assert.equal(acaoCartaoAssistencia(orcamento), "Aprovar e abrir OS");
  assert.equal(ordemSemAutorizacao(orcamento), false);
  assert.equal(rotuloSituacaoDocumento({ ...orcamento, situacao: "em_execucao", dados: { documento: "ordem" } }, "Em execução"), "Em execução");
});
