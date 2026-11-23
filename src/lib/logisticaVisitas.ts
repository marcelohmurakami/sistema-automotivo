export type LogisticaVisita = {
  origem: string;
  destino: string;
  margem_minutos: number;
  retorno_minutos: number;
  distancia_metros?: number;
  retorno_metros?: number;
  fonte?: "manual" | "openrouteservice";
  calculado_em?: string;
  origem_ponto?: [number, number] | null;
  destino_ponto?: [number, number] | null;
};
export type VisitaPlanejada = {
  id: string;
  inicio: string;
  fim: string | null;
  visita?: boolean;
  deslocamento_minutos?: number;
  logistica?: LogisticaVisita | null;
  situacao: string;
};
export const logisticaVazia = (): LogisticaVisita => ({
  origem: "",
  destino: "",
  margem_minutos: 10,
  retorno_minutos: 0,
  fonte: "manual",
});
export function inicioOcupacao(x: VisitaPlanejada) {
  return (
    Date.parse(x.inicio) -
    (x.visita
      ? (x.deslocamento_minutos || 0) + (x.logistica?.margem_minutos || 0)
      : 0) *
      60_000
  );
}
export function fimOcupacao(x: VisitaPlanejada) {
  return (
    Date.parse(x.fim || x.inicio) +
    (x.visita ? x.logistica?.retorno_minutos || 0 : 0) * 60_000
  );
}
export const reservaAtiva = (x: VisitaPlanejada) =>
  ["agendado", "confirmado", "convertido"].includes(x.situacao);
export function conflitoVisita(x: VisitaPlanejada, reservas: VisitaPlanejada[]) {
  return reservaAtiva(x)
    ? reservas.find(
        (y) =>
          y.id !== x.id &&
          reservaAtiva(y) &&
          inicioOcupacao(y) < fimOcupacao(x) &&
          fimOcupacao(y) > inicioOcupacao(x),
      )
    : undefined;
}
export function horarioVisita(ms: number) {
  return Number.isFinite(ms)
    ? new Date(ms).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
}
export function linkNavegacao(origem: string, destino: string) {
  const params = new URLSearchParams({
    api: "1",
    origin: origem,
    destination: destino,
    travelmode: "driving",
  });
  return `https://www.google.com/maps/dir/?${params}`;
}
export function enderecoTexto(endereco?: Record<string, string> | string | null) {
  if (typeof endereco === "string") return endereco;
  if (!endereco) return "";
  return [
    endereco.logradouro || endereco.rua || endereco.endereco,
    endereco.numero,
    endereco.bairro,
    endereco.cidade,
    endereco.uf || endereco.estado,
    endereco.cep,
  ]
    .filter(Boolean)
    .join(", ");
}
export function dadosVisita(form: FormData) {
  const visita = form.get("visita") === "on";
  return {
    visita,
    deslocamento_minutos: visita ? Number(form.get("deslocamento_minutos") || 0) : 0,
    logistica: visita
      ? (JSON.parse(String(form.get("logistica") || "{}")) as LogisticaVisita)
      : {},
  };
}
