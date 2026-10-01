export type SiteOficina = {
  identificador_url: string;
  titulo: string;
  descricao: string;
  publicado: boolean;
  portal_habilitado: boolean;
  pedidos_pecas_habilitados: boolean;
};
export type PedidoSite = {
  id: string;
  cliente?: string;
  situacao: string;
  criado_em: string;
  observacoes?: string;
  itens: { descricao: string; quantidade: number }[];
};
export type AdministracaoSite = {
  site: SiteOficina | null;
  produtos: { id: string; item_catalogo_id: string; visivel: boolean }[];
  pedidos: PedidoSite[];
  acessos: {
    cliente_id: string;
    nome: string;
    email: string;
    revogado_em: string | null;
  }[];
};
export const situacoesPedido: Record<string, string> = {
  requested: "Solicitado",
  reviewing: "Em análise",
  quoted: "Orçado",
  confirmed: "Confirmado",
  ready: "Pronto para retirada",
  fulfilled: "Entregue",
  cancelled: "Cancelado",
};
