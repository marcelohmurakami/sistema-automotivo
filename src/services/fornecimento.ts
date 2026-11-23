import { rpc } from "../lib/rpc";
import type { Pagina } from "./suprimentos";
import type { LinhaCatalogoFornecedor } from "../lib/catalogoFornecedor";
export type ItemCatalogoFornecedor = LinhaCatalogoFornecedor & {
  id: string;
  fornecedor_id: string;
  fornecedor: string;
  produto_id: string | null;
  produto_descricao: string | null;
  data_catalogo: string;
  arquivo: string;
  revisao: number;
};
export type DevolucaoFornecedor = {
  id: string;
  fornecedor_id: string;
  fornecedor: string;
  produto_id: string;
  descricao: string;
  unidade: string;
  rastreado: boolean;
  pedido_id: string | null;
  quantidade: number;
  substituido: number;
  creditado: number;
  sem_reposicao: number;
  pendente: number;
  credito_centavos: number;
  usado_centavos: number;
  estado: "aberto" | "enviado" | "analise" | "resolvido" | "encerrado";
  motivo: string;
  protocolo: string;
  prazo: string | null;
  observacoes: string;
  revisao: number;
  historico: {
    id: number;
    tipo: string;
    criado_em: string;
    dados: Record<string, unknown>;
  }[];
  total_historico: number;
  total_contas: number;
  contas: {
    id: string;
    descricao: string;
    documento: string;
    aberto_centavos: number;
    vencimento: string;
  }[];
  aplicacoes: {
    id: string;
    titulo_id: string;
    valor_centavos: number;
    estorno_de: string | null;
    estornado: boolean;
    motivo: string;
    criado_em: string;
  }[];
};
export const fornecimento = {
  catalogo: (
    w: string,
    busca = "",
    pagina = 0,
    fornecedor: string | null = null,
    disponibilidade = "todas",
  ) =>
    rpc<Pagina<ItemCatalogoFornecedor>>("consultar_catalogo_fornecedor", {
      p_oficina: w,
      p_busca: busca,
      p_pagina: pagina,
      p_fornecedor: fornecedor,
      p_disponibilidade: disponibilidade,
    }),
  devolucoes: (
    w: string,
    busca = "",
    pagina = 0,
    situacao = "abertas",
    signal?: AbortSignal,
  ) =>
    rpc<Pagina<DevolucaoFornecedor>>(
      "consultar_devolucoes_fornecedor",
      {
        p_oficina: w,
        p_busca: busca,
        p_pagina: pagina,
        p_situacao: situacao,
      },
      signal,
    ),
  devolucao: (w: string, id: string, pagina = 0, signal?: AbortSignal) =>
    rpc<DevolucaoFornecedor>(
      "consultar_devolucoes_fornecedor",
      {
        p_oficina: w,
        p_id: id,
        p_pagina: pagina,
      },
      signal,
    ),
};
