import { rpc } from "../lib/rpc";
export type RegrasContrato = {
  mensalidade: number;
  franquia_visitas: number;
  franquia_minutos: number;
  franquia_materiais: number;
  excedente_visita: number;
  excedente_hora: number;
  participacao_visita: number;
  vencimento_dia: number;
  servicos: string[];
  equipamentos: string[];
};
export type Contrato = {
  id: string;
  nome: string;
  cliente: string;
  cliente_id: string;
  inicio: string;
  fim: string | null;
  encerrado_em: string | null;
  revisao: number;
  regras: RegrasContrato;
};
export type Consumo = {
  id: string;
  data: string;
  servico: string;
  equipamento: string;
  visitas: number;
  minutos: number;
  materiais_centavos: number;
  observacoes: string;
  cancelado: boolean;
};
export type Fatura = {
  competencia: string;
  inicio: string;
  fim: string;
  regras: RegrasContrato;
  visitas: number;
  minutos: number;
  materiais: number;
  mensalidade: number;
  excedente_visitas: number;
  excedente_horas: number;
  excedente_materiais: number;
  participacao: number;
  total: number;
  vencimento: string;
  fechada: boolean;
  titulo_id?: string;
};
export type DetalheContrato = {
  contrato: Contrato;
  versoes: { desde: string; regras: RegrasContrato; motivo: string }[];
  consumos: Consumo[];
  total_consumos: number;
  fatura: { resumo: Fatura; titulo_id: string } | null;
};
export const listarContratos = (
  w: string,
  busca: string,
  pagina: number,
  signal?: AbortSignal,
) =>
  rpc<{ itens: Contrato[]; total: number }>(
    "consultar_contratos",
    {
      p_oficina: w,
      p_busca: busca,
      p_pagina: pagina,
    },
    signal,
  );
export const detalheContrato = (
  w: string,
  id: string,
  mes: string,
  pagina: number,
  signal?: AbortSignal,
) =>
  rpc<DetalheContrato>(
    "consultar_contratos",
    {
      p_oficina: w,
      p_contrato: id,
      p_mes: mes,
      p_pagina: pagina,
    },
    signal,
  );
export const salvarContrato = (
  w: string,
  id: string,
  d: Record<string, unknown>,
  rev?: number,
) =>
  rpc("salvar_contrato_preventivo", {
    p_oficina: w,
    p_id: id,
    p_dados: d,
    p_revisao: rev ?? null,
  });
export const consumirContrato = (
  w: string,
  id: string,
  chave: string,
  d: Record<string, unknown>,
  cancelar = false,
) =>
  rpc("registrar_consumo_contrato", {
    p_oficina: w,
    p_contrato: id,
    p_id: chave,
    p_dados: d,
    p_cancelar: cancelar,
  });
export const faturarContrato = (
  w: string,
  id: string,
  mes: string,
  confirmar = false,
) =>
  rpc<Fatura>("faturar_contrato", {
    p_oficina: w,
    p_contrato: id,
    p_mes: mes,
    p_confirmar: confirmar,
  });
export const encerrarContrato = (w: string, id: string, rev: number, data: string) =>
  rpc("encerrar_contrato", {
    p_oficina: w,
    p_contrato: id,
    p_revisao: rev,
    p_data: data,
  });

export type CobrancaContrato = {
  id: string;
  nome: string;
  cliente: string;
  fatura: Fatura;
  assinatura: string;
  fechada: boolean;
  titulo_id: string | null;
  cancelada: boolean;
  aberto: number | null;
};
export const listarCobrancasContratos = (
  w: string,
  mes: string,
  pagina: number,
  pendentes: boolean,
) =>
  rpc<{ itens: CobrancaContrato[]; total: number }>("consultar_cobrancas_contratos", {
    p_oficina: w,
    p_mes: mes,
    p_pagina: pagina,
    p_pendentes: pendentes,
  });
export const faturarLoteContratos = (
  w: string,
  mes: string,
  itens: Pick<CobrancaContrato, "id" | "assinatura">[],
) =>
  rpc<Fatura[]>("faturar_lote_contratos", { p_oficina: w, p_mes: mes, p_itens: itens });
