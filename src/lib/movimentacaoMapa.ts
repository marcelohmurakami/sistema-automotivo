export type DirecaoMapa = "voltar" | "avancar";

const fluxo = ["open", "in_progress", "quality_check", "ready", "delivered"];

export function destinoNoMapa(situacao: string, direcao: DirecaoMapa) {
  const posicao = fluxo.indexOf(situacao);
  if (posicao < 0 || situacao === "delivered") return null;
  return fluxo[posicao + (direcao === "avancar" ? 1 : -1)] ?? null;
}
