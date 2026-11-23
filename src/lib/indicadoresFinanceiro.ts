export const indicadoresFinanceiro = {
  resultado: {
    titulo: "Resultado do período",
    explicacao:
      "Receitas menos despesas, peças consumidas e taxas, conforme o resumo financeiro.",
  },
  receitas: {
    titulo: "Serviços e outras receitas",
    explicacao:
      "Receitas reconhecidas no período, incluindo valores que ainda não foram recebidos.",
  },
  custos: {
    titulo: "Custos e despesas",
    explicacao:
      "Despesas registradas, peças consumidas e taxas descontadas no resultado financeiro.",
  },
  saldo: {
    titulo: "Dinheiro disponível",
    explicacao:
      "Saldo de todas as datas. A lista abaixo mostra as movimentações do período escolhido.",
  },
  entradas: {
    titulo: "Entradas no período",
    explicacao:
      "Recebimentos menos taxas e estornos. Transferências entre suas contas não entram neste total.",
  },
  saidas: {
    titulo: "Saídas no período",
    explicacao:
      "Pagamentos menos estornos, incluindo compras e retiradas. Transferências entre suas contas não entram neste total.",
  },
  receber: {
    titulo: "Contas a receber",
    explicacao:
      "Saldo que falta receber de todas as contas em aberto, incluindo as atrasadas.",
  },
  pagar: {
    titulo: "Contas a pagar",
    explicacao:
      "Saldo que falta pagar de todas as contas em aberto, incluindo as atrasadas.",
  },
} as const;
export type IndicadorFinanceiro = keyof typeof indicadoresFinanceiro;
export const ehIndicadorFinanceiro = (
  v: string | undefined,
): v is IndicadorFinanceiro => !!v && Object.hasOwn(indicadoresFinanceiro, v);
export function dataFinanceiraValida(v: string | null): v is string {
  return (
    !!v &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v
  );
}
export const linkIndicadorFinanceiro = (
  indicador: IndicadorFinanceiro,
  inicio: string,
  fim: string,
) => `/financeiro/detalhes/${indicador}?${new URLSearchParams({ inicio, fim })}`;
export const nomesComposicao: Record<string, string> = {
  receita: "Receitas",
  despesa: "Despesas",
  estoque: "Peças consumidas",
  taxa: "Taxas",
  entrada: "Recebimentos",
  saida: "Pagamentos",
  receber: "A receber",
  pagar: "A pagar",
};
