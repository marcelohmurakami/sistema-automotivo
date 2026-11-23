import { createClient } from "@supabase/supabase-js";
import { criarTransporteSupabase } from "./transporteSupabase";
const url = import.meta.env.VITE_SUPABASE_URL;
const chave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const criarConexao = () =>
  url && chave
    ? createClient(url, chave, {
        global: {
          fetch: criarTransporteSupabase(url, import.meta.env.VITE_SUPABASE_PROXY_PATH),
        },
      })
    : null;
// O hot reload deve reutilizar o cliente para não disputar a renovação da sessão.
export const supabase: ReturnType<typeof criarConexao> =
  import.meta.hot?.data.supabase ?? criarConexao();
if (import.meta.hot) import.meta.hot.data.supabase = supabase;
export function erroPublico(erro: unknown): string {
  if (erro && typeof erro === "object" && "code" in erro) {
    const e = erro as { code: string; message: string };
    if (
      ["PT403", "PT409", "40001", "22023", "P0002", "23514", "23P01"].includes(e.code)
    )
      return e.message;
    if (e.code === "23505" && e.message?.includes("work_orders_vehicle_in_shop_idx"))
      return "Este veículo já possui uma OS em andamento. Continue na OS existente ou selecione outro veículo.";
    if (e.code === "23505")
      return "Já existe um registro com esses dados. Confira o cadastro ou atendimento existente.";
    if (e.code === "42501")
      return "Acesso indisponível. Verifique seu perfil e a assinatura da empresa.";
    if (e.code === "PGRST202")
      return "O banco precisa receber a atualização deste módulo.";
  }
  return erro instanceof Error
    ? erro.message
    : "Não foi possível concluir. Verifique a conexão e tente novamente.";
}
