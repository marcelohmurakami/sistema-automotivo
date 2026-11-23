import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const codigo = (await readFile("n8n/atendimento.mjs", "utf8")).replaceAll(
  "export function",
  "function",
);
const anterior = JSON.parse(
  await readFile("n8n/workflows/atendimento-whatsapp.json", "utf8"),
);
const webhookId = anterior.nodes.find(
  (n) => n.name === "Receber WhatsApp",
).webhookId;
const node = (name, type, parameters, x, y = 0, typeVersion = 2) => ({
  id: randomUUID(),
  name,
  type: "n8n-nodes-base." + type,
  typeVersion,
  position: [x, y],
  parameters,
});
const nodes = [
  {
    ...node(
      "Receber WhatsApp",
      "webhook",
      {
        httpMethod: "POST",
        path: "evolution-whatsapp/:secret",
        options: { responseCode: 200 },
      },
      0,
      0,
      2.1,
    ),
    webhookId,
  },
  node(
    "Validar mensagem e remetente",
    "code",
    {
      jsCode:
        codigo +
        "\nreturn normalizarEntrada($input.first().json, $env).map(json=>({json}));",
    },
    260,
  ),
  node(
    "Impedir resposta duplicada",
    "removeDuplicates",
    {
      operation: "removeItemsSeenInPreviousExecutions",
      dedupeValue: "={{ $json.id }}",
      options: {},
    },
    520,
  ),
  node(
    "Atendimento automotivo",
    "code",
    {
      jsCode:
        codigo +
        "\nreturn $input.all().map(item=>({json:prepararResposta(item.json)}));",
    },
    780,
  ),
  {
    ...node(
      "Responder pelo numero de testes",
      "httpRequest",
      {
        method: "POST",
        url: "https://evolution.murakamitech.tech/message/sendText/estudos-whatsapp",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: "apikey", value: "={{ $env.EVOLUTION_API_KEY }}" },
          ],
        },
        sendBody: true,
        contentType: "raw",
        rawContentType: "application/json",
        body: "={{ JSON.stringify({ number: $json.numero, text: $json.texto, delay: 800, linkPreview: false }) }}",
        options: { timeout: 15000 },
      },
      1040,
      0,
      4.2,
    ),
    retryOnFail: false,
  },
  node("Verificar conexao sem enviar", "manualTrigger", {}, 0, 300, 1),
  node(
    "Conferir configuracao",
    "code",
    {
      jsCode: await readFile("n8n/diagnostico-whatsapp.js", "utf8"),
    },
    260,
    300,
  ),
  node(
    "Estado da instancia",
    "httpRequest",
    {
      url: "https://evolution.murakamitech.tech/instance/connectionState/estudos-whatsapp",
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: "apikey", value: "={{ $env.EVOLUTION_API_KEY }}" },
        ],
      },
      options: { timeout: 15000 },
    },
    520,
    300,
    4.2,
  ),
];
const connections = {};
for (const ordem of [
  [0, 1, 2, 3, 4],
  [5, 6, 7],
])
  for (let i = 0; i < ordem.length - 1; i++)
    connections[nodes[ordem[i]].name] = {
      main: [[{ node: nodes[ordem[i + 1]].name, type: "main", index: 0 }]],
    };
const fluxo = {
  name: "Automotivo - Atendimento WhatsApp de testes",
  nodes,
  connections,
  pinData: {},
  active: false,
  settings: {
    executionOrder: "v1",
    timezone: "America/Sao_Paulo",
    saveDataErrorExecution: "none",
    saveDataSuccessExecution: "none",
    saveExecutionProgress: false,
  },
  tags: [],
};
await mkdir("n8n/workflows", { recursive: true });
await writeFile(
  "n8n/workflows/atendimento-whatsapp.json",
  JSON.stringify(fluxo, null, 2),
);
console.log(
  "Workflow gerado sem segredos; usa variáveis já configuradas no n8n.",
);
