if (
  $env.EVOLUTION_INSTANCE !== "estudos-whatsapp" ||
  !$env.EVOLUTION_WEBHOOK_SECRET ||
  !$env.EVOLUTION_API_KEY
)
  throw new Error("Configuração incompleta");
const esperado =
  "https://n8n.murakamitech.tech/webhook/dd2dc3b5-f49d-4365-b468-ae2a42cbdf83/evolution-whatsapp/" +
  $env.EVOLUTION_WEBHOOK_SECRET;
const r = await this.helpers.httpRequest({
  method: "GET",
  url: "https://evolution.murakamitech.tech/webhook/find/estudos-whatsapp",
  headers: { apikey: $env.EVOLUTION_API_KEY },
  json: true,
});
const w = r.webhook || r;
if (
  !w.enabled ||
  w.url !== esperado ||
  w.webhookByEvents ||
  !w.events?.includes("MESSAGES_UPSERT")
)
  throw new Error(
    "Webhook de entrada divergente. Conferir URL de produção completa, evento e habilitação.",
  );
const p = await this.helpers.httpRequest({
  method: "POST",
  url: esperado,
  body: {
    event: "diagnostico.sem_envio",
    instance: "estudos-whatsapp",
    data: {},
  },
  json: true,
  returnFullResponse: true,
  timeout: 10000,
});
return [
  {
    json: {
      habilitado: w.enabled,
      urlCorreta: w.url === esperado,
      eventos: w.events,
      porEvento: !!w.webhookByEvents,
      entradaHttp: p.statusCode,
      diagnostico: "Evento sem mensagem: nenhum WhatsApp enviado",
    },
  },
];
