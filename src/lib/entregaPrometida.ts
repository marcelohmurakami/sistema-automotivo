export const fusoEntrega = "America/Sao_Paulo";
const partesData = new Intl.DateTimeFormat("en-CA", {
  timeZone: fusoEntrega,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const formatoData = new Intl.DateTimeFormat("pt-BR", {
  timeZone: fusoEntrega,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const formatoHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: fusoEntrega,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function dataValida(valor: string | null | undefined) {
  const data = valor ? new Date(valor) : null;
  return data && Number.isFinite(data.getTime()) ? data : null;
}

/** O campo e os avisos usam o horário da oficina, mesmo em outro fuso do aparelho. */
export function entregaParaCampo(valor: string | null | undefined): string {
  const data = dataValida(valor);
  if (!data) return "";
  const p = Object.fromEntries(
    partesData.formatToParts(data).map(({ type, value }) => [type, value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function entregaDoCampo(valor: string): string | null {
  if (!valor) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor))
    throw new Error("Informe uma data e um horário de entrega válidos.");
  const parede = Date.parse(valor + ":00Z");
  if (!Number.isFinite(parede)) throw new Error("Data de entrega inválida.");
  let instante = parede;
  for (let i = 0; i < 3; i++) {
    const local = entregaParaCampo(new Date(instante).toISOString());
    instante += parede - Date.parse(local + ":00Z");
  }
  const iso = new Date(instante).toISOString();
  if (entregaParaCampo(iso) !== valor)
    throw new Error(
      "Esse horário não existe no fuso de São Paulo. Escolha outro horário.",
    );
  return iso;
}

export function classificarEntrega(
  valor: string | null | undefined,
  situacao: string,
  agora = new Date(),
) {
  const entrega = dataValida(valor);
  const encerrada = ["delivered", "cancelled"].includes(situacao);
  const hoje = !!entrega && formatoData.format(entrega) === formatoData.format(agora);
  const atrasada = !encerrada && !!entrega && entrega.getTime() < agora.getTime();
  const tipo = encerrada
    ? "encerrada"
    : !entrega
      ? "sem-data"
      : atrasada
        ? "atrasada"
        : hoje
          ? "hoje"
          : "no-prazo";
  const rotulo = encerrada
    ? situacao === "delivered"
      ? "Entregue"
      : "Cancelada"
    : {
        "sem-data": "Sem entrega definida",
        atrasada: "Entrega atrasada",
        hoje: "Entrega hoje",
        "no-prazo": "Dentro do prazo",
      }[tipo as "sem-data" | "atrasada" | "hoje" | "no-prazo"];
  const data = entrega
    ? `${hoje && !encerrada ? "Hoje" : formatoData.format(entrega)} às ${formatoHora.format(entrega)}`
    : "Data e horário não informados";
  const aviso = encerrada
    ? "Atendimento encerrado. Prazo combinado preservado no histórico."
    : !entrega
      ? "Combine a data e o horário com o cliente para acompanhar a entrega."
      : situacao === "ready"
        ? atrasada
          ? "O prazo passou e o veículo está pronto. Combine a retirada com o cliente."
          : "Veículo pronto. Confirme a retirada até o horário combinado."
        : atrasada
          ? "O horário combinado já passou. Confira a pendência e combine um novo prazo com o cliente."
          : hoje
            ? "Entrega prevista para hoje. Priorize a conclusão e a conferência do serviço."
            : "Serviço dentro do prazo combinado. Acompanhe as etapas até a entrega.";
  return {
    tipo,
    rotulo,
    data,
    aviso,
    hoje: !encerrada && hoje,
    atrasada,
    semData: !entrega,
    instante: entrega?.getTime() ?? null,
  };
}

export type PrazoEntrega = ReturnType<typeof classificarEntrega>;
