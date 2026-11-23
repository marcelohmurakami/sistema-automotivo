export class FalhaProvedorIA extends Error {
  constructor(codigo, mensagem, recuperavel = false) {
    super(mensagem);
    this.name = "FalhaProvedorIA";
    this.codigo = codigo;
    this.recuperavel = recuperavel;
  }
}

async function falhaRespostaIA(resposta) {
  let erro = {};
  try {
    erro = (await resposta.json())?.error || {};
  } catch {
    /* Corpo não JSON. */
  }
  const identificador = `${erro.type || ""} ${erro.code || ""}`;
  if (
    /insufficient_quota|credit_balance_exhausted|billing_hard_limit|budget_exceeded|spend_limit|usage_limit/i.test(
      identificador,
    )
  )
    return new FalhaProvedorIA(
      "ia_limite_uso",
      "O saldo ou limite de uso da IA foi atingido. Peça ao administrador verificar os créditos e limites da integração. Seu pedido foi mantido.",
    );
  if ([401, 403, 404].includes(resposta.status))
    return new FalhaProvedorIA(
      "ia_configuracao",
      "A integração de IA precisa ser revisada pelo administrador: confira a chave, o modelo e as permissões. Seu pedido foi mantido.",
    );
  if (resposta.status === 429)
    return new FalhaProvedorIA(
      "ia_limite_temporario",
      "A IA está recebendo muitos pedidos. Aguarde um pouco e envie novamente; seu pedido foi mantido.",
      true,
    );
  if ([408, 409].includes(resposta.status) || resposta.status >= 500)
    return new FalhaProvedorIA(
      "ia_indisponivel",
      "O assistente está indisponível no momento. Tente novamente em instantes; seu pedido foi mantido.",
      true,
    );
  return new FalhaProvedorIA(
    "ia_pedido_rejeitado",
    "A integração de IA não conseguiu processar o pedido. Peça ao administrador verificar a configuração. Seu pedido foi mantido.",
  );
}

function pausaProvedorIA(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const parar = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", parar);
      resolve();
    }, ms);
    signal?.addEventListener("abort", parar, { once: true });
  });
}

// Repete somente consultas ao provedor, nunca confirmações ou operações no banco.
// O sinal do turno limita também a soma das tentativas e esperas.
export async function consultarProvedorIA(
  url,
  opcoes,
  {
    buscar = fetch,
    esperar = pausaProvedorIA,
    aleatorio = Math.random,
    registrar = console.warn,
  } = {},
) {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    opcoes.signal?.throwIfAborted();
    let resposta, falha;
    try {
      resposta = await buscar(url, opcoes);
    } catch (erro) {
      if (opcoes.signal?.aborted) throw opcoes.signal.reason;
      if (!(erro instanceof TypeError)) throw erro;
      falha = new FalhaProvedorIA(
        "ia_conexao",
        "Não foi possível conectar à IA. Tente novamente em instantes; seu pedido foi mantido.",
        true,
      );
    }
    if (resposta?.ok) return resposta;
    if (resposta) falha = await falhaRespostaIA(resposta);
    // Sem conteúdo, chave, nome de cliente ou mensagem bruta do provedor nos logs.
    registrar("assistente_provedor", {
      status: resposta?.status || 0,
      codigo: falha.codigo,
      tentativa: tentativa + 1,
    });
    if (!falha.recuperavel || tentativa === 2) throw falha;
    const cabecalho = resposta?.headers.get("retry-after");
    const segundos = cabecalho ? Number(cabecalho) : NaN;
    const informado = Number.isFinite(segundos)
      ? segundos * 1000
      : cabecalho
        ? Date.parse(cabecalho) - Date.now()
        : NaN;
    const espera = Number.isFinite(informado)
      ? Math.max(0, informado)
      : 800 * 2 ** tentativa + Math.floor(aleatorio() * 200);
    // Não antecipa Retry-After longo nem mantém o chat bloqueado esperando minutos.
    if (espera > 10000) throw falha;
    await esperar(espera, opcoes.signal);
  }
  throw new FalhaProvedorIA(
    "ia_indisponivel",
    "O assistente está indisponível no momento. Tente novamente em instantes.",
  );
}
