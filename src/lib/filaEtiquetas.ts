import type { ItemFisico } from "./localizacaoFisica";

/** A fila é só uma conferência. A movimentação continua atômica no servidor. */
export function incluirEtiqueta(fila: ItemFisico[], item: ItemFisico) {
  if (fila.some((i) => i.id === item.id)) return fila;
  if (item.situacao === "entregue")
    throw new Error(
      "Este item já foi entregue. Registre o retorno na ficha antes de movê-lo.",
    );
  if (fila.length >= 50)
    throw new Error("Limite de 50 itens. Confirme este lote antes de continuar.");
  return [...fila, item];
}

export function assinaturaMovimento(itens: ItemFisico[], local: string) {
  return JSON.stringify([
    local,
    itens
      .map(({ id, revisao }) => [id, revisao])
      .sort(([a], [b]) => String(a).localeCompare(String(b))),
  ]);
}
