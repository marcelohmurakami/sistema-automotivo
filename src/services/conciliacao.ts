import { rpc } from "../lib/rpc";
import type { LinhaExtratoImportada } from "../lib/extratoBancario";
export type EstadoConciliacao = "pendente" | "conciliado" | "ignorado";
export const movimentosSemExtrato = (
  w: string,
  conta: string,
  inicio: string,
  fim: string,
  pagina: number,
  signal?: AbortSignal,
) =>
  rpc<{ itens: MovimentoConciliacao[]; total: number }>(
    "consultar_movimentos_sem_extrato",
    { p_oficina: w, p_conta: conta, p_inicio: inicio, p_fim: fim, p_pagina: pagina },
    signal,
  );
export type LinhaExtrato = LinhaExtratoImportada & {
  id: string;
  estado: EstadoConciliacao;
  motivo: string;
  revisao: number;
};
export type MovimentoConciliacao = {
  id: string;
  titulo_id: string;
  data: string;
  descricao: string;
  pessoa: string;
  valor: number;
  sugestao: boolean;
  taxa_centavos: number;
  estorno_de: string | null;
};
export type ListaConciliacao = {
  itens: LinhaExtrato[];
  total: number;
  resumo: {
    total: number;
    pendentes: number;
    conciliados: number;
    ignorados: number;
    sem_extrato: number;
    movimento_extrato: number;
    movimento_sistema: number;
  };
};
export const importarExtrato = (
  w: string,
  id: string,
  conta: string,
  nome: string,
  linhas: LinhaExtratoImportada[],
) =>
  rpc<{ novos: number; repetidos: number }>("importar_extrato", {
    p_oficina: w,
    p_id: id,
    p_conta: conta,
    p_nome: nome,
    p_linhas: linhas,
  });
export const consultarConciliacao = (
  w: string,
  conta: string,
  inicio: string,
  fim: string,
  estado: string,
  pagina: number,
  signal?: AbortSignal,
) =>
  rpc<ListaConciliacao>(
    "consultar_conciliacao",
    {
      p_oficina: w,
      p_conta: conta,
      p_inicio: inicio,
      p_fim: fim,
      p_estado: estado,
      p_pagina: pagina,
    },
    signal,
  );
export const detalharConciliacao = (
  w: string,
  id: string,
  inicio: string,
  fim: string,
  busca: string,
  pagina: number,
  signal?: AbortSignal,
) =>
  rpc<{
    linha: LinhaExtrato;
    candidatos: MovimentoConciliacao[];
    vinculados: MovimentoConciliacao[];
    total: number;
    historico: {
      id: number;
      criado_em: string;
      estado: EstadoConciliacao;
      motivo: string;
      baixas: string[];
    }[];
  }>(
    "detalhar_conciliacao",
    {
      p_oficina: w,
      p_linha: id,
      p_inicio: inicio,
      p_fim: fim,
      p_busca: busca,
      p_pagina: pagina,
    },
    signal,
  );
export const resolverConciliacao = (
  w: string,
  l: LinhaExtrato,
  estado: EstadoConciliacao,
  ids: string[],
  motivo: string,
) =>
  rpc("resolver_conciliacao", {
    p_oficina: w,
    p_linha: l.id,
    p_revisao: l.revisao,
    p_estado: estado,
    p_baixas: ids,
    p_motivo: motivo,
  });
export type MovimentoContador = MovimentoConciliacao & {
  conta_nome: string;
  forma: string;
  categoria: string;
  taxa_assinada: number;
  identificador_banco: string | null;
  linha_id: string | null;
  data_extrato: string | null;
};
export async function exportarMovimentosContador(
  w: string,
  inicio: string,
  fim: string,
) {
  const linhas: MovimentoContador[] = [];
  let assinatura: string | undefined;
  for (let p = 0; p <= 10000; p++) {
    const d = await rpc<{
      total: number;
      linhas: MovimentoContador[];
      assinatura: string;
    }>("exportar_movimentos_contador", {
      p_oficina: w,
      p_inicio: inicio,
      p_fim: fim,
      p_pagina: p,
    });
    if (assinatura && assinatura !== d.assinatura)
      throw Error(
        "Os lançamentos mudaram durante a exportação. Gere o arquivo novamente.",
      );
    assinatura = d.assinatura;
    linhas.push(...d.linhas);
    if (linhas.length >= d.total) return linhas;
    if (!d.linhas.length) break;
  }
  throw Error(
    "Não foi possível exportar o período completo. Escolha um período menor.",
  );
}
