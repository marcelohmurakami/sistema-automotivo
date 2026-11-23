import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { verificarBackupStorage } from "./lib/backup-storage.mjs";
await mkdir("tmp", { recursive: true });
const pasta = await mkdtemp("tmp/backup-teste-");
await mkdir(join(pasta, "objetos"));
const bytes = Buffer.from("foto ficticia para verificar integridade");
const hash = createHash("sha256").update(bytes).digest("hex");
const item = {
  caminho: "oficina/fotos/antes.jpg",
  arquivo: hash,
  sha256: hash,
  tamanho: bytes.length,
  tipo: "image/jpeg",
};
const original = {
  completo: true,
  projeto: "hzihxtjirttetnfdujcx",
  bucket: "workshop-files",
  itens: [item],
};
const salvar = (m) =>
  writeFile(join(pasta, "manifesto.json"), JSON.stringify(m));
await writeFile(join(pasta, "objetos", hash), bytes);
await salvar(original);
assert.equal((await verificarBackupStorage(pasta)).itens.length, 1);
for (const m of [
  { ...original, completo: false },
  { ...original, itens: [item, item] },
  { ...original, itens: [{ ...item, caminho: "../fora" }] },
  { ...original, itens: [{ ...item, arquivo: "../../fora" }] },
  { ...original, itens: [{ ...item, tamanho: bytes.length + 1 }] },
  { ...original, itens: [{ ...item, sha256: "a".repeat(64) }] },
]) {
  await salvar(m);
  await assert.rejects(verificarBackupStorage(pasta));
}
await salvar(original);
await writeFile(join(pasta, "objetos", hash), Buffer.alloc(bytes.length));
await assert.rejects(verificarBackupStorage(pasta));
const bloqueio = spawnSync(
  process.execPath,
  [
    "scripts/restaurar-storage.mjs",
    pasta,
    original.projeto,
    "--confirmar-copia-isolada",
  ],
  { encoding: "utf8" },
);
assert.notEqual(bloqueio.status, 0);
assert.match(bloqueio.stderr, /projeto automotivo é bloqueado/);
console.log(
  "9 verificações de backup passaram (integridade, manifesto, caminhos e destino isolado). Nenhuma chamada remota.",
);
