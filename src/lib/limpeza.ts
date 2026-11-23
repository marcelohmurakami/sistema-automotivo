import type { AtendimentoServico } from "../services/servicos";
import { ehLimpeza } from "./aceiteServico.ts";
import { novaFichaEspecialidade } from "./perfisAtendimento.ts";

/** Somente dados contratados podem ser reaproveitados; execução e aceite são de cada visita. */
export const camposPlanejamentoLimpeza = [
  "endereco_visita",
  "contato_local",
  "telefone_local",
  "base_cobranca",
  "horas_previstas",
  "pessoas_previstas",
  "exclusoes",
  "condicoes_local",
  "area",
  "ambientes",
  "frequencia",
  "acesso",
  "fornecimento",
  "superficies",
  "prioridades",
  "cuidados",
  "itens_extras",
  "restricoes_produtos",
  "organizacao",
  "ocupacao",
  "contrato",
  "turno",
  "rotina",
  "reposicao",
  "areas_criticas",
  "supervisor",
  "periodicidades",
  "tipo_limpeza",
  "entulho",
  "superficies_sensiveis",
  "pecas",
  "tecido",
  "metodo",
  "tipo_bem",
  "quantidade_lugares",
  "modalidade",
  "identificacao_bem",
  "coleta_devolucao",
  "superficie",
  "altura",
  "tipo_acesso",
  "restricoes_vidro",
];
export function fichaProximaLimpeza(a: AtendimentoServico) {
  if (!ehLimpeza(a)) throw Error("Selecione um atendimento de limpeza.");
  const f = novaFichaEspecialidade(a.ficha_especialidade!.especialidade);
  f.campos = Object.fromEntries(
    Object.entries(a.ficha_especialidade!.campos).filter(([id]) =>
      camposPlanejamentoLimpeza.includes(id),
    ),
  );
  return f;
}
export function validarLimpeza(a: AtendimentoServico) {
  if (!ehLimpeza(a)) return;
  const c = a.ficha_especialidade!.campos;
  for (const id of ["pessoas_previstas", "quantidade_lugares"])
    if (
      c[id] &&
      (!Number.isInteger(Number(c[id].replace(",", "."))) ||
        Number(c[id].replace(",", ".")) < 1)
    )
      throw Error(
        "Informe uma quantidade inteira, a partir de 1, para pessoas ou lugares.",
      );
  if (
    a.situacao === "concluido" &&
    ["Suspensa", "Aguardando avaliação"].includes(c.condicao_execucao)
  )
    throw Error(
      "O trabalho está suspenso ou aguardando avaliação. Revise a liberação antes de concluir.",
    );
}
