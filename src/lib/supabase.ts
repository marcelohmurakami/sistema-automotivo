import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL;
const chave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url && chave ? createClient(url, chave) : null;
export function erroPublico(erro: unknown): string {
  if (erro && typeof erro === "object" && "code" in erro) {
    const e = erro as { code: string; message: string };
    if (["PT409", "40001", "22023", "P0002", "23514"].includes(e.code)) return e.message;
    if (e.code === "23505")
      return "Já existe um registro com esses dados. Confira se o veículo já está em atendimento.";
    if (e.code === "42501")
      return "Acesso indisponível. Verifique seu perfil e a assinatura da oficina.";
    if (e.code === "PGRST202")
      return "O banco precisa receber a atualização deste módulo.";
  }
  return erro instanceof Error
    ? erro.message
    : "Não foi possível concluir. Verifique a conexão e tente novamente.";
}
