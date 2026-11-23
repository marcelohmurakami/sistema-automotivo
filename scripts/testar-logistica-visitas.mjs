import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import {
  planejarTrajeto,
  validarPedido,
} from "../supabase/functions/planejar-trajeto/provedor.mjs";
import {
  inicioOcupacao,
  fimOcupacao,
  conflitoVisita,
  linkNavegacao,
  enderecoTexto,
} from "../src/lib/logisticaVisitas.ts";

test("HTTP: autenticação, isolamento, tamanho, quota e ausência de chave antes do provedor", async () => {
  const source = (
    await readFile("supabase/functions/planejar-trajeto/index.ts", "utf8")
  ).replace(/^import .*;\r?\n/gm, "");
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  let handler,
    chamadas = 0,
    autenticado = true,
    acesso = null,
    chave = "teste",
    authChamadas = 0,
    falhaProvedor = null;
  const fakeClient = () => ({
    auth: {
      getUser: async () => {
        authChamadas++;
        return { data: { user: autenticado ? { id: "QA" } : null }, error: null };
      },
    },
    rpc: async () => ({ error: acesso }),
  });
  const deno = {
    env: { get: (k) => (k === "OPENROUTESERVICE_API_KEY" ? chave : "config-teste") },
    serve: (fn) => {
      handler = fn;
    },
  };
  new Function("createClient", "Deno", "planejarTrajeto", "validarPedido", js)(
    fakeClient,
    deno,
    async () => {
      chamadas++;
      if (falhaProvedor) throw falhaProvedor;
      return { confirmar: true };
    },
    validarPedido,
  );
  const req = (body = pedido, token = "Bearer teste", method = "POST") =>
    new Request("http://local/planejar-trajeto", {
      method,
      headers: { authorization: token, "Content-Type": "application/json" },
      ...(method === "POST"
        ? { body: typeof body === "string" ? body : JSON.stringify(body) }
        : {}),
    });
  assert.equal((await handler(req(pedido, "", "OPTIONS"))).status, 200);
  assert.equal(authChamadas, 0);
  assert.equal((await handler(req(pedido, "", "GET"))).status, 405);
  assert.equal((await handler(req(pedido, ""))).status, 401);
  autenticado = false;
  assert.equal((await handler(req())).status, 401);
  autenticado = true;
  assert.equal((await handler(req(" ".repeat(4097)))).status, 413);
  assert.equal((await handler(req("{"))).status, 400);
  acesso = { code: "42501", message: "Detalhe privado" };
  const negado = await handler(req());
  assert.equal(negado.status, 403);
  assert.ok(!(await negado.text()).includes("Detalhe privado"));
  acesso = { code: "22023", message: "Limite atingido" };
  assert.equal((await handler(req())).status, 429);
  acesso = null;
  chave = "";
  assert.equal((await handler(req())).status, 503);
  assert.equal(chamadas, 0);
  chave = "teste";
  const ok = await handler(req());
  assert.equal(ok.status, 200);
  assert.equal(chamadas, 1);
  assert.equal(ok.headers.get("Cache-Control"), "no-store");
  for (const falha of [
    new DOMException("The operation was aborted", "AbortError"),
    new DOMException("The operation timed out", "TimeoutError"),
    new TypeError("fetch failed: connection reset by peer"),
  ]) {
    falhaProvedor = falha;
    const indisponivel = await handler(req());
    assert.equal(indisponivel.status, 400);
    assert.deepEqual(await indisponivel.json(), {
      erro: "Não foi possível calcular agora. Tente novamente ou informe os minutos manualmente.",
    });
  }
});
const pedido = {
  oficina: "11111111-1111-4111-8111-111111111111",
  origem: "Rua A 100, Campinas, SP",
  destino: "Rua B 200, Campinas, SP",
  retorno: true,
};
test("Validação de entrada e coordenadas", () => {
  assert.throws(() => validarPedido({}));
  assert.throws(() => validarPedido({ ...pedido, origem: "a" }));
  for (const ponto of [[181, 0], [0, 91], [1], ["1", 2], [NaN, 0]])
    assert.throws(() => validarPedido({ ...pedido, origem_ponto: ponto }));
  assert.equal(validarPedido(pedido), pedido);
});
test("Endereços são confirmados antes de calcular; nunca escolhe local silenciosamente", async () => {
  let chamadas = 0;
  const r = await planejarTrajeto(pedido, {
    key: "qa",
    buscar: async (url, opt) => {
      chamadas++;
      const endpoint = new URL(url);
      assert.equal(endpoint.origin, "https://api.heigit.org");
      assert.equal(endpoint.pathname, "/pelias/v1/search");
      assert.equal(endpoint.searchParams.get("boundary.country"), "BR");
      assert.equal(endpoint.searchParams.get("size"), "3");
      assert.equal(opt.headers.Authorization, "qa");
      assert.ok(!url.includes("qa"));
      return Response.json({
        features: [
          {
            geometry: { type: "Point", coordinates: [-47, -22] },
            properties: { label: "Endereço encontrado" },
          },
        ],
      });
    },
  });
  assert.equal(r.confirmar, true);
  assert.equal(chamadas, 2);
  assert.equal(r.origens.length, 1);
});
test("Ida e volta usam rotas independentes e arredondam tempo para cima", async () => {
  const pedidos = [];
  const r = await planejarTrajeto(
    { ...pedido, origem_ponto: [-47, -22], destino_ponto: [-46, -23] },
    {
      key: "qa",
      buscar: async (url, opt) => {
        assert.equal(
          url,
          "https://api.heigit.org/openrouteservice/v2/directions/driving-car/json",
        );
        const d = JSON.parse(opt.body);
        pedidos.push(d);
        return Response.json({
          routes: [
            {
              summary: {
                duration: d.coordinates[0][0] === -47 ? 601 : 1000,
                distance: 5000,
              },
            },
          ],
        });
      },
    },
  );
  assert.equal(r.ida.minutos, 11);
  assert.equal(r.volta.minutos, 17);
  assert.equal(pedidos.length, 2);
  assert.deepEqual(pedidos[1].coordinates, [
    [-46, -23],
    [-47, -22],
  ]);
});
test("Sem retorno faz somente uma chamada e falhas não fabricam estimativas", async () => {
  let n = 0;
  const d = {
    ...pedido,
    retorno: false,
    origem_ponto: [-47, -22],
    destino_ponto: [-46, -23],
  };
  const r = await planejarTrajeto(d, {
    key: "qa",
    buscar: async () => {
      n++;
      return Response.json({
        routes: [{ summary: { duration: 600, distance: 5000 } }],
      });
    },
  });
  assert.equal(n, 1);
  assert.equal(r.volta, null);
  for (const status of [401, 403, 429, 500])
    await assert.rejects(
      () =>
        planejarTrajeto(d, {
          key: "qa",
          buscar: async () => new Response("", { status }),
        }),
      /manualmente/,
    );
  await assert.rejects(
    () =>
      planejarTrajeto(d, {
        key: "qa",
        buscar: async () => Response.json({ routes: [] }),
      }),
    /Trajeto indisponível/,
  );
  await assert.rejects(
    () =>
      planejarTrajeto(pedido, {
        key: "qa",
        buscar: async () => Response.json({ features: [] }),
      }),
    /Endereço não localizado/,
  );
});
test("Ocupação inclui ida, margem, retorno e atravessa a meia-noite", () => {
  const v = {
    id: "a",
    inicio: "2026-11-01T00:15:00-03:00",
    fim: "2026-11-01T01:00:00-03:00",
    situacao: "agendado",
    visita: true,
    deslocamento_minutos: 30,
    logistica: { origem: "A", destino: "B", margem_minutos: 10, retorno_minutos: 20 },
  };
  assert.equal(new Date(inicioOcupacao(v)).toISOString(), "2026-11-01T02:35:00.000Z");
  assert.equal(new Date(fimOcupacao(v)).toISOString(), "2026-11-01T04:20:00.000Z");
  assert.ok(
    conflitoVisita({ ...v, id: "b", inicio: "2026-11-01T01:10:00-03:00" }, [v]),
  );
  assert.equal(
    conflitoVisita(v, [{ ...v, id: "b", situacao: "cancelado" }]),
    undefined,
  );
  assert.equal(conflitoVisita(v, [v]), undefined);
});
test("Links escapam os endereços e a empresa fornece sua origem", () => {
  const u = new URL(linkNavegacao("Rua A & B", "Praça São José #3"));
  assert.equal(u.searchParams.get("origin"), "Rua A & B");
  assert.equal(u.searchParams.get("destination"), "Praça São José #3");
  assert.equal(
    enderecoTexto({ logradouro: "Rua A", numero: "1", cidade: "Campinas", uf: "SP" }),
    "Rua A, 1, Campinas, SP",
  );
});
