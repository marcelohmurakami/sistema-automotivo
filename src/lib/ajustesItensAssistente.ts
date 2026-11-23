import type { PropostaAssistente } from "./assistente";

export type AjustesItensAssistente = Record<number, string | null>;

// Todos os ajustes do resumo são enviados juntos. Preços e totais só mudam
// quando o servidor prepara e valida uma nova proposta.
export function pedidoAjustesItens(
  proposta: PropostaAssistente,
  ajustes: AjustesItensAssistente,
) {
  const itens = proposta.itens || [];
  const instrucoes: string[] = [];
  let removidos = 0;
  for (const [indiceTexto, valor] of Object.entries(ajustes)) {
    const indice = Number(indiceTexto),
      item = itens[indice];
    if (!Number.isInteger(indice) || !item)
      throw Error("Confira o item que deseja alterar.");
    // O índice identifica inclusive itens com descrições iguais e mantém a
    // correção de 30 linhas dentro do limite de tamanho da mensagem.
    const identificacao = `item ${indice + 1}`;
    if (valor === null) {
      removidos++;
      instrucoes.push(`Remova o ${identificacao}.`);
    } else {
      if (!/^\d+$/.test(valor) || Number(valor) < 1 || Number(valor) > 10000)
        throw Error("Use uma quantidade inteira de 1 a 10.000.");
      if (Number(valor) !== item.quantidade)
        instrucoes.push(
          `Altere a quantidade do ${identificacao} para ${Number(valor)}.`,
        );
    }
  }
  if (removidos === itens.length && removidos)
    throw Error("Mantenha pelo menos um item ou descarte o resumo.");
  if (!instrucoes.length) return "";
  return `Atualize o resumo usando a numeração ANTES das remoções: ${instrucoes.join(" ")} Mantenha o tipo de documento, o cliente, a identificação, os opcionais, a data, os preços unitários, o desconto e os demais itens.`;
}
