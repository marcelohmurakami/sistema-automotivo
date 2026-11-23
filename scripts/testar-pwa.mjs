import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
const pastaBuild = process.env.QA_BUILD || "dist";
const script = readFileSync(pastaBuild + "/sw.js", "utf8");
function worker() {
  const eventos = {},
    arquivos = [],
    removidos = [];
  const contexto = {
    URL,
    AbortSignal,
    Request: class extends Request {
      constructor(url, options) { super(new URL(url, 'https://patio.example'), options); }
    },
    self: {
      location: { origin: "https://patio.example" },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
      addEventListener: (tipo, fn) => (eventos[tipo] = fn),
    },
    fetch: async (req) => {
      if (req.mode === 'navigate') throw new Error("offline");
      assert.equal(req.cache, new URL(req.url).pathname.startsWith('/assets/') ? 'default' : 'reload');
      return new Response('arquivo');
    },
    caches: {
      open: async () => ({
        put: async (req) => arquivos.push(new URL(req.url).pathname),
        match: async (url) => url === '/index.html' ? 'aplicativo-em-cache' : "asset-em-cache",
      }),
      match: async (url) =>
        url === "/index.html" ? "aplicativo-em-cache" : undefined,
      keys: async () => ["patio-static-obsoleto", "patio-static-antigo", "cache-de-outro-app"],
      delete: async (k) => removidos.push(k),
    },
  };
  vm.runInNewContext(script, contexto);
  const evento = async (tipo) => {
    let p;
    eventos[tipo]({ waitUntil: (q) => (p = q) });
    await p;
  };
  const requisicao = async (url, method = "GET", mode = "cors") => {
    let p;
    eventos.fetch({
      request: { url, method, mode },
      respondWith: (r) => (p = r),
    });
    return p === undefined ? "sem-interceptar" : await p;
  };
  return { arquivos, removidos, evento, requisicao };
}
test("PWA inclui todos os arquivos necessários existentes no build", async () => {
  const w = worker();
  await w.evento("install");
  assert.ok(w.arquivos.includes("/index.html"));
  assert.ok(
    w.arquivos.some((p) => p.includes("ExecucaoOffline") && p.endsWith(".js")),
  );
  assert.ok(w.arquivos.some((p) => p.endsWith(".woff2")));
  for (const p of w.arquivos) assert.ok(existsSync(pastaBuild + p), p);
});
test("Navegação sem rede recebe o aplicativo previamente guardado", async () => {
  const w = worker();
  assert.equal(
    await w.requisicao("https://patio.example/rascunhos", "GET", "navigate"),
    "aplicativo-em-cache",
  );
});
test("PWA não intercepta Supabase nem respostas privadas da API", async () => {
  const w = worker();
  for (const path of ["/_supabase/rest/v1/clientes", "/_supabase/auth/v1/user", "/_supabase/rest/v1/rpc/gravar"]) {
    for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
      assert.equal(await w.requisicao("https://patio.example" + path, method), "sem-interceptar");
    }
  }
  assert.equal(
    await w.requisicao("https://supabase.example/rest/v1/clientes"),
    "sem-interceptar",
  );
  assert.equal(
    await w.requisicao("https://patio.example/api/clientes"),
    "sem-interceptar",
  );
  assert.equal(
    await w.requisicao("https://patio.example/rascunhos", "POST"),
    "sem-interceptar",
  );
});
test("Ativação preserva a versão anterior e caches de outros aplicativos", async () => {
  const w = worker();
  await w.evento("activate");
  assert.deepEqual(w.removidos, ["patio-static-obsoleto"]);
});
