/** Processa registros independentemente, sem perder os demais por uma falha. */
export async function enviarFilaOffline<T>(
  itens: T[],
  enviar: (item: T) => Promise<unknown>,
  progresso?: (enviados: number, total: number) => void,
) {
  let enviados = 0;
  const falhas: { item: T; erro: unknown }[] = [];
  for (const item of itens) {
    try {
      await enviar(item);
      enviados++;
    } catch (erro) {
      falhas.push({ item, erro });
    }
    progresso?.(enviados, itens.length);
  }
  return { enviados, falhas };
}
