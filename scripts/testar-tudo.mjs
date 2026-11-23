import { spawn } from "node:child_process";
import { readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Somente suites locais: PGlite em memória, mocks e fixtures fictícias.
// A migração de dados reais tem sua própria validação, dependente de backup.
const opcoes = new Set(process.argv.slice(2));
const atual = !opcoes.has("--historico");
const unidade = !opcoes.has("--banco");
const banco = !opcoes.has("--unidade");
const pasta = resolve(
  process.env.QA_SUITE_OUTPUT || "output/validacao-refatoracao" + (atual ? "-atual" : "-contratos"),
);
await mkdir(pasta, { recursive: true });
const ignorados = new Set([
  "testar-site.mjs",
  "testar-comissoes.mjs",
  "testar-migracao-retifica.mjs",
]);
const suites = [
  ...(unidade
    ? (await readdir("scripts"))
        .filter(
          (f) =>
            /^testar-.*\.mjs$/.test(f) && f !== "testar-tudo.mjs" && !ignorados.has(f),
        )
        .map((f) => `scripts/${f}`)
    : []),
  ...(banco
    ? (await readdir("supabase/tests"))
        .filter((f) => /^validate-.*\.mjs$/.test(f))
        .map((f) => `supabase/tests/${f}`)
    : []),
].sort();
// Estas suítes percorrem dezenas de empresas/tamanhos em navegador real.
// O limite é da suíte inteira, nunca o tempo aceitável de uma ação do usuário.
const suitesNavegador = new Set([
  "scripts/testar-cadastros-adversos-20261118.mjs",
  "scripts/testar-configuracoes-layout.mjs",
  "scripts/testar-formulario-baixa-agil-20261117.mjs",
  "scripts/testar-lembretes-financeiros.mjs",
  "scripts/testar-lembretes-layouts.mjs",
]);
const migracoes = (await readdir("supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();
const ultima = migracoes.at(-1).slice(0, 14);
const ambiente = {
  ...process.env,
  DB_VALIDATION_RUNTIME: resolve("node_modules/@electric-sql/pglite/dist/index.js"),
};
delete ambiente.DB_VALIDATION_MIGRATION_LIMIT;
if (atual) ambiente.DB_VALIDATION_MIGRATION_LIMIT = ultima;

function executar(arquivo) {
  return new Promise((resolveResultado) => {
    const inicio = performance.now();
    const filho = spawn(process.execPath, [arquivo], {
      env: ambiente,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let saida = "",
      expirou = false;
    const prazo = setTimeout(() => {
      expirou = true;
      filho.kill();
    }, suitesNavegador.has(arquivo) ? 1_200_000 : 180_000);
    filho.stdout.on("data", (d) => {
      saida += d;
    });
    filho.stderr.on("data", (d) => {
      saida += d;
    });
    filho.on("error", (e) => {
      saida += e.message;
    });
    filho.on("close", async (codigo) => {
      clearTimeout(prazo);
      const resultado = {
        arquivo,
        sucesso: codigo === 0 && !expirou,
        codigo,
        expirou,
        duracaoMs: Math.round(performance.now() - inicio),
      };
      await writeFile(resolve(pasta, arquivo.replaceAll("/", "_") + ".log"), saida);
      console.log(
        `${resultado.sucesso ? "OK" : "FALHOU"} ${arquivo} (${resultado.duracaoMs} ms)`,
      );
      if (!resultado.sucesso) console.log(saida.slice(-1800));
      resolveResultado(resultado);
    });
  });
}
const resultados = [];
let proxima = 0;
async function trabalhador() {
  while (proxima < suites.length) resultados.push(await executar(suites[proxima++]));
}
// Duas instâncias limitam a memória ocupada pelos bancos WebAssembly.
await Promise.all([trabalhador(), trabalhador()]);
const falhas = resultados.filter((r) => !r.sucesso);
await writeFile(
  resolve(pasta, "resultado.json"),
  JSON.stringify(
    {
      executadoEm: new Date().toISOString(),
      migracoes: atual ? ultima : "contrato de cada suíte",
      observacao:
        "validate-product mantém o cenário histórico de tradução do banco. A migração de backup privado não faz parte desta bateria.",
      resultados: resultados.sort((a, b) => a.arquivo.localeCompare(b.arquivo)),
    },
    null,
    2,
  ),
);
console.log(
  `${resultados.length - falhas.length}/${resultados.length} suites aprovadas. Relatório: ${pasta}`,
);
process.exitCode = falhas.length ? 1 : 0;
