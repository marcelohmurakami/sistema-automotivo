import { rpc } from "../lib/rpc";
import type { CandidatoTecnico } from "./distribuicaoTecnicos";
export type ParticipacaoEquipe = {
  funcionario_id: string;
  execucao_bp: number;
  venda_bp: number;
};
export type AtribuicaoEquipe = {
  criterio: "manual" | "igual" | "horas";
  participantes: ParticipacaoEquipe[];
  fontes: Record<string, string>;
};
export type ResultadoPessoa = ParticipacaoEquipe & {
  nome: string;
  receita: number;
  vendas: number;
  custo: number;
  contribuicao: number;
  minutos: number;
  comissoes: number;
  garantias: number;
  servicos: number;
};
export type DocumentoEquipe = {
  id: string;
  titulo: string;
  cliente: string;
  data: string;
  receita: number;
  situacao: string;
  atribuicao_revisao: number | null;
};
export type FonteEquipe = {
  chave: string;
  categoria: string;
  descricao: string;
  valor: number;
  minutos: number;
  funcionario_id?: string;
  pendente: boolean;
};
export type HoraEquipe = {
  id: string;
  funcionario_id: string;
  inicio: string;
  fim: string;
  custo_hora_centavos: number;
  descricao: string;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
};
export type DetalheEquipe = {
  documento: DocumentoEquipe & {
    assinatura: string;
    custo: number;
    conferido: boolean;
  };
  fontes: FonteEquipe[];
  atribuicao: { dados: AtribuicaoEquipe; revisao: number } | null;
  participantes: ResultadoPessoa[];
  revisar: boolean;
  horas: HoraEquipe[];
};
export type ResumoEquipe = {
  servicos: number;
  receita: number;
  pendentes: number;
  funcionarios: ResultadoPessoa[];
};
export type HabilidadeEquipe = {
  habilidade: string;
  nome: string;
  nivel_minimo: number;
  exige_comprovacao: boolean;
  ativo: boolean;
  revisao: number;
};
export type QualificacaoEquipe = {
  id: string;
  funcionario_id: string;
  nome: string;
  habilidade: string;
  nivel: number;
  realizada_em: string;
  valida_ate: string | null;
  comprovante: string;
  situacao: "planejada" | "concluida" | "revogada";
  observacoes: string;
  revisao: number;
};
export type ConsultaQualificacao = {
  habilidades: HabilidadeEquipe[];
  qualificacoes: QualificacaoEquipe[];
  vencendo: number;
};
export type DemandaEquipe = {
  id: string;
  inicio: string;
  fim: string | null;
  servico: string;
  recurso?: string;
  revisao: number;
};
export type SugestaoEscala = DemandaEquipe & {
  descricao: string;
  habilidades: string[];
  escolha: CandidatoTecnico | null;
  candidatos: CandidatoTecnico[];
  motivo: string | null;
};
export type LinhaDP = Record<string, unknown>;
export type PreparacaoDP = {
  versao: string;
  finalidade: string;
  inicio: string;
  fim: string;
  funcionarios: LinhaDP[];
  lancamentos: LinhaDP[];
  ocorrencias: LinhaDP[];
  horas_produtivas: LinhaDP[];
  comissoes?: LinhaDP[];
  pendencias: string[];
  exportacoes: ExportacaoDP[];
};
export type ExportacaoDP = {
  dados_canonicos: string;
  id: string;
  inicio: string;
  fim: string;
  hash: string;
  criado_em: string;
  dados: PreparacaoDP;
};
export const operacaoEquipe = <T>(
  oficina: string,
  nome: string,
  dados: Record<string, unknown> = {},
  signal?: AbortSignal,
) => rpc<T>(nome, { p_oficina: oficina, ...dados }, signal);
