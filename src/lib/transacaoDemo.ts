/** Restaura as chaves da demonstração se uma gravação local síncrona falhar. */
export function transacaoDemo(chaves: string[], gravar: () => void) {
  const anteriores = chaves.map(
    (chave) => [chave, localStorage.getItem(chave)] as const,
  );
  try {
    gravar();
  } catch (erro) {
    // Não regravar a chave intacta cuja escrita falhou. Libere os valores
    // alterados antes de restaurar: um deles pode ter ocupado o espaço de outro.
    const alteradas = anteriores.filter(
      ([chave, valor]) => localStorage.getItem(chave) !== valor,
    );
    for (const [chave] of alteradas) localStorage.removeItem(chave);
    for (const [chave, valor] of alteradas) {
      if (valor !== null) localStorage.setItem(chave, valor);
    }
    throw erro;
  }
}
