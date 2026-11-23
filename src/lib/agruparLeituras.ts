/** Reúne notificações locais e nunca aplica uma leitura anterior à última alteração. */
export function agruparLeituras<T>(ler: () => Promise<T>, aplicar: (valor: T) => void) {
  let pendente = false;
  let ativa = true;
  let execucao: Promise<void> | undefined;
  function atualizar(): Promise<void> {
    if (!ativa) return Promise.resolve();
    pendente = true;
    if (!execucao) {
      execucao = Promise.resolve()
        .then(async () => {
          while (ativa && pendente) {
            pendente = false;
            const valor = await ler();
            if (ativa && !pendente) aplicar(valor);
          }
        })
        .finally(() => {
          execucao = undefined;
          if (ativa && pendente) return atualizar();
        });
    }
    return execucao;
  }
  return {
    atualizar,
    encerrar() {
      ativa = false;
      pendente = false;
    },
  };
}
