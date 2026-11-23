import { spawn } from "node:child_process";
import { readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const out = resolve("output/os-velocidade-20261116/regressao");
await mkdir(out, { recursive: true });
const ultima = (await readdir("supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .at(-1)
  .slice(0, 14);
const env = {
  ...process.env,
  DB_VALIDATION_RUNTIME: resolve("node_modules/@electric-sql/pglite/dist/index.js"),
  DB_VALIDATION_MIGRATION_LIMIT: ultima,
  QA_OUTPUT: resolve(out, "pagamento"),
};
const suites = [
    "scripts/testar-os-agilidade.mjs",
    "scripts/testar-processos-agilidade.mjs",
    "scripts/testar-busca-orcamentos.mjs",
    "scripts/testar-desconto.mjs",
    "scripts/testar-resumo-os.mjs",
    ...[
      "validate-ordens-servico",
      "validate-os-gestao",
      "validate-os-itens",
      "validate-os-pronta",
      "validate-cliente-avulso",
      "validate-data-servico-os",
      "validate-custos-itens-lucro",
      "validate-desconto-nota",
      "validate-pagamento-parcial",
      "validate-vinculo-estoque-catalogo",
      "validate-mapa-acoes",
    ].map((n) => "supabase/tests/" + n + ".mjs"),
  ],
  resultados = [];
for (const arquivo of suites) {
  const inicio = performance.now();
  let log = "";
  const code = await new Promise((ok) => {
    const p = spawn(process.execPath, [arquivo], { env, windowsHide: true });
    p.stdout.on("data", (b) => (log += b));
    p.stderr.on("data", (b) => (log += b));
    p.on("exit", ok);
    p.on("error", (e) => {
      log += e.stack;
      ok(1);
    });
  });
  const nome = arquivo.split("/").at(-1) + ".log";
  await writeFile(resolve(out, nome), log);
  resultados.push({
    arquivo,
    ok: code === 0,
    segundos: +((performance.now() - inicio) / 1000).toFixed(3),
    log: nome,
  });
  console.log(code === 0 ? "PASS" : "FAIL", arquivo);
  await writeFile(
    resolve(out, "resultados.json"),
    JSON.stringify(
      { ok: resultados.every((x) => x.ok), migracao: ultima, resultados },
      null,
      2,
    ),
  );
}
if (resultados.some((x) => !x.ok)) process.exitCode = 1;
