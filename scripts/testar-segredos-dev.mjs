import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "vite";

test("servidor de desenvolvimento bloqueia artefatos privados por URL e /@fs", async () => {
  const pasta = resolve("output", "protecao-dev-" + randomUUID());
  await mkdir(pasta, { recursive: true });
  const arquivo = resolve(pasta, "credenciais.local.json");
  await writeFile(arquivo, '{"exemplo":"sem credenciais reais"}');
  let servidor;
  try {
    servidor = await createServer({
      logLevel: "silent",
      // Uma configuração de teste diferente invalida o cache do Vite. Nunca use
      // a pasta do servidor aberto pelo usuário; ela é removida na reotimização.
      cacheDir: resolve(pasta, "vite-cache"),
      server: { host: "127.0.0.1", port: 0, strictPort: true, open: false },
    });
    await servidor.listen();
    const endereco = servidor.httpServer.address();
    const base = `http://127.0.0.1:${endereco.port}`;
    assert.equal((await fetch(base + "/")).status, 200);
    for (const caminho of [
      "/output/" + pasta.split(/[\\/]/).at(-1) + "/credenciais.local.json",
      "/@fs/" + arquivo.replaceAll("\\", "/"),
      "/.env.local",
    ])
      assert.equal(
        (await fetch(base + caminho)).status,
        403,
        "Arquivo privado acessível: " + caminho,
      );
  } finally {
    await servidor?.close();
    // Remove apenas a pasta efêmera criada por este teste dentro de output/.
    assert.equal(dirname(pasta), resolve("output"));
    await rm(pasta, { recursive: true, force: true });
  }
});
