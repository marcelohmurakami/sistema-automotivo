export function linkPublico(valor: unknown) {
  try {
    const u = new URL(String(valor || ""));
    return u.protocol === "https:" && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}
export const documentosPublicos = {
  termos: linkPublico(import.meta.env.VITE_TERMOS_URL),
  privacidade: linkPublico(import.meta.env.VITE_PRIVACIDADE_URL),
  suporte: linkPublico(import.meta.env.VITE_SUPORTE_URL),
};
export const versaoTermos = String(import.meta.env.VITE_TERMOS_VERSAO || "");
