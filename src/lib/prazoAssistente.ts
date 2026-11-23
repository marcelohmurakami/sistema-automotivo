/** Libera o chat mesmo se a conexão não devolver resposta ou ignorar o cancelamento. */
export async function comPrazoAssistente<T>(
  executar: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
  milissegundos = 115_000,
): Promise<T> {
  signal.throwIfAborted();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelar: () => void = () => {};
  const interrompido = new Promise<never>((_, reject) => {
    cancelar = () => {
      controller.abort(signal.reason);
      reject(signal.reason);
    };
    signal.addEventListener("abort", cancelar, { once: true });
    timer = setTimeout(() => {
      const erro = new Error(
        "O assistente demorou para responder. Seu pedido foi mantido; tente enviar novamente. Nenhum documento é salvo sem sua confirmação.",
      );
      reject(erro);
      controller.abort(erro);
    }, milissegundos);
  });
  try {
    return await Promise.race([interrompido, executar(controller.signal)]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancelar);
  }
}
