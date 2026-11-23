import { readFile } from "node:fs/promises";
import ts from "typescript";

/** Carrega módulos puros sem dependências de runtime para testes em Node. */
export async function importarTypescript(arquivo) {
  const fonte = await readFile(arquivo, "utf8");
  const js = ts.transpileModule(fonte, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
}
