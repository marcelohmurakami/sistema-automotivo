import type { TituloFinanceiro } from "../services/financeiro";

/** Só dispensa a conferência quando não há saldo a receber ou o registro foi cancelado. */
export function pagamentoDefinidoNaEntrega(dados: {
  total: number;
  cancelado: boolean;
  titulo: Pick<TituloFinanceiro, "cancelado_em" | "baixado_centavos"> | null;
}) {
  if (dados.cancelado || dados.titulo?.cancelado_em) return true;
  if (dados.total <= 0) return true;
  if (!dados.titulo) return false;
  // Combinar uma data (inclusive para o restante de um sinal) não quita a OS.
  return dados.titulo.baixado_centavos >= dados.total;
}
