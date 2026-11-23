import type { AtendimentoServico, ObjetoServico } from "../services/servicos";
import type {
  TaxaDiagnostico,
  ComprovanteAutorizacao,
} from "../lib/diagnosticoOrcamento";
export type ItemAtendimento = {
  id: string;
  tipo: "servico" | "material";
  descricao: string;
  quantidade: number;
  unidade: string;
  preco_centavos: number;
  custo_centavos?: number;
  custo_informado?: boolean;
  custo_ajustado?: boolean;
  produto_id?: string | null;
  origem: "estoque" | "externa" | "cliente";
  grupo_servico?: string;
  depende_grupo?: string;
};
export type IntegranteAtendimento = {
  id: string;
  funcionario_id: string;
  nome: string;
  percentual?: number;
  custo_hora_centavos?: number;
  comissao_centavos?: number;
  titulo_id?: string | null;
};
export type HoraAtendimento = {
  id: string;
  atendimento_id: string;
  funcionario_id: string;
  inicio: string;
  fim: string | null;
  descricao: string;
};
export type QualidadeAtendimento = {
  id: string;
  atendimento_id: string;
  funcionario_id: string | null;
  tipo: "garantia" | "retrabalho" | "reclamacao";
  motivo: string;
  solucao: string;
  aberto_em: string;
  resolvido_em: string | null;
  custo_centavos: number;
  minutos: number;
  nota: number | null;
  revisao: number;
};
export type EventoAtendimento = {
  id: number;
  tipo: string;
  antes: string | null;
  depois: string | null;
  criado_em: string;
};
export type ComercialAtendimento = {
  abatimento_diagnostico_centavos?: number;
  comissao_total_centavos?: number;
  desconto_centavos?: number;
  custo_extra_centavos?: number;
  orcado_centavos?: number | null;
  motivo_custo?: string;
};
export type DetalhesAtendimento = {
  taxa_diagnostico?: TaxaDiagnostico;
  atendimento: AtendimentoServico;
  cliente: { nome: string; telefone: string | null };
  objeto: ObjetoServico;
  itens: ItemAtendimento[];
  comercial: ComercialAtendimento;
  equipe: IntegranteAtendimento[];
  horas: HoraAtendimento[];
  qualidade: QualidadeAtendimento[];
  eventos: EventoAtendimento[];
  propostas?: PropostaAtendimento[];
};

export type ItemPropostaServico = Pick<
  ItemAtendimento,
  | "id"
  | "tipo"
  | "descricao"
  | "quantidade"
  | "unidade"
  | "preco_centavos"
  | "grupo_servico"
  | "depende_grupo"
>;
export type DocumentoPropostaServico = {
  taxa_diagnostico?: TaxaDiagnostico;
  numero: number;
  titulo: string;
  data_servico: string;
  cliente: string;
  objeto: string;
  empresa: { nome: string; ramo: string };
  resumo: string;
  itens: ItemPropostaServico[];
  desconto_centavos: number;
  total_centavos: number;
};
export type PropostaAtendimento = {
  comprovante?: ComprovanteAutorizacao | null;
  id: string;
  revisao: number;
  documento: DocumentoPropostaServico;
  expira_em?: string;
  criado_em?: string;
  decisao: "aprovado" | "recusado" | null;
  nome_informado: string | null;
  confirmado_em: string | null;
  grupos_aprovados: string[] | null;
  total_aprovado_centavos: number | null;
  origem?: "equipe" | "link" | "portal";
};
