// Só antecipamos a seleção quando não há decisão a ser tomada pelo atendente.
export function veiculoUnicoDoCliente(
  cliente: string,
  veiculos: { id: string }[],
  vinculos: { cliente_id: string; veiculo_id: string }[],
) {
  if (!cliente || cliente === "avulso") return "";
  const disponiveis = new Set(veiculos.map((v) => v.id));
  const ids = new Set(
    vinculos
      .filter((v) => v.cliente_id === cliente && disponiveis.has(v.veiculo_id))
      .map((v) => v.veiculo_id),
  );
  return ids.size === 1 ? [...ids][0] : "";
}
