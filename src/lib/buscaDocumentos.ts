/** Aceita números copiados da listagem (#0038), sem alterar nomes ou placas. */
export function normalizarBuscaDocumento(busca: string) {
  const termo = busca.trim();
  return /^#?\s*\d+$/.test(termo)
    ? termo.replace(/^#?\s*/, "").replace(/^0+(?=\d)/, "")
    : termo;
}
