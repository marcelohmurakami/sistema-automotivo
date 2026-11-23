import type { ItemPropostaServico } from "../types/servicosCompletos";
import {
  gruposOrcamento,
  incluirDependencias,
  retirarGrupo,
  valorSelecionado,
} from "./orcamentoInteligente.ts";

export const itensParaAprovacao = (itens: ItemPropostaServico[]) =>
  itens.map((i) => ({
    ...i,
    preco_unitario_centavos: i.preco_centavos,
  }));
export const gruposDoAtendimento = (itens: ItemPropostaServico[]) =>
  gruposOrcamento(itensParaAprovacao(itens));
export const totalAutorizado = (
  itens: ItemPropostaServico[],
  desconto: number,
  grupos: string[],
) => valorSelecionado(itensParaAprovacao(itens), desconto, grupos);
export function selecionarGrupoAtendimento(
  itens: ItemPropostaServico[],
  grupos: string[],
  nome: string,
  incluir: boolean,
) {
  return incluir
    ? incluirDependencias(itensParaAprovacao(itens), [...grupos, nome])
    : retirarGrupo(itensParaAprovacao(itens), grupos, nome);
}

/** Orçamentos antigos sem itens ainda podem ser autorizados pelo valor informado. */
export function itensDaProposta(
  itens: ItemPropostaServico[],
  titulo: string,
  valor: number,
  id: string,
): ItemPropostaServico[] {
  return itens.length
    ? itens
    : [
        {
          id,
          descricao: titulo,
          tipo: "servico",
          quantidade: 1,
          unidade: "serv",
          preco_centavos: valor,
          grupo_servico: "Atendimento",
        },
      ];
}
