const formatoQuantidade = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
export const numeroEstoque = (n: number | null) =>
  n === null ? "Sem controle" : formatoQuantidade.format(n);
