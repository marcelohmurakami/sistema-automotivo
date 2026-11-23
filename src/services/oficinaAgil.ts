import { novoId } from "../lib/uuid.ts";
import { rpc } from "../lib/rpc";

export type Oportunidade = {
  origem: "orcamento" | "adiados" | "manutencao" | "retirada";
  origem_id: string;
  cliente_id: string;
  veiculo_id: string;
  descricao: string;
  valor_centavos: number;
  data_referencia: string | null;
  cliente: string;
  telefone: string | null;
  veiculo: string;
  placa: string | null;
  situacao: string;
  proximo_contato: string | null;
  anotacao: string | null;
  contatado_em: string | null;
  orcamento_id: string | null;
  ordem_servico_id: string | null;
  recebido_centavos: number;
  revisao: number | null;
};
export const consultarOportunidades = (oficina: string, signal?: AbortSignal) =>
  rpc<{ itens: Oportunidade[] }>(
    "consultar_oportunidades",
    {
      p_oficina: oficina,
    },
    signal,
  );
export const acompanharOportunidade = (
  oficina: string,
  o: Oportunidade,
  dados: Record<string, unknown>,
) =>
  rpc<{ orcamento: string | null }>("acompanhar_oportunidade", {
    p_oficina: oficina,
    p_origem: o.origem,
    p_origem_id: o.origem_id,
    p_dados: {
      revisao: o.revisao,
      proximo_contato: o.proximo_contato,
      anotacao: o.anotacao,
      ...dados,
    },
  });
export type EtapaExecucao = {
  id: string;
  nome: string;
  posicao: number;
  situacao: string;
  responsavel: string;
  fornecedor_id: string | null;
  fornecedor?: string;
  prazo: string | null;
  custo_centavos: number;
  observacoes: string;
  titulo_financeiro_id: string | null;
  revisao: number;
};
export const consultarEtapas = (oficina: string, os: string, signal?: AbortSignal) =>
  rpc<EtapaExecucao[]>(
    "consultar_etapas_execucao",
    {
      p_oficina: oficina,
      p_os: os,
    },
    signal,
  );
export const salvarEtapa = (
  oficina: string,
  os: string,
  e: EtapaExecucao,
  dados: Record<string, unknown> = {},
) =>
  rpc("salvar_etapa_execucao", {
    p_oficina: oficina,
    p_os: os,
    p_id: e.id,
    p_revisao: e.revisao || null,
    p_dados: { ...e, ...dados },
  });
export const novaEtapa = (posicao: number): EtapaExecucao => ({
  id: novoId(),
  nome: "",
  posicao,
  situacao: "pendente",
  responsavel: "",
  fornecedor_id: null,
  prazo: null,
  custo_centavos: 0,
  observacoes: "",
  titulo_financeiro_id: null,
  revisao: 0,
});
