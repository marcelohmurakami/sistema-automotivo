import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import * as protocolo from "../supabase/functions/assistente-operacional/protocolo.mjs";
import * as provedor from "../supabase/functions/assistente-operacional/provedor.mjs";
const fonte = await readFile(
  "supabase/functions/assistente-operacional/index.ts",
  "utf8",
);
const js = ts.transpileModule(fonte, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
}).outputText;
function servidor({
  autenticado = true,
  configurado = true,
  responderIA,
  repetir,
} = {}) {
  let handler;
  const chamadas = [],
    chamadasIA = [];
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: autenticado ? { id: randomUUID() } : null },
        error: null,
      }),
    },
    rpc: async (nome, args) => {
      chamadas.push({ nome, args });
      if (nome === "iniciar_turno_assistente")
        return {
          data: repetir
            ? { resposta: repetir }
            : {
                versao: 1,
                empresa: { nome: "Empresa QA", ramo: "assistencia_tecnica" },
              },
        };
      if (nome === "consultar_assistente")
        return { data: { tipo: args.p_tipo, linhas: [], limite: 30 } };
      if (nome === "preparar_assistente")
        return {
          data: { id: randomUUID(), titulo: "Resumo para confirmar", campos: [] },
        };
      return { data: null };
    },
  };
  vm.runInNewContext(js, {
    exports: {},
    require: (nome) =>
      nome.includes("supabase-js")
        ? { createClient: () => client }
        : nome.includes("provedor")
          ? {
              ...provedor,
              consultarProvedorIA: (url, args, deps) =>
                provedor.consultarProvedorIA(url, args, {
                  ...deps,
                  esperar: async () => {},
                  registrar: () => {},
                }),
            }
          : protocolo,
    Deno: {
      env: { get: () => (configurado ? "configuracao-ficticia" : undefined) },
      serve: (fn) => {
        handler = fn;
      },
    },
    Request,
    Response,
    FormData,
    File,
    Blob,
    Uint8Array,
    AbortSignal,
    Error,
    TypeError,
    console,
    JSON,
    fetch: async (url, args) => {
      chamadasIA.push({ url, args });
      if (responderIA) return responderIA(url, args);
      if (url.endsWith("/transcriptions"))
        return Response.json({ text: "Consulte os serviços parados" });
      return Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "Qual cliente você quer atender?" }],
          },
        ],
      });
    },
  });
  return { handler, chamadas, chamadasIA };
}
const pedido = () => ({
  oficina: randomUUID(),
  sessao: randomUUID(),
  chave: randomUUID(),
  texto: "Criar orçamento",
  historico: [],
  contexto: {},
});
const request = (body) =>
  new Request("https://example.test", {
    method: "POST",
    headers: {
      authorization: "Bearer token-ficticio",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
test("endpoint exige autenticação e não usa chave administrativa", async () => {
  const s = servidor({ autenticado: false });
  const r = await s.handler(request(pedido()));
  assert.equal(r.status, 401);
  assert.equal(s.chamadas.length, 0);
  assert.equal(s.chamadasIA.length, 0);
  assert.doesNotMatch(fonte, /SERVICE_ROLE_KEY/);
});
test("configuração ausente é explícita, sem fingir IA ou gravar pedidos", async () => {
  const s = servidor({ configurado: false });
  const r = await s.handler(request(pedido()));
  assert.equal(r.status, 503);
  assert.match((await r.json()).erro, /ativado/);
  assert.equal(s.chamadas.length, 0);
});
test("turno repetido recupera resposta sem nova cobrança ao provedor", async () => {
  const s = servidor({ repetir: { texto: "Resposta anterior", consultas: [] } });
  assert.equal(
    (await (await s.handler(request(pedido()))).json()).texto,
    "Resposta anterior",
  );
  assert.equal(s.chamadasIA.length, 0);
});
test("texto usa Responses com store=false e conserva a empresa autenticada em toda ferramenta", async () => {
  let rodada = 0;
  const s = servidor({
    responderIA: async () =>
      Response.json({
        status: "completed",
        output: !rodada++
          ? [
              {
                type: "function_call",
                name: "consultar",
                call_id: "consulta",
                arguments: JSON.stringify({
                  tipo: "clientes",
                  busca: "João",
                  id: null,
                  cliente_id: null,
                  inicio: null,
                  fim: null,
                }),
              },
            ]
          : [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: "Não encontrei João. Qual o nome cadastrado?",
                  },
                ],
              },
            ],
      }),
  });
  const p = pedido(),
    r = await s.handler(request(p));
  assert.equal(r.status, 200);
  assert.equal(
    s.chamadas.find((c) => c.nome === "consultar_assistente").args.p_oficina,
    p.oficina,
  );
  assert.equal(s.chamadas.at(-1).nome, "concluir_turno_assistente");
  assert.equal(JSON.parse(s.chamadasIA[0].args.body).store, false);
  assert.ok(!s.chamadas.some((c) => c.nome === "confirmar_assistente"));
});
test("áudio MP4 é transcrito, exibido para conferência e segue o mesmo fluxo", async () => {
  const s = servidor(),
    form = new FormData();
  form.append("pedido", JSON.stringify(pedido()));
  form.append("audio", new Blob(["audio-ficticio"], { type: "audio/mp4" }), "gravacao");
  const r = await s.handler(
    new Request("https://example.test", { method: "POST", body: form }),
  );
  assert.equal(r.status, 200);
  assert.equal((await r.json()).transcricao, "Consulte os serviços parados");
  const envio = s.chamadasIA[0].args.body;
  assert.equal(envio.get("file").name, "pedido.m4a");
  assert.equal(envio.get("language"), "pt");
  assert.match(envio.get("prompt"), /assistência técnica/);
  assert.doesNotMatch(envio.get("prompt"), /virabrequim|VW Gol/);
  assert.ok(
    JSON.parse(s.chamadasIA[1].args.body).input.some(
      (m) => m.content === "Consulte os serviços parados",
    ),
  );
});
test("arquivo inválido e excesso de tamanho são rejeitados antes do provedor", async () => {
  for (const [tipo, bytes] of [
    ["application/pdf", 10],
    ["audio/webm", 10 * 1024 * 1024 + 1],
  ]) {
    const s = servidor(),
      form = new FormData();
    form.append("pedido", JSON.stringify(pedido()));
    form.append("audio", new Blob([new Uint8Array(bytes)], { type: tipo }), "entrada");
    assert.equal(
      (
        await s.handler(
          new Request("https://example.test", { method: "POST", body: form }),
        )
      ).status,
      400,
    );
    assert.equal(s.chamadasIA.length, 0);
  }
});
test("falha no provedor não retorna sucesso e fica recuperável como erro", async () => {
  const s = servidor({
    responderIA: async () => new Response("indisponível", { status: 503 }),
  });
  const r = await s.handler(request(pedido()));
  assert.equal(r.status, 503);
  assert.match((await r.json()).erro, /indisponível/);
  assert.ok(s.chamadas.at(-1).args.p_resposta.erro);
});

test("limite de créditos aparece com orientação específica, sem repetir nem preparar documento", async () => {
  const s = servidor({
    responderIA: async () =>
      Response.json(
        { error: { type: "insufficient_quota", message: "conteúdo privado" } },
        { status: 429 },
      ),
  });
  const r = await s.handler(request(pedido())),
    body = await r.json();
  assert.equal(r.status, 503);
  assert.equal(body.codigo, "ia_limite_uso");
  assert.match(body.erro, /créditos e limites/);
  assert.doesNotMatch(body.erro, /conteúdo privado/);
  assert.equal(s.chamadasIA.length, 1);
  assert.equal(s.chamadas.at(-1).args.p_resposta.codigo, "ia_limite_uso");
  assert.ok(!s.chamadas.some((c) => /preparar|confirmar/.test(c.nome)));
});
