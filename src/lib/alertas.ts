const formatoDataAlerta = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
/** Datas civis: alertas são calculados no calendário de São Paulo. */
export function dataSaoPaulo(data = new Date()) {
  return formatoDataAlerta.format(data);
}
export function diasAte(data: string, referencia: string) {
  return Math.round((Date.parse(data) - Date.parse(referencia)) / 86400000);
}
export function marcoAlerta(dias: number): number | null {
  if (!Number.isFinite(dias) || dias > 5) return null;
  if (dias > 1) return 5;
  if (dias === 1) return 1;
  if (dias === 0) return 0;
  if (dias > -5) return -1;
  if (dias > -10) return -5;
  if (dias > -30) return -10;
  return -Math.floor(-dias / 30) * 30;
}
export function textoPrazo(dias: number) {
  return dias === 0
    ? "Vence hoje"
    : dias > 0
      ? `Faltam ${dias} dia${dias === 1 ? "" : "s"}`
      : `Atrasado há ${-dias} dia${dias === -1 ? "" : "s"}`;
}
export function vencimentoMensal(mes: string, dia: number) {
  const [ano, numero] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(ano, numero, 0)).getUTCDate();
  return `${mes.slice(0, 7)}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
}
export function proximoMes(mes: string) {
  const [ano, numero] = mes.split("-").map(Number);
  return new Date(Date.UTC(ano, numero, 1)).toISOString().slice(0, 10);
}
