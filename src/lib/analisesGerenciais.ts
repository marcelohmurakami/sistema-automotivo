import type { TipoAnalise } from "../services/analisesGerenciais";
export function termosAnalise(ramo = "automotivo") {
  return ramo === "automotivo"
    ? {
        ativo: "Veículo, motor ou peça",
        historico: "Histórico por veículo, motor ou peça",
        recurso: "Box ou equipamento",
        ocupacao: "Veja a disponibilidade de cada profissional, box e equipamento.",
      }
    : ramo === "limpeza"
      ? {
          ativo: "Local de atendimento",
          historico: "Histórico por local de atendimento",
          recurso: "Posto ou equipamento",
          ocupacao: "Veja a disponibilidade das equipes, postos e equipamentos.",
        }
      : {
          ativo: ramo === "manutencao_campo" ? "Local ou equipamento" : "Equipamento",
          historico:
            ramo === "manutencao_campo"
              ? "Histórico por local ou equipamento"
              : "Histórico por equipamento",
          recurso: "Posto ou equipamento",
          ocupacao: "Veja a disponibilidade dos técnicos, postos e equipamentos.",
        };
}
export const analises: Record<
  TipoAnalise,
  {
    nome: string;
    descricao: string;
    colunas: string[];
    resumo: string[];
    grafico?: string;
    financeiro: boolean;
  }
> = {
  clientes: {
    nome: "Clientes por margem",
    descricao: "Quem gera resultado e quanto dos custos já foi conferido.",
    colunas: [
      "receita",
      "custo",
      "margem",
      "cobertura",
      "servicos",
      "conferidos",
      "indiretos",
      "criterio",
    ],
    resumo: ["receita", "margem", "conferidos", "receita_pendente"],
    grafico: "margem",
    financeiro: true,
  },
  dados: {
    nome: "Qualidade dos dados financeiros",
    descricao: "Encontre custos faltantes e conferências que precisam ser refeitas.",
    colunas: ["situacao", "pendencias", "receita", "custo", "margem", "criterio"],
    resumo: ["servicos", "conferidos", "fontes_pendentes", "receita_pendente"],
    financeiro: true,
  },
  tempos: {
    nome: "Trabalho e espera",
    descricao: "Separe trabalho registrado, pausas e tempo ainda sem explicação.",
    colunas: [
      "trabalho",
      "espera",
      "sem_registro",
      "sobreposicao",
      "horas_pessoa",
      "abertos",
    ],
    resumo: ["trabalho", "espera", "sem_registro", "abertos"],
    financeiro: false,
  },
  recursos: {
    nome: "Ocupação por recurso",
    descricao: "Veja a disponibilidade de cada técnico, box e equipamento.",
    colunas: [
      "ocupacao",
      "reservadas",
      "livres",
      "capacidade",
      "bloqueadas",
      "fora_jornada",
      "sem_fim",
      "tipo",
      "cobertura",
    ],
    resumo: ["fora_jornada", "sem_fim"],
    grafico: "ocupacao",
    financeiro: false,
  },
  contratos: {
    nome: "Resultado por contrato",
    descricao: "Faturas, serviços cobertos e despesas reunidos no mesmo contrato.",
    colunas: [
      "receita",
      "custo",
      "margem",
      "situacao",
      "servicos",
      "visitas",
      "materiais",
      "despesas",
      "materiais_declarados",
      "pendentes",
      "vinculos_revisar",
    ],
    resumo: ["receita", "custo", "margem", "pendentes"],
    grafico: "margem",
    financeiro: true,
  },
  primeira_visita: {
    nome: "Resolução na primeira visita",
    descricao: "Problemas resolvidos sem uma nova visita nos 30 dias seguintes.",
    colunas: ["situacao", "primeira", "retornos"],
    resumo: ["avaliaveis", "resolvidos", "observacao", "visitas_sem_vinculo"],
    financeiro: false,
  },
  equipamentos: {
    nome: "Histórico por equipamento ou veículo",
    descricao: "Consulte o custo acumulado de cada ativo até a data final escolhida.",
    colunas: ["custo", "servicos", "pendentes", "receita", "problemas"],
    resumo: ["custo", "servicos", "pendentes"],
    grafico: "custo",
    financeiro: true,
  },
  comparacao: {
    nome: "Reparar ou substituir",
    descricao: "Compare os custos futuros de manter o ativo ou trocá-lo.",
    colunas: [
      "situacao",
      "reparo",
      "substituicao",
      "diferenca",
      "meses",
      "custo",
      "problemas",
      "pendentes",
    ],
    resumo: [],
    financeiro: true,
  },
  filiais: {
    nome: "Resultado por unidade",
    descricao: "Compare unidades autorizadas e elimine operações internas vinculadas.",
    colunas: ["receita", "resultado", "situacao", "pendentes", "sem_mapeamento"],
    resumo: ["receita", "resultado", "eliminado", "vinculos_invalidos"],
    grafico: "resultado",
    financeiro: true,
  },
};
export const rotulosAnalise: Record<string, string> = {
  receita: "Receita",
  custo: "Custos conhecidos",
  margem: "Margem estimada",
  cobertura: "Cobertura da conferência",
  servicos: "Serviços",
  conferidos: "Serviços conferidos",
  indiretos: "Indiretos apropriados",
  criterio: "Critério de rateio",
  situacao: "Conferência / resultado",
  pendencias: "Fontes pendentes",
  fontes_pendentes: "Fontes pendentes",
  receita_pendente: "Receita com custo a conferir",
  trabalho: "Trabalho registrado",
  espera: "Espera registrada",
  sem_registro: "Tempo sem registro",
  sobreposicao: "Sobreposição a conferir",
  horas_pessoa: "Horas-pessoa",
  abertos: "Apontamentos abertos",
  capacidade: "Horas disponíveis",
  ocupacao: "Capacidade ocupada",
  reservadas: "Horas reservadas",
  livres: "Horas livres",
  bloqueadas: "Horas indisponíveis",
  fora_jornada: "Reservas fora da disponibilidade",
  sem_fim: "Reservas sem término",
  tipo: "Tipo de recurso",
  visitas: "Visitas consumidas",
  materiais: "Materiais nas OS",
  despesas: "Despesas diretas",
  materiais_declarados: "Materiais declarados na franquia",
  pendentes: "Serviços a conferir",
  avaliaveis: "Problemas avaliáveis",
  resolvidos: "Resolvidos na primeira",
  observacao: "Em observação",
  visitas_sem_vinculo: "Visitas sem vínculo",
  primeira: "Primeira visita",
  retornos: "Visitas adicionais em 30 dias",
  problemas: "Problemas acompanhados",
  reparo: "Custo futuro: reparar",
  substituicao: "Custo futuro: substituir",
  diferenca: "Substituir menos reparar",
  meses: "Horizonte (meses)",
  resultado: "Resultado líquido estimado",
  sem_mapeamento: "Lançamentos sem conta contábil",
  eliminado: "Receita/despesa interna eliminada",
  vinculos_invalidos: "Operações internas a revisar",
  vinculos_revisar: "Despesas vinculadas a revisar",
};
const moedas = new Set([
  "receita",
  "custo",
  "margem",
  "indiretos",
  "receita_pendente",
  "materiais",
  "despesas",
  "materiais_declarados",
  "reparo",
  "substituicao",
  "diferenca",
  "resultado",
  "eliminado",
]);
const minutos = new Set(["trabalho", "espera", "sem_registro", "sobreposicao"]);
const horas = new Set([
  "horas_pessoa",
  "capacidade",
  "reservadas",
  "livres",
  "bloqueadas",
  "fora_jornada",
]);
const numeroAnalise = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const moedaAnalise = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
export function formatarAnalise(chave: string, valor: unknown): string {
  if (valor === undefined || valor === null) return "Não informado";
  if (chave === "primeira")
    return new Date(String(valor)).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      dateStyle: "short",
      timeStyle: "short",
    });
  if (chave === "criterio")
    return String(valor)
      .replaceAll("nenhum", "Sem rateio")
      .replaceAll("receita", "Receita do mês")
      .replaceAll("horas", "Horas trabalhadas");
  if (typeof valor === "number") {
    if (moedas.has(chave)) return moedaAnalise.format(valor / 100);
    if (chave === "cobertura" || chave === "ocupacao")
      return numeroAnalise.format(valor) + "%";
    if (minutos.has(chave) || horas.has(chave))
      return numeroAnalise.format(minutos.has(chave) ? valor / 60 : valor) + " h";
    return numeroAnalise.format(valor);
  }
  return String(valor);
}
export function taxaPrimeiraVisita(resumo: Record<string, number>): number | null {
  return resumo.avaliaveis > 0 ? (100 * resumo.resolvidos) / resumo.avaliaveis : null;
}
