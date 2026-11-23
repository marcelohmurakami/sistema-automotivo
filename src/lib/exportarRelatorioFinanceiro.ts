import { categorias, contas, formas } from "../services/financeiro";
import {
  custoTotal,
  resultadoFinanceiro,
  nomesFaixas,
  nomesAtrasos,
  type RelatorioFinanceiro as Dados,
} from "./relatorioFinanceiro";
const dia = (s: string) => s.split("-").reverse().join("/");
export const nomeCategoria = (c: string) =>
  ({
    pecas_estoque: "Peças consumidas do estoque",
    taxas: "Taxas de recebimento",
  })[c] ??
  categorias[c] ??
  c;
export function linhasFinanceirasCSV(
  d: Dados,
  nomesContas: Record<string, string> = contas,
): unknown[][] {
  const moeda = (v: number) => (v / 100).toFixed(2).replace(".", ",");
  const linhas: unknown[][] = [];
  for (const c of d.categorias)
    linhas.push([
      "Resultado por categoria (R$)",
      nomeCategoria(c.categoria),
      moeda(c.valor),
      c.natureza,
    ]);
  for (const c of d.caixa_categorias)
    linhas.push([
      "Caixa por categoria (R$)",
      nomeCategoria(c.categoria),
      moeda(c.valor),
      c.natureza,
    ]);
  for (const s of d.serie)
    for (const [n, v] of [
      ["Receitas", s.receitas],
      ["Custos e despesas", s.custos],
      ["Resultado", s.receitas - s.custos],
      ["Entradas líquidas", s.entradas],
      ["Saídas", s.saidas],
      ["Movimento líquido", s.entradas - s.saidas],
    ] as const)
      linhas.push(["Evolução diária (R$)", n, moeda(v), dia(s.data)]);
  for (const [n, v] of [
    ["Receitas", d.anterior.receitas],
    ["Custos e despesas", custoTotal(d.anterior)],
    ["Resultado", resultadoFinanceiro(d.anterior)],
    ["Entradas líquidas", d.anterior.entradas],
    ["Saídas", d.anterior.saidas],
  ] as const)
    linhas.push([
      "Período anterior (R$)",
      n,
      moeda(v),
      dia(d.inicio_anterior) + " a " + dia(d.fim_anterior),
    ]);
  for (const f of d.formas)
    for (const [n, v] of [
      ["Bruto", f.bruto],
      ["Taxas", f.taxas],
      ["Líquido", f.liquido],
    ] as const)
      linhas.push([
        "Forma de recebimento (R$)",
        formas[f.forma] + " · " + n,
        moeda(v),
        "Período selecionado",
      ]);
  for (const [tipo, lista, nomes] of [
    ["Vencimentos", d.vencimentos, nomesFaixas],
    ["Atrasos", d.atrasos, nomesAtrasos],
  ] as const)
    for (const f of lista)
      for (const n of ["receber", "pagar"] as const)
        linhas.push([
          tipo + " atuais (R$)",
          nomes[f.faixa] + " · A " + n,
          moeda(f[n]),
          dia(d.data_referencia),
        ]);
  for (const c of d.contas)
    linhas.push([
      "Saldo atual (R$)",
      nomesContas[c.conta] ?? c.conta,
      moeda(c.saldo),
      dia(d.data_referencia),
    ]);
  linhas.push(
    [
      "Caixa (R$)",
      "Saldo antes do período",
      moeda(d.saldo_inicial),
      "Período selecionado",
    ],
    [
      "Caixa (R$)",
      "Saldo no fim do período",
      moeda(d.saldo_final),
      "Período selecionado",
    ],
    [
      "Estimativa (R$)",
      "Saldo projetado em 30 dias",
      moeda(
        d.contas.reduce((s, c) => s + c.saldo, 0) +
          d.vencimentos
            .filter((f) => f.faixa <= 4)
            .reduce((s, f) => s + f.receber - f.pagar, 0),
      ),
      "Contas cadastradas; inclui vencidos; referência " + dia(d.data_referencia),
    ],
    [
      "Conferência",
      "Contas variáveis sem confirmação",
      d.variaveis_pendentes,
      dia(d.data_referencia),
    ],
  );
  for (const p of d.pendencias)
    linhas.push([
      "Pendências prioritárias (R$)",
      p.descricao + " · " + p.pessoa,
      moeda(p.aberto_centavos),
      "A " + p.natureza + " · " + dia(p.vencimento),
    ]);
  return linhas;
}
