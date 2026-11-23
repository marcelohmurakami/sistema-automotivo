import { supabase, erroPublico } from "../lib/supabase";
export function erroEquipe(erro: unknown): string {
  if (
    erro &&
    typeof erro === "object" &&
    "code" in erro &&
    erro.code === "42501" &&
    "message" in erro &&
    typeof erro.message === "string"
  )
    return erro.message;
  return erroPublico(erro);
}
export type PerfilEquipe = "owner" | "manager" | "staff";
export const perfisEquipe = {
  owner: "Proprietário",
  manager: "Gerente",
  staff: "Funcionário",
};
export type MembroEquipe = {
  usuario_id: string;
  email: string;
  perfil: PerfilEquipe;
  ativo: boolean;
  revisao: number;
};
export type ConviteEquipe = {
  id: string;
  email: string;
  perfil: "manager" | "staff";
  expira_em: string;
  situacao: "pendente" | "aceito" | "revogado" | "expirado";
};
export type EquipeDados = {
  membros: MembroEquipe[];
  convites: ConviteEquipe[];
};
export async function equipeRpc<T>(
  nome: string,
  parametros: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  if (!supabase) throw new Error("Conexão indisponível.");
  const consulta = supabase.rpc(nome, parametros);
  const { data, error } = await (signal ? consulta.abortSignal(signal) : consulta);
  if (error) throw error;
  return data as T;
}
export async function gerarConvite(oficina: string, email: string, perfil: string) {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
  await equipeRpc("criar_convite_equipe", {
    p_oficina: oficina,
    p_email: email,
    p_perfil: perfil,
    p_hash_token: hash,
  });
  return `${window.location.origin}/convite#${token}`;
}
export const equipeDemo: EquipeDados = {
  membros: [
    {
      usuario_id: "demo-owner",
      email: "marcelo@exemplo.com",
      perfil: "owner",
      ativo: true,
      revisao: 1,
    },
    {
      usuario_id: "demo-staff",
      email: "mecanico@exemplo.com",
      perfil: "staff",
      ativo: true,
      revisao: 1,
    },
  ],
  convites: [],
};
