import {
  fimOcupacao,
  inicioOcupacao,
  type VisitaPlanejada,
} from "./logisticaVisitas.ts";

export type VisaoAgenda = "dia" | "semana" | "mes";
export const situacoesAgendaOficina: Record<string, string> = {
  agendado: "Agendado",
  convertido: "OS aberta",
  concluido: "Concluído",
  cancelado: "Cancelado",
};
const formatadores = new Map<string, Intl.DateTimeFormat>();
function formatadorAgenda(tipo: "hora" | "dia", timeZone?: string) {
  const chave = `${tipo}:${timeZone ?? "local"}`;
  let formato = formatadores.get(chave);
  if (!formato) {
    formato = new Intl.DateTimeFormat(tipo === "hora" ? "pt-BR" : "sv-SE", {
      ...(tipo === "hora" ? ({ hour: "2-digit", minute: "2-digit" } as const) : {}),
      timeZone,
    });
    if (formatadores.size >= 32) formatadores.clear();
    formatadores.set(chave, formato);
  }
  return formato;
}
export const horaAgenda = (data: string, timeZone?: string) => {
  const d = new Date(data);
  return Number.isFinite(d.getTime())
    ? formatadorAgenda("hora", timeZone).format(d)
    : d.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone,
      });
};
export function diaAgenda(valor: Date | string, timeZone?: string) {
  const d = typeof valor === "string" ? new Date(valor) : valor;
  if (timeZone) return formatadorAgenda("dia", timeZone).format(d);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function somarDiasAgenda(dia: string, n: number) {
  const d = new Date(`${dia}T12:00:00`);
  d.setDate(d.getDate() + n);
  return diaAgenda(d);
}
export function diasCalendario(dia: string, visao: VisaoAgenda) {
  if (visao === "dia") return [dia];
  const primeiro = visao === "mes" ? `${dia.slice(0, 7)}-01` : dia;
  const deslocamento = (new Date(`${primeiro}T12:00:00`).getDay() + 6) % 7;
  const inicio = somarDiasAgenda(primeiro, -deslocamento);
  const ultimo = new Date(
    Number(dia.slice(0, 4)),
    Number(dia.slice(5, 7)),
    0,
  ).getDate();
  const total = visao === "semana" ? 7 : Math.ceil((deslocamento + ultimo) / 7) * 7;
  return Array.from({ length: total }, (_, i) => somarDiasAgenda(inicio, i));
}
export function moverCalendario(dia: string, visao: VisaoAgenda, passo: number) {
  if (visao !== "mes")
    return somarDiasAgenda(dia, passo * (visao === "semana" ? 7 : 1));
  return diaAgenda(
    new Date(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)) - 1 + passo, 1, 12),
  );
}
export function ocupaDiaAgenda(
  evento: VisitaPlanejada,
  dia: string,
  fusoHorario?: "America/Sao_Paulo",
) {
  const inicio = inicioOcupacao(evento);
  const fim = Math.max(fimOcupacao(evento), inicio + 1);
  const offset = fusoHorario ? "-03:00" : "";
  return (
    inicio < Date.parse(`${somarDiasAgenda(dia, 1)}T00:00:00${offset}`) &&
    fim > Date.parse(`${dia}T00:00:00${offset}`)
  );
}

/** Calcula cada intervalo uma vez, incluindo ida/volta e o fim exclusivo. */
export function agruparAgendaPorDia<T extends VisitaPlanejada>(
  eventos: readonly T[],
  dias: readonly string[],
  fusoHorario?: "America/Sao_Paulo",
) {
  const porDia = new Map(dias.map((dia) => [dia, [] as T[]]));
  const offset = fusoHorario ? "-03:00" : "";
  const limites = [...porDia.keys()].map((dia) => ({
    dia,
    inicio: Date.parse(`${dia}T00:00:00${offset}`),
    fim: Date.parse(`${somarDiasAgenda(dia, 1)}T00:00:00${offset}`),
  }));
  let quantidade = 0;
  for (const evento of eventos) {
    const inicio = inicioOcupacao(evento);
    const fim = Math.max(fimOcupacao(evento), inicio + 1);
    let incluido = false;
    for (const limite of limites) {
      if (inicio < limite.fim && fim > limite.inicio) {
        porDia.get(limite.dia)!.push(evento);
        incluido = true;
      }
    }
    if (incluido) quantidade++;
  }
  return { porDia, quantidade };
}
