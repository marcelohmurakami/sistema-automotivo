import type {
  BaixaFinanceira,
  ResumoFinanceiro,
  TituloFinanceiro,
} from "../services/financeiro";

export type DiaFinanceiro = {
  data: string;
  receitas: number;
  custos: number;
  entradas: number;
  saidas: number;
};
export type CategoriaFinanceira = {
  natureza: string;
  categoria: string;
  valor: number;
};
export type FaixaFinanceira = {
  faixa: number;
  receber: number;
  pagar: number;
  quantidade?: number;
};
export type DetalhesFinanceiros = {
  serie: DiaFinanceiro[];
  categorias: CategoriaFinanceira[];
  caixa_categorias: CategoriaFinanceira[];
  formas: { forma: string; bruto: number; taxas: number; liquido: number }[];
  vencimentos: FaixaFinanceira[];
  atrasos: FaixaFinanceira[];
  pendencias: Pick<
    TituloFinanceiro,
    | "id"
    | "descricao"
    | "pessoa"
    | "natureza"
    | "vencimento"
    | "aberto_centavos"
    | "valor_variavel"
    | "valor_confirmado_em"
  >[];
  saldo_inicial: number;
  saldo_final: number;
  variaveis_pendentes: number;
  data_referencia: string;
};
export type RelatorioFinanceiro = DetalhesFinanceiros & {
  resumo: ResumoFinanceiro;
  anterior: ResumoFinanceiro;
  contas: { conta: string; saldo: number }[];
  inicio_anterior: string;
  fim_anterior: string;
};
export const dataDeslocada = (data: string, dias: number) =>
  new Date(Date.parse(data) + dias * 86400000).toISOString().slice(0, 10);
export function periodoAnterior(inicio: string, fim: string) {
  return {
    inicio: dataDeslocada(
      inicio,
      -((Date.parse(fim) - Date.parse(inicio)) / 86400000 + 1),
    ),
    fim: dataDeslocada(inicio, -1),
  };
}
export const custoTotal = (r: ResumoFinanceiro) => r.pecas + r.despesas + r.taxas;
export const resultadoFinanceiro = (r: ResumoFinanceiro) => r.receitas - custoTotal(r);
export const nomesFaixas = [
  "Vencidos",
  "Hoje",
  "De 1 a 7 dias",
  "De 8 a 15 dias",
  "De 16 a 30 dias",
  "Após 30 dias",
];
export const nomesAtrasos = [
  "Até 7 dias",
  "8 a 30 dias",
  "31 a 60 dias",
  "Mais de 60 dias",
];

// A demonstração usa a mesma base completa; nenhuma soma depende da página da listagem.
export function detalharFinanceiro(
  titulos: TituloFinanceiro[],
  baixas: BaixaFinanceira[],
  pecas: { data: string; valor: number }[],
  inicio: string,
  fim: string,
  hoje: string,
): DetalhesFinanceiros {
  const periodo = (d: string) => d >= inicio && d <= fim;
  const serie: DiaFinanceiro[] = [];
  for (let d = inicio; d <= fim; d = dataDeslocada(d, 1))
    serie.push({ data: d, receitas: 0, custos: 0, entradas: 0, saidas: 0 });
  const dias = new Map(serie.map((d) => [d.data, d]));
  const porId = new Map(titulos.map((t) => [t.id, t]));
  const categorias = new Map<string, CategoriaFinanceira>(),
    caixa = new Map<string, CategoriaFinanceira>();
  const somar = (
    map: Map<string, CategoriaFinanceira>,
    natureza: string,
    categoria: string,
    valor: number,
  ) => {
    const chave = natureza + ":" + categoria,
      c = map.get(chave) ?? { natureza, categoria, valor: 0 };
    c.valor += valor;
    map.set(chave, c);
  };
  const formas = new Map<string, DetalhesFinanceiros["formas"][number]>();
  const pagos = new Map<string, number>();
  let saldo_inicial = 0,
    saldo_final = 0;
  for (const b of baixas) {
    const t = porId.get(b.titulo_id);
    if (!t) continue;
    const sinal = b.estorno_de ? -1 : 1,
      bruto = sinal * b.valor_centavos,
      taxa = sinal * b.taxa_centavos;
    pagos.set(t.id, (pagos.get(t.id) ?? 0) + bruto);
    const liquido = bruto - (t.natureza === "receber" ? taxa : 0),
      movimento = (t.natureza === "receber" ? 1 : -1) * liquido;
    if (b.data < inicio) saldo_inicial += movimento;
    if (b.data <= fim) saldo_final += movimento;
    const dia = dias.get(b.data);
    if (!dia) continue;
    dia.custos += taxa;
    somar(categorias, "pagar", "taxas", taxa);
    if (t.categoria === "transferencia") continue;
    dia[t.natureza === "receber" ? "entradas" : "saidas"] += liquido;
    somar(caixa, t.natureza, t.categoria, liquido);
    if (t.natureza === "receber") {
      const f = formas.get(b.forma) ?? {
        forma: b.forma,
        bruto: 0,
        taxas: 0,
        liquido: 0,
      };
      f.bruto += bruto;
      f.taxas += taxa;
      f.liquido += liquido;
      formas.set(b.forma, f);
    }
  }
  const ativos = titulos.filter((t) => !t.cancelado_em);
  for (const t of ativos) {
    if (!periodo(t.competencia)) continue;
    const conta =
      t.natureza === "receber"
        ? !t.provisorio && ["servicos", "outras_receitas"].includes(t.categoria)
        : !["compra_estoque", "retirada", "saldo_inicial", "transferencia"].includes(
            t.categoria,
          );
    if (conta) {
      dias.get(t.competencia)![t.natureza === "receber" ? "receitas" : "custos"] +=
        t.valor_centavos;
      somar(categorias, t.natureza, t.categoria, t.valor_centavos);
    }
  }
  for (const p of pecas)
    if (periodo(p.data)) {
      dias.get(p.data)!.custos += p.valor;
      somar(categorias, "pagar", "pecas_estoque", p.valor);
    }
  const abertos = ativos
    .map((t) => ({
      ...t,
      aberto_centavos: t.valor_centavos - (pagos.get(t.id) ?? 0),
    }))
    .filter((t) => t.aberto_centavos > 0);
  const vencimentos: FaixaFinanceira[] = nomesFaixas.map((_, faixa) => ({
    faixa,
    receber: 0,
    pagar: 0,
    quantidade: 0,
  }));
  const atrasos: FaixaFinanceira[] = nomesAtrasos.map((_, faixa) => ({
    faixa,
    receber: 0,
    pagar: 0,
  }));
  for (const t of abertos) {
    const dias = (Date.parse(t.vencimento) - Date.parse(hoje)) / 86400000;
    const f =
      vencimentos[
        dias < 0
          ? 0
          : dias === 0
            ? 1
            : dias <= 7
              ? 2
              : dias <= 15
                ? 3
                : dias <= 30
                  ? 4
                  : 5
      ];
    f[t.natureza] += t.aberto_centavos;
    f.quantidade!++;
    if (dias < 0)
      atrasos[dias >= -7 ? 0 : dias >= -30 ? 1 : dias >= -60 ? 2 : 3][t.natureza] +=
        t.aberto_centavos;
  }
  const ordenar = (map: Map<string, CategoriaFinanceira>) =>
    [...map.values()]
      .filter((c) => c.valor !== 0)
      .sort(
        (a, b) =>
          a.natureza.localeCompare(b.natureza) ||
          b.valor - a.valor ||
          a.categoria.localeCompare(b.categoria),
      );
  return {
    serie,
    categorias: ordenar(categorias),
    caixa_categorias: ordenar(caixa),
    formas: [...formas.values()].sort(
      (a, b) => b.liquido - a.liquido || a.forma.localeCompare(b.forma),
    ),
    vencimentos,
    atrasos,
    pendencias: (["pagar", "receber"] as const).flatMap((n) =>
      abertos
        .filter((t) => t.natureza === n && t.vencimento <= dataDeslocada(hoje, 30))
        .sort(
          (a, b) =>
            a.vencimento.localeCompare(b.vencimento) ||
            b.aberto_centavos - a.aberto_centavos ||
            a.id.localeCompare(b.id),
        )
        .slice(0, 8)
        .map((t) => ({
          id: t.id,
          descricao: t.descricao,
          pessoa: t.pessoa,
          natureza: t.natureza,
          vencimento: t.vencimento,
          aberto_centavos: t.aberto_centavos,
          valor_variavel: t.valor_variavel ?? false,
          valor_confirmado_em: t.valor_confirmado_em ?? null,
        })),
    ),
    saldo_inicial,
    saldo_final,
    variaveis_pendentes: ativos.filter(
      (t) =>
        t.valor_variavel &&
        !t.valor_confirmado_em &&
        (periodo(t.competencia) || abertos.some((a) => a.id === t.id)),
    ).length,
    data_referencia: hoje,
  };
}

export function agruparSerie(serie: DiaFinanceiro[], modo: "dia" | "mes") {
  if (modo === "dia") return serie;
  const meses = new Map<string, DiaFinanceiro>();
  for (const d of serie) {
    const data = d.data.slice(0, 7),
      m = meses.get(data) ?? {
        data,
        receitas: 0,
        custos: 0,
        entradas: 0,
        saidas: 0,
      };
    m.receitas += d.receitas;
    m.custos += d.custos;
    m.entradas += d.entradas;
    m.saidas += d.saidas;
    meses.set(data, m);
  }
  return [...meses.values()];
}
