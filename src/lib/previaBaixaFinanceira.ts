/** Valores em centavos, com as mesmas restrições da baixa no banco. */
export function previaBaixaFinanceira(
  aberto: number,
  valor: number,
  taxa: number,
  natureza: "receber" | "pagar",
) {
  if (
    !Number.isSafeInteger(aberto) ||
    !Number.isSafeInteger(valor) ||
    aberto <= 0 ||
    valor <= 0 ||
    valor > aberto ||
    !Number.isSafeInteger(taxa) ||
    taxa < 0 ||
    (natureza === "receber" ? taxa >= valor : taxa !== 0)
  )
    return null;
  return { liquido: valor - taxa, restante: aberto - valor };
}
