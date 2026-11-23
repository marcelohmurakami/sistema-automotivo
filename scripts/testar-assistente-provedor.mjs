import assert from "node:assert/strict";
import { test } from "node:test";
import { consultarProvedorIA } from "../supabase/functions/assistente-operacional/provedor.mjs";
const url = "https://example.test/ia";
const falha = (status, code, type = code, headers = {}) =>
  Response.json(
    { error: { code, type, message: "DADO PRIVADO QUE NÃO PODE SAIR" } },
    { status, headers },
  );
const opcoes = () => ({
  method: "POST",
  body: "pedido",
  signal: new AbortController().signal,
});

test("crédito esgotado não é repetido e não expõe mensagem do provedor", async () => {
  for (const code of [
    "insufficient_quota",
    "credit_balance_exhausted",
    "billing_hard_limit_reached",
    "budget_exceeded",
  ]) {
    let chamadas = 0;
    const logs = [];
    await assert.rejects(
      consultarProvedorIA(url, opcoes(), {
        buscar: async () => {
          chamadas++;
          return falha(429, code);
        },
        registrar: (...a) => logs.push(a),
      }),
      (e) => e.codigo === "ia_limite_uso" && !e.message.includes("PRIVADO"),
    );
    assert.equal(chamadas, 1);
    assert.doesNotMatch(JSON.stringify(logs), /PRIVADO|pedido/);
  }
});
test("429 temporário e 503 são repetidos com espera e sucesso sem alterar o pedido", async () => {
  let n = 0;
  const pausas = [],
    args = opcoes();
  const r = await consultarProvedorIA(url, args, {
    buscar: async (u, a) => {
      assert.equal(a, args);
      n++;
      return n === 1
        ? falha(429, "rate_limit_exceeded", "rate_limit_error", { "retry-after": "2" })
        : n === 2
          ? falha(503, "server_error")
          : Response.json({ ok: true });
    },
    esperar: async (ms) => pausas.push(ms),
    aleatorio: () => 0,
    registrar: () => {},
  });
  assert.equal(r.status, 200);
  assert.equal(n, 3);
  assert.deepEqual(pausas, [2000, 1600]);
});
test("Retry-After longo não é antecipado", async () => {
  let n = 0;
  await assert.rejects(
    consultarProvedorIA(url, opcoes(), {
      buscar: async () => {
        n++;
        return falha(429, "slow_down", "rate_limit_error", { "retry-after": "60" });
      },
      esperar: async () => assert.fail("Não deve aguardar minutos no turno"),
      registrar: () => {},
    }),
    (e) => e.codigo === "ia_limite_temporario",
  );
  assert.equal(n, 1);
});
test("chave, permissão e modelo inválidos não geram repetições", async () => {
  for (const status of [401, 403, 404]) {
    let n = 0;
    await assert.rejects(
      consultarProvedorIA(url, opcoes(), {
        buscar: async () => {
          n++;
          return falha(status, "invalid_api_key");
        },
        registrar: () => {},
      }),
      (e) => e.codigo === "ia_configuracao",
    );
    assert.equal(n, 1);
  }
});
test("falha persistente para após três tentativas e aceita corpo não JSON", async () => {
  let n = 0;
  await assert.rejects(
    consultarProvedorIA(url, opcoes(), {
      buscar: async () => {
        n++;
        return new Response("erro", { status: 502 });
      },
      esperar: async () => {},
      registrar: () => {},
    }),
    (e) => e.codigo === "ia_indisponivel",
  );
  assert.equal(n, 3);
});
test("conexão pode recuperar, mas cancelamento interrompe a próxima tentativa", async () => {
  let n = 0;
  await consultarProvedorIA(url, opcoes(), {
    buscar: async () => {
      if (!n++) throw new TypeError("rede");
      return Response.json({ ok: true });
    },
    esperar: async () => {},
    registrar: () => {},
  });
  assert.equal(n, 2);
  const c = new AbortController();
  n = 0;
  await assert.rejects(
    consultarProvedorIA(
      url,
      { signal: c.signal },
      {
        buscar: async () => {
          n++;
          return falha(503, "server_error");
        },
        esperar: async () => c.abort(),
        registrar: () => {},
      },
    ),
    (e) => e.name === "AbortError",
  );
  assert.equal(n, 1);
});
test("requisição rejeitada não é repetida", async () => {
  let n = 0;
  await assert.rejects(
    consultarProvedorIA(url, opcoes(), {
      buscar: async () => {
        n++;
        return falha(400, "invalid_request_error");
      },
      registrar: () => {},
    }),
    (e) => e.codigo === "ia_pedido_rejeitado",
  );
  assert.equal(n, 1);
});
