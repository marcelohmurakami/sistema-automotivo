const formatoDiaServico = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
});
/** Data civil do aparelho, sem converter meia-noite para UTC. */
export function hojeNoAparelho(agora = new Date()) {
  return `${String(agora.getFullYear()).padStart(4, "0")}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
}
export function validarDataServico(valor: unknown): string {
  if (
    typeof valor !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(valor) ||
    valor.startsWith("0000-") ||
    !Number.isFinite(Date.parse(valor)) ||
    new Date(valor).toISOString().slice(0, 10) !== valor
  )
    throw new Error("Informe uma data válida para o serviço.");
  return valor;
}
export function dataServicoDoCampo(os?: {
  data_servico?: string | null;
  concluido_em?: string | null;
  criado_em: string;
}) {
  if (!os) return hojeNoAparelho();
  return (
    os.data_servico ||
    formatoDiaServico.format(new Date(os.concluido_em || os.criado_em))
  );
}
