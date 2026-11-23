import { termosBuscaCompras } from "./navegacaoCompras.ts";

export const gruposAssistencia = [
  "Dia a dia",
  "Cadastros e compras",
  "Gestão e qualidade",
  "Minha assistência",
] as const;
export const navegacaoAssistencia = [
  {
    rota: "/laudos",
    nome: "Laudos técnicos",
    recurso: "work_orders",
    grupo: 2,
    icone: "ordens",
  },
  {
    rota: "/contratos",
    nome: "Contratos preventivos",
    recurso: "finance",
    grupo: 2,
    icone: "financeiro",
    gerencia: true,
  },
  {
    rota: "/execucao-offline",
    nome: "Trabalhar sem internet",
    recurso: "work_orders",
    grupo: 0,
    icone: "ordens",
  },
  {
    rota: "/localizacao",
    nome: "Localização e etiquetas",
    recurso: "work_orders",
    grupo: 1,
    icone: "localizacao",
  },
  {
    rota: "/",
    nome: "Painel da assistência",
    recurso: "customers",
    grupo: 0,
    icone: "painel",
  },
  {
    rota: "/orcamentos",
    nome: "Orçamentos",
    recurso: "work_orders",
    grupo: 0,
    icone: "ordens",
  },
  {
    rota: "/atendimentos",
    nome: "Ordens de reparo",
    recurso: "work_orders",
    grupo: 0,
    icone: "ordens",
  },
  {
    rota: "/agenda",
    nome: "Agenda",
    recurso: "work_orders",
    grupo: 0,
    icone: "agenda",
  },
  {
    rota: "/clientes",
    nome: "Clientes",
    recurso: "customers",
    grupo: 0,
    icone: "clientes",
  },
  {
    rota: "/objetos",
    nome: "Equipamentos",
    recurso: "customers",
    grupo: 0,
    icone: "equipamentos",
  },
  {
    rota: "/estoque",
    nome: "Peças e estoque",
    recurso: "inventory",
    grupo: 0,
    icone: "estoque",
  },
  {
    rota: "/financeiro",
    nome: "Financeiro",
    recurso: "finance",
    grupo: 0,
    icone: "financeiro",
    gerencia: true,
  },
  {
    rota: "/catalogo",
    nome: "Serviços e preços",
    recurso: "catalog",
    grupo: 1,
    icone: "servicos",
  },
  {
    rota: "/funcionarios",
    nome: "Funcionários",
    recurso: "customers",
    grupo: 1,
    icone: "clientes",
    gerencia: true,
  },
  {
    rota: "/fornecedores",
    nome: "Fornecedores",
    recurso: "inventory",
    grupo: 1,
    icone: "fornecedores",
  },
  {
    rota: "/compras",
    nome: "Compras",
    recurso: "finance",
    grupo: 1,
    icone: "compras",
    gerencia: true,
  },
  {
    rota: "/relatorios",
    nome: "Relatórios",
    recurso: "reports",
    grupo: 2,
    icone: "relatorios",
    gerencia: true,
  },
  {
    rota: "/garantias",
    nome: "Qualidade e garantia",
    recurso: "work_orders",
    grupo: 2,
    icone: "garantias",
    gerencia: true,
  },
  {
    rota: "/historico",
    nome: "Histórico",
    recurso: "reports",
    grupo: 2,
    icone: "historico",
    gerencia: true,
  },
  {
    rota: "/meu-site",
    nome: "Site e área do cliente",
    recurso: "website",
    grupo: 2,
    icone: "site",
    gerencia: true,
  },
  {
    rota: "/equipe",
    nome: "Equipe e acesso",
    recurso: "customers",
    grupo: 3,
    icone: "acesso",
    dono: true,
  },
  {
    rota: "/planos",
    nome: "Meu plano",
    recurso: "customers",
    grupo: 3,
    icone: "garantias",
  },
  {
    rota: "/configuracoes",
    nome: "Configurações",
    recurso: "customers",
    grupo: 3,
    icone: "configuracoes",
  },
] as const;
export function menuAssistencia(
  permite: (recurso: string) => boolean,
  perfil?: string,
  busca = "",
  manutencao = false,
  limpeza = false,
) {
  const normalizar = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  return navegacaoServicos(manutencao, limpeza).filter(
    (item) =>
      permite(item.recurso) &&
      (!["/compras"].includes(item.rota) || permite("inventory")) &&
      (!("gerencia" in item) || perfil !== "staff") &&
      (!("dono" in item) || perfil === "owner") &&
      normalizar(termosBuscaCompras(item)).includes(normalizar(busca)),
  );
}

export function navegacaoServicos(manutencao = false, limpeza = false) {
  const nomes: Record<string, string> = limpeza
    ? {
        "/": "Painel da limpeza",
        "/atendimentos": "Atendimentos",
        "/objetos": "Locais de atendimento",
        "/estoque": "Produtos e estoque",
        "/compras": "Compras",
      }
    : {
        "/": "Painel de manutenção",
        "/atendimentos": "Ordens de serviço",
        "/objetos": "Locais e equipamentos",
        "/estoque": "Materiais e estoque",
        "/compras": "Compras",
      };
  return navegacaoAssistencia.map((n) => ({
    ...n,
    nome: manutencao || limpeza ? nomes[n.rota] || n.nome : n.nome,
  }));
}
