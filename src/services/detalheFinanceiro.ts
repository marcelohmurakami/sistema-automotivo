import { rpc } from "../lib/rpc";
import type { IndicadorFinanceiro } from "../lib/indicadoresFinanceiro";
import { consultarFinanceiroDemoCompleto } from "./financeiro";
import { lerEstoqueDemo } from "./estoque";
export type RegistroIndicador = {
  id: string;
  data: string;
  tipo: string;
  descricao: string;
  pessoa: string;
  categoria: string;
  conta: string | null;
  valor: number;
  dados: {
    titulo_id?: string;
    ordem_servico_id?: string;
    numero_os?: number;
    observacao?: string;
    vencimento?: string;
    competencia?: string;
    valor_original?: number;
    pago?: number;
    forma?: string;
    estorno?: boolean;
    bruto?: number;
    taxa?: number;
    quantidade?: number;
    custo_unitario?: number;
    custos_revisados?: boolean;
  };
};
export type DetalheFinanceiro = {
  total_centavos: number;
  filtrado_centavos: number;
  quantidade: number;
  quantidade_total: number;
  composicao: { tipo: string; valor: number; quantidade: number }[];
  categorias: string[];
  itens: RegistroIndicador[];
  saldos?: { atual: number; anterior: number; final: number };
};
export type FiltroIndicador = {
  indicador: IndicadorFinanceiro;
  inicio: string;
  fim: string;
  busca: string;
  categoria: string;
  conta: string;
  pagina: number;
  filtrarVencimento: boolean;
};
export async function consultarDetalheFinanceiro(
  demo: boolean,
  oficina: string,
  f: FiltroIndicador,
  signal?: AbortSignal,
): Promise<DetalheFinanceiro> {
  if (!demo)
    return rpc(
      "consultar_detalhe_financeiro",
      {
        p_oficina: oficina,
        p_indicador: f.indicador,
        p_inicio: f.inicio,
        p_fim: f.fim,
        p_busca: f.busca,
        p_categoria: f.categoria,
        p_conta: f.conta,
        p_pagina: f.pagina,
        p_filtrar_vencimento: f.filtrarVencimento,
      },
      signal,
    );
  const d = consultarFinanceiroDemoCompleto(),
    registros: RegistroIndicador[] = [],
    periodo = (data: string) => data >= f.inicio && data <= f.fim;
  const resultado = f.indicador === "resultado",
    custos = resultado || f.indicador === "custos",
    pendente = ["receber", "pagar"].includes(f.indicador);
  const saldos = { atual: 0, anterior: 0, final: 0 };
  for (const t of d.titulos) {
    const receita =
      t.natureza === "receber" &&
      !t.provisorio &&
      ["servicos", "outras_receitas"].includes(t.categoria);
    const despesa =
      t.natureza === "pagar" &&
      !["compra_estoque", "retirada", "saldo_inicial", "transferencia"].includes(
        t.categoria,
      );
    if (t.cancelado_em) continue;
    const dados = {
      titulo_id: t.id,
      ordem_servico_id: t.ordem_servico_id ?? undefined,
      observacao: t.observacoes,
      vencimento: t.vencimento,
      competencia: t.competencia,
      valor_original: t.valor_centavos,
      pago: t.baixado_centavos,
      custos_revisados: t.custos_revisados,
    };
    if (
      pendente &&
      t.natureza === f.indicador &&
      t.aberto_centavos > 0 &&
      (!f.filtrarVencimento || periodo(t.vencimento))
    )
      registros.push({
        id: "pendente:" + t.id,
        data: t.vencimento,
        tipo: t.natureza,
        descricao: t.descricao,
        pessoa: t.pessoa,
        categoria: t.categoria,
        conta: null,
        valor: t.aberto_centavos,
        dados,
      });
    if (
      periodo(t.competencia) &&
      (((resultado || f.indicador === "receitas") && receita) || (custos && despesa))
    )
      registros.push({
        id: "titulo:" + t.id,
        data: t.competencia,
        tipo: receita ? "receita" : "despesa",
        descricao: t.descricao,
        pessoa: t.pessoa,
        categoria: t.categoria,
        conta: null,
        valor: t.valor_centavos * (resultado && despesa ? -1 : 1),
        dados,
      });
  }
  for (const b of d.baixas) {
    const t = d.titulos.find((x) => x.id === b.titulo_id);
    if (!t) continue;
    const sinal = b.estorno_de ? -1 : 1,
      valor =
        sinal * (b.valor_centavos - (t.natureza === "receber" ? b.taxa_centavos : 0)),
      direcional = valor * (t.natureza === "receber" ? 1 : -1);
    if (!f.conta || b.conta === f.conta) {
      saldos.atual += direcional;
      if (b.data < f.inicio) saldos.anterior += direcional;
      if (b.data <= f.fim) saldos.final += direcional;
    }
    if (!periodo(b.data)) continue;
    const dados = {
      titulo_id: t.id,
      ordem_servico_id: t.ordem_servico_id ?? undefined,
      forma: b.forma,
      observacao: b.observacao,
      estorno: !!b.estorno_de,
      bruto: b.valor_centavos,
      taxa: b.taxa_centavos,
      competencia: t.competencia,
      vencimento: t.vencimento,
    };
    if (custos && b.taxa_centavos)
      registros.push({
        id: "taxa:" + b.id,
        data: b.data,
        tipo: "taxa",
        descricao: t.descricao,
        pessoa: t.pessoa,
        categoria: "taxas",
        conta: b.conta,
        valor: sinal * b.taxa_centavos * (resultado ? -1 : 1),
        dados,
      });
    if (
      ["saldo", "entradas", "saidas"].includes(f.indicador) &&
      (!f.conta || f.conta === b.conta) &&
      (f.indicador === "saldo" || t.categoria !== "transferencia") &&
      (f.indicador === "saldo" ||
        t.natureza === (f.indicador === "entradas" ? "receber" : "pagar"))
    )
      registros.push({
        id: "baixa:" + b.id,
        data: b.data,
        tipo: t.natureza === "receber" ? "entrada" : "saida",
        descricao: t.descricao,
        pessoa: t.pessoa,
        categoria: t.categoria,
        conta: b.conta,
        valor: f.indicador === "saldo" ? direcional : valor,
        dados,
      });
  }
  if (custos)
    for (const m of lerEstoqueDemo().movimentos) {
      const data = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
      }).format(new Date(m.criado_em));
      if (!m.ordem_servico_id || !periodo(data)) continue;
      const produto = lerEstoqueDemo().produtos.find(
        (p) => p.id === m.item_catalogo_id,
      );
      registros.push({
        id: "estoque:" + m.id,
        data,
        tipo: "estoque",
        descricao: produto?.descricao || "Consumo de estoque",
        pessoa: "",
        categoria: "estoque_consumido",
        conta: null,
        valor: Math.round(-m.quantidade * m.custo_centavos) * (resultado ? -1 : 1),
        dados: {
          ordem_servico_id: m.ordem_servico_id,
          numero_os: m.numero_os ?? undefined,
          observacao: m.motivo,
          quantidade: -m.quantidade,
          custo_unitario: m.custo_centavos,
          estorno: !!m.estorno_de,
        },
      });
    }
  const filtrados = registros
    .filter(
      (r) =>
        (!f.categoria || f.categoria === r.categoria) &&
        `${r.descricao} ${r.pessoa} ${r.dados.observacao || ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(f.busca.toLocaleLowerCase("pt-BR")),
    )
    .sort((a, b) => b.data.localeCompare(a.data) || a.id.localeCompare(b.id));
  return {
    total_centavos: registros.reduce((s, r) => s + r.valor, 0),
    filtrado_centavos: filtrados.reduce((s, r) => s + r.valor, 0),
    quantidade: filtrados.length,
    quantidade_total: registros.length,
    categorias: [...new Set(registros.map((r) => r.categoria))].sort(),
    composicao: [...new Set(registros.map((r) => r.tipo))].map((tipo) => ({
      tipo,
      valor: registros.filter((r) => r.tipo === tipo).reduce((s, r) => s + r.valor, 0),
      quantidade: registros.filter((r) => r.tipo === tipo).length,
    })),
    itens: filtrados.slice(f.pagina * 30, (f.pagina + 1) * 30),
    ...(f.indicador === "saldo" ? { saldos } : {}),
  };
}
