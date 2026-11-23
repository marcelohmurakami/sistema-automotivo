/** Mantém a identidade da sessão; só REST/Auth passam pelo proxy do próprio site. */
export function criarTransporteSupabase(
  origemSupabase: string,
  caminhoProxy: string | undefined,
  fetchOriginal: typeof fetch = globalThis.fetch.bind(globalThis),
): typeof fetch {
  const origem = new URL(origemSupabase).origin;
  return (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (
      !caminhoProxy ||
      url.origin !== origem ||
      !/^\/(rest|auth)\/v1\//.test(url.pathname)
    )
      return fetchOriginal(input, init);

    const destino = caminhoProxy + url.pathname + url.search;
    // Request preserva corpo, método, cabeçalhos e cancelamento do chamador.
    // Nunca repetir uma gravação nem enviar cookies do site ao serviço externo.
    const request =
      input instanceof Request
        ? new Request(new URL(destino, globalThis.location.origin), input)
        : destino;
    return fetchOriginal(request, { ...init, credentials: "omit", cache: "no-store" });
  };
}
