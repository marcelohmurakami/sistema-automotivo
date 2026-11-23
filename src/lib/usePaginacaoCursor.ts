import { useState } from "react";

/** Guarda apenas as posições visitadas. Filtros novos sempre começam na primeira página. */
export function usePaginacaoCursor<T>(chave: string) {
  const [estado, setEstado] = useState<{
    chave: string;
    posicoes: (T | null)[];
    pagina: number;
  }>({ chave, posicoes: [null], pagina: 0 });
  const atual =
    estado.chave === chave ? estado : { chave, posicoes: [null], pagina: 0 };
  return {
    pagina: atual.pagina,
    cursor: atual.posicoes[atual.pagina],
    anterior: () => setEstado({ ...atual, pagina: Math.max(0, atual.pagina - 1) }),
    proxima: (cursor: T) =>
      setEstado({
        chave,
        posicoes: [...atual.posicoes.slice(0, atual.pagina + 1), cursor],
        pagina: atual.pagina + 1,
      }),
    reiniciar: () => setEstado({ chave, posicoes: [null], pagina: 0 }),
  };
}
