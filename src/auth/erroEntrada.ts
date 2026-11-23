/** Mensagem pública: uma indisponibilidade não significa senha incorreta. */
export function erroEntrada(erro: unknown): string {
  const e =
    erro && typeof erro === "object"
      ? (erro as { code?: string; status?: number })
      : {};
  if (e.code === "invalid_credentials")
    return "Não foi possível entrar. Confira seu e-mail e senha.";
  if (e.status === 429 || e.code === "over_request_rate_limit")
    return "Muitas tentativas de acesso. Aguarde um pouco e tente novamente.";
  if (e.code === "email_not_confirmed")
    return "Confirme seu e-mail pelo link recebido antes de entrar.";
  if (e.status && e.status >= 500)
    return "O acesso está temporariamente indisponível. Aguarde um pouco e tente novamente.";
  return "Não foi possível conectar agora. Verifique a conexão e tente novamente.";
}
