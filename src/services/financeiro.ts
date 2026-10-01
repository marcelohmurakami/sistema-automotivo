import { rpc } from "./orcamentos";
import { lerEstoqueDemo } from "./estoque";
import type { OrdemServico } from "./ordensServico";
export const categorias: Record<string, string> = {
  transferencia: "Transferência entre contas",
  servicos: "Serviços e peças vendidos",
  outras_receitas: "Outras receitas",
  pecas_externas: "Peças compradas para uma OS",
  pessoal: "Salários e equipe",
  aluguel: "Aluguel",
  agua_luz: "Água, luz e internet",
  impostos: "Impostos",
  terceiros: "Serviços de terceiros",
  outras_despesas: "Outras despesas",
  compra_estoque: "Compra para estoque",
  aporte: "Dinheiro colocado pelo dono",
  retirada: "Retirada do dono",
  saldo_inicial: "Saldo anterior ao sistema",
};
export const categoriasReceber = [
  "servicos",
  "outras_receitas",
  "aporte",
  "saldo_inicial",
];
export const categoriasPagar = Object.keys(categorias).filter(
  (c) =>
    !["servicos", "outras_receitas", "aporte", "transferencia"].includes(c),
);
export const contas: Record<string, string> = {
  caixa: "Dinheiro na oficina",
  banco: "Banco / conta digital",
};
export const formas: Record<string, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  debito: "Cartão de débito",
  credito: "Cartão de crédito",
  boleto: "Boleto",
  transferencia: "Transferência",
  outro: "Outro",
};
const foraResultado = [
  "compra_estoque",
  "aporte",
  "retirada",
  "saldo_inicial",
  "transferencia",
];
export const hoje = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export type TituloFinanceiro = {
  compra_id?: string | null;
  provisorio?: boolean;
  pagamento_combinado?: boolean;
  transferencia_id?: string | null;
  id: string;
  natureza: "receber" | "pagar";
  descricao: string;
  categoria: string;
  valor_centavos: number;
  competencia: string;
  vencimento: string;
  pessoa: string;
  observacoes: string;
  ordem_servico_id: string | null;
  automatico: boolean;
  custos_revisados: boolean;
  cancelado_em: string | null;
  motivo_cancelamento?: string;
  revisao: number;
  baixado_centavos: number;
  aberto_centavos: number;
};
export type BaixaFinanceira = {
  id: string;
  titulo_id: string;
  valor_centavos: number;
  taxa_centavos: number;
  data: string;
  conta: string;
  forma: string;
  observacao: string;
  estorno_de: string | null;
  chave: string;
  criado_em: string;
};
export type ResumoFinanceiro = {
  receitas: number;
  despesas: number;
  pecas: number;
  taxas: number;
  entradas: number;
  saidas: number;
  receber: number;
  pagar: number;
  receber_atrasado: number;
  pagar_atrasado: number;
  revisar_custos: number;
};
export type ResultadoOS = {
  id: string;
  ordem_servico_id: string;
  descricao: string;
  pessoa: string;
  valor_centavos: number;
  custos_revisados: boolean;
  pecas: number;
  despesas: number;
  taxas: number;
};
export type PainelFinanceiro = {
  resumo: ResumoFinanceiro;
  contas: { conta: string; saldo: number }[];
  itens: TituloFinanceiro[];
  total: number;
  ordens: ResultadoOS[];
};
export type FiltrosFinanceiro = {
  inicio: string;
  fim: string;
  busca: string;
  filtro: string;
  natureza: string;
  pagina: number;
  os: string | null;
};
type DadosDemo = { titulos: TituloFinanceiro[]; baixas: BaixaFinanceira[] };
const chaveDemo = "patio_financeiro_v1";
function ler(): DadosDemo {
  return JSON.parse(
    localStorage.getItem(chaveDemo) || '{"titulos":[],"baixas":[]}',
  );
}
function gravar(d: DadosDemo) {
  localStorage.setItem(chaveDemo, JSON.stringify(d));
}
function sincronizarDemo() {
  const d = ler();
  const os: OrdemServico[] = JSON.parse(
    localStorage.getItem("patio_os_v1") || "[]",
  );
  for (const o of os.filter(
    (o) => o.situacao === "delivered" && o.total_centavos > 0,
  ))
    if (!d.titulos.some((t) => t.automatico && t.ordem_servico_id === o.id)) {
      const entrega =
        o.historico.find((h) => h.descricao === "Situação: Entregue")
          ?.ocorrido_em ?? o.criado_em;
      const data = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
      }).format(new Date(entrega));
      d.titulos.push({
        ...novoTitulo("receber"),
        id: crypto.randomUUID(),
        descricao: `OS #${o.numero}`,
        categoria: "servicos",
        valor_centavos: o.total_centavos,
        competencia: data,
        vencimento: data,
        pessoa: o.dados_cliente.nome,
        ordem_servico_id: o.id,
        automatico: true,
      });
    }
  gravar(d);
  return d;
}
export function novoTitulo(natureza: "receber" | "pagar"): TituloFinanceiro {
  return {
    id: crypto.randomUUID(),
    natureza,
    descricao: "",
    categoria: natureza === "receber" ? "outras_receitas" : "outras_despesas",
    valor_centavos: 0,
    competencia: hoje(),
    vencimento: hoje(),
    pessoa: "",
    observacoes: "",
    ordem_servico_id: null,
    automatico: false,
    custos_revisados: false,
    cancelado_em: null,
    revisao: 0,
    baixado_centavos: 0,
    aberto_centavos: 0,
  };
}
function comSaldo(d: DadosDemo, t: TituloFinanceiro) {
  const pago = d.baixas
    .filter((b) => b.titulo_id === t.id)
    .reduce((s, b) => s + (b.estorno_de ? -1 : 1) * b.valor_centavos, 0);
  return {
    ...t,
    baixado_centavos: pago,
    aberto_centavos: t.valor_centavos - pago,
  };
}
export function validarFinanceiroOSDemo(o: OrdemServico) {
  const d = ler(),
    t = d.titulos.find((t) => t.automatico && t.ordem_servico_id === o.id);
  if (
    t &&
    (comSaldo(d, t).baixado_centavos > o.total_centavos ||
      (o.situacao === "cancelled" && comSaldo(d, t).baixado_centavos > 0))
  )
    throw new Error(
      "Estorne os pagamentos antes de cancelar ou reduzir a OS abaixo do valor recebido.",
    );
}
export function sincronizarFinanceiroOSDemo(o: OrdemServico) {
  const d = ler(),
    t = d.titulos.find((t) => t.automatico && t.ordem_servico_id === o.id);
  if (!t) return;
  validarFinanceiroOSDemo(o);
  t.valor_centavos = Math.max(o.total_centavos, 1);
  t.provisorio = o.situacao !== "delivered";
  t.cancelado_em =
    o.situacao === "cancelled" || o.total_centavos === 0
      ? new Date().toISOString()
      : null;
  if (o.situacao === "delivered") t.competencia = hoje();
  t.revisao++;
  gravar(d);
}
export async function consultarFinanceiroOS(
  demo: boolean,
  oficina: string,
  os: string,
): Promise<TituloFinanceiro | null> {
  if (!demo)
    return rpc("consultar_financeiro_os", { p_oficina: oficina, p_os: os });
  const d = sincronizarDemo(),
    t = d.titulos.find(
      (t) => t.automatico && t.ordem_servico_id === os && !t.cancelado_em,
    );
  return t ? comSaldo(d, t) : null;
}
export async function prepararFinanceiroOS(
  demo: boolean,
  oficina: string,
  o: OrdemServico,
) {
  if (!demo) {
    await rpc("preparar_financeiro_os", { p_oficina: oficina, p_os: o.id });
    return (await consultarFinanceiroOS(false, oficina, o.id))!;
  }
  const atual = await consultarFinanceiroOS(true, oficina, o.id);
  if (atual) return atual;
  if (o.situacao === "cancelled" || o.total_centavos <= 0)
    throw new Error(
      "Inclua os itens antes de receber. OS cancelada não pode receber.",
    );
  const d = ler(),
    t = {
      ...novoTitulo("receber"),
      descricao: `OS #${o.numero}`,
      categoria: "servicos",
      pessoa: o.dados_cliente.nome,
      valor_centavos: o.total_centavos,
      ordem_servico_id: o.id,
      automatico: true,
      provisorio: o.situacao !== "delivered",
      revisao: 1,
    };
  const anterior = d.titulos.find(
    (x) => x.automatico && x.ordem_servico_id === o.id,
  );
  if (anterior) t.id = anterior.id;
  d.titulos = d.titulos.filter((x) => x.id !== t.id);
  d.titulos.push(t);
  gravar(d);
  return comSaldo(d, t);
}
export async function combinarPagamentoOS(
  demo: boolean,
  oficina: string,
  o: OrdemServico,
  data: string,
) {
  if (!demo)
    return rpc("combinar_pagamento_os", {
      p_oficina: oficina,
      p_os: o.id,
      p_vencimento: data,
    });
  const t = await prepararFinanceiroOS(true, oficina, o),
    d = ler(),
    atual = d.titulos.find((x) => x.id === t.id)!;
  atual.vencimento = data;
  atual.pagamento_combinado = true;
  atual.revisao++;
  gravar(d);
}
export async function consultarFinanceiro(
  demo: boolean,
  oficina: string,
  f: FiltrosFinanceiro,
): Promise<PainelFinanceiro> {
  if (!demo)
    return rpc("consultar_financeiro", {
      p_oficina: oficina,
      p_inicio: f.inicio,
      p_fim: f.fim,
      p_busca: f.busca,
      p_filtro: f.filtro,
      p_natureza: f.natureza,
      p_pagina: f.pagina,
      p_os: f.os,
    });
  if (
    !f.inicio ||
    !f.fim ||
    f.inicio > f.fim ||
    (Date.parse(f.fim) - Date.parse(f.inicio)) / 86400000 > 366
  )
    throw new Error("Selecione um período de até 367 dias.");
  const d = sincronizarDemo(),
    todos = d.titulos.map((t) => comSaldo(d, t)),
    ativos = todos.filter((t) => !t.cancelado_em),
    periodo = (data: string) => data >= f.inicio && data <= f.fim;
  const movimentos = lerEstoqueDemo().movimentos.filter(
    (m) => m.ordem_servico_id,
  );
  const r: ResumoFinanceiro = {
    receitas: 0,
    despesas: 0,
    pecas: 0,
    taxas: 0,
    entradas: 0,
    saidas: 0,
    receber: 0,
    pagar: 0,
    receber_atrasado: 0,
    pagar_atrasado: 0,
    revisar_custos: 0,
  };
  for (const t of ativos) {
    r[t.natureza] += t.aberto_centavos;
    if (t.vencimento < hoje())
      r[t.natureza === "receber" ? "receber_atrasado" : "pagar_atrasado"] +=
        t.aberto_centavos;
    if (periodo(t.competencia) && !t.provisorio) {
      if (!foraResultado.includes(t.categoria))
        r[t.natureza === "receber" ? "receitas" : "despesas"] +=
          t.valor_centavos;
      if (t.automatico && !t.custos_revisados) r.revisar_custos++;
    }
  }
  const saldos: Record<string, number> = { caixa: 0, banco: 0 };
  for (const b of d.baixas) {
    const t = todos.find((t) => t.id === b.titulo_id)!;
    const sinal = b.estorno_de ? -1 : 1;
    const liquido =
      sinal *
      (b.valor_centavos - (t.natureza === "receber" ? b.taxa_centavos : 0));
    saldos[b.conta] += (t.natureza === "receber" ? 1 : -1) * liquido;
    if (periodo(b.data) && t.categoria !== "transferencia") {
      r[t.natureza === "receber" ? "entradas" : "saidas"] += liquido;
      r.taxas += sinal * b.taxa_centavos;
    }
  }
  for (const m of movimentos) {
    const data = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date(m.criado_em));
    if (periodo(data)) r.pecas += Math.round(-m.quantidade * m.custo_centavos);
  }
  const lista = todos
    .filter(
      (t) =>
        (!f.os || t.ordem_servico_id === f.os) &&
        (!f.natureza || t.natureza === f.natureza) &&
        `${t.descricao} ${t.pessoa}`
          .toLowerCase()
          .includes(f.busca.toLowerCase()) &&
        (f.filtro === "cancelados"
          ? !!t.cancelado_em && periodo(t.competencia)
          : !t.cancelado_em &&
            (f.filtro === "abertos"
              ? t.aberto_centavos > 0
              : f.filtro === "atrasados"
                ? t.aberto_centavos > 0 && t.vencimento < hoje()
                : f.filtro === "vencimentos"
                  ? periodo(t.vencimento)
                  : f.filtro === "pagos"
                    ? t.aberto_centavos === 0 && periodo(t.competencia)
                    : periodo(t.competencia))),
    )
    .sort(
      (a, b) =>
        a.vencimento.localeCompare(b.vencimento) || a.id.localeCompare(b.id),
    );
  const ordens = ativos
    .filter((t) => t.automatico && !t.provisorio && periodo(t.competencia))
    .sort((a, b) => b.competencia.localeCompare(a.competencia))
    .slice(0, 100)
    .map((t) => ({
      id: t.id,
      ordem_servico_id: t.ordem_servico_id!,
      descricao: t.descricao,
      pessoa: t.pessoa,
      valor_centavos: t.valor_centavos,
      custos_revisados: t.custos_revisados,
      pecas: movimentos
        .filter((m) => m.ordem_servico_id === t.ordem_servico_id)
        .reduce((s, m) => s + Math.round(-m.quantidade * m.custo_centavos), 0),
      despesas: ativos
        .filter(
          (x) =>
            x.natureza === "pagar" &&
            x.ordem_servico_id === t.ordem_servico_id &&
            !foraResultado.includes(x.categoria),
        )
        .reduce((s, x) => s + x.valor_centavos, 0),
      taxas: d.baixas
        .filter((b) => b.titulo_id === t.id)
        .reduce((s, b) => s + (b.estorno_de ? -1 : 1) * b.taxa_centavos, 0),
    }));
  return {
    resumo: r,
    contas: Object.entries(saldos).map(([conta, saldo]) => ({ conta, saldo })),
    itens: lista.slice(f.pagina * 30, f.pagina * 30 + 30),
    total: lista.length,
    ordens,
  };
}
export async function salvarTitulo(
  demo: boolean,
  oficina: string,
  t: TituloFinanceiro,
) {
  if (!demo)
    return rpc("salvar_titulo_financeiro", {
      p_oficina: oficina,
      p_id: t.id,
      p_dados: t,
      p_revisao: t.revisao || null,
    });
  const d = ler(),
    anterior = d.titulos.find((x) => x.id === t.id);
  if (anterior && t.revisao === 0) return;
  if (anterior && anterior.revisao !== t.revisao)
    throw new Error("Lançamento alterado. Atualize a tela.");
  if (
    anterior &&
    (anterior.automatico ||
      anterior.compra_id ||
      d.baixas.some((b) => b.titulo_id === t.id)) &&
    (t.valor_centavos !== anterior.valor_centavos ||
      t.natureza !== anterior.natureza ||
      t.categoria !== anterior.categoria ||
      t.competencia !== anterior.competencia ||
      t.ordem_servico_id !== anterior.ordem_servico_id)
  )
    throw new Error(
      "Valores de lançamentos integrados ou com pagamentos não podem ser alterados.",
    );
  if (
    t.valor_centavos <= 0 ||
    !Number.isSafeInteger(t.valor_centavos) ||
    t.descricao.trim().length < 3
  )
    throw new Error("Informe uma descrição e um valor válido.");
  d.titulos = [
    { ...t, revisao: t.revisao + 1 },
    ...d.titulos.filter((x) => x.id !== t.id),
  ];
  gravar(d);
}
export async function baixarTitulo(
  demo: boolean,
  oficina: string,
  t: TituloFinanceiro,
  b: Omit<BaixaFinanceira, "id" | "titulo_id" | "estorno_de" | "criado_em">,
) {
  if (!demo)
    return rpc("baixar_titulo_financeiro", {
      p_oficina: oficina,
      p_titulo: t.id,
      p_chave: b.chave,
      p_valor: b.valor_centavos,
      p_taxa: b.taxa_centavos,
      p_data: b.data,
      p_conta: b.conta,
      p_forma: b.forma,
      p_observacao: b.observacao,
    });
  const d = ler();
  if (d.baixas.some((x) => x.chave === b.chave)) return;
  const atual = comSaldo(
    d,
    d.titulos.find((x) => x.id === t.id)!,
  );
  if (
    atual.cancelado_em ||
    b.valor_centavos <= 0 ||
    b.valor_centavos > atual.aberto_centavos ||
    b.taxa_centavos < 0 ||
    b.taxa_centavos >= b.valor_centavos ||
    b.data > hoje()
  )
    throw new Error("Confira valor, taxa e data do pagamento.");
  d.baixas.push({
    ...b,
    id: crypto.randomUUID(),
    titulo_id: t.id,
    estorno_de: null,
    criado_em: new Date().toISOString(),
  });
  d.titulos.find((x) => x.id === t.id)!.revisao++;
  gravar(d);
}
export async function historicoFinanceiro(
  demo: boolean,
  oficina: string,
  id: string,
): Promise<BaixaFinanceira[]> {
  return demo
    ? ler()
        .baixas.filter((b) => b.titulo_id === id)
        .reverse()
    : rpc("historico_financeiro", { p_oficina: oficina, p_titulo: id });
}
export async function estornarBaixa(
  demo: boolean,
  oficina: string,
  b: BaixaFinanceira,
  data: string,
  motivo: string,
) {
  if (!demo)
    return rpc("estornar_baixa_financeira", {
      p_oficina: oficina,
      p_baixa: b.id,
      p_data: data,
      p_motivo: motivo,
    });
  const d = ler();
  if (d.baixas.some((x) => x.estorno_de === b.id)) return;
  if (
    b.estorno_de ||
    data < b.data ||
    data > hoje() ||
    motivo.trim().length < 3
  )
    throw new Error("Informe motivo e data válidos.");
  d.baixas.push({
    ...b,
    id: crypto.randomUUID(),
    estorno_de: b.id,
    data,
    observacao: motivo,
    chave: crypto.randomUUID(),
    criado_em: new Date().toISOString(),
  });
  d.titulos.find((t) => t.id === b.titulo_id)!.revisao++;
  gravar(d);
}
export async function cancelarTitulo(
  demo: boolean,
  oficina: string,
  t: TituloFinanceiro,
  motivo: string,
) {
  if (!demo)
    return rpc("cancelar_titulo_financeiro", {
      p_oficina: oficina,
      p_titulo: t.id,
      p_revisao: t.revisao,
      p_motivo: motivo,
    });
  const d = ler(),
    atual = comSaldo(
      d,
      d.titulos.find((x) => x.id === t.id)!,
    );
  if (
    atual.automatico ||
    atual.compra_id ||
    atual.baixado_centavos !== 0 ||
    motivo.trim().length < 3
  )
    throw new Error(
      "Estorne os pagamentos e informe o motivo. OS automática não pode ser cancelada por aqui.",
    );
  d.titulos = d.titulos.map((x) =>
    x.id === t.id
      ? {
          ...x,
          cancelado_em: new Date().toISOString(),
          motivo_cancelamento: motivo,
          revisao: x.revisao + 1,
        }
      : x,
  );
  gravar(d);
}
export async function revisarCustos(
  demo: boolean,
  oficina: string,
  id: string,
) {
  if (!demo)
    return rpc("revisar_custos_financeiro", {
      p_oficina: oficina,
      p_titulo: id,
    });
  const d = ler();
  d.titulos = d.titulos.map((t) =>
    t.id === id ? { ...t, custos_revisados: true, revisao: t.revisao + 1 } : t,
  );
  gravar(d);
}

export async function transferirFinanceiro(
  demo: boolean,
  oficina: string,
  chave: string,
  valor: number,
  data: string,
  origem: string,
  destino: string,
) {
  if (!demo)
    return rpc("transferir_financeiro", {
      p_oficina: oficina,
      p_chave: chave,
      p_valor: valor,
      p_data: data,
      p_origem: origem,
      p_destino: destino,
    });
  const d = ler();
  if (d.titulos.some((t) => t.transferencia_id === chave)) return;
  if (origem === destino || valor <= 0 || data > hoje())
    throw new Error("Confira valor, data e contas diferentes.");
  for (const natureza of ["pagar", "receber"] as const) {
    const t = {
      ...novoTitulo(natureza),
      transferencia_id: chave,
      categoria: "transferencia",
      descricao: "Transferência entre caixa e banco",
      valor_centavos: valor,
      competencia: data,
      vencimento: data,
      revisao: 1,
    };
    d.titulos.push(t);
    d.baixas.push({
      id: crypto.randomUUID(),
      titulo_id: t.id,
      chave: crypto.randomUUID(),
      valor_centavos: valor,
      taxa_centavos: 0,
      data,
      conta: natureza === "pagar" ? origem : destino,
      forma: "transferencia",
      observacao: "Transferência interna",
      estorno_de: null,
      criado_em: new Date().toISOString(),
    });
  }
  gravar(d);
}
export async function estornarTransferencia(
  demo: boolean,
  oficina: string,
  id: string,
  data: string,
  motivo: string,
) {
  if (!demo)
    return rpc("estornar_transferencia_financeira", {
      p_oficina: oficina,
      p_transferencia: id,
      p_data: data,
      p_motivo: motivo,
    });
  const d = ler(),
    titulos = d.titulos.filter((t) => t.transferencia_id === id);
  if (
    !titulos.length ||
    motivo.trim().length < 3 ||
    data > hoje() ||
    titulos.some((t) => data < t.competencia)
  )
    throw new Error("Confira data e motivo.");
  for (const t of titulos) {
    const b = d.baixas.find((b) => b.titulo_id === t.id && !b.estorno_de)!;
    if (!d.baixas.some((x) => x.estorno_de === b.id))
      d.baixas.push({
        ...b,
        id: crypto.randomUUID(),
        estorno_de: b.id,
        data,
        observacao: motivo,
        chave: crypto.randomUUID(),
        criado_em: new Date().toISOString(),
      });
    t.cancelado_em = new Date().toISOString();
    t.motivo_cancelamento = motivo;
    t.revisao++;
  }
  gravar(d);
}
