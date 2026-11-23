import type { EntradaPedido, LinhaPedido } from "../services/suprimentos";

export function limiteRecebimento(i: LinhaPedido, tipo: EntradaPedido["tipo"]) {
  const saldo =
    tipo === "compra"
      ? i.quantidade - i.recebido
      : tipo === "reposicao"
        ? i.devolvido - i.reposto - (i.creditado ?? 0) - (i.sem_reposicao ?? 0)
        : i.recebido - i.devolvido + i.reposto;
  return Math.max(0, Math.round(saldo * 1000) / 1000);
}

export function calcularQuantidadesEntrega(
  entregue: number,
  recusado: number,
  limite: number,
  unidade: string,
) {
  const inteiras = ["un", "unid", "peça", "peca"].includes(unidade.toLowerCase());
  if (
    ![entregue, recusado, limite].every(Number.isFinite) ||
    entregue < 0 ||
    recusado < 0 ||
    recusado > entregue ||
    entregue > limite ||
    [entregue, recusado].some(
      (v) =>
        Math.abs(v * 1000 - Math.round(v * 1000)) > 0.000001 ||
        (inteiras && !Number.isInteger(v)),
    )
  ) {
    throw new Error(
      "Confira as quantidades: a entrega não pode ultrapassar o saldo, e a recusa não pode ultrapassar o que chegou.",
    );
  }
  const aceito = Math.round((entregue - recusado) * 1000) / 1000;
  return {
    aceito,
    naoChegou: Math.round((limite - entregue) * 1000) / 1000,
    pendente: Math.round((limite - aceito) * 1000) / 1000,
  };
}
