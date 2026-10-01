import type { QueryClient } from "@tanstack/react-query";
export async function atualizarIntegracoes(qc: QueryClient) {
  await Promise.all(
    [
      "catalogo",
      "aux-orcamento",
      "auxiliares-orcamento",
      "financeiro",
      "mapa-oficina",
      "financeiro-relatorio",
      "financeiro-os",
      "financeiro-historico",
      "compras",
      "compra",
      "estoque",
      "estoque-historico",
      "os-detalhe",
      "relatorios",
      "historico-gestao",
    ].map((k) => qc.invalidateQueries({ queryKey: [k] })),
  );
}
