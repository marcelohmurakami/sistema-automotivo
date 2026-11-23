import { lerOrdensDemo } from "../lib/ordensDemo";
import { rpc } from "../lib/rpc";
import { lerPropostasDemo } from "./orcamentos";
import type { OrdemServico } from "./ordensServico";
import { lerEstoqueDemo } from "./estoque";
import { motivosParada } from "../lib/mapaOficina";
export type ConfiguracoesOficina = {
  nome: string;
  telefone: string;
  endereco: Record<string, string>;
  revisao: number;
};
export async function consultarConfiguracoes(
  demo: boolean,
  oficina: string,
  signal?: AbortSignal,
): Promise<ConfiguracoesOficina> {
  return demo
    ? JSON.parse(
        localStorage.getItem(
          oficina === "demo-assistencia_tecnica"
            ? `patio_configuracoes_demo:${oficina}`
            : "patio_configuracoes_demo",
        ) ||
          JSON.stringify({
            nome:
              oficina === "demo-assistencia_tecnica"
                ? "Assistência técnica · Demonstração"
                : "Oficina do Marcelo",
            telefone: "",
            endereco: {},
            revisao: 1,
          }),
      )
    : rpc("consultar_configuracoes_oficina", { p_oficina: oficina }, signal);
}
export async function salvarConfiguracoes(
  demo: boolean,
  oficina: string,
  d: ConfiguracoesOficina,
) {
  if (!demo)
    return rpc("salvar_configuracoes_oficina", {
      p_oficina: oficina,
      p_revisao: d.revisao,
      p_nome: d.nome,
      p_telefone: d.telefone,
      p_endereco: d.endereco,
    });
  const anterior = await consultarConfiguracoes(true, oficina);
  if (d.revisao !== anterior.revisao)
    throw new Error("Configurações alteradas. Atualize a página.");
  localStorage.setItem(
    oficina === "demo-assistencia_tecnica"
      ? `patio_configuracoes_demo:${oficina}`
      : "patio_configuracoes_demo",
    JSON.stringify({ ...d, revisao: d.revisao + 1 }),
  );
  window.dispatchEvent(new Event("oficina-demo-alterada"));
}
type Indicadores = {
  entregues: number;
  vendido: number;
  ticket: number;
  prazo_medio: number | null;
  no_prazo: number;
  com_previsao: number;
  orcamentos: number;
  enviados: number;
  aprovados: number;
  recusados: number;
};
export type Relatorio = {
  atual: Indicadores;
  anterior: Indicadores;
  inicio_anterior: string;
  fim_anterior: string;
  operacao: {
    ativas: number;
    atrasadas: number;
    prontas: number;
    sem_previsao: number;
    paradas: number;
    aguardando_aprovacao: number;
  };
  atencao: {
    id: string;
    numero: number;
    cliente: string;
    veiculo: string;
    entrega_prevista_em: string | null;
    situacao: string;
    motivo: string | null;
    parada: boolean;
    atrasada: boolean;
  }[];
  paradas_motivos: { motivo: string; quantidade: number }[];
  clientes: {
    cliente_id: string;
    nome: string;
    atendimentos: number;
    total: number;
  }[];
  estoque: { baixo: number; sem_custo: number; controlados: number };
};
const dataSP = (data: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(data),
  );
function validarDatas(inicio: string, fim: string) {
  if (
    !inicio ||
    !fim ||
    inicio > fim ||
    Date.parse(fim) - Date.parse(inicio) > 366 * 86400000
  )
    throw new Error("Escolha um período de até 367 dias.");
}
export async function consultarRelatorios(
  demo: boolean,
  oficina: string,
  inicio: string,
  fim: string,
  signal?: AbortSignal,
): Promise<Relatorio> {
  validarDatas(inicio, fim);
  if (!demo)
    return rpc(
      "consultar_relatorios",
      {
        p_oficina: oficina,
        p_inicio: inicio,
        p_fim: fim,
      },
      signal,
    );
  const ordens: OrdemServico[] = lerOrdensDemo();
  const dias = (Date.parse(fim) - Date.parse(inicio)) / 86400000 + 1,
    inicioAnterior = new Date(Date.parse(inicio) - dias * 86400000)
      .toISOString()
      .slice(0, 10),
    fimAnterior = new Date(Date.parse(inicio) - 86400000).toISOString().slice(0, 10);
  const entregues = (i: string, f: string) =>
    ordens.filter((o) => {
      const data = o.historico.find(
        (h) => h.descricao === "Situação: Entregue",
      )?.ocorrido_em;
      return (
        o.situacao === "delivered" && data && dataSP(data) >= i && dataSP(data) <= f
      );
    });
  const indicadores = (i: string, f: string): Indicadores => {
    const os = entregues(i, f);
    return {
      entregues: os.length,
      vendido: os.reduce((s, o) => s + o.total_centavos, 0),
      ticket: os.length
        ? Math.round(os.reduce((s, o) => s + o.total_centavos, 0) / os.length)
        : 0,
      prazo_medio: os.some((o) => o.recebido_em)
        ? Math.round(
            (os
              .filter((o) => o.recebido_em)
              .reduce(
                (s, o) =>
                  s +
                  (Date.parse(
                    o.historico.find((h) => h.descricao === "Situação: Entregue")!
                      .ocorrido_em,
                  ) -
                    Date.parse(o.recebido_em!)) /
                    86400000,
                0,
              ) /
              os.filter((o) => o.recebido_em).length) *
              10,
          ) / 10
        : null,
      no_prazo: os.filter(
        (o) =>
          o.entrega_prevista_em &&
          o.historico.find((h) => h.descricao === "Situação: Entregue")!.ocorrido_em <=
            o.entrega_prevista_em,
      ).length,
      com_previsao: os.filter((o) => o.entrega_prevista_em).length,
      orcamentos: 0,
      enviados: 0,
      aprovados: 0,
      recusados: 0,
    };
  };
  const ativas = ordens.filter((o) => !["delivered", "cancelled"].includes(o.situacao)),
    atrasada = (o: OrdemServico) =>
      !!o.entrega_prevista_em && Date.parse(o.entrega_prevista_em) < Date.now(),
    parada = (o: OrdemServico) => o.paradas.some((p) => !p.encerrado_em),
    produtos = lerEstoqueDemo().produtos.filter((p) => !p.arquivado_em);
  const clientes = new Map<
    string,
    { cliente_id: string; nome: string; atendimentos: number; total: number }
  >();
  for (const o of entregues(inicio, fim)) {
    const c = clientes.get(o.cliente_id) || {
      cliente_id: o.cliente_id,
      nome: o.dados_cliente.nome,
      atendimentos: 0,
      total: 0,
    };
    c.atendimentos++;
    c.total += o.total_centavos;
    clientes.set(c.cliente_id, c);
  }
  return {
    atual: indicadores(inicio, fim),
    anterior: indicadores(inicioAnterior, fimAnterior),
    inicio_anterior: inicioAnterior,
    fim_anterior: fimAnterior,
    operacao: {
      ativas: ativas.length,
      atrasadas: ativas.filter(atrasada).length,
      prontas: ativas.filter((o) => o.situacao === "ready").length,
      sem_previsao: ativas.filter((o) => !o.entrega_prevista_em).length,
      paradas: ativas.filter(parada).length,
      aguardando_aprovacao: lerPropostasDemo().filter(
        (q) => q.situacao === "awaiting_approval",
      ).length,
    },
    paradas_motivos: Object.keys(motivosParada)
      .map((motivo) => ({
        motivo,
        quantidade: ativas.filter((o) =>
          o.paradas.some((p) => !p.encerrado_em && p.motivo === motivo),
        ).length,
      }))
      .filter((p) => p.quantidade > 0)
      .sort((a, b) => b.quantidade - a.quantidade || a.motivo.localeCompare(b.motivo)),
    atencao: ativas
      .filter((o) => atrasada(o) || parada(o) || o.situacao === "ready")
      .sort(
        (a, b) =>
          Number(atrasada(b)) - Number(atrasada(a)) ||
          Number(parada(b)) - Number(parada(a)) ||
          (a.entrega_prevista_em || "9999").localeCompare(
            b.entrega_prevista_em || "9999",
          ) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, 15)
      .map((o) => ({
        id: o.id,
        numero: o.numero,
        cliente: o.dados_cliente.nome,
        veiculo: o.dados_veiculo.modelo,
        entrega_prevista_em: o.entrega_prevista_em,
        situacao: o.situacao,
        parada: parada(o),
        atrasada: atrasada(o),
        motivo: o.paradas
          .filter((p) => !p.encerrado_em)
          .map((p) => p.detalhes || motivosParada[p.motivo] || "Outra pendência")
          .join("; "),
      })),
    clientes: [...clientes.values()].sort((a, b) => b.total - a.total).slice(0, 10),
    estoque: {
      baixo: produtos.filter((p) => (p.saldo ?? 0) <= p.minimo).length,
      sem_custo: produtos.filter((p) => p.custo_centavos === 0).length,
      controlados: produtos.length,
    },
  };
}
export type EventoGestao = {
  id: string;
  data: string;
  origem: string;
  tipo: string;
  descricao: string;
  autor: string | null;
  autor_nome?: string;
  entidade: string | null;
  numero: string | null;
};
export type DetalheEventoGestao = EventoGestao & {
  detalhes: Record<string, unknown>;
  contexto_atual: {
    cliente?: string;
    identificacao?: string;
    numero?: number;
    campos?: Record<string, unknown>;
  };
};
export async function consultarEventoHistorico(
  demo: boolean,
  oficina: string,
  evento: EventoGestao,
  signal?: AbortSignal,
): Promise<DetalheEventoGestao> {
  if (!demo)
    return rpc(
      "consultar_evento_historico",
      {
        p_oficina: oficina,
        p_origem: evento.origem,
        p_id: evento.id,
      },
      signal,
    );
  const ordem = lerOrdensDemo().find((o) => o.id === evento.entidade);
  const h = ordem?.historico.find((h) => h.id === evento.id);
  const movimento =
    evento.origem === "estoque"
      ? lerEstoqueDemo().movimentos.find((m) => m.id === evento.id)
      : undefined;
  return {
    ...evento,
    autor_nome: "Demonstração",
    detalhes: movimento
      ? {
          tipo: movimento.tipo,
          quantidade: movimento.quantidade,
          saldo_apos: movimento.saldo_apos,
          custo_centavos: movimento.custo_centavos,
          motivo: movimento.motivo,
        }
      : h?.metadados || {},
    contexto_atual: {},
  };
}
export async function consultarHistorico(
  demo: boolean,
  oficina: string,
  inicio: string,
  fim: string,
  tipo: string,
  busca: string,
  pagina: number,
  signal?: AbortSignal,
): Promise<{ itens: EventoGestao[]; total: number }> {
  validarDatas(inicio, fim);
  if (!demo)
    return rpc(
      "consultar_historico_gestao",
      {
        p_oficina: oficina,
        p_inicio: inicio,
        p_fim: fim,
        p_tipo: tipo,
        p_busca: busca,
        p_pagina: pagina,
      },
      signal,
    );
  const os: OrdemServico[] = lerOrdensDemo();
  const eventos: EventoGestao[] = os.flatMap((o) =>
    o.historico.map((h) => ({
      id: h.id,
      data: h.ocorrido_em,
      origem: "os",
      tipo: "ordem_servico",
      descricao: h.descricao,
      autor: null,
      entidade: o.id,
      numero: String(o.numero),
    })),
  );
  for (const m of lerEstoqueDemo().movimentos)
    eventos.push({
      id: m.id,
      data: m.criado_em,
      origem: "estoque",
      tipo: "estoque",
      descricao: `${m.tipo}: ${m.motivo}`,
      autor: null,
      entidade: m.item_catalogo_id,
      numero: null,
    });
  const lista = eventos
    .filter(
      (e) =>
        dataSP(e.data) >= inicio &&
        dataSP(e.data) <= fim &&
        (!tipo || e.tipo === tipo) &&
        `${e.descricao} ${e.numero ?? ""}`.toLowerCase().includes(busca.toLowerCase()),
    )
    .sort((a, b) => b.data.localeCompare(a.data) || a.id.localeCompare(b.id));
  return {
    itens: lista.slice(pagina * 30, pagina * 30 + 30),
    total: lista.length,
  };
}
