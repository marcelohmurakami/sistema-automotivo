import type { AtendimentoServico } from "../services/servicos";
import {
  apresentacaoEntrega,
  concluirReparo,
  etapasEmAndamento,
} from "./assistenciaTecnica.ts";
import { fichaDoAtendimento } from "./operacaoServicos.ts";
import { ordemSemAutorizacao } from "./apresentacaoDocumentoServico.ts";

export const colunasAssistencia = [
  {
    id: "recebidos",
    nome: "Recebidos",
    ajuda: "Diagnóstico e orçamento",
    acao: "Enviar para aprovação",
  },
  {
    id: "aprovados",
    nome: "Aprovados",
    ajuda: "Prontos para iniciar",
    acao: "Iniciar reparo",
  },
  {
    id: "producao",
    nome: "Em reparo",
    ajuda: "Serviços em execução",
    acao: "Concluir reparo",
  },
  {
    id: "parados",
    nome: "Parados",
    ajuda: "Aprovação, peças ou outras pendências",
    acao: "Retomar serviço",
  },
  {
    id: "prontos",
    nome: "Prontos",
    ajuda: "Retirada ou aceite no local",
    acao: "Registrar entrega",
  },
] as const;

export const motivosParadaAssistencia = [
  "Aguardando aprovação do orçamento",
  "Aguardando peças",
  "Aguardando retorno do cliente",
  "Aguardando serviço de terceiro",
  "Aguardando testes ou diagnóstico",
  "Outro motivo",
] as const;
// O estado persistido de aprovação continua separado; só a coluna é agrupada.
export type EtapaPainelAssistencia =
  (typeof colunasAssistencia)[number]["id"] | "aprovacao";

export function acaoCartaoAssistencia(a: AtendimentoServico) {
  const etapa = etapaPainelAssistencia(a);
  return etapa === "aprovacao"
    ? ordemSemAutorizacao(a)
      ? "Registrar autorização"
      : "Aprovar e abrir OS"
    : colunasAssistencia.find((c) => c.id === etapa)?.acao;
}

export function etapaPainelAssistencia(
  a: AtendimentoServico,
): EtapaPainelAssistencia | null {
  if (a.situacao === "cancelado") return null;
  if (a.situacao === "concluido")
    return apresentacaoEntrega(a).confirmada ? null : "prontos";
  if (a.situacao === "aguardando") return "parados";
  if (a.situacao === "em_execucao") return "producao";
  if (a.situacao === "aprovado") return "aprovados";
  return a.dados.orcamento_enviado === "nao" ? "recebidos" : "aprovacao";
}

export function avancarAssistencia(
  a: AtendimentoServico,
  especialidade: string,
): AtendimentoServico {
  const etapa = etapaPainelAssistencia(a);
  const ficha = fichaDoAtendimento(a, especialidade);
  if (etapa === "recebidos")
    return {
      ...a,
      dados: { ...a.dados, orcamento_enviado: "sim" },
    };
  if (etapa === "aprovacao")
    return {
      ...a,
      situacao: "aprovado",
      dados: {
        ...a.dados,
        orcamento_aprovado_em: new Date().toISOString(),
      },
    };
  if (etapa === "aprovados" || etapa === "parados")
    return {
      ...a,
      situacao: "em_execucao",
      ficha_especialidade: {
        ...ficha,
        etapa:
          etapasEmAndamento(ficha.especialidade).find((e) => e.startsWith("Reparo")) ||
          ficha.etapa,
        campos: { ...ficha.campos, motivo_espera: "Sem pendência", pendencia: "" },
      },
    };
  if (etapa === "producao") return concluirReparo(a, especialidade);
  throw new Error("Abra a ordem para registrar quem recebeu o equipamento.");
}

export function pararAssistencia(
  a: AtendimentoServico,
  especialidade: string,
  motivo: string,
): AtendimentoServico {
  if (!["orcamento", "aprovado", "em_execucao"].includes(a.situacao))
    throw new Error("Este serviço não pode ser parado nesta situação.");
  if (!motivo.trim() || motivo.trim().length > 1500)
    throw new Error("Informe o motivo da parada.");
  const ficha = fichaDoAtendimento(a, especialidade);
  return {
    ...a,
    // Um orçamento parado continua sem aprovação. Retomar nunca pode autorizá-lo.
    situacao: a.situacao === "orcamento" ? "orcamento" : "aguardando",
    dados:
      a.situacao === "orcamento" ? { ...a.dados, orcamento_enviado: "sim" } : a.dados,
    ficha_especialidade: {
      ...ficha,
      campos: { ...ficha.campos, pendencia: motivo.trim() },
    },
  };
}
