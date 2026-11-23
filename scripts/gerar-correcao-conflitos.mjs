import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { criarBancoLocal } from "../supabase/tests/banco-local.mjs";

process.env.DB_VALIDATION_RUNTIME ||= resolve(
  "node_modules/@electric-sql/pglite/dist/index.js",
);
process.env.DB_VALIDATION_MIGRATION_LIMIT = "20261019001100";
const db = await criarBancoLocal();
try {
  const { rows } = await db.query(`select p.oid::regprocedure::text as assinatura,
    pg_get_functiondef(p.oid) as definicao
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.prokind='f'
    and p.prosrc like '%40001%' order by n.nspname,p.proname,p.oid`);
  const regex = /errcode\s*=\s*'40001'/gi;
  await writeFile(
    "output/auditoria-pos-refatoracao-20261019/definicoes-locais-antes.json",
    JSON.stringify(rows, null, 2),
  );
  for (const r of rows) {
    if (!r.definicao.match(regex)) throw Error("Código não esperado: " + r.assinatura);
  }
  const sql = `-- Conflitos de revisão são permanentes até o usuário atualizar a tela.
-- 40001 é reservado a falhas de serialização e pode causar repetição infinita
-- no PostgREST. PT409 preserva a mensagem e retorna HTTP 409 imediatamente.
-- Não muda dados, assinaturas, permissões nem os testes de revisão.
begin;
${rows.map((r) => r.definicao.replace(regex, "errcode='PT409'").trimEnd() + ";").join("\n")}
notify pgrst, 'reload schema';
commit;
`;
  await writeFile("supabase/migrations/20261019001200_conflitos_revisao_http.sql", sql);
  await writeFile(
    "output/auditoria-pos-refatoracao-20261019/funcoes-conflito.json",
    JSON.stringify(
      rows.map((r) => r.assinatura),
      null,
      2,
    ),
  );
  const antes = (
    await db.query(`select p.oid::regprocedure::text as assinatura,
    md5(pg_get_functiondef(p.oid)) as hash from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.prokind='f'
    and p.prosrc like '%40001%' order by assinatura`)
  ).rows;
  await db.exec(sql);
  const depois = (
    await db.query(
      `select p.oid::regprocedure::text as assinatura,
    md5(pg_get_functiondef(p.oid)) as hash from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.prokind='f'
    and p.oid::regprocedure::text = any($1::text[]) order by assinatura`,
      [antes.map((r) => r.assinatura)],
    )
  ).rows;
  await writeFile(
    "output/auditoria-pos-refatoracao-20261019/hashes-conflito.json",
    JSON.stringify({ antes, depois }, null, 2),
  );
  console.log(rows.length + " funções: somente código de conflito alterado.");
} finally {
  await db.close();
}
