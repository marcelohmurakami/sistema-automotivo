export type ItemCatalogo = {
  id: string;
  tipo: "service" | "part";
  descricao: string;
  unidade: string;
  preco_padrao_centavos: number;
  favorito: boolean;
  arquivado_em: string | null;
  revisao: number;
};
const chave = "patio_catalogo_v1";
const iniciais: ItemCatalogo[] = [
  {
    id: "oleo",
    tipo: "service",
    descricao: "Troca de óleo — mão de obra",
    unidade: "serv",
    preco_padrao_centavos: 6000,
    favorito: true,
    arquivado_em: null,
    revisao: 1,
  },
  {
    id: "alinhamento",
    tipo: "service",
    descricao: "Alinhamento da direção",
    unidade: "serv",
    preco_padrao_centavos: 10000,
    favorito: true,
    arquivado_em: null,
    revisao: 1,
  },
];
function metadados(): ItemCatalogo[] {
  return JSON.parse(localStorage.getItem(chave) || JSON.stringify(iniciais));
}
type ProdutoDemo = Omit<ItemCatalogo, "revisao"> & {
  revisao: number | null;
  saldo: number | null;
  minimo: number;
  custo_centavos: number;
  codigo: string | null;
  localizacao: string;
  fornecedor: string;
};
function estoque(): { produtos: ProdutoDemo[]; movimentos: unknown[] } {
  return JSON.parse(
    localStorage.getItem("patio_estoque_v1") ||
      '{"produtos":[],"movimentos":[]}',
  );
}
export function lerCatalogoDemo(): ItemCatalogo[] {
  const meta = metadados(),
    d = estoque();
  return [
    ...meta.filter((i) => i.tipo === "service"),
    ...d.produtos.map((p) => {
      const m = meta.find((i) => i.id === p.id);
      return {
        id: p.id,
        tipo: "part" as const,
        descricao: p.descricao,
        unidade: p.unidade,
        preco_padrao_centavos: p.preco_padrao_centavos,
        favorito: m?.favorito ?? false,
        arquivado_em: p.arquivado_em,
        revisao: (m?.revisao ?? 1) + (p.revisao ?? 0),
      };
    }),
  ];
}
export function salvarCatalogoDemo(item: ItemCatalogo, novo: boolean) {
  const meta = metadados(),
    d = estoque(),
    atual = lerCatalogoDemo().find((i) => i.id === item.id);
  if (!novo && (!atual || atual.revisao !== item.revisao))
    throw new Error("Cadastro alterado. Atualize antes de salvar.");
  if (novo && atual)
    throw new Error("Cadastro já existente. Atualize a lista.");
  if (atual && atual.tipo !== item.tipo)
    throw new Error("O tipo do cadastro não pode ser alterado.");
  const p = d.produtos.find((p) => p.id === item.id);
  if (p && atual?.unidade !== item.unidade && p.saldo !== null)
    throw new Error("A unidade de um produto em uso não pode ser alterada.");
  const os = JSON.parse(localStorage.getItem("patio_os_v1") || "[]") as {
    situacao: string;
    itens: { item_catalogo_id?: string; produto_estoque_id?: string }[];
  }[];
  if (
    atual &&
    atual.unidade !== item.unidade &&
    os.some((o) => o.itens.some((i) => i.item_catalogo_id === item.id))
  )
    throw new Error("A unidade de um item em uso não pode ser alterada.");
  if (
    item.arquivado_em &&
    ((p?.saldo ?? 0) !== 0 ||
      os.some(
        (o) =>
          !["delivered", "cancelled"].includes(o.situacao) &&
          o.itens.some(
            (i) => (i.produto_estoque_id || i.item_catalogo_id) === item.id,
          ),
      ))
  )
    throw new Error(
      "Zere o saldo e conclua as OS vinculadas antes de arquivar.",
    );
  if (item.tipo === "part") {
    d.produtos = [
      {
        ...(p ?? {
          saldo: null,
          minimo: 0,
          custo_centavos: 0,
          codigo: null,
          localizacao: "",
          fornecedor: "",
        }),
        ...item,
        revisao: p?.revisao == null ? null : p.revisao + 1,
      },
      ...d.produtos.filter((p) => p.id !== item.id),
    ];
  }
  const registro = {
    ...item,
    revisao: (meta.find((i) => i.id === item.id)?.revisao ?? 0) + 1,
  };
  const antes = localStorage.getItem("patio_estoque_v1");
  try {
    if (item.tipo === "part")
      localStorage.setItem("patio_estoque_v1", JSON.stringify(d));
    localStorage.setItem(
      chave,
      JSON.stringify([registro, ...meta.filter((i) => i.id !== item.id)]),
    );
  } catch (e) {
    if (antes === null) localStorage.removeItem("patio_estoque_v1");
    else localStorage.setItem("patio_estoque_v1", antes);
    throw e;
  }
}
export const buscarCatalogo = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
export function filtrarCatalogo(
  itens: ItemCatalogo[],
  busca: string,
  tipo: string,
  situacao: string,
  favoritos: boolean,
) {
  return itens
    .filter(
      (i) =>
        (tipo === "todos" || i.tipo === tipo) &&
        (situacao === "arquivados" ? !!i.arquivado_em : !i.arquivado_em) &&
        (!favoritos || i.favorito) &&
        buscarCatalogo(i.descricao).includes(buscarCatalogo(busca)),
    )
    .sort(
      (a, b) =>
        Number(b.favorito) - Number(a.favorito) ||
        a.descricao.localeCompare(b.descricao, "pt-BR") ||
        a.id.localeCompare(b.id),
    );
}
