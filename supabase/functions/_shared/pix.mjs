// Mercado Pago Payments API. As credenciais são da oficina recebedora, nunca do SaaS.
export function configuracaoPix(env, oficina) {
  if (env("PIX_HABILITADO") !== "true") return null;
  const lista = JSON.parse(env("PIX_OFICINAS_JSON") || "[]");
  if (!Array.isArray(lista)) throw new Error("Configuração Pix inválida.");
  const encontrados = lista.filter((c) => c.oficina === oficina);
  if (encontrados.length !== 1) return null;
  const c = encontrados[0];
  if (
    !c.token ||
    !c.segredo_webhook ||
    !/^\d+$/.test(String(c.recebedor_id)) ||
    !["teste", "producao"].includes(c.ambiente)
  )
    return null;
  if (c.ambiente === "producao" && env("PIX_PRODUCAO_HABILITADA") !== "true")
    return null;
  return c;
}
export async function assinaturaPixValida({
  assinatura,
  requestId,
  dataId,
  segredo,
  agora = Date.now(),
}) {
  if (!assinatura || !requestId || !/^\d+$/.test(dataId || "") || !segredo)
    return false;
  const campos = Object.fromEntries(
    assinatura.split(",").map((p) => p.trim().split("=")),
  );
  if (
    !/^\d{10,13}$/.test(campos.ts || "") ||
    !/^[a-f0-9]{64}$/i.test(campos.v1 || "")
  )
    return false;
  const tempo = Number(campos.ts) * (campos.ts.length === 10 ? 1000 : 1);
  if (Math.abs(agora - tempo) > 10 * 60 * 1000) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const sig = Uint8Array.from(
    campos.v1.match(/.{2}/g).map((x) => parseInt(x, 16)),
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    sig,
    new TextEncoder().encode(
      `id:${dataId};request-id:${requestId};ts:${campos.ts};`,
    ),
  );
}
export function pagamentoConferido(p, c, config) {
  const valor = Math.round(Number(p.transaction_amount) * 100);
  if (
    p.payment_method_id !== "pix" ||
    p.currency_id !== "BRL" ||
    String(p.collector_id) !== String(config.recebedor_id) ||
    p.external_reference !== c.id ||
    valor !== Number(c.valor_centavos) ||
    typeof p.live_mode !== "boolean" ||
    p.live_mode !== (config.ambiente === "producao") ||
    c.ambiente !== config.ambiente ||
    !/^\d+$/.test(String(p.id))
  )
    throw new Error("Pagamento incompatível com a oficina ou cobrança.");
  const reembolsado = Math.round(
    Number(p.transaction_amount_refunded || 0) * 100,
  );
  const status = {
    pending: "pendente",
    in_process: "pendente",
    approved: "aprovado",
    cancelled: "cancelado",
    rejected: "falhou",
    refunded: "estornado",
    charged_back: "estornado",
  }[p.status];
  if (!status) throw new Error("Situação do provedor não reconhecida.");
  const taxa = (p.fee_details || []).reduce(
    (s, f) => s + Math.round(Number(f.amount) * 100),
    0,
  );
  if (
    !Number.isSafeInteger(taxa) ||
    taxa < 0 ||
    taxa >= valor ||
    !Number.isSafeInteger(reembolsado) ||
    reembolsado < 0 ||
    reembolsado > valor
  )
    throw new Error("Taxas ou reembolso inconsistentes.");
  return {
    referencia: c.id,
    provedor_id: String(p.id),
    recebedor_id: String(p.collector_id),
    valor_centavos: valor,
    moeda: p.currency_id,
    ambiente: config.ambiente,
    situacao: reembolsado > 0 ? "estornado" : status,
    taxa_centavos: taxa,
    reembolsado_centavos: reembolsado,
    codigo_pix: p.point_of_interaction?.transaction_data?.qr_code || "",
    expira_em: p.date_of_expiration || null,
  };
}
export function corpoCriacaoPix(c, config, urlSupabase) {
  return {
    transaction_amount: c.valor_centavos / 100,
    description: "Pagamento de ordem de serviço",
    payment_method_id: "pix",
    payer: { email: c.email_pagador },
    external_reference: c.id,
    date_of_expiration: new Date(
      Date.parse(c.criado_em) + 30 * 60 * 1000,
    ).toISOString(),
    notification_url: `${urlSupabase}/functions/v1/webhook-pix?oficina=${encodeURIComponent(config.oficina)}`,
  };
}
export async function chamarPix(
  config,
  path,
  body,
  metodo = "GET",
  chave,
  fetcher = fetch,
) {
  if (!/^\/v1\/payments(?:\/\d+)?$/.test(path))
    throw new Error("Rota inválida.");
  const r = await fetcher("https://api.mercadopago.com" + path, {
    method: metodo,
    signal: AbortSignal.timeout(18000),
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      ...(chave ? { "X-Idempotency-Key": chave } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok)
    throw new Error(
      "Provedor indisponível. Consulte novamente antes de criar outra cobrança.",
    );
  return r.json();
}
