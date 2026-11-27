import type { AtendimentoServico } from "../services/servicos";
import { fichaDoAtendimento } from "./operacaoServicos";
import { entregaParaCampo } from "./entregaPrometida";
import type { AlteracaoRapidaMapa } from "../services/edicaoRapidaMapa";

export function dadosAtalhoAtendimento(
  a: AtendimentoServico,
  especialidade: string,
  alteracao: AlteracaoRapidaMapa,
): AtendimentoServico {
  if (alteracao.campo === "tipo")
    return { ...a, dados: { ...a.dados, tipo_servico: alteracao.valor } };
  const ficha = fichaDoAtendimento(a, especialidade);
  return {
    ...a,
    dados: { ...a.dados, entrega_prevista_em: alteracao.valor || "" },
    ficha_especialidade: {
      ...ficha,
      campos: {
        ...ficha.campos,
        prazo_servico: entregaParaCampo(alteracao.valor).slice(0, 10),
      },
    },
  };
}
