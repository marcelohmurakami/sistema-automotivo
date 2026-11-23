import { rpc } from "../lib/rpc";
export type TipoAnalise =
  | "clientes"
  | "dados"
  | "tempos"
  | "recursos"
  | "contratos"
  | "primeira_visita"
  | "equipamentos"
  | "comparacao"
  | "filiais";
export type LinhaAnalise = { id: string; nome: string; [key: string]: unknown };
export type AnaliseGerencial = {
  tipo: TipoAnalise;
  total: number;
  pagina: number;
  inicio: string;
  fim: string;
  gerado_em: string;
  criterios: string;
  resumo: Record<string, number>;
  linhas: LinhaAnalise[];
};
export type VinculoAnalitico = {
  dados: Record<string, unknown>;
  revisao: number;
  ativo: boolean;
};
export const consultarAnalise = (
  oficina: string,
  tipo: TipoAnalise,
  inicio: string,
  fim: string,
  filtros: Record<string, unknown>,
  pagina: number,
  signal?: AbortSignal,
) =>
  rpc<AnaliseGerencial>(
    "consultar_analise_gerencial",
    {
      p_oficina: oficina,
      p_tipo: tipo,
      p_inicio: inicio,
      p_fim: fim,
      p_filtros: filtros,
      p_pagina: pagina,
    },
    signal,
  );
export const buscarOpcoesAnalise = (
  oficina: string,
  tipo: string,
  busca: string,
  signal?: AbortSignal,
) =>
  rpc<{ id: string; nome: string }[]>(
    "buscar_opcoes_analiticas",
    {
      p_oficina: oficina,
      p_tipo: tipo,
      p_busca: busca,
    },
    signal,
  );
export const consultarVinculo = (
  oficina: string,
  tipo: string,
  id: string,
  signal?: AbortSignal,
) =>
  rpc<VinculoAnalitico | null>(
    "consultar_vinculo_analitico",
    {
      p_oficina: oficina,
      p_tipo: tipo,
      p_id: id,
    },
    signal,
  );
export const salvarVinculo = (
  oficina: string,
  tipo: string,
  id: string,
  dados: Record<string, unknown>,
  revisao: number | null,
) =>
  rpc<void>("salvar_vinculo_analitico", {
    p_oficina: oficina,
    p_tipo: tipo,
    p_id: id,
    p_dados: dados,
    p_revisao: revisao,
  });
export const retirarVinculo = (
  oficina: string,
  tipo: string,
  id: string,
  revisao: number,
  motivo: string,
) =>
  rpc<void>("retirar_vinculo_analitico", {
    p_oficina: oficina,
    p_tipo: tipo,
    p_id: id,
    p_revisao: revisao,
    p_motivo: motivo,
  });
