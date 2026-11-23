import { rpc } from "../lib/rpc";

export type ResumoRecurso = {
  id: string;
  nome: string;
  tipo: "box" | "equipamento";
  movel: boolean;
};
export type AtivoAgenda = ResumoRecurso & {
  ativo: boolean;
  revisao: number;
  bloqueios: { inicio: string; fim: string; motivo: string }[];
};
export type DisponibilidadeRecurso = ResumoRecurso & {
  ativo: boolean;
  disponivel: boolean;
  motivo: string;
  inicio: string;
  fim: string;
};
export const listarAtivosAgenda = (oficina: string, signal?: AbortSignal) =>
  rpc<AtivoAgenda[]>("consultar_recursos_reserva", { p_oficina: oficina }, signal);
export const conferirRecursosAgenda = (
  oficina: string,
  dados: Record<string, unknown>,
  signal?: AbortSignal,
) =>
  rpc<DisponibilidadeRecurso[]>(
    "consultar_recursos_reserva",
    {
      p_oficina: oficina,
      p_dados: dados,
    },
    signal,
  );
export const salvarAtivoAgenda = (oficina: string, ativo: AtivoAgenda) =>
  rpc<string>("salvar_ativo_agenda", {
    p_oficina: oficina,
    p_id: ativo.id,
    p_dados: ativo,
    p_revisao: ativo.revisao || null,
  });
export const dadosRecursos = (form: FormData): string[] =>
  JSON.parse(String(form.get("recursos_reservados") || "[]"));
