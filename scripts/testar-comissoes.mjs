import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const teste = spawnSync(
  process.execPath,
  ["supabase/tests/validate-comissoes.mjs"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      DB_VALIDATION_RUNTIME:
        process.env.DB_VALIDATION_RUNTIME ||
        resolve("node_modules/@electric-sql/pglite/dist/index.js"),
    },
  },
);
process.exitCode = teste.status ?? 1;
