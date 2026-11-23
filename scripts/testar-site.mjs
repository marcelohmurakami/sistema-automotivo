import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { readdirSync } from "node:fs";
const ultima = readdirSync("supabase/migrations")
  .filter((f) => /^\d{14}_.*\.sql$/.test(f))
  .sort()
  .at(-1)
  .slice(0, 14);
const env = {
  ...process.env,
  DB_VALIDATION_RUNTIME: resolve("node_modules/@electric-sql/pglite/dist/index.js"),
  DB_VALIDATION_MIGRATION_LIMIT: process.env.DB_VALIDATION_MIGRATION_LIMIT || ultima,
};
for (const args of [
  ["--test", "scripts/testar-retorno-portal.mjs"],
  ["supabase/tests/validate-site-portal.mjs"],
  ["supabase/tests/validate-expansao.mjs"],
  ["supabase/tests/validate-clientes-planos.mjs"],
  ["supabase/tests/validate-produtividade.mjs"],
]) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
