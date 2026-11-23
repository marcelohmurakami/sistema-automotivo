import assert from "node:assert/strict";
import { novaFichaEspecialidade } from "../src/lib/perfisAtendimento.ts";
import {
  fichaDoAtendimento,
  resumoOperacao,
  destaquesAtendimento,
  subsetoresDoRamo,
} from "../src/lib/operacaoServicos.ts";

const hoje = "2026-10-14";
assert.equal(
  fichaDoAtendimento({ revisao: 1, vencimento: "2026-10-14" }, "limpeza_estofados")
    .campos.prazo_servico,
  "2026-10-14",
);
assert.equal(
  fichaDoAtendimento({ revisao: 0, vencimento: "2026-10-14" }, "limpeza_estofados")
    .campos.prazo_servico,
  undefined,
);
const ficha = novaFichaEspecialidade("manutencao_climatizacao");
const t = {
  id: "a",
  situacao: "em_execucao",
  vencimento: "2026-01-01",
  ficha_especialidade: ficha,
};
assert.equal(
  resumoOperacao(t, hoje, []).atrasados,
  false,
  "Cobrança vencida não é serviço atrasado",
);
ficha.campos.prazo_servico = "2026-10-13";
ficha.campos.motivo_espera = "Peça / material";
ficha.campos.proxima_data = "2026-10-14";
assert.equal(resumoOperacao(t, hoje, []).atrasados, true);
assert.equal(resumoOperacao(t, hoje, []).espera, true);
assert.equal(resumoOperacao(t, hoje, []).retornos, true);
const visita = {
  atendimento_id: "a",
  situacao: "agendado",
  inicio: "2026-10-14T12:00:00Z",
};
assert.equal(resumoOperacao(t, hoje, [visita]).retornos, false);
assert.equal(
  resumoOperacao(t, hoje, [{ ...visita, situacao: "cancelado" }]).retornos,
  true,
);
assert.equal(
  resumoOperacao(t, hoje, [{ ...visita, situacao: "faltou" }]).retornos,
  true,
);
assert.equal(
  resumoOperacao(t, hoje, [{ ...visita, inicio: "2026-10-14T01:00:00Z" }]).retornos,
  true,
  "Respeita o dia de São Paulo",
);
assert.equal(
  resumoOperacao(t, hoje, [{ ...visita, atendimento_id: "outro" }]).retornos,
  true,
);
assert.equal(
  resumoOperacao({ ...t, situacao: "concluido" }, hoje, []).atrasados,
  false,
);
assert.equal(resumoOperacao({ ...t, situacao: "concluido" }, hoje, []).retornos, true);
assert.equal(resumoOperacao({ ...t, situacao: "cancelado" }, hoje, []).retornos, false);
ficha.campos.motivo_espera = "Sem pendência";
assert.equal(resumoOperacao(t, hoje, []).espera, false);
assert.equal(resumoOperacao({ ...t, situacao: "aguardando" }, hoje, []).espera, true);
assert.equal(
  resumoOperacao({ ...t, ficha_especialidade: null }, hoje, []).prazo,
  t.vencimento,
  "Preserva a data combinada dos registros antigos",
);
const celular = {
  ...t,
  ficha_especialidade: {
    ...novaFichaEspecialidade("assistencia_celulares"),
    etapa: "Pronto para retirada",
  },
};
assert.equal(resumoOperacao(celular, hoje, []).retirada, true);
assert.equal(
  resumoOperacao({ ...celular, situacao: "concluido" }, hoje, []).retirada,
  true,
  "Reparo concluído ainda aguarda retirada física do equipamento",
);
ficha.campos.ativo = "Split 01";
ficha.campos.responsavel = "Técnica fictícia";
const destaques = destaquesAtendimento(t);
assert.ok(destaques.some((c) => c.valor === "Split 01"));
assert.ok(destaques.some((c) => c.valor === "14/10/2026"));
assert.ok(destaques.length <= 3);
assert.deepEqual(destaquesAtendimento({ ...t, ficha_especialidade: null }), []);
assert.equal(subsetoresDoRamo("assistencia_tecnica").length, 5);
assert.equal(subsetoresDoRamo("manutencao_campo").length, 5);
assert.equal(subsetoresDoRamo("limpeza").length, 6);
console.log(
  "PASS prazos técnicos, pendências, retiradas, retornos, agenda, cancelamentos e compatibilidade histórica",
);
