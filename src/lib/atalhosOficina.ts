export const normalizarAtalho = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
export type AtalhoOficina = {
  nome: string;
  rota: string;
  recurso: string;
  gerencia?: boolean;
  termos?: string;
};
export const atalhosOficina: AtalhoOficina[] = [
  {
    nome: "Nova ordem de serviço",
    rota: "/ordens-servico?nova=1",
    recurso: "work_orders",
    termos: "os novo atendimento serviço rápido",
  },
  {
    nome: "Novo orçamento",
    rota: "/orcamentos?novo=1",
    recurso: "quotes",
    termos: "proposta cotação",
  },
  {
    nome: "Nova receita",
    rota: "/financeiro?novo=receber",
    recurso: "finance",
    gerencia: true,
    termos: "entrada recebimento",
  },
  {
    nome: "Nova despesa",
    rota: "/financeiro?novo=pagar",
    recurso: "finance",
    gerencia: true,
    termos: "saída gasto boleto",
  },
  {
    nome: "Contas a receber e pagar",
    rota: "/financeiro?aba=contas",
    recurso: "finance",
    gerencia: true,
    termos: "pagamentos cobrança dinheiro",
  },
  {
    nome: "Relatório financeiro",
    rota: "/relatorios?aba=financeiro",
    recurso: "reports",
    gerencia: true,
    termos: "lucro faturamento devedores caixa",
  },
  {
    nome: "Relatório da oficina",
    rota: "/relatorios?aba=oficina",
    recurso: "reports",
    gerencia: true,
    termos: "atrasos ocupação produção",
  },
  {
    nome: "Relatório de estoque",
    rota: "/relatorios?aba=estoque",
    recurso: "reports",
    gerencia: true,
    termos: "peças paradas compras fornecedores",
  },
  {
    nome: "Consultar ordens de serviço",
    rota: "/ordens-servico",
    recurso: "work_orders",
    termos: "os buscar serviço",
  },
  {
    nome: "Consultar orçamentos",
    rota: "/orcamentos",
    recurso: "quotes",
    termos: "propostas buscar",
  },
  {
    nome: "Consultar clientes",
    rota: "/clientes",
    recurso: "customers",
    termos: "nome telefone ficha histórico",
  },
  {
    nome: "Estoque e peças",
    rota: "/estoque",
    recurso: "inventory",
    termos: "saldo produtos movimentar",
  },
  {
    nome: "Agenda e revisões",
    rota: "/produtividade",
    recurso: "work_orders",
    termos: "agendar horário compromisso",
  },
  {
    nome: "Mapa da oficina",
    rota: "/",
    recurso: "production_board",
    termos: "avançar etapas andamento",
  },
];
export function filtrarAtalhos(
  busca: string,
  permite: (recurso: string) => boolean,
  gerente: boolean,
) {
  const termos = normalizarAtalho(busca).split(/\s+/).filter(Boolean);
  return atalhosOficina.filter(
    (a) =>
      permite(a.recurso) &&
      (!a.gerencia || gerente) &&
      (a.rota !== "/relatorios?aba=financeiro" || permite("finance")) &&
      termos.every((t) =>
        normalizarAtalho(a.nome + " " + (a.termos || "")).includes(t),
      ),
  );
}
