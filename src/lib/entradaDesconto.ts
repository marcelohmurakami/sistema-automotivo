export function lerEntradaDesconto(texto: string): number | "" | null {
  const entrada = texto.trim();
  if (!entrada) return "";
  if (!/^-?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(entrada)) return null;
  const numero = Number(entrada.replace(",", "."));
  return Number.isFinite(numero) ? numero : null;
}

export function validarEntradaDesconto(texto: string, limite: number): string {
  const numero = lerEntradaDesconto(texto);
  if (numero === "") return "";
  if (numero === null) return "Informe um número para o desconto.";
  if (numero < 0) return "O desconto não pode ser negativo.";
  if (/[.,]\d{3,}$/.test(texto.trim())) return "Use no máximo duas casas decimais.";
  if (numero > limite)
    return `O desconto deve ser de até ${limite.toLocaleString("pt-BR")}.`;
  return "";
}
