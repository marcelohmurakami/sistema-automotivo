// Cache e fila existem somente durante este pedido autenticado. Nunca compartilham
// resultados entre usuários/empresas, nem guardam preços para a próxima mensagem.
export function criarConsultasDoTurno(executar, signal, desempenho, limite = 3) {
  const cache = new Map(),
    fila = [];
  let ativas = 0;
  function iniciar() {
    while (ativas < limite && fila.length) {
      const { args, resolve, reject } = fila.shift();
      if (signal?.aborted) {
        reject(signal.reason);
        continue;
      }
      ativas++;
      desempenho.consultas_banco++;
      const inicio = Date.now();
      Promise.resolve()
        .then(() => executar("consultar", args))
        .then(resolve, reject)
        .finally(() => {
          desempenho.consultas_ms += Date.now() - inicio;
          ativas--;
          iniciar();
        });
    }
  }
  return (args) => {
    signal?.throwIfAborted();
    const chave = JSON.stringify(
      Object.fromEntries(Object.entries(args).sort(([a], [b]) => a.localeCompare(b))),
    );
    if (cache.has(chave)) {
      desempenho.reusos_consulta++;
      return cache.get(chave);
    }
    const resultado = new Promise((resolve, reject) => {
      fila.push({ args, resolve, reject });
      iniciar();
    });
    cache.set(chave, resultado);
    return resultado;
  };
}
