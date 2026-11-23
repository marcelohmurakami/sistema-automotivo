import { supabase } from "./supabase";
import { registrarDiagnostico } from "./diagnosticos";

/** Não repete mutações automaticamente: o chamador mantém a chave de idempotência. */
export async function rpc<T>(
  nome: string,
  dados: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<T> {
  if (!supabase) throw new Error("Conexão indisponível.");
  const { data, error } = await supabase
    .rpc(nome, dados)
    .abortSignal(
      signal
        ? AbortSignal.any([signal, AbortSignal.timeout(20_000)])
        : AbortSignal.timeout(20_000),
    )
    .retry(false);
  if (error) {
    // Uma busca substituída por outra não é uma falha da aplicação.
    if (signal?.aborted) throw signal.reason;
    if (
      !["22023", "40001", "42501", "23514", "23505", "23P01", "PT409"].includes(
        error.code,
      )
    )
      registrarDiagnostico("consulta", error);
    throw error;
  }
  return data as T;
}
