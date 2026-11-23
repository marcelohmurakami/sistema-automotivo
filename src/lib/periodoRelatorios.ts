export type PeriodoRelatorio = { inicio: string; fim: string };

export function periodoRelatorioValido(inicio: string, fim: string) {
  const valido = (d: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(d) &&
    Number.isFinite(Date.parse(d)) &&
    new Date(d).toISOString().slice(0, 10) === d;
  return (
    valido(inicio) &&
    valido(fim) &&
    inicio <= fim &&
    Date.parse(fim) - Date.parse(inicio) <= 366 * 86400000
  );
}

export function periodoRapido(tipo: string, hoje: string): PeriodoRelatorio {
  if (tipo === "hoje") return { inicio: hoje, fim: hoje };
  if (tipo === "anterior") {
    const [ano, mes] = hoje.split("-").map(Number);
    return {
      inicio: new Date(Date.UTC(ano, mes - 2, 1)).toISOString().slice(0, 10),
      fim: new Date(Date.UTC(ano, mes - 1, 0)).toISOString().slice(0, 10),
    };
  }
  if (tipo === "30dias")
    return {
      inicio: new Date(Date.parse(hoje) - 29 * 86400000).toISOString().slice(0, 10),
      fim: hoje,
    };
  return { inicio: hoje.slice(0, 7) + "-01", fim: hoje };
}
