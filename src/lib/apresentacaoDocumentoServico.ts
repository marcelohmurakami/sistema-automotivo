import type { AtendimentoServico } from "../services/servicos";

type Documento = Pick<AtendimentoServico, "situacao" | "dados"> &
  Partial<Pick<AtendimentoServico, "revisao">>;

export function orcamentoRecusado(a: Documento) {
  return (
    a.situacao === "orcamento" &&
    !!a.dados.orcamento_recusado_em &&
    a.dados.orcamento_recusado_revisao === String(a.revisao)
  );
}

// Recepção e orçamento compartilham o estado persistido, mas são documentos distintos.
export function ordemSemAutorizacao(a: Documento) {
  return a.situacao === "orcamento" && a.dados.documento === "ordem";
}

export function ordemComCusteio(a: Documento) {
  return (
    a.situacao !== "cancelado" && (a.situacao !== "orcamento" || ordemSemAutorizacao(a))
  );
}

export function rotuloSituacaoDocumento(a: Documento, padrao: string) {
  if (orcamentoRecusado(a)) return "Orçamento recusado";
  if (!ordemSemAutorizacao(a)) return padrao;
  return a.dados.orcamento_enviado === "sim" ? "Aguardando autorização" : "Recebido";
}
