import type { OcorrenciaQualidade } from "../services/qualidade";
import type { FichaEspecialidade } from "../lib/perfisAtendimento";
import type { CusteioRelatorio } from "./custeioRelatorio";
export type ComplementoGestao = {
  entidade: string;
  registro_id: string;
  revisao: number;
  dados: Record<string, unknown>;
};
export type OrdemGestao = {
  ficha_especialidade?: FichaEspecialidade | null;
  id: string;
  numero: number;
  cliente_id: string | null;
  cliente: string;
  veiculo: string;
  tipo: string | null;
  situacao: string;
  total: number;
  entrada: string | null;
  inicio: string | null;
  pronta: string | null;
  entrega: string | null;
  cancelamento: string | null;
  prazo: string | null;
  orcado: number | null;
  orcamento: string | null;
  adicionais: number;
  mao_obra: number;
};
export type DadosGestao = {
  custeios?: Record<string, CusteioRelatorio>;
  primeiras_entregas?: { cliente_id: string; data: string | null }[];
  agora: string;
  equipe_permitida: boolean;
  complementos: ComplementoGestao[];
  funcionarios: { id: string; nome: string; ativo: boolean }[];
  fornecedores: { id: string; nome: string }[];
  ordens: OrdemGestao[];
  itens: {
    id: string;
    os: string;
    catalogo: string | null;
    produto: string | null;
    tipo: string;
    nome: string;
    quantidade: number;
    receita: number;
  }[];
  historico: {
    os: string;
    data: string;
    de: string | null;
    para: string | null;
  }[];
  paradas: { os: string; motivo: string; inicio: string; fim: string | null }[];
  qualidade: OcorrenciaQualidade[];
  orcamentos: {
    cliente_id?: string | null;
    tipo?: string | null;
    id: string;
    numero: number;
    situacao: string;
    data: string;
    valor: number | null;
  }[];
  titulos: {
    id: string;
    os: string | null;
    nome: string;
    categoria: string;
    natureza: string;
    data: string;
    valor: number;
    comissao: string | null;
    compra: string | null;
    vencimento: string;
  }[];
  pagamentos: {
    forma: string;
    valor: number;
    estorno: boolean;
    data: string;
  }[];
  produtos: {
    ultima_movimentacao?: string | null;
    id: string;
    nome: string;
    codigo: string | null;
    unidade: string;
    saldo: number;
    minimo: number;
    custo: number;
    fornecedor: string;
    criado: string | null;
    reservado: number;
  }[];
  movimentos: {
    id: string;
    produto: string;
    os: string | null;
    item: string | null;
    tipo: string;
    quantidade: number;
    custo: number;
    motivo: string;
    data: string;
    estorno: string | null;
  }[];
  compras: {
    id: string;
    fornecedor_id: string | null;
    fornecedor: string;
    documento: string;
    data: string;
    total: number;
  }[];
  agenda: {
    id: string;
    inicio: string;
    fim: string | null;
    recurso: string;
    servico: string;
    cliente: string;
    identificacao: string;
  }[];
  comissoes: {
    os: string;
    item: string;
    valor: number;
    liberada: number;
    paga: number;
    profissional: string | null;
  }[];
  profissionais: { id: string; nome: string }[];
};
export type FiltrosGestao = {
  busca: string;
  cliente: string;
  funcionario: string;
  tipo: string;
  situacao: string;
  fornecedor: string;
  estoque: string;
};
