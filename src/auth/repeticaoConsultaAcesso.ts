/** Só consultas de acesso; nunca repetir uma gravação nem uma recusa de permissão. */
export function repetirConsultaAcesso(tentativas: number, erro: unknown): boolean {
  if (tentativas >= 2 || !erro || typeof erro !== "object") return false;
  const e = erro as { code?: string; status?: number; name?: string; message?: string };
  if (
    ["42501", "PT403", "PGRST301", "PGRST302", "PGRST303"].includes(e.code || "") ||
    e.status === 401 ||
    e.status === 403
  )
    return false;
  return (
    e.status === 429 ||
    (!!e.status && e.status >= 500 && e.status <= 599) ||
    ["PGRST000", "PGRST001", "PGRST002", "PGRST003", "57014"].includes(e.code || "") ||
    ["AbortError", "TimeoutError", "AuthRetryableFetchError"].includes(e.name || "") ||
    // PostgREST serializa erros de fetch em message e não preserva name.
    /^(?:TimeoutError|AbortError):/i.test(e.message || "") ||
    /failed to fetch|networkerror|network request failed|fetch failed|signal is aborted/i.test(
      e.message || "",
    )
  );
}
