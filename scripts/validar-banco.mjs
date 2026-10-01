import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const runtime = process.env.DB_VALIDATION_RUNTIME || join(tmpdir(), 'sistema-automotivo-db-validation/node_modules/@electric-sql/pglite/dist/index.js');
if (!existsSync(runtime)) throw new Error('Defina DB_VALIDATION_RUNTIME com o caminho do PGlite para executar o banco isolado de testes.');
const suites=['clientes-planos','orcamentos','ordens-servico','estoque','financeiro','compras','gestao','catalogo','mapa-banco','equipe','expansao','cobranca'];
for (const suite of suites) {
  const resultado=spawnSync(process.execPath,[`supabase/tests/validate-${suite}.mjs`],{
    stdio:'inherit',env:{...process.env,DB_VALIDATION_RUNTIME:runtime,DB_VALIDATION_MIGRATION_LIMIT:'20261001000600'}
  });
  if(resultado.status!==0) process.exit(resultado.status||1);
}
console.log('Todas as suites passaram no banco local isolado.');
