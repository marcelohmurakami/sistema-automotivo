const acoes: Record<string, string> = {
  "cliente.cadastrado": "Cliente cadastrado",
  "cliente.editado": "Cliente atualizado",
  "cliente.arquivado": "Cliente arquivado",
  "cliente.restaurado": "Cliente restaurado",
  "orcamento.criado": "Orçamento criado",
  "orcamento.editado": "Orçamento atualizado",
  "orcamento.emitido": "Orçamento emitido",
  "orcamento.revisado": "Nova versão de orçamento",
  "orcamento.cancelado": "Orçamento cancelado",
  "orcamento.approved": "Orçamento aprovado",
  "orcamento.declined": "Orçamento recusado",
  "orcamento.excluido": "Orçamento excluído",
  "os.excluida": "OS excluída",
  saved: "Lançamento financeiro salvo",
  paid: "Pagamento registrado",
  reversed: "Pagamento estornado",
  cancelled: "Lançamento cancelado",
  costs_reviewed: "Custos conferidos",
  os_generated: "Receita de OS gerada",
  transfer_reversed: "Transferência estornada",
  configuracoes_atualizadas: "Configurações atualizadas",
  salvar_produto: "Produto atualizado",
};
export const tituloEvento = (texto: string) =>
  acoes[texto] || texto.replaceAll("_", " ");
export const nomeModulo = (tipo: string) =>
  ({
    ordem_servico: "Atendimento",
    estoque: "Estoque",
    financeiro: "Financeiro",
    cliente: "Cliente",
    orcamento: "Orçamento",
    oficina: "Configurações",
  })[tipo] || tituloEvento(tipo);
export const dataEvento = (data: string) =>
  new Date(data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

const campos: Record<string, string> = {
  natureza: "Tipo da conta",
  pessoa: "Cliente ou fornecedor",
  categoria: "Categoria",
  competencia: "Competência",
  forma_prevista: "Forma de pagamento prevista",
  motivo_cancelamento: "Motivo do cancelamento",
  motivo: "Motivo",
  reason: "Motivo",
  situacao: "Situação",
  situacao_anterior: "Situação anterior",
  tipo: "Tipo",
  descricao: "Descrição",
  nome: "Nome",
  titulo: "Título",
  quantidade: "Quantidade",
  unidade: "Unidade",
  preco_unitario_centavos: "Preço unitário",
  preco_padrao_centavos: "Preço",
  custo_centavos: "Custo",
  valor_centavos: "Valor",
  subtotal_centavos: "Subtotal",
  desconto_centavos: "Desconto",
  total_centavos: "Total",
  desconto_anterior: "Desconto anterior",
  desconto_atual: "Desconto atual",
  saldo_anterior_centavos: "Saldo anterior",
  total_autorizado_centavos: "Total autorizado",
  saldo_apos: "Saldo após a movimentação",
  forma_pagamento: "Forma de pagamento",
  vencimento: "Vencimento",
  data_servico: "Data do serviço",
  old_status: "Situação anterior",
  new_status: "Nova situação",
  old_promised_at: "Prazo anterior",
  new_promised_at: "Novo prazo",
  etapa_anterior: "Etapa anterior",
  etapa_atual: "Etapa",
  local_anterior: "Local anterior",
  local_atual: "Local",
  iniciado_em: "Início",
  finalizado_em: "Finalização",
  recebido_em: "Entrada",
  concluido_em: "Conclusão",
  entregue_em: "Entrega",
  entrega_prevista_em: "Entrega prevista",
  responsavel: "Responsável",
  prioridade: "Prioridade",
  item: "Item",
  itens: "Itens",
  produto: "Produto",
  decisao: "Decisão",
  origem: "Origem",
  revisao: "Revisão",
  revisao_anterior: "Revisão anterior",
  entrada_sem_data: "Entrada sem data",
  pecas_sem_origem: "Peças com origem pendente",
  resultado: "Resultado",
  tipo_servico: "Tipo de serviço",
  minutos_previstos: "Duração prevista (min)",
  percentual: "Porcentagem",
  observacoes: "Observações",
  observacoes_internas: "Observações internas",
  anotacoes: "Anotações",
  diagnostico: "Diagnóstico",
  queixa_cliente: "Relato do cliente",
  resumo_cliente: "Resumo para o cliente",
  ativo: "Ativo",
  visivel_ao_cliente: "Visível para o cliente",
  acao: "Ação",
};
const valores: Record<string, string> = {
  receber: "Conta a receber",
  pagar: "Conta a pagar",
  servicos: "Serviços",
  outras_receitas: "Outras receitas",
  pecas_externas: "Peças externas",
  pessoal: "Pessoal",
  aluguel: "Aluguel",
  agua_luz: "Água e luz",
  impostos: "Impostos",
  terceiros: "Terceiros",
  outras_despesas: "Outras despesas",
  compra_estoque: "Compra de estoque",
  aporte: "Aporte",
  retirada: "Retirada",
  saldo_inicial: "Saldo inicial",
  transferencia: "Transferência",
  receivable: "Conta a receber",
  payable: "Conta a pagar",
  receita: "Conta a receber",
  despesa: "Conta a pagar",
  pix: "Pix",
  cash: "Dinheiro",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  received: "Recebida",
  waiting_approval: "Aguardando aprovação",
  in_progress: "Em execução",
  ready: "Pronta",
  delivered: "Entregue",
  cancelled: "Cancelada",
  approved: "Aprovado",
  declined: "Recusado",
  draft: "Rascunho",
  orcamento: "Orçamento",
  aprovado: "Aprovado",
  em_execucao: "Em execução",
  concluido: "Concluído",
  entregue: "Entregue",
  cancelado: "Cancelado",
  parada: "Parado",
  entrada: "Entrada",
  saida: "Saída",
  ajuste: "Ajuste",
  estorno: "Estorno",
  user: "Equipe",
  customer: "Cliente",
  system: "Sistema",
  estoque: "Estoque",
  customer_supplied: "Fornecido pelo cliente",
  avulsa: "Compra avulsa",
  service: "Serviço",
  part: "Peça",
  pending: "Pendente",
  done: "Concluído",
};
function valorCampo(chave: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "Não informado";
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (typeof valor === "number") {
    return chave.endsWith("_centavos") ||
      ["desconto_anterior", "desconto_atual"].includes(chave)
      ? (valor / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : valor.toLocaleString("pt-BR");
  }
  const texto = String(valor);
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto.split("-").reverse().join("/");
  if (/^\d{4}-\d{2}-\d{2}T/.test(texto) && Number.isFinite(Date.parse(texto)))
    return dataEvento(texto);
  return valores[texto] || texto;
}
export type CampoHistorico = { chave: string; rotulo: string; valor: string };
export function camposHistorico(dados: unknown, prefixo = ""): CampoHistorico[] {
  if (!dados || typeof dados !== "object") return [];
  return Object.entries(dados).flatMap(([k, v]) => {
    // Also protects local demo data; production projects the same allowlist server-side.
    if (!(k in campos) && !/^\d+$/.test(k)) return [];
    const rotulo = [prefixo, campos[k] || `Item ${Number(k) + 1}`]
      .filter(Boolean)
      .join(" · ");
    if (v && typeof v === "object") return camposHistorico(v, rotulo);
    return [{ chave: k, rotulo, valor: valorCampo(k, v) }];
  });
}
export function compararHistorico(dados: Record<string, unknown>) {
  const antes = camposHistorico(dados.antes),
    depois = camposHistorico(dados.depois);
  const pares = [
    ["old_status", "new_status", "Situação"],
    ["old_promised_at", "new_promised_at", "Prazo de entrega"],
    ["etapa_anterior", "etapa_atual", "Etapa"],
    ["desconto_anterior", "desconto_atual", "Desconto"],
  ];
  const alteracoes = [...new Set([...antes, ...depois].map((c) => c.rotulo))].flatMap(
    (rotulo) => {
      const a = antes.find((c) => c.rotulo === rotulo)?.valor || "Não informado";
      const d = depois.find((c) => c.rotulo === rotulo)?.valor || "Não informado";
      return a === d ? [] : [{ rotulo, antes: a, depois: d }];
    },
  );
  const ignorar = new Set(["antes", "depois"]);
  for (const [a, d, rotulo] of pares)
    if (a in dados && d in dados) {
      ignorar.add(a);
      ignorar.add(d);
      if (dados[a] !== dados[d])
        alteracoes.push({
          rotulo,
          antes: valorCampo(a, dados[a]),
          depois: valorCampo(d, dados[d]),
        });
    }
  const informacoes = camposHistorico(
    Object.fromEntries(Object.entries(dados).filter(([k]) => !ignorar.has(k))),
  );
  return { alteracoes, informacoes };
}
