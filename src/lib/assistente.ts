export type ContextoAssistente = {
  tela?: string;
  os?: string;
  atendimento?: string;
  cliente?: string;
  inicio?: string;
  fim?: string;
  data?: string;
  titulo?: string;
};
export type MensagemAssistente = { role: "user" | "assistant"; content: string };
export type ConsultaAssistente = {
  tipo: string;
  linhas: Record<string, unknown>[];
  limite: number;
  pode_haver_mais: boolean;
  consultado_em: string;
  inicio: string | null;
  fim: string | null;
  base?: string | null;
};
export type PropostaAssistente = {
  id: string;
  acao: string;
  titulo: string;
  expira_em: string;
  campos: {
    rotulo: string;
    valor: string | null;
    editar?:
      | "veiculo"
      | "motor"
      | "identificacao"
      | "placa"
      | "marca"
      | "modelo"
      | "serie"
      | "endereco"
      | null;
  }[];
  itens?: {
    descricao: string;
    quantidade: number;
    preco_centavos: number;
    origem: string;
    aproximacao?: { pedido: string };
  }[];
  total_centavos?: number;
};
export type RespostaAssistente = {
  texto: string;
  consultas: ConsultaAssistente[];
  proposta: PropostaAssistente | null;
  transcricao?: string | null;
  erro?: string;
};
export type ResultadoAssistente = { id: string; destino: string; mensagem: string };

export function rotuloConfirmacaoAssistente(proposta: PropostaAssistente) {
  if (proposta.titulo === "Criar ordem de serviço") return "Confirmar e criar OS";
  if (proposta.titulo === "Criar orçamento") return "Confirmar e criar orçamento";
  return "Confirmar e salvar";
}

const rotas: Record<string, string> = {
  "/": "Tela inicial",
  "/ordens-servico": "Ordens de serviço",
  "/atendimentos": "Atendimentos",
  "/orcamentos": "Orçamentos",
  "/clientes": "Clientes",
  "/relatorios": "Relatórios",
  "/produtividade": "Agenda",
  "/agenda": "Agenda",
  "/estoque": "Estoque",
  "/financeiro": "Financeiro",
};
export function contextoDaRota(pathname: string, search: string): ContextoAssistente {
  const p = new URLSearchParams(search);
  const uuid = /^[0-9a-f-]{36}$/i;
  const contexto: ContextoAssistente = { tela: rotas[pathname] || "Sistema" };
  for (const campo of ["os", "atendimento", "cliente"] as const) {
    const id = p.get(campo);
    if (id && uuid.test(id)) contexto[campo] = id;
  }
  return contexto;
}
export function historicoLimitado(mensagens: MensagemAssistente[]) {
  return mensagens.slice(-16).map((m) => ({ ...m, content: m.content.slice(0, 4000) }));
}
export function destinoAssistenteValido(destino: string) {
  return /^\/(ordens-servico|atendimentos|orcamentos|financeiro|produtividade|agenda|garantias)(\?[a-z]+=[0-9a-f-]{36})?$/.test(
    destino,
  );
}
export function selecionarContas(consulta: ConsultaAssistente, selecionados: string[]) {
  const ids = new Set(selecionados);
  const contas = consulta.linhas.filter((l) => ids.has(String(l.id)));
  if (
    !contas.length ||
    contas.length !== ids.size ||
    contas.some((c) => !c.cliente_id || Number(c.aberto_centavos) <= 0) ||
    new Set(contas.map((c) => c.cliente_id)).size !== 1
  )
    throw Error("Selecione contas em aberto de um único cliente cadastrado.");
  return contas;
}
