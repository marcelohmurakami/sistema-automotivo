export const eventoOSPronta = "patio:os-pronta";
export type AvisoOSPronta = { oficina: string; id: string };
export function notificarOSPronta(oficina: string, id: string) {
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent<AvisoOSPronta>(eventoOSPronta, {
        detail: { oficina, id },
      }),
    );
}
export function telefoneWhatsAppPronta(valor: string | undefined) {
  const n = (valor ?? "").replace(/\D/g, "");
  if (!valor?.trim().startsWith("+") && (n.length === 10 || n.length === 11))
    return "55" + n;
  return n.length >= 12 && n.length <= 15 ? n : "";
}
export function linkWhatsAppPronta(
  telefone: string | undefined,
  nome: string,
  numero: number | string,
) {
  const n = telefoneWhatsAppPronta(telefone);
  if (!n) return null;
  const mensagem = `Olá${nome.trim() ? `, ${nome.trim()}` : ""}! O serviço da sua ordem de serviço #${numero} está pronto para retirada. Entre em contato para combinar a retirada.`;
  return `https://wa.me/${n}?text=${encodeURIComponent(mensagem)}`;
}
