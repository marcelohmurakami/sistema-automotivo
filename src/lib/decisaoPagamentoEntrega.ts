import type { TituloFinanceiro } from "../services/financeiro";

/** Consulta o registro persistido, sem usar memória de telas já abertas. */
export function pagamentoDefinidoNaEntrega(dados: {
  total: number;
  cancelado: boolean;
  titulo: Pick<
    TituloFinanceiro,
    "cancelado_em" | "baixado_centavos" | "pagamento_combinado"
  > | null;
}) {
  if (dados.cancelado || dados.titulo?.cancelado_em) return true;
  if (dados.total <= 0) return true;
  if (!dados.titulo) return false;
  return (
    dados.titulo.baixado_centavos >= dados.total ||
    dados.titulo.pagamento_combinado === true
  );
}
