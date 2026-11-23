import { rpc } from "../lib/rpc";
import { consultarFinanceiro, hoje } from "./financeiro";

import { lerEstoqueDemo } from "./estoque";
import {
  detalharFinanceiro,
  periodoAnterior,
  type RelatorioFinanceiro,
} from "../lib/relatorioFinanceiro";

export async function consultarRelatorioFinanceiro(
  demo: boolean,
  oficina: string,
  inicio: string,
  fim: string,
  signal?: AbortSignal,
): Promise<RelatorioFinanceiro> {
  if (
    !inicio ||
    !fim ||
    inicio > fim ||
    !Number.isFinite(Date.parse(inicio)) ||
    !Number.isFinite(Date.parse(fim)) ||
    Date.parse(fim) - Date.parse(inicio) > 366 * 86400000
  )
    throw new Error("Escolha um período válido de até 367 dias.");
  if (!demo) {
    if (signal?.aborted) throw new DOMException("Consulta cancelada", "AbortError");
    await rpc("sincronizar_contas_recorrentes", { p_oficina: oficina });
    // Não interrompe a gravação idempotente das recorrências; cancela apenas a leitura vencida.
    if (signal?.aborted) throw new DOMException("Consulta cancelada", "AbortError");
    return rpc(
      "consultar_relatorio_financeiro",
      {
        p_oficina: oficina,
        p_inicio: inicio,
        p_fim: fim,
      },
      signal,
    );
  }
  const anterior = periodoAnterior(inicio, fim);
  const consultar = (inicio: string, fim: string) =>
    consultarFinanceiro(true, oficina, {
      inicio,
      fim,
      busca: "",
      filtro: "periodo",
      natureza: "",
      pagina: 0,
      os: null,
    });
  const atual = await consultar(inicio, fim),
    antes = await consultar(anterior.inicio, anterior.fim);
  const dados = JSON.parse(
    localStorage.getItem("patio_financeiro_v1") || '{"titulos":[],"baixas":[]}',
  );
  const pecas = lerEstoqueDemo()
    .movimentos.filter((m) => m.ordem_servico_id)
    .map((m) => ({
      data: new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
      }).format(new Date(m.criado_em)),
      valor: Math.round(-m.quantidade * m.custo_centavos),
    }));
  return {
    ...detalharFinanceiro(dados.titulos, dados.baixas, pecas, inicio, fim, hoje()),
    resumo: atual.resumo,
    contas: atual.contas,
    anterior: antes.resumo,
    inicio_anterior: anterior.inicio,
    fim_anterior: anterior.fim,
  };
}
