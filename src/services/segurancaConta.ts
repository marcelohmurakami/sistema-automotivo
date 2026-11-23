import { supabase } from "../lib/supabase";
export async function consultarSegundoFator() {
  if (!supabase) throw Error("Conexão indisponível.");
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  return { exigido: data.nextLevel === "aal2" && data.currentLevel !== "aal2" };
}
