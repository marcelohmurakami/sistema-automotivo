import { spawnSync } from "node:child_process";

const etapas = [
  ["TypeScript estrito", ["node_modules/typescript/bin/tsc", "-b"]],
  ["ESLint", ["node_modules/eslint/bin/eslint.js", "."]],
  ["Formatação", ["node_modules/prettier/bin/prettier.cjs", "--check", "src"]],
  ["Build", ["node_modules/vite/bin/vite.js", "build"]],
  ["Artefatos de produção / Vercel", ["scripts/verificar-build.mjs"]],
  ["Regressão local completa", ["scripts/testar-tudo.mjs"]],
];
for (const [nome, args] of etapas) {
  console.log(`Verificando: ${nome}`);
  const resultado = spawnSync(process.execPath, args, {
    stdio: "inherit",
    windowsHide: true,
  });
  if (resultado.error) throw resultado.error;
  if (resultado.status !== 0) process.exit(resultado.status || 1);
}
console.log("Verificação local concluída.");
