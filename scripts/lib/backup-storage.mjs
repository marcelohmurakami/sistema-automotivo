import { readFile, lstat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
export async function verificarBackupStorage(pasta) {
  const raiz = resolve(pasta),
    manifesto = JSON.parse(
      await readFile(join(raiz, "manifesto.json"), "utf8"),
    );
  if (
    manifesto.completo !== true ||
    (manifesto.versao===2 ? !Array.isArray(manifesto.buckets) || manifesto.buckets.some(b=>!b.id||typeof b.id!=="string"||typeof b.public!=="boolean") : manifesto.bucket !== "workshop-files") ||
    !Array.isArray(manifesto.itens)
  )
    throw new Error("Manifesto inválido ou incompleto.");
  const caminhos = new Set(),
    arquivos = new Set();
  for (const item of manifesto.itens) {
    const identidade=(item.bucket||manifesto.bucket)+"/"+item.caminho;
    if (
      (manifesto.versao===2&&!manifesto.buckets.some(b=>b.id===item.bucket)) ||
      typeof item.caminho !== "string" ||
      !item.caminho ||
      item.caminho.includes("\0") ||
      item.caminho.split("/").some((p) => p === "." || p === "..") ||
      !/^[a-f0-9]{64}$/.test(item.arquivo) ||
      !/^[a-f0-9]{64}$/.test(item.sha256) ||
      !Number.isSafeInteger(item.tamanho) ||
      item.tamanho < 0 ||
      caminhos.has(identidade) ||
      arquivos.has(item.arquivo)
    )
      throw new Error("Entrada insegura ou repetida no manifesto.");
    caminhos.add(identidade);
    arquivos.add(item.arquivo);
    const caminho = join(raiz, "objetos", item.arquivo);
    if (
      !(await lstat(join(raiz, "objetos"))).isDirectory() ||
      (await lstat(join(raiz, "objetos"))).isSymbolicLink() ||
      !(await lstat(caminho)).isFile() || (await lstat(caminho)).isSymbolicLink()
    )
      throw new Error("Objeto não é um arquivo regular.");
    const bytes = await readFile(caminho);
    if (
      bytes.length !== item.tamanho ||
      createHash("sha256").update(bytes).digest("hex") !== item.sha256
    )
      throw new Error("Backup corrompido: tamanho ou hash divergente.");
  }
  return manifesto;
}
