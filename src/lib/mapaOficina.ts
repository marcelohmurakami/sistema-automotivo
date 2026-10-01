export type OrdemNoMapa = {
  id: string;
  numero: number;
  situacao: string;
  veiculo_id: string;
  dados_cliente: { nome?: string };
  dados_veiculo: { modelo?: string; placa?: string };
  responsavel: string | null;
  queixa_cliente: string | null;
  recebido_em: string | null;
  entrega_prevista_em: string | null;
  paradas: {
    id: string;
    motivo: string;
    detalhes: string;
    encerrado_em: string | null;
  }[];
};
export const motivosParada: Record<string, string> = {
  parts: "Aguardando peças",
  approval: "Aguardando aprovação",
  third_party: "Aguardando terceiros",
  capacity: "Sem capacidade disponível",
  diagnosis: "Aguardando diagnóstico",
  other: "Outra pendência",
};
export const etapasMapa = [
  { id: "recepcao", nome: "Recebidas", descricao: "Aguardando início" },
  { id: "execucao", nome: "Em execução", descricao: "Serviços em andamento" },
  { id: "aguardando", nome: "Paradas", descricao: "Pendências abertas" },
  {
    id: "conferencia",
    nome: "Conferência",
    descricao: "Verificação do serviço",
  },
  { id: "pronto", nome: "Prontas", descricao: "Aguardando entrega" },
];
export const normalizarBuscaMapa = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
const dia = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
export function prepararMapa(ordens: OrdemNoMapa[], agora = new Date()) {
  return ordens
    .filter((o) =>
      ["open", "in_progress", "quality_check", "ready"].includes(o.situacao),
    )
    .map((o) => {
      const paradas = o.paradas.filter((p) => !p.encerrado_em),
        data = o.entrega_prevista_em ? new Date(o.entrega_prevista_em) : null;
      const valida = data && !Number.isNaN(data.getTime()) ? data : null,
        hoje = !!valida && dia(valida) === dia(agora);
      const tecnico = o.responsavel?.trim() || "Sem responsável";
      return {
        id: o.numero,
        osId: o.id,
        veiculoId: o.veiculo_id,
        presente: !!o.recebido_em,
        modelo: o.dados_veiculo.modelo || "Veículo não informado",
        placa: o.dados_veiculo.placa || "Sem placa",
        cliente: o.dados_cliente.nome || "Cliente não informado",
        versao: (
          {
            open: "Recebida",
            in_progress: "Em execução",
            quality_check: "Conferência",
            ready: "Pronta para entrega",
          } as Record<string, string>
        )[o.situacao],
        servico: o.queixa_cliente || "Relato não informado",
        etapa: paradas.length
          ? "aguardando"
          : o.situacao === "ready"
            ? "pronto"
            : o.situacao === "quality_check"
              ? "conferencia"
              : o.situacao === "in_progress"
                ? "execucao"
                : "recepcao",
        motivo: paradas
          .map((p) => `${motivosParada[p.motivo] ?? p.motivo}: ${p.detalhes}`)
          .join(" · "),
        tecnico,
        iniciais:
          tecnico === "Sem responsável"
            ? "—"
            : tecnico
                .split(" ")
                .slice(0, 2)
                .map((s) => s[0])
                .join(""),
        cor: "azul",
        hoje,
        semPrazo: !valida,
        atrasado: !!valida && valida.getTime() < agora.getTime(),
        prazo: valida
          ? `${hoje ? "Hoje" : new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(valida)}, ${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(valida)}`
          : "Sem previsão",
        entrega: o.entrega_prevista_em,
      };
    })
    .sort(
      (a, b) =>
        Number(b.atrasado) - Number(a.atrasado) ||
        (a.entrega ?? "9999").localeCompare(b.entrega ?? "9999") ||
        a.id - b.id,
    );
}
export type VeiculoMapa = ReturnType<typeof prepararMapa>[number];
