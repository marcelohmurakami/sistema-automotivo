import { novoId } from "../lib/uuid.ts";
import { lerOrdensDemo } from "../lib/ordensDemo";
import { rpc } from "../lib/rpc";

import type { ParcelaFinanceira } from "../lib/parcelasFinanceiras";
import { gerarRecorrenciasDemo } from "./recorrencias";
import { lerEstoqueDemo } from "./estoque";
import type { OrdemServico } from "./ordensServico";
import {
  prepararDescontoRecebimentoDemo,
  gravarRecebimentoDemo,
} from "./descontoRecebimentoDemo";
export const categorias: Record<string, string> = {
  transferencia: "Transferência entre contas",
  servicos: "Serviços e produtos vendidos",
  outras_receitas: "Outras receitas",
  pecas_externas: "Peças e materiais comprados para serviços",
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
  (c) => !["servicos", "outras_receitas", "aporte", "transferencia"].includes(c),
);
export const contas: Record<string, string> = {
  caixa: "Dinheiro em caixa",
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
  forma_prevista?: string;
  acompanhamento_qualidade_id?: string | null;
  credito_fornecedor_centavos?: number;
  parcelamento_id?: string;
  valor_variavel?: boolean;
  valor_confirmado_em?: string | null;
  recorrencia_id?: string | null;
  comissao_id?: string | null;
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
  mostrar_desconto_nota?: boolean;
  desconto_centavos?: number;
  saldo_antes_desconto_centavos?: number;
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
  titulo?: string | null;
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
  return JSON.parse(localStorage.getItem(chaveDemo) || '{"titulos":[],"baixas":[]}');
}
function gravar(d: DadosDemo) {
  localStorage.setItem(chaveDemo, JSON.stringify(d));
}
function sincronizarDemo() {
  gerarRecorrenciasDemo();
  const d = ler();
  const os: OrdemServico[] = lerOrdensDemo();
  for (const o of os.filter((o) => o.situacao === "delivered" && o.total_centavos > 0))
    if (!d.titulos.some((t) => t.automatico && t.ordem_servico_id === o.id)) {
      const entrega =
        o.historico.find((h) => h.descricao === "Situação: Entregue")?.ocorrido_em ??
        o.criado_em;
      const data = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
      }).format(new Date(entrega));
      d.titulos.push({
        ...novoTitulo("receber"),
        id: novoId(),
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
    id: novoId(),
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
export function consultarFinanceiroDemoCompleto(): DadosDemo {
  const dados = sincronizarDemo();
  return {
    titulos: dados.titulos.map((t) => comSaldo(dados, t)),
    baixas: dados.baixas,
  };
}
export function tituloDemoAtivo(id: string) {
  return ler().titulos.some((t) => t.id === id && !t.cancelado_em);
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
  signal?: AbortSignal,
): Promise<TituloFinanceiro | null> {
  if (!demo)
    return rpc("consultar_financeiro_os", { p_oficina: oficina, p_os: os }, signal);
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
    throw new Error("Inclua os itens antes de receber. OS cancelada não pode receber.");
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
  const anterior = d.titulos.find((x) => x.automatico && x.ordem_servico_id === o.id);
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
export async function consultarTituloFinanceiro(
  demo: boolean,
  oficina: string,
  id: string,
  signal?: AbortSignal,
): Promise<TituloFinanceiro | null> {
  if (!demo)
    return rpc("consultar_titulo_alerta", { p_oficina: oficina, p_titulo: id }, signal);
  const d = sincronizarDemo(),
    t = d.titulos.find((t) => t.id === id);
  return t ? comSaldo(d, t) : null;
}
/** Combina o vencimento sem registrar recebimento nem alterar o valor da conta. */
export async function combinarPagamentoTitulo(
  demo: boolean,
  oficina: string,
  titulo: TituloFinanceiro,
  vencimento: string,
) {
  if (!demo)
    return rpc("combinar_pagamento_titulo", {
      p_oficina: oficina,
      p_titulo: titulo.id,
      p_revisao: titulo.revisao,
      p_vencimento: vencimento,
    });
  if (!vencimento || titulo.cancelado_em || titulo.aberto_centavos <= 0)
    throw new Error("Informe uma data para uma conta com saldo em aberto.");
  return salvarTitulo(true, oficina, {
    ...titulo,
    vencimento,
    pagamento_combinado: true,
  });
}
export async function consultarFinanceiro(
  demo: boolean,
  oficina: string,
  f: FiltrosFinanceiro,
  signal?: AbortSignal,
): Promise<PainelFinanceiro> {
  if (!demo) {
    try {
      return await rpc<PainelFinanceiro>(
        "consultar_painel_financeiro",
        {
          p_oficina: oficina,
          p_inicio: f.inicio,
          p_fim: f.fim,
          p_busca: f.busca,
          p_filtro: f.filtro,
          p_natureza: f.natureza,
          p_pagina: f.pagina,
          p_os: f.os,
          p_titulo: f.titulo || null,
        },
        signal,
      );
    } catch (erro) {
      // Compatibilidade durante a implantação; erros de autorização nunca são contornados.
      if (
        !erro ||
        typeof erro !== "object" ||
        !("code" in erro) ||
        erro.code !== "PGRST202"
      )
        throw erro;
    }
    try {
      await rpc("sincronizar_contas_recorrentes", { p_oficina: oficina }, signal);
    } catch (erro) {
      // Mantém o financeiro existente utilizável durante a implantação da migração.
      // A central de alertas e a aba de recorrências exibem a atualização pendente.
      if (
        !erro ||
        typeof erro !== "object" ||
        !("code" in erro) ||
        erro.code !== "PGRST202"
      )
        throw erro;
    }
    const painel: PainelFinanceiro = await rpc(
      "consultar_financeiro",
      {
        p_oficina: oficina,
        p_inicio: f.inicio,
        p_fim: f.fim,
        p_busca: f.busca,
        p_filtro: f.filtro,
        p_natureza: f.natureza,
        p_pagina: f.pagina,
        p_os: f.os,
      },
      signal,
    );
    if (f.titulo) {
      const t: TituloFinanceiro | null = await rpc(
        "consultar_titulo_alerta",
        {
          p_oficina: oficina,
          p_titulo: f.titulo,
        },
        signal,
      );
      return { ...painel, itens: t ? [t] : [], total: t ? 1 : 0 };
    }
    return painel;
  }
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
  const movimentos = lerEstoqueDemo().movimentos.filter((m) => m.ordem_servico_id);
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
        r[t.natureza === "receber" ? "receitas" : "despesas"] += t.valor_centavos;
      if (t.automatico && !t.custos_revisados) r.revisar_custos++;
    }
  }
  const saldos: Record<string, number> = { caixa: 0, banco: 0 };
  for (const b of d.baixas) {
    const t = todos.find((t) => t.id === b.titulo_id)!;
    const sinal = b.estorno_de ? -1 : 1;
    const liquido =
      sinal * (b.valor_centavos - (t.natureza === "receber" ? b.taxa_centavos : 0));
    saldos[b.conta] =
      (saldos[b.conta] ?? 0) + (t.natureza === "receber" ? 1 : -1) * liquido;
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
    .filter((t) =>
      f.titulo
        ? t.id === f.titulo
        : (!f.os || t.ordem_servico_id === f.os) &&
          (!f.natureza || t.natureza === f.natureza) &&
          `${t.descricao} ${t.pessoa}`.toLowerCase().includes(f.busca.toLowerCase()) &&
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
      (a, b) => a.vencimento.localeCompare(b.vencimento) || a.id.localeCompare(b.id),
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
export async function salvarContaParcelada(
  demo: boolean,
  oficina: string,
  t: TituloFinanceiro,
  parcelas: ParcelaFinanceira[],
) {
  if (
    parcelas.length < 2 ||
    parcelas.length > 60 ||
    parcelas.some(
      (p) =>
        !Number.isSafeInteger(p.valor_centavos) ||
        p.valor_centavos < 1 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(p.vencimento),
    ) ||
    parcelas.reduce((s, p) => s + p.valor_centavos, 0) !== t.valor_centavos
  )
    throw new Error(
      "Gere as parcelas e confira os vencimentos. A soma deve ser igual ao valor total.",
    );
  if (t.revisao || t.automatico || t.compra_id || t.comissao_id || t.recorrencia_id)
    throw new Error("O parcelamento é exclusivo para novas contas manuais.");
  if (!demo)
    return rpc<string[]>("criar_conta_parcelada", {
      p_oficina: oficina,
      p_chave: t.id,
      p_dados: t,
      p_parcelas: parcelas,
    });
  const d = ler();
  if (d.titulos.some((x) => x.parcelamento_id === t.id)) return;
  const novos = parcelas.map((p, i) => ({
    ...t,
    ...p,
    id: novoId(),
    parcelamento_id: t.id,
    descricao: `${t.descricao.trim().slice(0, 180)} · ${i + 1}/${parcelas.length}`,
    revisao: 1,
    aberto_centavos: p.valor_centavos,
  }));
  gravar({ ...d, titulos: [...d.titulos, ...novos] });
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
      anterior.acompanhamento_qualidade_id ||
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
export async function confirmarValorRecorrente(
  demo: boolean,
  oficina: string,
  t: TituloFinanceiro,
  valor: number,
): Promise<TituloFinanceiro> {
  if (!demo)
    return rpc("confirmar_valor_recorrente", {
      p_oficina: oficina,
      p_titulo: t.id,
      p_revisao: t.revisao,
      p_valor: valor,
    });
  const d = ler();
  const atual = d.titulos.find((x) => x.id === t.id);
  if (
    !atual ||
    !atual.valor_variavel ||
    atual.cancelado_em ||
    atual.revisao !== t.revisao
  )
    throw new Error("Conta alterada ou indisponível. Atualize a tela.");
  if (
    !Number.isSafeInteger(valor) ||
    valor < 1 ||
    valor > 10000000000 ||
    d.baixas.some((b) => b.titulo_id === t.id)
  )
    throw new Error("Confira o valor. Contas com pagamentos não podem ser alteradas.");
  atual.valor_centavos = valor;
  atual.valor_confirmado_em = new Date().toISOString();
  atual.revisao++;
  gravar(d);
  return comSaldo(d, atual);
}
export async function baixarTitulo(
  demo: boolean,
  oficina: string,
  t: TituloFinanceiro,
  b: Omit<BaixaFinanceira, "id" | "titulo_id" | "estorno_de" | "criado_em"> & {
    vencimento_restante?: string;
  },
) {
  if (!demo)
    return rpc(
      b.desconto_centavos
        ? typeof b.mostrar_desconto_nota === "boolean"
          ? "baixar_titulo_com_desconto_nota"
          : "baixar_titulo_com_desconto_os"
        : b.vencimento_restante
          ? "baixar_titulo_com_restante"
          : "baixar_titulo_financeiro",
      {
        ...(b.desconto_centavos
          ? {
              p_desconto: b.desconto_centavos,
              p_saldo: b.saldo_antes_desconto_centavos,
              ...(typeof b.mostrar_desconto_nota === "boolean"
                ? { p_mostrar_desconto_nota: b.mostrar_desconto_nota }
                : {}),
            }
          : {}),
        ...(b.vencimento_restante ? { p_vencimento: b.vencimento_restante } : {}),
        p_oficina: oficina,
        p_titulo: t.id,
        p_chave: b.chave,
        p_valor: b.valor_centavos,
        p_taxa: b.taxa_centavos,
        p_data: b.data,
        p_conta: b.conta,
        p_forma: b.forma,
        p_observacao: b.observacao,
      },
    );
  const d = ler();
  const repetida = d.baixas.find((x) => x.chave === b.chave);
  if (repetida) {
    if (
      repetida.titulo_id !== t.id ||
      repetida.valor_centavos !== b.valor_centavos ||
      (repetida.desconto_centavos || 0) !== (b.desconto_centavos || 0)
    )
      throw new Error("Esta confirmação já foi usada. Reabra o pagamento.");
    return;
  }
  const atual = comSaldo(
    d,
    d.titulos.find((x) => x.id === t.id)!,
  );
  const desconto = b.desconto_centavos || 0;
  if (
    !Number.isSafeInteger(desconto) ||
    desconto < 0 ||
    (desconto > 0 && desconto >= atual.aberto_centavos)
  )
    throw new Error("O desconto deve deixar um valor maior que zero para receber.");
  if (desconto > 0 && b.saldo_antes_desconto_centavos !== atual.aberto_centavos)
    throw new Error("O saldo mudou. Reabra o pagamento para conferir o desconto.");
  if (atual.valor_variavel && !atual.valor_confirmado_em)
    throw new Error(
      "Confirme o valor desta conta variável para este mês antes de pagar.",
    );
  if (
    atual.cancelado_em ||
    b.valor_centavos <= 0 ||
    b.valor_centavos > atual.aberto_centavos - desconto ||
    (!!b.vencimento_restante && b.valor_centavos >= atual.aberto_centavos - desconto) ||
    b.taxa_centavos < 0 ||
    b.taxa_centavos >= b.valor_centavos ||
    b.data > hoje()
  )
    throw new Error("Confira valor, taxa e data do pagamento.");
  d.baixas.push({
    ...b,
    id: novoId(),
    titulo_id: t.id,
    estorno_de: null,
    criado_em: new Date().toISOString(),
  });
  const tituloAtual = d.titulos.find((x) => x.id === t.id)!;
  const documentos =
    desconto > 0
      ? prepararDescontoRecebimentoDemo(
          oficina,
          atual,
          desconto,
          b.mostrar_desconto_nota,
        )
      : new Map<string, string>();
  tituloAtual.valor_centavos -= desconto;
  if (b.vencimento_restante) {
    tituloAtual.vencimento = b.vencimento_restante;
    tituloAtual.pagamento_combinado = true;
  }
  tituloAtual.revisao++;
  gravarRecebimentoDemo(new Map([[chaveDemo, JSON.stringify(d)], ...documentos]));
}
export async function historicoFinanceiro(
  demo: boolean,
  oficina: string,
  id: string,
  signal?: AbortSignal,
): Promise<BaixaFinanceira[]> {
  return demo
    ? ler()
        .baixas.filter((b) => b.titulo_id === id)
        .reverse()
    : rpc("historico_financeiro", { p_oficina: oficina, p_titulo: id }, signal);
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
  if (b.estorno_de || data < b.data || data > hoje() || motivo.trim().length < 3)
    throw new Error("Informe motivo e data válidos.");
  d.baixas.push({
    ...b,
    desconto_centavos: 0,
    saldo_antes_desconto_centavos: undefined,
    id: novoId(),
    estorno_de: b.id,
    data,
    observacao: motivo,
    chave: novoId(),
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
    atual.acompanhamento_qualidade_id ||
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
export async function revisarCustos(demo: boolean, oficina: string, id: string) {
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
      id: novoId(),
      titulo_id: t.id,
      chave: novoId(),
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
        id: novoId(),
        estorno_de: b.id,
        data,
        observacao: motivo,
        chave: novoId(),
        criado_em: new Date().toISOString(),
      });
    t.cancelado_em = new Date().toISOString();
    t.motivo_cancelamento = motivo;
    t.revisao++;
  }
  gravar(d);
}
