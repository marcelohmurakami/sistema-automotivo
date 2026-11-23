import { rpc } from "../lib/rpc";
import { type ItemProposta } from "./orcamentos";
export type Pacote = {
  id: string;
  nome: string;
  ativo: boolean;
  revisao: number;
  itens: { item_catalogo_id: string; quantidade: number }[];
};
export type Agendamento = {
  recursos_reservados?: string[];
  resumo_recursos?: import("./reservasRecursos").ResumoRecurso[];
  distribuicao?: import("./distribuicaoTecnicos").CriteriosDistribuicao;
  visita?: boolean;
  deslocamento_minutos?: number;
  logistica?: LogisticaVisita;
  id: string;
  cliente: string;
  veiculo: string;
  placa: string;
  cliente_id: string;
  veiculo_id: string | null;
  identificacao?: string | null;
  recurso: string;
  inicio: string;
  fim: string | null;
  servico: string;
  situacao: string;
  revisao: number;
  ordem_servico_id: string | null;
};
export type Manutencao = {
  id: string;
  ordem_servico_id: string;
  descricao: string;
  data_prevista: string | null;
  quilometragem_prevista: number | null;
  concluida_em: string | null;
  veiculo: string;
  placa: string;
  cliente?: string;
  numero_os?: number;
};
export type Vistoria = {
  dados: {
    combustivel: number;
    pertences: string;
    avarias: { local: string; descricao: string }[];
  };
  revisao: number;
  confirmado_em: string | null;
  nome_confirmacao: string | null;
};
export type Produtividade = {
  pacotes: Pacote[];
  agenda: Agendamento[];
  manutencoes: Manutencao[];
  adicionais: {
    orcamento_id: string;
    numero: number;
    situacao: string;
    total_centavos: number;
    aplicado_em: string | null;
  }[];
  tempos: {
    id: string;
    meu: boolean;
    iniciado_em: string;
    encerrado_em: string | null;
    segundos: number;
    custo_centavos: number;
  }[];
  retornos: {
    id: string;
    ordem_original_id: string;
    ordem_retorno_id: string;
    numero: number;
    situacao: string;
    motivo: string;
    total_centavos: number;
  }[];
  vistoria: Vistoria | null;
};
export const consultarProdutividade = (
  oficina: string,
  os?: string,
  signal?: AbortSignal,
) =>
  rpc<Produtividade>(
    "consultar_produtividade",
    {
      p_oficina: oficina,
      p_os: os || null,
    },
    signal,
  );
export const operarProdutividade = (
  oficina: string,
  acao: string,
  dados: Record<string, unknown>,
) =>
  rpc<{ os?: string; orcamento?: string; id?: string }>("operar_produtividade", {
    p_oficina: oficina,
    p_acao: acao,
    p_dados: dados,
  });
export const itensPacote = (oficina: string, pacote: string) =>
  rpc<ItemProposta[]>("itens_do_pacote", {
    p_oficina: oficina,
    p_pacote: pacote,
  });
export async function tokenPublico() {
  const t = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t))),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  return { token: t, hash };
}
import type { LogisticaVisita } from "../lib/logisticaVisitas";
