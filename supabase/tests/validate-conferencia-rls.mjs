import assert from "node:assert/strict";
import { randomUUID as uuid } from "node:crypto";
import { readFile } from "node:fs/promises";
import { criarCenarioSubsistemas } from "./subsistemas-fixture.mjs";

// Comparação com dados idênticos antes/depois, nunca no banco conectado.
process.env.DB_VALIDATION_MIGRATION_LIMIT = "20261111174758";
const { db, login, ids, registros } = await criarCenarioSubsistemas();
const tables = ["titulos_financeiros", "baixas_financeiras", "compras_estoque"];
const one = async (sql, args = []) =>
  Object.values((await db.query(sql, args)).rows[0])[0];
let checks = 0;
try {
  await db.exec("reset role");
  for (const [perfil, r] of Object.entries(registros)) {
    const titulo = await one(
      "insert into public.titulos_financeiros(oficina_id,natureza,categoria,descricao,valor_centavos,competencia,vencimento) values($1,'receber','outras_receitas','QA leitura isolada',1000,current_date,current_date) returning id",
      [r.w],
    );
    await db.query(
      "insert into public.baixas_financeiras(oficina_id,titulo_id,valor_centavos,data,conta,forma,chave,criado_por) values($1,$2,100,current_date,'caixa','dinheiro',$3,$4)",
      [r.w, titulo, uuid(), ids[perfil]],
    );
    const fornecedor = uuid();
    await db.query(
      "insert into public.fornecedores(id,oficina_id,nome) values($1,$2,'Fornecedor QA')",
      [fornecedor, r.w],
    );
    await db.query(
      "insert into public.compras_estoque(id,oficina_id,fornecedor_id,nome_fornecedor,data,total_centavos,criado_por) values($1,$2,$3,'Fornecedor QA',current_date,500,$4)",
      [uuid(), r.w, fornecedor, ids[perfil]],
    );
  }
  async function snapshot() {
    const result = {};
    for (const [perfil, r] of Object.entries(registros)) {
      await login(ids[perfil]);
      result[perfil] = {};
      for (const table of tables) {
        const rows = (
          await db.query(`select id,oficina_id from public.${table} order by id`)
        ).rows;
        assert(rows.length > 0);
        assert(rows.every((x) => x.oficina_id === r.w));
        checks += 2;
        result[perfil][table] = rows;
      }
    }
    await login(ids.stranger);
    for (const table of tables) {
      assert.equal((await db.query(`select id from public.${table}`)).rows.length, 0);
      checks++;
    }
    await login("", "anon");
    for (const table of tables) {
      await assert.rejects(
        () => db.query(`select id from public.${table}`),
        /permission denied/,
      );
      checks++;
    }
    return result;
  }
  const antes = await snapshot();
  await db.exec("reset role");
  const sql = await readFile(
    new URL(
      "../migrations/20261111194135_conferencia_rls_e_indice_clientes.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.exec(sql);
  const depois = await snapshot();
  assert.deepEqual(depois, antes);
  checks++;
  await db.exec("reset role");
  assert(await one("select to_regclass('public.clientes_lista_ativos') is not null"));
  checks++;
  assert.equal(
    await one("select to_regclass('public.clientes_selecao_ativos') is null"),
    true,
  );
  checks++;
  const policies = (
    await db.query(
      "select qual from pg_policies where policyname in ('financeiro_titulos_leitura','financeiro_baixas_leitura','compras_leitura')",
    )
  ).rows;
  assert.equal(policies.length, 3);
  for (const p of policies) {
    assert.match(p.qual, /SELECT auth.uid\(\)/);
    checks++;
  }
  // Reexecução é segura e não recria índices nem altera dados.
  await db.exec(sql);
  assert.deepEqual(await snapshot(), antes);
  checks++;
  console.log(
    JSON.stringify({
      ok: true,
      subsistemas: 26,
      verificacoes: checks,
      escopo:
        "RLS antes/depois; isolamento de empresa; anônimo; estranho; índice; reexecução",
    }),
  );
} finally {
  await db.close();
}
