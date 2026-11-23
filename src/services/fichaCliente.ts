import { rpc } from "../lib/rpc";
import type { Acesso } from "../auth/contexto";
import { consultarClienteDemo, type Cliente } from "./clientes";
import type { Notinha } from "./documentos";
import type { BaixaFinanceira, TituloFinanceiro } from "./financeiro";

import type { OrdemServico } from "./ordensServico";
import { lerServicosDemo } from "./servicos";
import { consultarDetalhesAtendimento } from "./servicosCompletos";

export type AtendimentoCliente = {
  id: string;
  tipo: "os" | "nota" | "atendimento";
  numero: number;
  situacao: string;
  data: string;
  total_centavos: number;
  veiculo: { modelo?: string; placa?: string | null };
  resumo: string;
  itens: {
    descricao: string;
    tipo: string;
    quantidade: number;
    unidade: string;
    total_centavos: number;
    situacao: string;
  }[];
};
export type VeiculoCliente = {
  id: string;
  modelo: string;
  marca: string | null;
  placa: string | null;
  ano_modelo: number | null;
  vinculo?: string;
  encerrado_em?: string | null;
  arquivado_em?: string | null;
};
export type FichaCliente = {
  cliente: Cliente;
  resumo: {
    atendimentos_concluidos: number;
    total_servicos_centavos: number;
    ticket_medio_centavos: number | null;
    em_andamento: number;
    ultimo_atendimento_em: string | null;
  };
  financeiro: { pago_centavos: number; aberto_centavos: number } | null;
  veiculos: VeiculoCliente[];
  historico: { itens: AtendimentoCliente[]; total: number };
  recursos: { ordens: boolean; notinhas: boolean };
};
export type FiltroAtendimentos = "todos" | "concluidos" | "andamento" | "cancelados";
const concluido = (a: AtendimentoCliente) =>
  a.tipo === "os" ? a.situacao === "delivered" : a.situacao === "issued";

export async function consultarFichaCliente(
  acesso: Acesso,
  clienteId: string,
  pagina: number,
  filtro: FiltroAtendimentos,
  signal?: AbortSignal,
): Promise<FichaCliente> {
  if (!acesso.demo)
    return rpc(
      "consultar_ficha_cliente",
      {
        p_oficina: acesso.oficina!.id,
        p_cliente: clienteId,
        p_pagina: pagina,
        p_filtro: filtro,
      },
      signal,
    );
  const cliente = consultarClienteDemo(clienteId);
  if (acesso.oficina?.ramo && acesso.oficina.ramo !== "automotivo") {
    const painel = lerServicosDemo(acesso.oficina.id);
    const atendimentos = painel.atendimentos.filter((a) => a.cliente_id === clienteId);
    const concluidos = atendimentos.filter((a) => a.situacao === "concluido");
    const total = concluidos.reduce((s, a) => s + a.valor_centavos, 0);
    const filtrados = atendimentos
      .filter(
        (a) =>
          filtro === "todos" ||
          (filtro === "concluidos"
            ? a.situacao === "concluido"
            : filtro === "cancelados"
              ? a.situacao === "cancelado"
              : !["cancelado", "concluido"].includes(a.situacao)),
      )
      .sort(
        (a, b) =>
          (b.data_servico || "").localeCompare(a.data_servico || "") ||
          b.id.localeCompare(a.id),
      );
    const itens = await Promise.all(
      filtrados.slice(pagina * 20, (pagina + 1) * 20).map(async (a) => {
        const d = await consultarDetalhesAtendimento(true, acesso.oficina!.id, a.id);
        return {
          id: a.id,
          tipo: "atendimento" as const,
          numero: a.numero || 0,
          situacao: a.situacao,
          data: a.data_servico || "",
          total_centavos: a.valor_centavos,
          veiculo: { modelo: painel.objetos.find((o) => o.id === a.objeto_id)?.nome },
          resumo: a.titulo,
          itens: d.itens.map((i) => ({
            descricao: i.descricao,
            tipo: i.tipo === "servico" ? "service" : "part",
            quantidade: i.quantidade,
            unidade: i.unidade,
            total_centavos: Math.round(i.quantidade * i.preco_centavos),
            situacao: a.situacao,
          })),
        };
      }),
    );
    return {
      cliente,
      resumo: {
        atendimentos_concluidos: concluidos.length,
        total_servicos_centavos: total,
        ticket_medio_centavos: concluidos.length
          ? Math.round(total / concluidos.length)
          : null,
        em_andamento: atendimentos.filter(
          (a) => !["concluido", "cancelado", "orcamento"].includes(a.situacao),
        ).length,
        ultimo_atendimento_em:
          concluidos
            .map((a) => a.concluido_em || a.data_servico || "")
            .sort()
            .at(-1) || null,
      },
      financeiro: null,
      veiculos: [],
      historico: { itens, total: filtrados.length },
      recursos: { ordens: true, notinhas: false },
    };
  }
  const ordens: OrdemServico[] = JSON.parse(
    localStorage.getItem("patio_os_v1") || "[]",
  );
  const notas: Notinha[] = JSON.parse(
    localStorage.getItem("patio_notinhas_demo") || "[]",
  );
  const os = acesso.permite("work_orders")
    ? ordens.filter((o) => o.cliente_id === clienteId && !o.arquivado_em)
    : [];
  const itens: AtendimentoCliente[] = [
    ...os.map((o): AtendimentoCliente => ({
      id: o.id,
      tipo: "os",
      numero: o.numero,
      situacao: o.situacao,
      data:
        o.historico.find((h) => h.descricao === "Situação: Entregue")?.ocorrido_em ||
        o.recebido_em ||
        o.criado_em,
      total_centavos: o.total_centavos,
      veiculo: o.dados_veiculo,
      resumo: o.resumo_cliente || o.diagnostico || o.queixa_cliente || "",
      itens: o.itens
        .filter((i) => i.situacao !== "cancelled")
        .map((i) => ({
          ...i,
          total_centavos: Math.round(i.quantidade * i.preco_unitario_centavos),
        })),
    })),
    ...(acesso.permite("simple_notes")
      ? notas
          .filter((n) => n.cliente_id === clienteId)
          .map((n): AtendimentoCliente => ({
            id: n.id,
            tipo: "nota",
            numero: n.numero,
            situacao: n.situacao,
            data: n.emitido_em,
            total_centavos: n.total_centavos,
            veiculo: {},
            resumo: n.observacoes,
            itens: n.itens.map((i) => ({
              ...i,
              total_centavos: Math.round(i.quantidade * i.preco_unitario_centavos),
              situacao: n.situacao === "issued" ? "done" : "pending",
            })),
          }))
      : []),
  ].sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id));
  const realizados = itens.filter(concluido);
  const total = realizados.reduce((s, i) => s + i.total_centavos, 0);
  let financeiro: FichaCliente["financeiro"] = null;
  if (
    acesso.permite("finance") &&
    acesso.permite("work_orders") &&
    ["owner", "manager"].includes(acesso.oficina!.perfil)
  ) {
    const f: { titulos: TituloFinanceiro[]; baixas: BaixaFinanceira[] } = JSON.parse(
      localStorage.getItem("patio_financeiro_v1") || '{"titulos":[],"baixas":[]}',
    );
    financeiro = { pago_centavos: 0, aberto_centavos: 0 };
    for (const t of f.titulos.filter(
      (t) =>
        !t.cancelado_em &&
        t.natureza === "receber" &&
        !t.transferencia_id &&
        os.some((o) => o.id === t.ordem_servico_id && o.situacao !== "cancelled"),
    )) {
      const pago = f.baixas
        .filter((b) => b.titulo_id === t.id)
        .reduce((s, b) => s + (b.estorno_de ? -1 : 1) * b.valor_centavos, 0);
      financeiro.pago_centavos += pago;
      financeiro.aberto_centavos += t.valor_centavos - pago;
    }
  }
  const veiculos: (VeiculoCliente & { cliente_id: string })[] = JSON.parse(
    localStorage.getItem("patio_veiculos_v1") || "[]",
  );
  const filtrados = itens.filter(
    (i) =>
      filtro === "todos" ||
      (filtro === "concluidos" && concluido(i)) ||
      (filtro === "cancelados" && i.situacao === "cancelled") ||
      (filtro === "andamento" && !concluido(i) && i.situacao !== "cancelled"),
  );
  return {
    cliente,
    financeiro,
    veiculos: veiculos.filter((v) => v.cliente_id === clienteId),
    recursos: {
      ordens: acesso.permite("work_orders"),
      notinhas: acesso.permite("simple_notes"),
    },
    resumo: {
      atendimentos_concluidos: realizados.length,
      total_servicos_centavos: total,
      ticket_medio_centavos: realizados.length
        ? Math.round(total / realizados.length)
        : null,
      em_andamento: itens.filter((i) => !concluido(i) && i.situacao !== "cancelled")
        .length,
      ultimo_atendimento_em: realizados[0]?.data ?? null,
    },
    historico: {
      itens: filtrados.slice(pagina * 20, (pagina + 1) * 20),
      total: filtrados.length,
    },
  };
}
