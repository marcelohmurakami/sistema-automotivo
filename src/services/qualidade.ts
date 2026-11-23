import { novoId } from "../lib/uuid.ts";
import { rpc } from "../lib/rpc";

import type { OrdemServico } from "./ordensServico";
export const motivosQualidade = {
  execucao: "Execução do serviço",
  peca: "Peça com problema",
  diagnostico: "Diagnóstico",
  prazo: "Prazo de entrega",
  atendimento: "Atendimento",
  recorrencia: "Problema voltou",
  outro: "Outro motivo",
};
export const situacoesQualidade = {
  aberta: "Aberta",
  em_analise: "Em análise",
  em_retrabalho: "Em retrabalho",
  resolvida: "Resolvida",
  cancelada: "Cancelada",
};
export type OcorrenciaQualidade = {
  id: string;
  ordem_original_id: string;
  ordem_retrabalho_id: string | null;
  item_os_id: string | null;
  funcionario_id: string | null;
  tipo: "garantia" | "retrabalho" | "reclamacao";
  situacao: keyof typeof situacoesQualidade;
  cobertura: string;
  motivo: keyof typeof motivosQualidade;
  descricao: string;
  diagnostico: string;
  solucao: string;
  reclamacao: boolean;
  houve_retrabalho: boolean;
  aberto_em: string;
  resolvido_em: string | null;
  horas_retrabalho: number;
  custo_hora_centavos: number;
  custo_pecas_centavos: number;
  outros_custos_centavos: number;
  reembolso_centavos: number;
  recuperado_centavos: number;
  nota_cliente: number | null;
  comentario_cliente: string;
  custos_conferidos: boolean;
  revisao: number;
  numero_os?: number;
  cliente?: string;
  veiculo?: string;
  funcionario?: string;
  servico?: string;
};
export type OpcaoOSQualidade = {
  id: string;
  numero: number;
  cliente: string;
  veiculo: string;
  servicos: { id: string; descricao: string }[];
};
const chave = (oficina: string) => "patio_qualidade_v1_" + oficina;
export const custoQualidade = (q: OcorrenciaQualidade) =>
  Math.round(q.horas_retrabalho * q.custo_hora_centavos) +
  q.custo_pecas_centavos +
  q.outros_custos_centavos +
  q.reembolso_centavos -
  q.recuperado_centavos;
export function novaOcorrencia(): OcorrenciaQualidade {
  return {
    id: novoId(),
    ordem_original_id: "",
    ordem_retrabalho_id: null,
    item_os_id: null,
    funcionario_id: null,
    tipo: "garantia",
    situacao: "aberta",
    cobertura: "em_analise",
    motivo: "execucao",
    descricao: "",
    diagnostico: "",
    solucao: "",
    reclamacao: false,
    houve_retrabalho: false,
    aberto_em: new Date().toISOString(),
    resolvido_em: null,
    horas_retrabalho: 0,
    custo_hora_centavos: 0,
    custo_pecas_centavos: 0,
    outros_custos_centavos: 0,
    reembolso_centavos: 0,
    recuperado_centavos: 0,
    nota_cliente: null,
    comentario_cliente: "",
    custos_conferidos: false,
    revisao: 0,
  };
}
export async function opcoesQualidade(
  demo: boolean,
  oficina: string,
  busca: string,
  os?: string,
  signal?: AbortSignal,
) {
  if (!demo)
    return rpc<OpcaoOSQualidade[]>(
      "opcoes_os_qualidade",
      {
        p_oficina: oficina,
        p_busca: busca,
        p_os: os || null,
      },
      signal,
    );
  const ordens: OrdemServico[] = JSON.parse(
    localStorage.getItem("patio_os_v1") || "[]",
  );
  return ordens
    .filter(
      (o) =>
        !o.arquivado_em &&
        (!os || o.id === os) &&
        (!busca ||
          `${o.numero} ${o.dados_cliente.nome}`
            .toLowerCase()
            .includes(busca.toLowerCase())),
    )
    .slice(0, 30)
    .map((o) => ({
      id: o.id,
      numero: o.numero,
      cliente: o.dados_cliente.nome,
      veiculo: o.dados_veiculo.modelo,
      servicos: o.itens
        .filter((i) => i.tipo === "service")
        .map((i) => ({ id: i.id, descricao: i.descricao })),
    }));
}
export async function consultarQualidade(
  demo: boolean,
  oficina: string,
  inicio: string,
  fim: string,
  signal?: AbortSignal,
) {
  if (!demo)
    return rpc<{ ocorrencias: OcorrenciaQualidade[]; abertas: number }>(
      "consultar_qualidade",
      { p_oficina: oficina, p_inicio: inicio, p_fim: fim },
      signal,
    );
  const todas: OcorrenciaQualidade[] = JSON.parse(
    localStorage.getItem(chave(oficina)) || "[]",
  );
  return {
    ocorrencias: todas.filter(
      (q) => q.aberto_em.slice(0, 10) >= inicio && q.aberto_em.slice(0, 10) <= fim,
    ),
    abertas: todas.filter((q) => !["resolvida", "cancelada"].includes(q.situacao))
      .length,
  };
}
export async function salvarQualidade(
  demo: boolean,
  oficina: string,
  q: OcorrenciaQualidade,
) {
  if (!demo)
    return rpc("salvar_ocorrencia_qualidade", {
      p_oficina: oficina,
      p_id: q.id,
      p_dados: q,
      p_revisao: q.revisao || null,
    });
  if (!q.ordem_original_id || q.descricao.trim().length < 5)
    throw new Error("Escolha a OS e descreva o problema.");
  if (q.situacao === "resolvida" && q.solucao.trim().length < 3)
    throw new Error("Informe a solução.");
  if (custoQualidade(q) < 0)
    throw new Error("O valor recuperado não pode superar o custo.");
  const todas: OcorrenciaQualidade[] = JSON.parse(
    localStorage.getItem(chave(oficina)) || "[]",
  );
  const anterior = todas.find((o) => o.id === q.id);
  if (anterior && anterior.revisao !== q.revisao)
    throw new Error("Ocorrência alterada. Atualize antes de salvar.");
  const nova = {
    ...q,
    revisao: q.revisao + 1,
    resolvido_em:
      q.situacao === "resolvida" ? q.resolvido_em || new Date().toISOString() : null,
  };
  localStorage.setItem(
    chave(oficina),
    JSON.stringify([nova, ...todas.filter((o) => o.id !== q.id)]),
  );
}
