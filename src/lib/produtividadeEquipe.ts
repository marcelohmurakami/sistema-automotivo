import type {
  ParticipacaoEquipe,
  FonteEquipe,
  LinhaDP,
  ExportacaoDP,
  AtribuicaoEquipe,
} from "../services/produtividadeEquipe";
/** Descarta somente vínculos cujas fontes foram canceladas ou substituídas. */
export function prepararAtribuicao(
  dados: AtribuicaoEquipe,
  fontes: FonteEquipe[],
): AtribuicaoEquipe {
  const atuais = new Set(fontes.map((f) => f.chave));
  return {
    ...dados,
    fontes: Object.fromEntries(
      Object.entries(dados.fontes).filter(([chave]) => atuais.has(chave)),
    ),
  };
}
/** Distribui pontos-base, preservando exatamente 100%, com desempate estável. */
export function dividirPercentual(
  pesos: { id: string; peso: number }[],
): Record<string, number> {
  const total = pesos.reduce((s, x) => s + Math.max(0, x.peso), 0);
  if (!total)
    throw Error(
      "Não há horas atribuídas aos participantes. Registre ou vincule as horas primeiro.",
    );
  const itens = pesos.map((x) => ({
    id: x.id,
    exato: (Math.max(0, x.peso) * 10000) / total,
    valor: Math.floor((Math.max(0, x.peso) * 10000) / total),
  }));
  let sobra = 10000 - itens.reduce((s, x) => s + x.valor, 0);
  for (const x of [...itens].sort(
    (a, b) => b.exato - b.valor - (a.exato - a.valor) || a.id.localeCompare(b.id),
  ))
    if (sobra-- > 0) x.valor++;
  return Object.fromEntries(itens.map((x) => [x.id, x.valor]));
}
export function distribuirExecucao(
  p: ParticipacaoEquipe[],
  criterio: "igual" | "horas",
  fontes: FonteEquipe[],
  destinos: Record<string, string>,
): ParticipacaoEquipe[] {
  const pesos = p.map((x) => ({
    id: x.funcionario_id,
    peso:
      criterio === "igual"
        ? 1
        : fontes.reduce(
            (s, f) =>
              s +
              ((destinos[f.chave] ?? f.funcionario_id) === x.funcionario_id
                ? Number(f.minutos) || 0
                : 0),
            0,
          ),
  }));
  const valores = dividirPercentual(pesos);
  return p.map((x) => ({ ...x, execucao_bp: valores[x.funcionario_id] }));
}
const formatoHoje = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
});
const formatoData = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
});
const formatoHorario = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});
const formatarDataEquipe = (data: Date, formato: Intl.DateTimeFormat) =>
  Number.isFinite(data.getTime()) ? formato.format(data) : data.toString();
export const hojeEquipe = () => formatoHoje.format(new Date());
export function mesEquipe() {
  const hoje = hojeEquipe(),
    [a, m] = hoje.split("-").map(Number);
  return {
    inicio: hoje.slice(0, 7) + "-01",
    fim: new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10),
  };
}
export const dataEquipe = (s: string) =>
  s
    ? formatarDataEquipe(new Date(s.length === 10 ? s + "T12:00:00" : s), formatoData)
    : "Sem data";
export const horarioEquipe = (s: string) =>
  formatarDataEquipe(new Date(s), formatoHorario);
const celula = (v: unknown) => {
  let s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[\s]*[-=+@]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
};
/** CSV neutro; todas as seções e a versão permanecem no JSON para integração. */
export function csvDepartamentoPessoal(ex: ExportacaoDP): string {
  const secoes = [
    "funcionarios",
    "lancamentos",
    "ocorrencias",
    "horas_produtivas",
    "comissoes",
  ] as const;
  const linhas: string[] = [
    ["Pátio · preparação para o contador", ex.dados.versao, ex.inicio, ex.fim]
      .map(celula)
      .join(";"),
    ["Exportação", ex.id, "SHA-256", ex.hash].map(celula).join(";"),
    celula(ex.dados.finalidade),
  ];
  for (const secao of secoes) {
    const registros: LinhaDP[] = ex.dados[secao] ?? [];
    linhas.push("", celula(secao));
    if (!registros.length) {
      linhas.push(celula("Sem registros"));
      continue;
    }
    const colunas = [...new Set(registros.flatMap((x) => Object.keys(x)))];
    linhas.push(colunas.map(celula).join(";"));
    for (const r of registros) linhas.push(colunas.map((k) => celula(r[k])).join(";"));
  }
  linhas.push("", celula("Conferência necessária"), ...ex.dados.pendencias.map(celula));
  return "\ufeff" + linhas.join("\r\n");
}
export function baixarEquipe(nome: string, conteudo: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
