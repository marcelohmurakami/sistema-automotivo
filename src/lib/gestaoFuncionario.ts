export type PeriodoJornada = { dia: number; inicio: string; fim: string };
export type DiaJornada = {
  dia: number;
  ativo: boolean;
  inicio: string;
  fim: string;
  intervalo: boolean;
  intervaloInicio: string;
  intervaloFim: string;
};
export const diasSemanaFuncionario = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
export function diasDaJornada(periodos: PeriodoJornada[] | null): DiaJornada[] {
  return diasSemanaFuncionario.map((_, dia) => {
    const turnos = (periodos ?? [])
      .filter((p) => p.dia === dia)
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
    return {
      dia,
      ativo: !!turnos.length,
      inicio: turnos[0]?.inicio ?? "08:00",
      fim: turnos.at(-1)?.fim ?? "18:00",
      intervalo: turnos.length === 2,
      intervaloInicio: turnos[0]?.fim ?? "12:00",
      intervaloFim: turnos[1]?.inicio ?? "13:00",
    };
  });
}
export function periodosDaJornada(dias: DiaJornada[]): PeriodoJornada[] {
  const hora = /^([01]\d|2[0-3]):[0-5]\d$/;
  return dias
    .filter((d) => d.ativo)
    .flatMap((d) => {
      if (!hora.test(d.inicio) || !hora.test(d.fim) || d.fim <= d.inicio)
        throw Error(`Confira início e fim de ${diasSemanaFuncionario[d.dia]}.`);
      if (!d.intervalo) return [{ dia: d.dia, inicio: d.inicio, fim: d.fim }];
      if (
        !hora.test(d.intervaloInicio) ||
        !hora.test(d.intervaloFim) ||
        d.intervaloInicio <= d.inicio ||
        d.intervaloFim >= d.fim ||
        d.intervaloFim <= d.intervaloInicio
      )
        throw Error(
          `O intervalo de ${diasSemanaFuncionario[d.dia]} precisa ficar dentro da jornada.`,
        );
      return [
        { dia: d.dia, inicio: d.inicio, fim: d.intervaloInicio },
        { dia: d.dia, inicio: d.intervaloFim, fim: d.fim },
      ];
    });
}
export function intervaloBloqueio(inicio: string, fim: string, diaInteiro: boolean) {
  const formato = diaInteiro
    ? /^\d{4}-\d{2}-\d{2}$/
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
  for (const valor of [inicio, fim]) {
    const data = new Date(`${valor}${diaInteiro ? "T00:00" : ""}:00Z`);
    if (
      !formato.test(valor) ||
      !Number.isFinite(+data) ||
      data.toISOString().slice(0, diaInteiro ? 10 : 16) !== valor
    )
      throw Error("Informe datas e horários válidos.");
  }
  const primeiro = new Date(`${inicio}${diaInteiro ? "T00:00:00" : ":00"}-03:00`);
  const ultimo = new Date(`${fim}${diaInteiro ? "T00:00:00" : ":00"}-03:00`);
  if (diaInteiro) ultimo.setUTCDate(ultimo.getUTCDate() + 1);
  if (!Number.isFinite(+primeiro) || !Number.isFinite(+ultimo) || ultimo <= primeiro)
    throw Error("O término deve ser posterior ao início.");
  const limite = new Date(primeiro);
  limite.setUTCFullYear(limite.getUTCFullYear() + 2);
  if (ultimo > limite) throw Error("Informe um período de até dois anos.");
  return { inicio: primeiro.toISOString(), fim: ultimo.toISOString() };
}
export const atendeClientes = (f: { dados?: Record<string, string> }) =>
  f.dados?.atende_clientes !== "false";
export const corFuncionario = (f: { dados?: Record<string, string> }) =>
  /^#[0-9a-fA-F]{6}$/.test(f.dados?.cor_agenda ?? "") ? f.dados!.cor_agenda : "#3b82f6";
