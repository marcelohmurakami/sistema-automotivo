export const secoesCompras = {
  recebidas: "Compras recebidas",
  pedidos: "Pedidos",
  cotacoes: "Cotações",
  sugestoes: "Reposição",
  devolucoes: "Devoluções e créditos",
  catalogos: "Catálogos dos fornecedores",
} as const;

export type SecaoCompras = keyof typeof secoesCompras;
export type SecaoSuprimentos = Exclude<SecaoCompras, "recebidas">;

export function termosBuscaCompras(item: { rota: string; nome: string }) {
  return item.rota === "/compras"
    ? `${item.nome} pedidos cotações reposição peças materiais produtos recebimentos`
    : item.nome;
}

export function secaoCompras(params: URLSearchParams): SecaoCompras {
  if (params.get("compra")) return "recebidas";
  const aba = params.get("aba") || "recebidas";
  return Object.hasOwn(secoesCompras, aba) ? (aba as SecaoCompras) : "recebidas";
}

export function destinoCompras(aba: SecaoCompras) {
  return aba === "recebidas" ? "/compras" : `/compras?aba=${aba}`;
}

export function destinoSuprimentosAntigo(search: string) {
  const params = new URLSearchParams(search);
  if (!params.get("compra") && !Object.hasOwn(secoesCompras, params.get("aba") || "")) {
    params.set("aba", "pedidos");
  }
  return `/compras?${params}`;
}
