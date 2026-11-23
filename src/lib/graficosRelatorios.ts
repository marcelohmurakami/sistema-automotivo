export type AgrupamentoGrafico = "dia" | "semana" | "mes";
export type PontoGrafico = { data: string; valores: number[] };
export type GrupoGrafico = PontoGrafico & { fim: string };

export function agrupamentoInicial(quantidade: number): AgrupamentoGrafico {
  return quantidade > 90 ? "mes" : quantidade > 14 ? "semana" : "dia";
}
// Semanas de segunda a domingo; as bordas respeitam o intervalo consultado.
export function agruparGrafico(
  pontos: PontoGrafico[],
  modo: AgrupamentoGrafico,
): GrupoGrafico[] {
  const grupos = new Map<string, GrupoGrafico>();
  for (const p of [...pontos].sort((a, b) => a.data.localeCompare(b.data))) {
    const data = new Date(p.data + "T12:00:00Z");
    const segunda = new Date(data.getTime() - ((data.getUTCDay() + 6) % 7) * 86400000)
      .toISOString()
      .slice(0, 10);
    const chave =
      modo === "mes" ? p.data.slice(0, 7) : modo === "semana" ? segunda : p.data;
    const g = grupos.get(chave);
    if (g) {
      g.fim = p.data;
      g.valores = g.valores.map((v, i) => v + (p.valores[i] || 0));
    } else grupos.set(chave, { data: p.data, fim: p.data, valores: [...p.valores] });
  }
  return [...grupos.values()];
}
export function escalaGrafico(valores: number[]) {
  const menor = Math.min(0, ...valores),
    maior = Math.max(0, ...valores);
  const bruto = (maior - menor) / 4 || 1;
  const base = 10 ** Math.floor(Math.log10(bruto));
  const passo = Math.max(
    1,
    ([1, 2, 5, 10].find((v) => v * base >= bruto) || 10) * base,
  );
  const min = Math.floor(menor / passo) * passo;
  const max = Math.max(min + passo, Math.ceil(maior / passo) * passo);
  const marcas = Array.from(
    { length: Math.round((max - min) / passo) + 1 },
    (_, i) => min + i * passo,
  );
  return { min, max, marcas };
}
export function indicesRotulos(quantidade: number, largura: number, minimo = 92) {
  if (!quantidade) return [];
  if (quantidade === 1) return [0];
  const limite = Math.max(2, Math.floor(largura / minimo));
  const passo = Math.max(1, Math.ceil((quantidade - 1) / (limite - 1)));
  const indices: number[] = [];
  for (let i = 0; i < quantidade; i += passo) indices.push(i);
  if (indices.at(-1) !== quantidade - 1) {
    if (
      indices.length > 1 &&
      (quantidade - 1 - indices[indices.length - 1]) * (largura / quantidade) < minimo
    )
      indices.pop();
    indices.push(quantidade - 1);
  }
  return indices;
}
const curta = (s: string) => s.slice(8, 10) + "/" + s.slice(5, 7);
export function rotuloGrupo(
  g: GrupoGrafico,
  modo: AgrupamentoGrafico,
  completo = false,
) {
  if (modo === "mes")
    return new Date(g.data + "T12:00:00Z")
      .toLocaleDateString("pt-BR", {
        timeZone: "UTC",
        month: completo ? "long" : "short",
        year: "numeric",
      })
      .replace(" de ", " ");
  if (g.data === g.fim)
    return completo ? g.data.split("-").reverse().join("/") : curta(g.data);
  if (completo)
    return `${g.data.split("-").reverse().join("/")} a ${g.fim.split("-").reverse().join("/")}`;
  return `${curta(g.data)} a ${curta(g.fim)}`;
}
