export const precosTeste = { basic: 4900, intermediate: 9900, complete: 19900 };
export const versaoStripe = "2025-03-31.basil";
const encoder = new TextEncoder();

export async function verificarAssinaturaStripe(
  corpo,
  cabecalho,
  segredo,
  agora = Date.now(),
) {
  if (!segredo || typeof cabecalho !== "string" || cabecalho.length > 2048)
    return false;
  const partes = cabecalho.split(",").map((p) => p.trim().split("="));
  const datas = partes.filter(([k]) => k === "t");
  if (datas.length !== 1 || !/^\d+$/.test(datas[0][1])) return false;
  const timestamp = Number(datas[0][1]);
  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(agora / 1000 - timestamp) > 300
  )
    return false;
  const chave = await crypto.subtle.importKey(
    "raw",
    encoder.encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  for (const [, assinatura] of partes.filter(([k]) => k === "v1")) {
    if (!/^[a-fA-F0-9]{64}$/.test(assinatura || "")) continue;
    const bytes = Uint8Array.from(assinatura.match(/../g), (p) =>
      parseInt(p, 16),
    );
    if (
      await crypto.subtle.verify(
        "HMAC",
        chave,
        bytes,
        encoder.encode(`${timestamp}.${corpo}`),
      )
    )
      return true;
  }
  return false;
}

export function lerConfiguracaoCobranca(ler) {
  const ambiente = ler("COBRANCA_AMBIENTE") || "teste";
  const live = ambiente === "producao";
  const segredo = ler("STRIPE_SECRET_KEY") || "";
  const webhook = ler("STRIPE_WEBHOOK_SECRET") || "";
  const origem = ler("APP_URL") || "";
  const precos = Object.fromEntries(
    Object.keys(precosTeste).map((p) => [
      p,
      ler(`STRIPE_PRICE_${p.toUpperCase()}`) || "",
    ]),
  );
  const valores = Object.fromEntries(Object.entries(precosTeste).map(([p, padrao]) => {
    const informado = ler(`STRIPE_AMOUNT_${p.toUpperCase()}`);
    const valor = informado ? Number(informado) : live ? NaN : padrao;
    return [p, valor];
  }));
  let url;
  try {
    url = new URL(origem);
  } catch {
    /* Incompleta: nenhum checkout será aberto. */
  }
  const habilitado =
    ler("COBRANCA_HABILITADA") === "true" &&
    ["teste", "producao"].includes(ambiente) &&
    (live ? ler("COBRANCA_PRODUCAO_HABILITADA") === "true" : true) &&
    new RegExp(`^(sk|rk)_${live ? "live" : "test"}_`).test(segredo) &&
    Object.values(valores).every(v => Number.isSafeInteger(v) && v > 0 && v <= 10000000) &&
    webhook.startsWith("whsec_") &&
    !!url &&
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    url.pathname === "/" &&
    !url.search &&
    !url.hash &&
    Object.values(precos).every((p) => /^price_[A-Za-z0-9]+$/.test(p)) &&
    new Set(Object.values(precos)).size === 3;
  return {
    ambiente,
    live,
    valores,
    habilitado,
    segredo,
    webhook,
    origem: url?.origin,
    precos,
    portal: ler("STRIPE_PORTAL_CONFIGURATION") || undefined,
  };
}

export function conferirPreco(preco, plano, config) {
  if (
    !preco ||
    preco.id !== config.precos[plano] ||
    preco.livemode !== config.live ||
    !preco.active ||
    preco.currency !== "brl" ||
    preco.unit_amount !== config.valores[plano] ||
    preco.type !== "recurring" ||
    preco.recurring?.interval !== "month" ||
    preco.recurring?.interval_count !== 1
  )
    throw new Error("preco_divergente");
}

export function projetarAssinatura(assinatura, oficina, cliente, config) {
  if (
    assinatura.livemode !== config.live ||
    assinatura.customer !== cliente ||
    assinatura.metadata?.oficina_id !== oficina ||
    !/^sub_[A-Za-z0-9]+$/.test(assinatura.id)
  )
    throw new Error("assinatura_divergente");
  const itens = assinatura.items?.data;
  if (!Array.isArray(itens) || itens.length !== 1 || itens[0].quantity !== 1)
    throw new Error("itens_divergentes");
  const item = itens[0];
  const plano = Object.keys(config.precos).find(
    (p) => config.precos[p] === item.price?.id,
  );
  if (!plano) throw new Error("plano_desconhecido");
  // Um preço arquivado continua válido para assinaturas já contratadas.
  conferirPreco({ ...item.price, active: true }, plano, config);
  const fim = item.current_period_end;
  if (
    !Number.isSafeInteger(fim) ||
    fim < 1 ||
    ![
      "active",
      "trialing",
      "past_due",
      "canceled",
      "unpaid",
      "incomplete",
      "incomplete_expired",
      "paused",
    ].includes(assinatura.status)
  )
    throw new Error("periodo_ou_estado_invalido");
  return {
    plano,
    situacao: assinatura.status,
    periodo_final: new Date(fim * 1000).toISOString(),
    cancelar_no_fim: assinatura.cancel_at_period_end === true,
  };
}

export function idAssinaturaEvento(evento) {
  const objeto = evento?.data?.object;
  if (evento?.type?.startsWith("customer.subscription.")) return objeto?.id;
  if (["invoice.paid", "invoice.payment_failed"].includes(evento?.type))
    return objeto?.parent?.subscription_details?.subscription;
  return null;
}

export async function chamarStripe(
  config,
  caminho,
  parametros,
  idempotencia,
  transporte = fetch,
) {
  const headers = {
    Authorization: `Bearer ${config.segredo}`,
    "Stripe-Version": versaoStripe,
  };
  if (parametros) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (idempotencia) headers["Idempotency-Key"] = idempotencia;
  const resposta = await transporte(`https://api.stripe.com/v1/${caminho}`, {
    method: parametros ? "POST" : "GET",
    headers,
    ...(parametros
      ? {
          body: new URLSearchParams(
            Object.entries(parametros)
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => [k, String(v)]),
          ),
        }
      : {}),
    signal: AbortSignal.timeout(15000),
  });
  if (!resposta.ok) throw new Error("stripe_indisponivel");
  return resposta.json();
}
