/** Aceita somente a rota pública de uma oficina, nunca URLs externas. */
export function retornoPortal(search: string): string | null {
  const destino = new URLSearchParams(search).get("retorno");
  return destino && /^\/oficina\/[a-z0-9][a-z0-9-]{2,60}[a-z0-9]$/.test(destino)
    ? destino
    : null;
}

export function parametroRetorno(destino: string | null): string {
  return destino ? `?retorno=${encodeURIComponent(destino)}` : "";
}
