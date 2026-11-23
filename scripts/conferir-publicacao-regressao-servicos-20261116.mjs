import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const out = "output/regressao-assistencia-manutencao-limpeza-20261116",
  pacote = JSON.parse(await readFile(out + "/pacote.json", "utf8")),
  log = await readFile(out + "/deploy.log", "utf8"),
  d = JSON.parse(log.slice(log.indexOf("{"))).deployment;
assert.equal(d.readyState, "READY");
assert.equal(d.productionUrl, "https://patio-gestao-peach.vercel.app");
const base = d.productionUrl;
const h = await fetch(base + "/health.json?qa=" + Date.now(), {
  cache: "no-store",
}).then((r) => r.json());
assert.equal(h.build, pacote.build);
const arquivos = pacote.arquivos.filter(
  (x) => !x.arquivo.startsWith(".vercel/") && x.arquivo !== "vercel.json",
);
for (let i = 0; i < arquivos.length; i += 5)
  await Promise.all(
    arquivos.slice(i, i + 5).map(async (x) => {
      const r = await fetch(base + "/" + x.arquivo, {
        cache: "no-store",
        signal: AbortSignal.timeout(30000),
      });
      assert.equal(r.status, 200, x.arquivo);
      const sha = createHash("sha256")
        .update(Buffer.from(await r.arrayBuffer()))
        .digest("hex");
      assert.equal(sha, x.sha256, x.arquivo);
    }),
  );
const res = {
  publicado: true,
  geradoEm: new Date().toISOString(),
  url: base,
  build: h.build,
  deployment: d.id,
  arquivosConferidos: arquivos.length,
  migracao: null,
};
await writeFile(out + "/publicacao.json", JSON.stringify(res, null, 2));
console.log(JSON.stringify(res));


