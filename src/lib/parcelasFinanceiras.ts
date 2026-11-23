export type ParcelaFinanceira = { valor_centavos: number; vencimento: string };
export function gerarParcelasFinanceiras(
  total: number,
  quantidade: number,
  primeira: string,
): ParcelaFinanceira[] {
  if (
    !Number.isSafeInteger(total) ||
    !Number.isInteger(quantidade) ||
    quantidade < 2 ||
    quantidade > 60 ||
    total < quantidade ||
    !/^\d{4}-\d{2}-\d{2}$/.test(primeira)
  )
    throw new Error("Informe o total, o primeiro vencimento e de 2 a 60 parcelas.");
  const [ano, mes, dia] = primeira.split("-").map(Number);
  const base = new Date(Date.UTC(ano, mes - 1, dia));
  if (base.toISOString().slice(0, 10) !== primeira)
    throw new Error("Primeiro vencimento inválido.");
  return Array.from({ length: quantidade }, (_, i) => {
    const ultimo = new Date(Date.UTC(ano, mes + i, 0)).getUTCDate();
    return {
      valor_centavos: Math.floor(total / quantidade) + (i < total % quantidade ? 1 : 0),
      vencimento: new Date(Date.UTC(ano, mes - 1 + i, Math.min(dia, ultimo)))
        .toISOString()
        .slice(0, 10),
    };
  });
}
