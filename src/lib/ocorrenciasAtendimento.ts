import type { QualidadeAtendimento } from "../types/servicosCompletos";
import { novoId } from "./uuid";
import { hojeNoAparelho } from "./dataServico";
export const tiposOcorrencia = {
  garantia: "Garantia",
  retrabalho: "Retrabalho",
  reclamacao: "Reclamação",
};
export function novaOcorrencia(atendimento: string): QualidadeAtendimento {
  return {
    id: novoId(),
    atendimento_id: atendimento,
    funcionario_id: null,
    tipo: "garantia",
    motivo: "",
    solucao: "",
    aberto_em: hojeNoAparelho(),
    resolvido_em: null,
    custo_centavos: 0,
    minutos: 0,
    nota: null,
    revisao: 0,
  };
}
