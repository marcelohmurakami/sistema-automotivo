import { rpc } from "../lib/rpc";
import type { Pagina, UnidadeEstoque } from "./suprimentos";
export type Deposito = {
  id: string;
  nome: string;
  tipo: "deposito" | "veiculo";
  identificacao: string;
  ativo: boolean;
  padrao: boolean;
  revisao: number;
  saldo: number;
  reservado: number;
  disponivel: number;
};
export type SaldoLocal = {
  id: string;
  descricao: string;
  unidade: string;
  saldo: number;
  reservado: number;
  disponivel: number;
  rastreado: boolean;
  revisao: number;
};
export type EtiquetaEstoque = {
  codigo: string;
  descricao: string;
  serie?: string;
  imei?: string;
  deposito?: string;
};
export type CodigoEstoque = {
  produto_id: string;
  descricao: string;
  unidade_id: string | null;
  serie: string | null;
  imei: string | null;
  estado: string | null;
  reserva_id: string | null;
  deposito_id: string;
  disponivel: number;
};
export type Transferencia = {
  id: string;
  descricao: string;
  unidade: string;
  origem_nome: string;
  destino_nome: string;
  quantidade: number;
  motivo: string;
  criado_em: string;
};
export const logisticaEstoque = {
  depositos: (
    w: string,
    produto: string | null = null,
    busca = "",
    pagina = 0,
    deposito: string | null = null,
    signal?: AbortSignal,
  ) =>
    rpc<
      Pagina<Deposito> & {
        padrao: string;
        produtos?: SaldoLocal[];
        total_produtos?: number;
      }
    >(
      "consultar_depositos_estoque",
      {
        p_oficina: w,
        p_produto: produto,
        p_busca: busca,
        p_pagina: pagina,
        p_deposito: deposito,
      },
      signal,
    ),
  unidades: (
    w: string,
    produto: string,
    deposito: string | null,
    busca = "",
    pagina = 0,
    signal?: AbortSignal,
  ) =>
    rpc<Pagina<UnidadeEstoque>>(
      "consultar_unidades_deposito",
      {
        p_oficina: w,
        p_produto: produto,
        p_deposito: deposito,
        p_busca: busca,
        p_pagina: pagina,
      },
      signal,
    ),
  transferencias: (
    w: string,
    produto: string | null = null,
    pagina = 0,
    signal?: AbortSignal,
  ) =>
    rpc<Pagina<Transferencia>>(
      "consultar_transferencias_estoque",
      {
        p_oficina: w,
        p_produto: produto,
        p_pagina: pagina,
      },
      signal,
    ),
  etiqueta: (
    w: string,
    produto: string,
    unidade: string | null = null,
    codigo: string | null = null,
  ) =>
    rpc<EtiquetaEstoque>("preparar_etiqueta_estoque", {
      p_oficina: w,
      p_produto: produto,
      p_unidade: unidade,
      p_codigo: codigo,
    }),
  localizar: (w: string, codigo: string) =>
    rpc<CodigoEstoque[]>("localizar_codigo_estoque", {
      p_oficina: w,
      p_codigo: codigo,
    }),
};
