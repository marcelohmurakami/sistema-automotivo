import assert from "node:assert/strict";
import { readFile, readdir, lstat } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";

const raiz = resolve("dist");
const ler = (arquivo) => readFile(resolve(raiz, arquivo), "utf8");
const configuracao = JSON.parse(await readFile("vercel.json", "utf8"));
assert.equal(configuracao.framework, "vite");
assert.equal(configuracao.outputDirectory, "dist");
assert.ok(
  configuracao.rewrites.some(
    (r) => r.source === "/(.*)" && r.destination === "/index.html",
  ),
  "Links diretos da aplicação precisam do fallback SPA na Vercel.",
);

async function conferirArquivo(caminho) {
  const absoluto = resolve(raiz, caminho.replace(/^\//, ""));
  const local = relative(raiz, absoluto);
  assert.ok(local && !local.startsWith(".." + sep) && local !== "..");
  const info = await lstat(absoluto);
  assert.ok(info.isFile() && !info.isSymbolicLink() && info.size > 0, caminho);
}

const html = await ler("index.html");
assert.match(html, /id="root"/);
assert.match(html, /<script[^>]+type="module"/);
assert.doesNotMatch(html, /\/@vite\/client|\/src\/main\./);
for (const [, caminho] of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) {
  await conferirArquivo(caminho);
}

const health = JSON.parse(await ler("health.json"));
assert.equal(health.status, "ok");
assert.ok(health.build && Number.isFinite(Date.parse(health.geradoEm)));
const sw = await ler("sw.js");
const precache = sw.match(/const FILES=(\[[^\n;]+\]);/);
assert.ok(precache, "Manifesto do cache offline ausente.");
const arquivosCache = JSON.parse(precache[1]);
assert.ok(arquivosCache.includes("/index.html"));
for (const caminho of arquivosCache) await conferirArquivo(caminho);
const manifesto = JSON.parse(await ler("manifest.webmanifest"));
for (const icone of manifesto.icons) await conferirArquivo(icone.src);

let quantidade = 0;
for (const arquivo of await readdir(raiz, { recursive: true })) {
  const info = await lstat(resolve(raiz, arquivo));
  assert.ok(!info.isSymbolicLink(), "Build não deve publicar links locais.");
  if (!info.isFile()) continue;
  quantidade++;
  assert.doesNotMatch(
    arquivo.replaceAll("\\", "/"),
    /(^|\/)(?:\.env[^/]*|.*\.local|credenciais[^/]*|backups|output|supabase)(\/|$)|\.(?:dump|pem|key|map|tsx?)$/i,
    "Arquivo privado ou fonte incluído no build.",
  );
  if (!/\.(js|html|css|json|webmanifest)$/.test(arquivo)) continue;
  const conteudo = await ler(arquivo);
  assert.doesNotMatch(conteudo, /\bsb_secret_[A-Za-z0-9_-]+/);
  for (const token of conteudo.matchAll(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g)) {
    let payload;
    try {
      payload = JSON.parse(
        Buffer.from(token[0].split(".")[1], "base64url").toString("utf8"),
      );
    } catch {
      continue;
    }
    assert.notEqual(payload.role, "service_role", "Chave administrativa no build.");
  }
}
console.log(
  `OK: ${quantidade} arquivos de produção; referências e cache offline íntegros; fallback Vercel e ausência de credenciais administrativas verificados.`,
);
