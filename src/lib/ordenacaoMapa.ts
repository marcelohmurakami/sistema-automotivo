import { etapasMapa, type VeiculoMapa } from "./mapaOficina.ts";

export const opcoesOrdenacaoMapa = [
  { valor: "entrega", rotulo: "Entrega mais próxima" },
  { valor: "antigos", rotulo: "Mais antigos na oficina" },
  { valor: "recentes", rotulo: "Mais recentes na oficina" },
  { valor: "cliente", rotulo: "Cliente (A–Z)" },
] as const;
export type OrdenacaoMapa = (typeof opcoesOrdenacaoMapa)[number]["valor"];
export type PreferenciasOrdenacaoMapa = Record<string, OrdenacaoMapa>;
const nomes = new Intl.Collator("pt-BR", {
  sensitivity: "base",
  numeric: true,
});

function compararDatas(a: number | null, b: number | null, decrescente = false) {
  // Sem data fica por último nas duas direções, sem usar criação da OS como entrada.
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return decrescente ? b - a : a - b;
}

export function ordenarVeiculosMapa(veiculos: VeiculoMapa[], ordem: OrdenacaoMapa) {
  return [...veiculos].sort((a, b) => {
    const comparacao =
      ordem === "cliente"
        ? nomes.compare(a.cliente, b.cliente)
        : ordem === "entrega"
          ? compararDatas(a.prazoEntrega.instante, b.prazoEntrega.instante)
          : compararDatas(a.entradaInstante, b.entradaInstante, ordem === "recentes");
    return comparacao || a.id - b.id || a.osId.localeCompare(b.osId);
  });
}

export function lerOrdenacoesMapa(
  chave: string,
  storage?: Pick<Storage, "getItem">,
): PreferenciasOrdenacaoMapa {
  try {
    const dados: unknown = JSON.parse((storage ?? localStorage).getItem(chave) || "{}");
    if (!dados || typeof dados !== "object" || Array.isArray(dados)) return {};
    const secoes = [...etapasMapa.map((e) => e.id), "lista"];
    return Object.fromEntries(
      Object.entries(dados).filter(
        ([secao, valor]) =>
          secoes.includes(secao) && opcoesOrdenacaoMapa.some((o) => o.valor === valor),
      ),
    );
  } catch {
    return {};
  }
}

export function salvarOrdenacoesMapa(
  chave: string,
  preferencias: PreferenciasOrdenacaoMapa,
  storage?: Pick<Storage, "setItem">,
) {
  try {
    (storage ?? localStorage).setItem(chave, JSON.stringify(preferencias));
  } catch {
    /* A ordenação continua funcionando quando o navegador bloqueia armazenamento. */
  }
}
