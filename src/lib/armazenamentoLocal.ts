/** Preferências inválidas ou indisponíveis não devem impedir a abertura do app. */
export function lerObjetoLocal(chave: string): Record<string, unknown> {
  try {
    const valor: unknown = JSON.parse(localStorage.getItem(chave) ?? "{}");
    return valor && typeof valor === "object" && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function nomeOficinaDemo() {
  const nome = lerObjetoLocal("patio_configuracoes_demo").nome;
  return typeof nome === "string" && nome.trim() ? nome : "Oficina do Marcelo";
}
