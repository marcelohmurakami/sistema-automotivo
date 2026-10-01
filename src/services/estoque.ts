import { rpc } from "./orcamentos";
export type ProdutoEstoque = {
  id: string;
  descricao: string;
  unidade: string;
  preco_padrao_centavos: number;
  arquivado_em: string | null;
  codigo: string | null;
  localizacao: string;
  fornecedor: string;
  saldo: number | null;
  minimo: number;
  custo_centavos: number;
  revisao: number | null;
};
export type MovimentoEstoque = {
  compra_id?: string | null;
  id: string;
  item_catalogo_id: string;
  tipo: string;
  quantidade: number;
  saldo_apos: number;
  custo_centavos: number;
  motivo: string;
  documento: string;
  ordem_servico_id: string | null;
  numero_os: number | null;
  criado_em: string;
  estornado: boolean;
  estorno_de?: string;
  chave: string;
};
export const tiposMovimento: Record<string, string> = {
  entrada: "Entrada",
  saida: "Saída avulsa",
  ajuste: "Contagem física",
  consumo_os: "Consumo em OS",
  estorno: "Estorno / devolução",
};
export type DadosEstoque = {
  produtos: ProdutoEstoque[];
  movimentos: MovimentoEstoque[];
};
const chave = "patio_estoque_v1";
export function lerEstoqueDemo(): DadosEstoque {
  return JSON.parse(
    localStorage.getItem(chave) || '{"produtos":[],"movimentos":[]}',
  );
}
function gravar(d: DadosEstoque) {
  localStorage.setItem(chave, JSON.stringify(d));
}
export async function listarEstoque(
  demo: boolean,
  oficina: string,
  busca = "",
  filtro = "",
  pagina = 0,
) {
  if (!demo)
    return rpc<{
      itens: ProdutoEstoque[];
      total: number;
      resumo: { produtos: number; baixos: number; valor_centavos: number };
    }>("listar_estoque", {
      p_oficina: oficina,
      p_busca: busca,
      p_filtro: filtro,
      p_pagina: pagina,
    });
  const d = lerEstoqueDemo();
  const ativos = d.produtos.filter((p) => !p.arquivado_em);
  const lista = d.produtos.filter(
    (p) =>
      (filtro === "arquivados" ? !!p.arquivado_em : !p.arquivado_em) &&
      (filtro !== "baixo" || (p.saldo ?? 0) <= p.minimo) &&
      `${p.descricao} ${p.codigo ?? ""}`
        .toLowerCase()
        .includes(busca.toLowerCase()),
  );
  return {
    itens: lista.slice(pagina * 24, pagina * 24 + 24),
    total: lista.length,
    resumo: {
      produtos: ativos.length,
      baixos: ativos.filter((p) => (p.saldo ?? 0) <= p.minimo).length,
      valor_centavos: ativos.reduce(
        (v, p) => v + Math.round((p.saldo ?? 0) * p.custo_centavos),
        0,
      ),
    },
  };
}
export async function salvarProduto(
  demo: boolean,
  oficina: string,
  p: ProdutoEstoque,
) {
  if (!demo)
    return rpc<string>("salvar_produto_estoque", {
      p_oficina: oficina,
      p_id: p.id,
      p_revisao: p.revisao,
      p_dados: p,
    });
  const d = lerEstoqueDemo(),
    atual = d.produtos.find((x) => x.id === p.id);
  if (atual && atual.revisao !== p.revisao)
    throw new Error("Produto alterado. Atualize antes de salvar.");
  d.produtos = [
    { ...p, saldo: atual?.saldo ?? 0, revisao: (atual?.revisao ?? 0) + 1 },
    ...d.produtos.filter((x) => x.id !== p.id),
  ];
  gravar(d);
  return p.id;
}
export async function movimentar(
  demo: boolean,
  oficina: string,
  p: ProdutoEstoque,
  tipo: string,
  quantidade: number,
  motivo: string,
  documento: string,
  chaveMov: string,
) {
  if (!demo)
    return rpc("movimentar_estoque", {
      p_oficina: oficina,
      p_produto: p.id,
      p_tipo: tipo,
      p_quantidade: quantidade,
      p_motivo: motivo,
      p_documento: documento,
      p_chave: chaveMov,
      p_revisao: p.revisao,
    });
  const d = lerEstoqueDemo();
  if (d.movimentos.some((m) => m.chave === chaveMov)) return;
  const produto = d.produtos.find((x) => x.id === p.id)!;
  if (produto.revisao !== p.revisao)
    throw new Error("Saldo alterado. Atualize antes de movimentar.");
  const delta =
    tipo === "ajuste"
      ? quantidade - (produto.saldo ?? 0)
      : quantidade * (tipo === "saida" ? -1 : 1);
  if (!delta || !Number.isFinite(delta) || quantidade < 0)
    throw new Error("Informe uma quantidade válida que altere o saldo.");
  if ((produto.saldo ?? 0) + delta < 0) throw new Error("Saldo insuficiente.");
  produto.saldo = Math.round(((produto.saldo ?? 0) + delta) * 1000) / 1000;
  produto.revisao = (produto.revisao ?? 0) + 1;
  d.movimentos.unshift({
    id: crypto.randomUUID(),
    item_catalogo_id: p.id,
    tipo,
    quantidade: delta,
    saldo_apos: produto.saldo,
    custo_centavos: produto.custo_centavos,
    motivo,
    documento,
    ordem_servico_id: null,
    numero_os: null,
    criado_em: new Date().toISOString(),
    estornado: false,
    chave: chaveMov,
  });
  gravar(d);
}
export async function historicoEstoque(
  demo: boolean,
  oficina: string,
  produto: string,
  pagina: number,
) {
  if (!demo)
    return rpc<MovimentoEstoque[]>("consultar_movimentacoes_estoque", {
      p_oficina: oficina,
      p_produto: produto,
      p_pagina: pagina,
    });
  return lerEstoqueDemo()
    .movimentos.filter((m) => m.item_catalogo_id === produto)
    .slice(pagina * 30, pagina * 30 + 30);
}
export async function estornarEstoque(
  demo: boolean,
  oficina: string,
  m: MovimentoEstoque,
  motivo: string,
) {
  if (!demo)
    return rpc("estornar_movimentacao_estoque", {
      p_oficina: oficina,
      p_movimento: m.id,
      p_motivo: motivo,
    });
  const d = lerEstoqueDemo(),
    original = d.movimentos.find((x) => x.id === m.id)!,
    p = d.produtos.find((x) => x.id === m.item_catalogo_id)!;
  if (original.estornado) return;
  if (original.compra_id)
    throw new Error(
      "Cancele a compra para reverter estoque e financeiro juntos.",
    );
  if ((p.saldo ?? 0) - m.quantidade < 0)
    throw new Error("O estorno deixaria o estoque negativo.");
  p.saldo = Math.round(((p.saldo ?? 0) - m.quantidade) * 1000) / 1000;
  p.revisao = (p.revisao ?? 0) + 1;
  original.estornado = true;
  d.movimentos.unshift({
    ...m,
    id: crypto.randomUUID(),
    tipo: "estorno",
    quantidade: -m.quantidade,
    saldo_apos: p.saldo,
    motivo,
    estorno_de: m.id,
    estornado: false,
    criado_em: new Date().toISOString(),
  });
  gravar(d);
}
export async function arquivarProduto(
  demo: boolean,
  oficina: string,
  p: ProdutoEstoque,
) {
  if (!demo)
    return rpc("arquivar_produto_estoque", {
      p_oficina: oficina,
      p_produto: p.id,
      p_arquivar: !p.arquivado_em,
    });
  if (!p.arquivado_em && p.saldo)
    throw new Error("Zere o saldo antes de arquivar.");
  const d = lerEstoqueDemo();
  d.produtos = d.produtos.map((x) =>
    x.id === p.id
      ? {
          ...x,
          revisao: (x.revisao ?? 0) + 1,
          arquivado_em: p.arquivado_em ? null : new Date().toISOString(),
        }
      : x,
  );
  gravar(d);
}
export function baixarEstoqueDemo(
  os: {
    id: string;
    numero: number;
    itens: {
      id: string;
      tipo: string;
      descricao: string;
      quantidade: number;
      situacao: string;
      produto_estoque_id?: string | null;
      item_catalogo_id?: string | null;
      origem_peca?: string | null;
    }[];
  },
  salvarOS: () => void,
) {
  const d = lerEstoqueDemo(),
    antes = localStorage.getItem(chave),
    osAntes = localStorage.getItem("patio_os_v1");
  for (const i of os.itens) {
    if (
      i.tipo !== "part" ||
      i.situacao === "cancelled" ||
      ["cliente", "externa"].includes(i.origem_peca ?? "")
    )
      continue;
    if (d.movimentos.some((m) => m.chave === `os:${os.id}:${i.id}`)) continue;
    const p = d.produtos.find(
      (p) => p.id === (i.produto_estoque_id ?? i.item_catalogo_id),
    );
    if (!p)
      throw new Error(`Defina a origem de ${i.descricao} antes de entregar.`);
    if ((p.saldo ?? 0) < i.quantidade)
      throw new Error(`Saldo insuficiente para ${i.descricao}.`);
    p.saldo = Math.round(((p.saldo ?? 0) - i.quantidade) * 1000) / 1000;
    p.revisao = (p.revisao ?? 0) + 1;
    d.movimentos.unshift({
      id: crypto.randomUUID(),
      item_catalogo_id: p.id,
      tipo: "consumo_os",
      quantidade: -i.quantidade,
      saldo_apos: p.saldo,
      custo_centavos: p.custo_centavos,
      motivo: `Consumo na entrega da OS #${os.numero}`,
      documento: "",
      ordem_servico_id: os.id,
      numero_os: os.numero,
      criado_em: new Date().toISOString(),
      estornado: false,
      chave: `os:${os.id}:${i.id}`,
    });
  }
  try {
    gravar(d);
    salvarOS();
  } catch (e) {
    if (antes === null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, antes);
    if (osAntes === null) localStorage.removeItem("patio_os_v1");
    else localStorage.setItem("patio_os_v1", osAntes);
    throw e;
  }
}
