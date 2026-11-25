import { classificarEntrega, fusoEntrega } from "./entregaPrometida.ts";
import { normalizarBuscaOperacao, termosBuscaOperacao } from "./buscaOperacao.ts";

const formatoEntrada = new Intl.DateTimeFormat("pt-BR", {
  timeZone: fusoEntrega,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const horaEntrada = new Intl.DateTimeFormat("pt-BR", {
  timeZone: fusoEntrega,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export type OrdemNoMapa = {
  tipo_servico?: string | null;
  id: string;
  numero: number;
  revisao: number;
  situacao: string;
  veiculo_id: string;
  dados_cliente: { nome?: string };
  dados_veiculo: { modelo?: string; placa?: string };
  responsavel: string | null;
  queixa_cliente: string | null;
  recebido_em: string | null;
  entrega_prevista_em: string | null;
  etapas_execucao?: {
    nome: string;
    situacao: string;
    prazo: string | null;
    responsavel: string;
    posicao: number;
  }[];
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
  {
    id: "recepcao",
    nome: "Recebidas / Diagnóstico",
    descricao: "Recebido na oficina e aguardando diagnóstico",
  },
  { id: "aguardando", nome: "Paradas", descricao: "Pendências abertas" },
  { id: "execucao", nome: "Em execução", descricao: "Serviços em andamento" },
  {
    id: "conferencia",
    nome: "Conferência e testes",
    descricao: "Verificação do serviço",
  },
  { id: "pronto", nome: "Prontas", descricao: "Aguardando entrega" },
];
export const normalizarBuscaMapa = normalizarBuscaOperacao;
export function prepararMapa(ordens: OrdemNoMapa[], agora = new Date()) {
  return ordens
    .filter((o) =>
      ["open", "in_progress", "quality_check", "ready"].includes(o.situacao),
    )
    .map((o) => {
      const paradas = o.paradas.filter((p) => !p.encerrado_em);
      const prazoEntrega = classificarEntrega(o.entrega_prevista_em, o.situacao, agora);
      const tecnico = o.responsavel?.trim() || "Sem responsável";
      const instanteEntrada = o.recebido_em ? Date.parse(o.recebido_em) : NaN;
      const entradaValida = Number.isFinite(instanteEntrada);
      return {
        tipoServico: o.tipo_servico,
        id: o.numero,
        osId: o.id,
        revisao: o.revisao,
        situacao: o.situacao,
        veiculoId: o.veiculo_id,
        presente: !!o.recebido_em,
        entrada: entradaValida ? o.recebido_em : null,
        entradaInstante: entradaValida ? instanteEntrada : null,
        entradaTexto: entradaValida
          ? `${formatoEntrada.format(instanteEntrada)} às ${horaEntrada.format(instanteEntrada)}`
          : "",
        modelo: o.dados_veiculo.modelo || "Veículo não informado",
        placa: o.dados_veiculo.placa || "Sem placa",
        cliente: o.dados_cliente.nome || "Cliente não informado",
        versao: paradas.length
          ? "Parada"
          : (
              {
                open: "Recebida",
                in_progress: "Em execução",
                quality_check: "Conferência",
                ready: "Pronta para entrega",
              } as Record<string, string>
            )[o.situacao],
        servico: o.queixa_cliente?.trim() || "",
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
          .map((p) => {
            const motivo = motivosParada[p.motivo] ?? p.motivo;
            return p.detalhes && p.detalhes !== motivo
              ? `${motivo}: ${p.detalhes}`
              : motivo;
          })
          .join(" · "),
        tecnico,
        etapaExecucaoAtrasada: o.etapas_execucao?.some(
          (e) =>
            !["concluida", "cancelada"].includes(e.situacao) &&
            e.prazo &&
            Date.parse(e.prazo) < +agora,
        ),
        etapaExecucao: o.etapas_execucao
          ?.filter((e) => !["concluida", "cancelada"].includes(e.situacao))
          .sort((a, b) => a.posicao - b.posicao)[0],
        iniciais:
          tecnico === "Sem responsável"
            ? "—"
            : tecnico
                .split(" ")
                .slice(0, 2)
                .map((s) => s[0])
                .join(""),
        cor: "azul",
        prazoEntrega,
        hoje: prazoEntrega.hoje,
        semPrazo: prazoEntrega.semData,
        atrasado: prazoEntrega.atrasada,
        prazo: prazoEntrega.data,
        entrega: o.entrega_prevista_em,
      };
    })
    .sort(
      (a, b) =>
        Number(b.atrasado) - Number(a.atrasado) ||
        (a.prazoEntrega.instante ?? Infinity) - (b.prazoEntrega.instante ?? Infinity) ||
        a.id - b.id,
    );
}
export type VeiculoMapa = ReturnType<typeof prepararMapa>[number];

// Os veículos preparados são imutáveis durante a busca. Reaproveita a normalização
// entre teclas; uma nova consulta/atualização de prazo produz objetos novos.
const indiceBusca = new WeakMap<VeiculoMapa, string>();
function textoParaBusca(v: VeiculoMapa) {
  let texto = indiceBusca.get(v);
  if (texto === undefined) {
    texto = normalizarBuscaMapa(
      `${v.id} ${v.placa} ${v.modelo} ${v.cliente} ${v.motivo} ${v.tecnico}`,
    );
    indiceBusca.set(v, texto);
  }
  return texto;
}

export function filtrarVeiculosMapa(
  veiculos: VeiculoMapa[],
  filtro: string,
  busca: string,
) {
  const termos = termosBuscaOperacao(busca);
  return veiculos.filter(
    (v) =>
      (filtro === "todos" ||
        (filtro === "presentes" && v.presente) ||
        (filtro === "execucao" && v.etapa === "execucao") ||
        (filtro === "prontos" && v.etapa === "pronto") ||
        (filtro === "atrasados" && v.atrasado) ||
        (filtro === "hoje" && v.hoje) ||
        (filtro === "parados" && !!v.motivo) ||
        (filtro === "sem-prazo" && v.semPrazo)) &&
      termos.every((termo) => textoParaBusca(v).includes(termo)),
  );
}
