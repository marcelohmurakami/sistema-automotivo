import type { OrdemServico } from "../services/ordensServico";

// Demonstrações antigas podem ter sido salvas antes das coleções de histórico e paradas.
export function normalizarColecoesOSDemo(o: OrdemServico): OrdemServico {
  return {
    ...o,
    itens: o.itens ?? [],
    historico: o.historico ?? [],
    paradas: o.paradas ?? [],
  };
}

export function lerOrdensDemo(): OrdemServico[] {
  const ordens: OrdemServico[] = JSON.parse(
    localStorage.getItem("patio_os_v1") || "[]",
  );
  return ordens.map(normalizarColecoesOSDemo);
}
