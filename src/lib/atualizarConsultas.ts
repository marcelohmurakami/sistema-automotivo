import { matchQuery, type QueryClient, type QueryKey } from "@tanstack/react-query";

/** Atualiza cada consulta uma vez e mantém o escopo original das chaves. */
export async function atualizarConsultas(
  cache: QueryClient,
  chaves: readonly QueryKey[],
  prioritarias?: readonly QueryKey[],
) {
  const corresponde = (
    consulta: Parameters<typeof matchQuery>[1],
    lista: readonly QueryKey[],
  ) => lista.some((queryKey) => matchQuery({ queryKey }, consulta));
  if (!prioritarias) {
    await cache.invalidateQueries({ predicate: (q) => corresponde(q, chaves) });
    return;
  }
  // Falhas continuam visíveis na consulta correspondente; uma consulta secundária
  // lenta não pode manter o formulário bloqueado depois de a gravação terminar.
  void cache
    .invalidateQueries({
      predicate: (q) => corresponde(q, chaves) && !corresponde(q, prioritarias),
    })
    .catch(() => {});
  await cache.invalidateQueries({
    predicate: (q) => corresponde(q, chaves) && corresponde(q, prioritarias),
  });
}
