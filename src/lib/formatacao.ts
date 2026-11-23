const moedaReal = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Valores monetários do domínio são sempre expressos em centavos. */
export const dinheiro = (centavos: number) => moedaReal.format(centavos / 100);
