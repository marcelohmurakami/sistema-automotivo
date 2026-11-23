import type { QueryClient, QueryKey } from "@tanstack/react-query";

/** A consulta iniciada antes da gravação não pode confirmar a lista posterior. */
export async function atualizarCadastro(qc: QueryClient, queryKey: QueryKey) {
  await qc.cancelQueries({ queryKey });
  await qc.invalidateQueries({ queryKey });
}
