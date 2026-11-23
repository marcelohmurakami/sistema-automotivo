import { rpc } from "../lib/rpc";
export type Feriado = { data: string; nome: string; anual: boolean };
export type RegraCalendario = {
  frequencia: string;
  intervalo: number;
  mensal: string;
  dias_semana: number[];
  dias_fechados: number[];
  feriado: string;
  ate: string;
  excecoes: Record<string, { acao: string; data?: string }>;
};
export type OcorrenciaCalendario = {
  original: string;
  data: string | null;
  inicio: string | null;
  fim: string | null;
  motivo: string;
  id?: string;
};
export const regraInicial = (): RegraCalendario => ({
  frequencia: "semanal",
  intervalo: 1,
  mensal: "dia",
  dias_semana: [],
  dias_fechados: [0, 6],
  feriado: "pular",
  ate: "",
  excecoes: {},
});
export const regraFormulario = (f: FormData): RegraCalendario =>
  JSON.parse(String(f.get("regra_calendario") || JSON.stringify(regraInicial())));
export const consultarCalendario = (w: string) =>
  rpc<{ feriados: Feriado[]; revisao: number }>("consultar_calendario_operacao", {
    p_oficina: w,
  });
export const salvarCalendario = (w: string, feriados: Feriado[], revisao: number) =>
  rpc("salvar_calendario_operacao", {
    p_oficina: w,
    p_feriados: feriados,
    p_revisao: revisao,
  });
export const preverCalendario = (w: string, d: Record<string, unknown>, n: number) =>
  rpc<OcorrenciaCalendario[]>("prever_visitas_calendario", {
    p_oficina: w,
    p_dados: d,
    p_quantidade: n,
  });
export const programarCalendario = (
  w: string,
  chave: string,
  d: Record<string, unknown>,
  n: number,
) =>
  rpc<OcorrenciaCalendario[]>("programar_agenda_calendario", {
    p_oficina: w,
    p_chave: chave,
    p_dados: d,
    p_quantidade: n,
  });
export const cancelarSerieCalendario = (w: string, serie: string, desde: string) =>
  rpc<number>("cancelar_serie_calendario", {
    p_oficina: w,
    p_serie: serie,
    p_desde: desde,
  });
