import { rpc } from "../lib/rpc";
import { acaoProposta, gravarDemo, obterProposta, type Proposta } from "./orcamentos";
import type { AlteracaoRapidaMapa } from "./edicaoRapidaMapa";
export async function salvarIdentificacaoOrcamento(
  demo: boolean,
  oficina: string,
  anterior: Proposta,
  alteracao: AlteracaoRapidaMapa,
): Promise<Proposta> {
  if (!demo)
    return rpc("editar_identificacao_orcamento", {
      p_oficina: oficina,
      p_orcamento: anterior.id,
      p_revisao: anterior.revisao,
      p_campo: alteracao.campo,
      p_valor: alteracao.valor,
    });
  let q = await obterProposta(true, oficina, anterior.id);
  if (q.revisao !== anterior.revisao)
    throw new Error("O orçamento mudou. Atualize os dados antes de salvar.");
  if (q.arquivado_em || q.edicao_bloqueada || q.adicional_aplicado_em)
    throw new Error("Este orçamento está encerrado ou já autorizou uma OS.");
  const campo = alteracao.campo === "tipo" ? "tipo_servico" : "entrega_prevista_em";
  if ((q.versao[campo] || "") === (alteracao.valor || "")) return q;
  if (q.situacao !== "draft")
    q = (await acaoProposta(true, oficina, q, "revisar")) as Proposta;
  return gravarDemo({
    ...q,
    revisao: q.revisao + 1,
    versao: { ...q.versao, [campo]: alteracao.valor },
  });
}
