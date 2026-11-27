import type { TituloFinanceiro } from "../services/financeiro";

/** Classifica a conferência; nenhum destes estados deve fechar a tela sozinho. */
export function situacaoPagamentoRegistro(dados: {
  total: number;
  cancelado: boolean;
  titulo: Pick<TituloFinanceiro, "cancelado_em" | "baixado_centavos"> | null;
}) {
  if (dados.cancelado || dados.titulo?.cancelado_em) return "cancelado";
  if (dados.total <= 0) return "sem_valor";
  if (!dados.titulo) return "pendente";
  // Combinar uma data (inclusive para o restante de um sinal) não quita a OS.
  return dados.titulo.baixado_centavos >= dados.total ? "pago" : "pendente";
}
