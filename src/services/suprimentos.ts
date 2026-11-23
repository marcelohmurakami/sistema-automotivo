import { rpc } from "../lib/rpc";
import type { ProdutoEstoque } from "./estoque";
export type Pagina<T> = { itens: T[]; total: number };
export type LinhaPedido = {
  id: string;
  produto_id: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  custo_centavos: number;
  recebido: number;
  devolvido: number;
  reposto: number;
  creditado: number;
  sem_reposicao: number;
  pendente: number;
  rastreado: boolean;
};
export type EntradaPedido = {
  id: string;
  tipo: "compra" | "reposicao" | "devolucao";
  data: string;
  documento: string;
  motivo: string;
  cancelado: boolean;
  compra_id: string | null;
  itens: { item_id: string; quantidade: number; recusado?: number }[];
};
export type Pedido = {
  id: string;
  referencia: string;
  fornecedor: string;
  fornecedor_id: string;
  previsao: string | null;
  condicoes: string;
  observacoes: string;
  revisao: number;
  cancelado: boolean;
  motivo_cancelamento: string;
  total_centavos: number;
  pendente: number;
  itens: LinhaPedido[];
  entregas: EntradaPedido[];
  total_entregas: number;
};
export type ItemSolicitado = {
  produto_id: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  custo_centavos: number;
};
export type PropostaCompra = {
  id: string;
  fornecedor_id: string;
  fornecedor: string;
  itens: ItemSolicitado[];
  total_centavos: number;
  previsao: string;
  validade: string;
  condicoes: string;
  observacoes: string;
  versao: number;
};
export type Cotacao = {
  id: string;
  titulo: string;
  revisao: number;
  pedido_id: string | null;
  escolhida: string | null;
  motivo_escolha: string;
  fornecedores: number;
  itens: ItemSolicitado[];
  propostas: PropostaCompra[];
  historico: PropostaCompra[];
  total_historico: number;
};
export type SugestaoCompra = ProdutoEstoque & {
  item_catalogo_id: string;
  disponivel: number;
  reservado: number;
  consumo: number;
  em_pedidos: number;
  media_diaria: number;
  ponto_pedido: number;
  sugerido: number;
  fornecedor_id: string | null;
  fornecedor_nome: string | null;
  prazo_reposicao_dias: number;
  cobertura_dias: number;
  seguranca: number;
};
export type UnidadeEstoque = {
  deposito_id?: string | null;
  id: string;
  produto_id: string;
  descricao: string;
  serie: string;
  imei: string | null;
  estado: "estoque" | "utilizado" | "saida" | "cancelado";
  reserva_id: string | null;
  documento?: string | null;
  ramo_documento?: string;
  entrada_id: string;
  movimento_id: string;
  revisao: number;
};
export type ReservaItem = {
  deposito_id?: string | null;
  unidade: string;
  item_id: string;
  descricao: string;
  produto_id: string;
  quantidade: number;
  ativo: boolean;
  saldo: number;
  disponivel: number;
  rastreado: boolean;
  reservado: number;
  reserva_id: string | null;
  reserva_revisao: number | null;
  unidades: UnidadeEstoque[];
};
export type Reservas = { revisao: number; itens: ReservaItem[] };
export const suprimentos = {
  produto: (w: string, id: string, signal?: AbortSignal) =>
    rpc<ProdutoEstoque>(
      "consultar_produto_estoque",
      { p_oficina: w, p_produto: id },
      signal,
    ),
  pedidos: (w: string, busca = "", pagina = 0, signal?: AbortSignal) =>
    rpc<Pagina<Pedido>>(
      "consultar_pedidos_compra",
      {
        p_oficina: w,
        p_busca: busca,
        p_pagina: pagina,
      },
      signal,
    ),
  pedido: (w: string, id: string, pagina = 0, signal?: AbortSignal) =>
    rpc<Pedido>(
      "consultar_pedidos_compra",
      {
        p_oficina: w,
        p_pedido: id,
        p_pagina: pagina,
      },
      signal,
    ),
  cotacoes: (w: string, busca = "", pagina = 0, signal?: AbortSignal) =>
    rpc<Pagina<Cotacao>>(
      "consultar_cotacoes_compra",
      {
        p_oficina: w,
        p_busca: busca,
        p_pagina: pagina,
      },
      signal,
    ),
  cotacao: (w: string, id: string, pagina = 0, signal?: AbortSignal) =>
    rpc<Cotacao>(
      "consultar_cotacoes_compra",
      {
        p_oficina: w,
        p_cotacao: id,
        p_pagina: pagina,
      },
      signal,
    ),
  sugestoes: (w: string, busca = "", pagina = 0, dias = 90, signal?: AbortSignal) =>
    rpc<Pagina<SugestaoCompra>>(
      "sugerir_compras_estoque",
      {
        p_oficina: w,
        p_busca: busca,
        p_pagina: pagina,
        p_dias: dias,
      },
      signal,
    ),
  unidades: (
    w: string,
    produto: string | null,
    busca = "",
    pagina = 0,
    signal?: AbortSignal,
  ) =>
    rpc<Pagina<UnidadeEstoque>>(
      "consultar_unidades_estoque",
      {
        p_oficina: w,
        p_produto: produto,
        p_busca: busca,
        p_pagina: pagina,
      },
      signal,
    ),
  unidade: (w: string, id: string, signal?: AbortSignal) =>
    rpc<{
      unidade: UnidadeEstoque;
      historico: {
        id: number;
        tipo: string;
        criado_em: string;
        dados: UnidadeEstoque & {
          documento_id?: string | null;
          ramo?: string;
          referencia?: string | null;
          motivo?: string;
        };
      }[];
    }>("consultar_unidades_estoque", { p_oficina: w, p_unidade: id }, signal),
  reservas: (w: string, id: string, ramo: "os" | "atendimento") =>
    rpc<Reservas>("consultar_reservas_atendimento", {
      p_oficina: w,
      p_documento: id,
      p_ramo: ramo,
    }),
  executar: <T = unknown>(w: string, nome: string, dados: Record<string, unknown>) =>
    rpc<T>(nome, { p_oficina: w, ...dados }),
};
