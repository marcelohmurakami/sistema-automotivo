import { novoId } from "../lib/uuid.ts";
import { rpc } from "../lib/rpc";
import { transacaoDemo } from "../lib/transacaoDemo";
import type { PlanoPagamentoCompra } from "../lib/pagamentoCompra";

import { lerEstoqueDemo, type MovimentoEstoque } from "./estoque";
import {
  hoje,
  novoTitulo,
  type TituloFinanceiro,
  type BaixaFinanceira,
} from "./financeiro";
export type Fornecedor = {
  id: string;
  nome: string;
  documento: string;
  telefone: string;
  email: string;
  endereco: string;
  observacoes: string;
  revisao: number;
  arquivado_em: string | null;
};
export type ItemCompra = {
  produto_id: string;
  descricao?: string;
  unidade?: string;
  quantidade: number;
  custo_centavos: number;
  total_centavos?: number;
  saldo_anterior?: number;
  custo_anterior?: number;
  revisao_apos?: number;
};
export type Compra = {
  id: string;
  fornecedor_id: string;
  nome_fornecedor: string;
  documento: string;
  data: string;
  observacoes: string;
  total_centavos: number;
  cancelado_em: string | null;
  motivo_cancelamento?: string;
  itens: ItemCompra[];
  titulo: TituloFinanceiro;
  titulos?: TituloFinanceiro[];
  vencimento: string;
  baixado_centavos: number;
  aberto_centavos: number;
};
export type NovaCompra = {
  pagamento?: PlanoPagamentoCompra;
  deposito_id?: string | null;
  id: string;
  fornecedor_id: string;
  documento: string;
  data: string;
  vencimento: string;
  observacoes: string;
  itens: ItemCompra[];
  pago: number;
  conta: string;
  forma: string;
};
const lerFornecedores = (): Fornecedor[] =>
  JSON.parse(localStorage.getItem("patio_fornecedores_v1") || "[]");
const lerCompras = (): Compra[] =>
  JSON.parse(localStorage.getItem("patio_compras_v1") || "[]");
const lerFinanceiro = (): {
  titulos: TituloFinanceiro[];
  baixas: BaixaFinanceira[];
} =>
  JSON.parse(
    localStorage.getItem("patio_financeiro_v1") || '{"titulos":[],"baixas":[]}',
  );
// All changes are computed before persistence; restore previous values on storage failure.
export function gravarConjuntoDemo(valores: Record<string, unknown>) {
  transacaoDemo(Object.keys(valores), () => {
    for (const [k, v] of Object.entries(valores))
      localStorage.setItem(k, JSON.stringify(v));
  });
}
export const novoFornecedor = (): Fornecedor => ({
  id: novoId(),
  nome: "",
  documento: "",
  telefone: "",
  email: "",
  endereco: "",
  observacoes: "",
  revisao: 0,
  arquivado_em: null,
});
export async function listarFornecedores(
  demo: boolean,
  oficina: string,
  busca = "",
  arquivados = false,
  pagina = 0,
  signal?: AbortSignal,
) {
  if (!demo)
    return rpc<{ itens: Fornecedor[]; total: number }>(
      "listar_fornecedores",
      {
        p_oficina: oficina,
        p_busca: busca,
        p_arquivados: arquivados,
        p_pagina: pagina,
      },
      signal,
    );
  const itens = lerFornecedores()
    .filter(
      (f) =>
        !!f.arquivado_em === arquivados &&
        `${f.nome} ${f.documento}`.toLowerCase().includes(busca.toLowerCase()),
    )
    .sort((a, b) => a.nome.localeCompare(b.nome));
  return {
    itens: itens.slice(pagina * 30, pagina * 30 + 30),
    total: itens.length,
  };
}
export async function salvarFornecedor(demo: boolean, oficina: string, f: Fornecedor) {
  if (!demo)
    return rpc("salvar_fornecedor", {
      p_oficina: oficina,
      p_id: f.id,
      p_dados: f,
      p_revisao: f.revisao || null,
    });
  const lista = lerFornecedores(),
    anterior = lista.find((x) => x.id === f.id);
  if (anterior && !f.revisao) return;
  if (anterior && (anterior.revisao !== f.revisao || anterior.arquivado_em))
    throw new Error("Fornecedor alterado. Atualize a tela.");
  if (f.nome.trim().length < 2) throw new Error("Informe o nome do fornecedor.");
  if (
    f.documento &&
    lista.some((x) => x.id !== f.id && !x.arquivado_em && x.documento === f.documento)
  )
    throw new Error("Já existe um fornecedor com este documento.");
  gravarConjuntoDemo({
    patio_fornecedores_v1: [
      ...lista.filter((x) => x.id !== f.id),
      { ...f, revisao: f.revisao + 1 },
    ],
  });
}
export async function arquivarFornecedor(
  demo: boolean,
  oficina: string,
  f: Fornecedor,
) {
  if (!demo)
    return rpc("arquivar_fornecedor", {
      p_oficina: oficina,
      p_id: f.id,
      p_revisao: f.revisao,
      p_arquivar: !f.arquivado_em,
    });
  const lista = lerFornecedores();
  const atual = lista.find((x) => x.id === f.id);
  if (!atual || atual.revisao !== f.revisao) throw new Error("Atualize o fornecedor.");
  if (
    f.arquivado_em &&
    f.documento &&
    lista.some((x) => x.id !== f.id && !x.arquivado_em && x.documento === f.documento)
  )
    throw new Error("Documento já usado por outro fornecedor ativo.");
  atual.arquivado_em = f.arquivado_em ? null : new Date().toISOString();
  atual.revisao++;
  gravarConjuntoDemo({ patio_fornecedores_v1: lista });
}
function atualizarSaldo(c: Compra) {
  const d = lerFinanceiro();
  const titulos = d.titulos
    .filter((t) => t.compra_id === c.id)
    .map((t) => {
      const pago = d.baixas
        .filter((b) => b.titulo_id === t.id)
        .reduce((s, b) => s + (b.estorno_de ? -1 : 1) * b.valor_centavos, 0);
      return {
        ...t,
        baixado_centavos: pago,
        aberto_centavos: t.cancelado_em ? 0 : t.valor_centavos - pago,
      };
    });
  const t = titulos[0],
    pago = titulos.reduce((s, t) => s + t.baixado_centavos, 0);
  return {
    ...c,
    titulo: t,
    titulos,
    vencimento: t.vencimento,
    baixado_centavos: pago,
    aberto_centavos: titulos.reduce((s, t) => s + t.aberto_centavos, 0),
  };
}
export async function listarCompras(
  demo: boolean,
  oficina: string,
  busca = "",
  pagina = 0,
  signal?: AbortSignal,
) {
  if (!demo)
    return rpc<{ itens: Compra[]; total: number }>(
      "listar_compras_estoque",
      {
        p_oficina: oficina,
        p_busca: busca,
        p_pagina: pagina,
      },
      signal,
    );
  const itens = lerCompras()
    .filter((c) =>
      `${c.nome_fornecedor} ${c.documento}`.toLowerCase().includes(busca.toLowerCase()),
    )
    .sort((a, b) => b.data.localeCompare(a.data));
  return {
    itens: itens.slice(pagina * 30, pagina * 30 + 30).map(atualizarSaldo),
    total: itens.length,
  };
}
export async function consultarCompra(
  demo: boolean,
  oficina: string,
  id: string,
  signal?: AbortSignal,
) {
  if (!demo)
    return rpc<Compra>(
      "consultar_compra_estoque",
      {
        p_oficina: oficina,
        p_compra: id,
      },
      signal,
    );
  const c = lerCompras().find((c) => c.id === id);
  if (!c) throw new Error("Compra não encontrada.");
  return atualizarSaldo(c);
}
export async function registrarCompra(demo: boolean, oficina: string, c: NovaCompra) {
  if (!demo && c.pagamento)
    return rpc("registrar_compra_com_pagamento", { p_oficina: oficina, p_dados: c });
  if (!demo)
    return rpc("registrar_compra_deposito", {
      p_deposito: c.deposito_id ?? null,
      p_oficina: oficina,
      p_id: c.id,
      p_fornecedor: c.fornecedor_id,
      p_data: c.data,
      p_vencimento: c.vencimento,
      p_documento: c.documento,
      p_observacoes: c.observacoes,
      p_itens: c.itens,
      p_pago: c.pago,
      p_conta: c.conta,
      p_forma: c.forma,
    });
  const compras = lerCompras();
  if (compras.some((x) => x.id === c.id)) return;
  const f = lerFornecedores().find((x) => x.id === c.fornecedor_id && !x.arquivado_em);
  if (!f) throw new Error("Selecione um fornecedor ativo.");
  if (
    c.documento &&
    compras.some(
      (x) => !x.cancelado_em && x.fornecedor_id === f.id && x.documento === c.documento,
    )
  )
    throw new Error("Este documento já foi registrado para o fornecedor.");
  const total = c.itens.reduce(
    (s, i) => s + Math.round(i.quantidade * i.custo_centavos),
    0,
  );
  if (
    c.data > hoje() ||
    !c.data ||
    !c.vencimento ||
    total <= 0 ||
    total > 1e10 ||
    c.pago < 0 ||
    c.pago > total ||
    new Set(c.itens.map((i) => i.produto_id)).size !== c.itens.length
  )
    throw new Error("Confira datas, itens e valor pago.");
  const estoque = lerEstoqueDemo(),
    fin = lerFinanceiro();
  const itens = c.itens.map((i) => {
    const p = estoque.produtos.find(
      (p) => p.id === i.produto_id && !p.arquivado_em && p.saldo !== null,
    );
    if (
      !p ||
      i.quantidade <= 0 ||
      i.quantidade > 1e6 ||
      Math.abs(Math.round(i.quantidade * 1000) - i.quantidade * 1000) > 0.000001 ||
      !Number.isSafeInteger(i.custo_centavos) ||
      i.custo_centavos < 0
    )
      throw new Error("Confira as peças, quantidades e custos.");
    const linha = {
      ...i,
      descricao: p.descricao,
      saldo_anterior: p.saldo!,
      custo_anterior: p.custo_centavos,
      revisao_apos: (p.revisao ?? 0) + 1,
      total_centavos: Math.round(i.quantidade * i.custo_centavos),
    };
    p.custo_centavos = Math.round(
      (p.saldo! * p.custo_centavos + i.quantidade * i.custo_centavos) /
        (p.saldo! + i.quantidade),
    );
    p.saldo = Math.round((p.saldo! + i.quantidade) * 1000) / 1000;
    p.revisao = linha.revisao_apos;
    estoque.movimentos.unshift({
      id: novoId(),
      item_catalogo_id: p.id,
      tipo: "entrada",
      quantidade: i.quantidade,
      saldo_apos: p.saldo,
      custo_centavos: i.custo_centavos,
      motivo: `Compra de ${f.nome}`,
      documento: c.documento,
      ordem_servico_id: null,
      numero_os: null,
      criado_em: new Date().toISOString(),
      estornado: false,
      chave: novoId(),
      compra_id: c.id,
    } as MovimentoEstoque);
    return linha;
  });
  const t = {
    ...novoTitulo("pagar"),
    descricao: `Compra · ${f.nome}`,
    categoria: "compra_estoque",
    pessoa: f.nome,
    valor_centavos: total,
    competencia: c.data,
    vencimento: c.vencimento,
    compra_id: c.id,
    revisao: 1,
  };
  const plano = c.pagamento;
  if (
    plano &&
    (plano.parcelas.length < 1 ||
      plano.parcelas.length > 60 ||
      plano.parcelas.reduce((s, p) => s + p.valor_centavos, 0) !== total ||
      plano.parcelas.some((p) => !p.vencimento || p.valor_centavos <= 0))
  )
    throw Error("Confira o pagamento da compra.");
  const titulos = plano
    ? plano.parcelas.map((p, i) => ({
        ...t,
        id: i ? novoId() : t.id,
        valor_centavos: p.valor_centavos,
        vencimento: p.vencimento,
        descricao:
          t.descricao +
          (plano.parcelas.length > 1 ? ` · ${i + 1}/${plano.parcelas.length}` : ""),
      }))
    : [t];
  fin.titulos.push(...titulos);
  const pago = plano ? (plano.modo === "pago" ? total : 0) : c.pago;
  if (pago)
    fin.baixas.push({
      id: novoId(),
      titulo_id: t.id,
      valor_centavos: pago,
      taxa_centavos: 0,
      data: plano?.data || c.data,
      conta: plano?.conta || c.conta,
      forma: plano?.forma || c.forma,
      observacao: "Pagamento informado na compra",
      estorno_de: null,
      chave: novoId(),
      criado_em: new Date().toISOString(),
    });
  compras.unshift({
    ...c,
    nome_fornecedor: f.nome,
    total_centavos: total,
    cancelado_em: null,
    itens,
    titulo: titulos[0],
    titulos,
    baixado_centavos: pago,
    aberto_centavos: total - pago,
  });
  gravarConjuntoDemo({
    patio_estoque_v1: estoque,
    patio_financeiro_v1: fin,
    patio_compras_v1: compras,
  });
}
export async function cancelarCompra(
  demo: boolean,
  oficina: string,
  id: string,
  motivo: string,
) {
  if (!demo)
    return rpc("cancelar_compra_estoque", {
      p_oficina: oficina,
      p_compra: id,
      p_motivo: motivo,
    });
  const compras = lerCompras(),
    c = compras.find((c) => c.id === id)!;
  if (c.cancelado_em) return;
  if (motivo.trim().length < 3) throw new Error("Informe o motivo.");
  if (atualizarSaldo(c).baixado_centavos)
    throw new Error("Estorne os pagamentos antes de cancelar a compra.");
  const estoque = lerEstoqueDemo(),
    fin = lerFinanceiro();
  for (const i of c.itens) {
    const p = estoque.produtos.find((p) => p.id === i.produto_id)!;
    if (p.revisao !== i.revisao_apos)
      throw new Error(
        "Há alterações posteriores em uma peça. Não é possível cancelar automaticamente.",
      );
    p.saldo = i.saldo_anterior!;
    p.custo_centavos = i.custo_anterior!;
    p.revisao!++;
    const m = estoque.movimentos.find(
      (m) => m.compra_id === id && m.item_catalogo_id === p.id && m.tipo === "entrada",
    )!;
    m.estornado = true;
    estoque.movimentos.unshift({
      ...m,
      id: novoId(),
      tipo: "estorno",
      quantidade: -i.quantidade,
      saldo_apos: p.saldo,
      motivo,
      estorno_de: m.id,
      estornado: false,
      chave: novoId(),
      criado_em: new Date().toISOString(),
    });
  }
  c.cancelado_em = new Date().toISOString();
  c.motivo_cancelamento = motivo;
  for (const t of fin.titulos.filter((t) => t.compra_id === id)) {
    t.cancelado_em = c.cancelado_em;
    t.motivo_cancelamento = motivo;
    t.revisao++;
  }
  gravarConjuntoDemo({
    patio_estoque_v1: estoque,
    patio_financeiro_v1: fin,
    patio_compras_v1: compras,
  });
}
