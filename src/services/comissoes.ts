import { rpc } from "../lib/rpc";

export type ProfissionalComissao = {
  id: string;
  nome: string;
  usuario_id: string | null;
  ativo: boolean;
  tipo: "percentual" | "fixo";
  valor: number;
  liberacao: "entrega" | "recebimento";
  revisao: number;
};
export type Comissao = {
  id: string;
  ordem_servico_id: string;
  item_id: string;
  profissional_id: string;
  nome_profissional: string;
  descricao_servico: string;
  numero_os: number;
  cliente: string;
  tipo: ProfissionalComissao["tipo"];
  valor: number;
  liberacao: ProfissionalComissao["liberacao"];
  situacao_os: string;
  base_atual_centavos: number;
  prevista_centavos: number;
  liberada_centavos: number;
  disponivel_centavos: number;
  aguardando_centavos: number;
  pago_centavos: number;
  titulo_id: string | null;
  congelada_em: string | null;
  competencia: string;
};
export type PainelComissoes = {
  profissionais: ProfissionalComissao[];
  itens: Comissao[];
  total: number;
  resumo: {
    prevista: number;
    aguardando: number;
    disponivel: number;
    pago: number;
  };
};
export const consultarComissoes = (
  oficina: string,
  inicio: string,
  fim: string,
  profissional = "",
  os?: string,
  pagina = 0,
  signal?: AbortSignal,
) =>
  rpc<PainelComissoes>(
    "consultar_comissoes",
    {
      p_oficina: oficina,
      p_inicio: inicio,
      p_fim: fim,
      p_profissional: profissional || null,
      p_os: os || null,
      p_pagina: pagina,
    },
    signal,
  );
export const salvarProfissionalComissao = (
  oficina: string,
  p: Omit<ProfissionalComissao, "revisao">,
  revisao?: number,
) =>
  rpc<string>("salvar_profissional_comissao", {
    p_oficina: oficina,
    p_id: p.id,
    p_dados: p,
    p_revisao: revisao ?? null,
  });
export const definirComissoesOS = (
  oficina: string,
  os: string,
  revisao: number,
  atribuicoes: { item_id: string; profissional_id: string | null }[],
) =>
  rpc<void>("definir_comissoes_os", {
    p_oficina: oficina,
    p_os: os,
    p_revisao: revisao,
    p_atribuicoes: atribuicoes,
  });
export const pagarComissao = (
  oficina: string,
  titulo: string,
  dados: {
    chave: string;
    valor: number;
    data: string;
    conta: string;
    forma: string;
    observacao: string;
  },
) =>
  rpc<string>("baixar_titulo_financeiro", {
    p_oficina: oficina,
    p_titulo: titulo,
    p_chave: dados.chave,
    p_valor: dados.valor,
    p_taxa: 0,
    p_data: dados.data,
    p_conta: dados.conta,
    p_forma: dados.forma,
    p_observacao: dados.observacao,
  });
export function textoRegra(
  p: Pick<ProfissionalComissao, "tipo" | "valor" | "liberacao">,
) {
  const valor =
    p.tipo === "percentual"
      ? `${Number(p.valor).toLocaleString("pt-BR")}% da mão de obra`
      : `${Number(p.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} por unidade de serviço`;
  return `${valor} · ${p.liberacao === "entrega" ? "na entrega" : "após entrega, conforme recebimento"}`;
}
export function situacaoComissao(c: Comissao) {
  if (c.situacao_os === "cancelled") return "OS cancelada";
  if (c.prevista_centavos === 0) return "Sem valor a pagar";
  if (c.pago_centavos >= c.prevista_centavos) return "Paga";
  if (c.pago_centavos > 0) return "Paga em parte";
  if (c.disponivel_centavos > 0) return "A pagar";
  return c.situacao_os === "delivered"
    ? "Aguardando cliente pagar"
    : "Aguardando entrega";
}
