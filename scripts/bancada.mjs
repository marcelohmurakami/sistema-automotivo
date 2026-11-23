// Ponto de entrada da bancada: usa a mesma verificação completa do CI local.
// As suítes são descobertas automaticamente, incluindo novas regressões.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const pasta = resolve("output/bancada-completa");
mkdirSync(pasta, { recursive: true });
const inicio = performance.now();
const r = spawnSync(process.execPath, ["scripts/verificar-projeto.mjs"], {
  encoding: "utf8",
  windowsHide: true,
  maxBuffer: 30 * 1024 * 1024,
});
const log = (r.stdout || "") + (r.stderr || "") + (r.error ? String(r.error) : "");
process.stdout.write(log);
writeFileSync(resolve(pasta, "execucao.log"), log);
const sucesso = r.status === 0 && !r.error;
const resultado = {
  executadoEm: new Date().toISOString(),
  ambiente: "local isolado; banco em memória; sem cobranças ou mensagens externas",
  sucesso,
  codigo: r.status,
  duracaoMs: Math.round(performance.now() - inicio),
  verificacoes: [
    "TypeScript",
    "ESLint",
    "Formatação",
    "Build",
    "Todas as suítes locais",
  ],
  suites: sucesso
    ? JSON.parse(
        readFileSync("output/validacao-refatoracao-atual/resultado.json", "utf8"),
      ).resultados
    : null,
};
writeFileSync(resolve(pasta, "resultado.json"), JSON.stringify(resultado, null, 2));
console.log(`Resultado da bancada: ${pasta}`);
process.exitCode = sucesso ? 0 : 1;
