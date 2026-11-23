import type { AcompanhamentoQualidade } from "../lib/qualidadeAvancada";
import {
  consultarFinanceiroDemoCompleto,
  novoTitulo,
  hoje,
  type TituloFinanceiro,
} from "./financeiro";
import { gravarConjuntoDemo } from "./compras";
import { consultarQualidade, novaOcorrencia, salvarQualidade } from "./qualidade";
import { consultarDetalhesAtendimento, operarAtendimento } from "./servicosCompletos";
export function financeiroGarantiaDemo(a: AcompanhamentoQualidade, salvar = false) {
  const fin = consultarFinanceiroDemoCompleto(),
    t = fin.titulos.find((t) => t.acompanhamento_qualidade_id === a.id),
    valor = Number(a.dados.autorizado_centavos || 0),
    pago = t?.baixado_centavos || 0;
  if (!salvar) return t || null;
  const aprovada =
    ["autorizada", "enviada", "recebida", "ressarcida", "encerrada"].includes(
      a.situacao,
    ) && valor > 0;
  if (pago > valor || (pago > 0 && !aprovada))
    throw Error("Estorne o recebimento antes de reduzir ou cancelar a garantia.");
  if (Number(a.dados.recebido_centavos || 0) !== pago)
    throw Error("Use o botão Receber pagamento para confirmar o ressarcimento.");
  if (!t && !aprovada) return null;
  const titulo: TituloFinanceiro = {
    ...(t || novoTitulo("receber")),
    acompanhamento_qualidade_id: a.id,
    descricao: `Garantia · ${a.dados.fabricante}`,
    pessoa: String(a.dados.fabricante),
    valor_centavos: aprovada ? valor : t!.valor_centavos,
    vencimento: String(a.dados.vencimento_ressarcimento || t?.vencimento || hoje()),
    cancelado_em: aprovada ? null : new Date().toISOString(),
    revisao: (t?.revisao || 0) + 1,
  };
  gravarConjuntoDemo({
    patio_financeiro_v1: {
      ...fin,
      titulos: [titulo, ...fin.titulos.filter((x) => x.id !== titulo.id)],
    },
  });
  return titulo;
}
export async function ocorrenciaAnaliseDemo(
  w: string,
  a: AcompanhamentoQualidade,
  args: Record<string, unknown>,
) {
  const novo = args.p_criar === true,
    dados = args.p_dados as { custo_centavos: number; minutos: number } | undefined;
  if (a.tipo !== "analise") throw Error("Análise indisponível.");
  if (a.ordem_servico_id) {
    let q = (
      await consultarQualidade(true, w, "2000-01-01", "2100-01-01")
    ).ocorrencias.find((q) => q.id === a.id);
    if (!q && novo) {
      q = {
        ...novaOcorrencia(),
        id: a.id,
        ordem_original_id: a.ordem_servico_id,
        descricao: String(a.dados.descricao),
      };
      await salvarQualidade(true, w, q);
      q = { ...q, revisao: 1 };
    }
    if (!q) return null;
    if (dados) {
      if (q.revisao !== args.p_revisao) throw Error("Ocorrência alterada. Atualize.");
      q = {
        ...q,
        outros_custos_centavos: dados.custo_centavos,
        horas_retrabalho: dados.minutos / 60,
      };
      await salvarQualidade(true, w, q);
      q = { ...q, revisao: q.revisao + 1 };
    }
    return {
      ...q,
      origem: "os",
      custo_centavos: q.outros_custos_centavos,
      minutos: Math.round(q.horas_retrabalho * 60),
    };
  }
  let q = (
    await consultarDetalhesAtendimento(true, w, a.atendimento_id!)
  ).qualidade.find((q) => q.id === a.id);
  if (!q && novo) {
    await operarAtendimento(true, w, "salvar_qualidade_atendimento", {
      p_atendimento: a.atendimento_id,
      p_id: a.id,
      p_dados: {
        tipo: "garantia",
        motivo: a.dados.descricao,
        aberto_em: hoje(),
        custo_centavos: 0,
        minutos: 0,
      },
    });
    q = (await consultarDetalhesAtendimento(true, w, a.atendimento_id!)).qualidade.find(
      (q) => q.id === a.id,
    );
  }
  if (!q) return null;
  if (dados) {
    await operarAtendimento(true, w, "salvar_qualidade_atendimento", {
      p_atendimento: a.atendimento_id,
      p_id: a.id,
      p_revisao: args.p_revisao,
      p_dados: { ...q, ...dados },
    });
    q = (await consultarDetalhesAtendimento(true, w, a.atendimento_id!)).qualidade.find(
      (q) => q.id === a.id,
    )!;
  }
  return { ...q, origem: "atendimento" };
}
