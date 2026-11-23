export function rotuloPeriodoFinanceiro(inicio: string, fim: string) {
  const mes = (valor: string) => {
    const data = new Date(`${valor}T12:00:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor) || Number.isNaN(data.getTime())) return "";
    const texto = new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
    }).format(data);
    return texto[0].toUpperCase() + texto.slice(1);
  };
  const de = mes(inicio),
    ate = mes(fim);
  if (!de || !ate) return "Período personalizado";
  return de === ate ? de : `${de} a ${ate}`;
}
