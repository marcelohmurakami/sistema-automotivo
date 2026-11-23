import { normalizarAtalho } from "./atalhosOficina.ts";

type OpcaoPesquisavel = { nome: string; detalhe?: string; busca?: string };

/** A página atual prevalece sobre a cópia recuperada para manter uma seleção. */
export function unirOpcoesPorId<T extends { id: string }>(
  pagina: readonly T[] = [],
  selecionadas: readonly T[] = [],
): T[] {
  const ids = new Set<string>();
  return [...pagina, ...selecionadas].filter((item) => {
    if (ids.has(item.id)) return false;
    ids.add(item.id);
    return true;
  });
}

/** Preserva a ordem do catálogo e para assim que a lista visível estiver completa. */
export function buscarOpcoesRapidas<T extends OpcaoPesquisavel>(
  opcoes: readonly T[],
  busca: string,
  remota = false,
): T[] {
  if (remota || !busca.trim()) return opcoes.slice(0, 30);
  const termos = normalizarAtalho(busca)
    .split(/\s+/)
    .filter(Boolean)
    .map((termo) => termo.replace(/[^a-z0-9]/g, ""));
  const resultado: T[] = [];
  for (const opcao of opcoes) {
    const texto = normalizarAtalho(
      `${opcao.nome} ${opcao.detalhe || ""} ${opcao.busca || ""}`,
    ).replace(/[^a-z0-9]/g, "");
    if (termos.every((termo) => texto.includes(termo))) {
      resultado.push(opcao);
      if (resultado.length === 30) break;
    }
  }
  return resultado;
}
