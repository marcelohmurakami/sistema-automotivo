import assert from "node:assert/strict";
import { especialidades } from "../src/lib/especialidades.ts";
import { novaFichaEspecialidade } from "../src/lib/perfisAtendimento.ts";
import { gerarPdfAtendimento } from "../src/services/pdfAtendimento.ts";

for (const [id, perfil] of Object.entries(especialidades)) {
  if (perfil.ramo === "automotivo") continue;
  const ficha = novaFichaEspecialidade(id);
  ficha.campos = {
    endereco_visita: "Rua da visita, 120, unidade 4",
    resultado_teste: "Teste parcial",
    limitacoes_teste: "LIMITACAO_EXECUTADA",
    intervencao: "INTERVENCAO_EXECUTADA",
    condicao_uso: "Uso com restrições",
    situacao_aceite: "Aceito com ressalvas",
    aceite: "PESSOA_QUE_CONFERIU",
    data_aceite: "2026-10-19",
    ressalvas_aceite: "RESSALVA_APOS_EXECUCAO",
    resultado: "RESULTADO_EXECUTADO",
    orientacoes: "ORIENTACAO_COMBINADA",
    ...(id === "assistencia_eletrodomesticos" ? { modalidade: "Domicílio" } : {}),
  };
  const d = {
    atendimento: {
      id: "qa",
      numero: 7,
      titulo: "Atendimento fictício",
      valor_centavos: 17500,
      data_servico: "2026-10-19",
      vencimento: "2026-11-19",
      ficha_especialidade: ficha,
      dados: {
        execucao: "SERVICO_JA_EXECUTADO",
        observacoes_cliente: "OBSERVACAO_PUBLICA",
      },
    },
    cliente: { nome: "Cliente fictício" },
    objeto: {
      nome: "Bem ou local fictício",
      dados: { endereco: "Endereco do cadastro alterado" },
    },
    itens: [],
    comercial: { desconto_centavos: 0 },
  };
  const empresa = { nome: "Empresa fictícia", especialidade: id };
  const proposta = gerarPdfAtendimento(d, empresa, "orcamento").internal.pages.flat().join("\n");
  assert.doesNotMatch(
    proposta,
    /LIMITACAO_EXECUTADA|INTERVENCAO_EXECUTADA|PESSOA_QUE_CONFERIU|RESSALVA_APOS_EXECUCAO|RESULTADO_EXECUTADO|SERVICO_JA_EXECUTADO/,
    id + ": orçamento não apresenta execução ou aceite como já realizados",
  );
  assert.match(proposta, /OBSERVACAO_PUBLICA/);
  const comprovante = gerarPdfAtendimento(d, empresa).output();
  assert.match(comprovante, /SERVICO_JA_EXECUTADO/);
  if (perfil.ramo !== "assistencia_tecnica")
    assert.match(comprovante, /PESSOA_QUE_CONFERIU/);
  if (id === "assistencia_eletrodomesticos") {
    assert.match(
      comprovante,
      /Rua da visita, 120, unidade 4/,
      "Visita de eletrodoméstico identifica endereço histórico",
    );
    assert.doesNotMatch(comprovante, /Endereco do cadastro alterado/);
  }
  console.log("PASS documentos: " + id);
}
