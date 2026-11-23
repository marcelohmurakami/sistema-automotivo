/** Um mês de calendário, limitado ao último dia do mês seguinte. */
export function umMesDepois(data: string): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes, Math.min(dia, ultimoDia)))
    .toISOString()
    .slice(0, 10);
}
