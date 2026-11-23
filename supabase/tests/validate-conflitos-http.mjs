import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { criarBancoLocal } from "./banco-local.mjs";
import { criarCenarioSubsistemas } from "./subsistemas-fixture.mjs";

const limite = process.env.DB_VALIDATION_MIGRATION_LIMIT;
process.env.DB_VALIDATION_MIGRATION_LIMIT = "20261019001100";
const db = await criarBancoLocal();
const catalogo = () =>
  db.query(`select p.oid::regprocedure::text as assinatura, pg_get_functiondef(p.oid) as definicao,
  p.proacl::text as permissoes,p.proowner,p.prosecdef,p.proconfig
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prokind='f' order by p.oid`);
try {
  const antes = (await catalogo()).rows;
  const sql = await readFile(
    new URL("../migrations/20261019001200_conflitos_revisao_http.sql", import.meta.url),
    "utf8",
  );
  await db.exec(sql);
  const depois = (await catalogo()).rows;
  assert.equal(antes.length, depois.length);
  let alteradas = 0;
  for (let i = 0; i < antes.length; i++) {
    const esperado = {
      ...antes[i],
      definicao: antes[i].definicao.replace(
        /errcode\s*=\s*'40001'/gi,
        "errcode='PT409'",
      ),
    };
    assert.deepEqual(
      depois[i],
      esperado,
      antes[i].assinatura + " preserva corpo, assinatura, privilégios e configuração",
    );
    if (esperado.definicao !== antes[i].definicao) alteradas++;
    assert.doesNotMatch(depois[i].definicao, /errcode\s*=\s*'40001'/i);
  }
  assert.equal(alteradas, 24);
  await db.exec(sql);
  assert.deepEqual((await catalogo()).rows, depois, "reaplicação não muda o resultado");
  console.log(
    "PASS 24 funções: só muda o SQLSTATE de conflito; permissões e restante do código preservados.",
  );
} finally {
  await db.close();
}
process.env.DB_VALIDATION_MIGRATION_LIMIT = "20261019001200";
const c = await criarCenarioSubsistemas({ realista: true });
try {
  for (const [perfil, r] of Object.entries(c.registros)) {
    await c.login(c.ids[perfil]);
    const call = async (fn, ...args) =>
      Object.values(
        (
          await c.db.query(
            `select public.${fn}(${args.map((_, i) => "$" + (i + 1)).join(",")})`,
            args,
          )
        ).rows[0],
      )[0];
    if (r.atendimento) {
      const original = await call("consultar_detalhes_atendimento", r.w, r.atendimento);
      await assert.rejects(
        () =>
          call(
            "salvar_atendimento_servico",
            r.w,
            r.atendimento,
            { ...original.atendimento, titulo: "NÃO DEVE SER SALVO" },
            original.atendimento.revisao - 1,
          ),
        (e) => e.code === "PT409",
      );
      assert.deepEqual(
        await call("consultar_detalhes_atendimento", r.w, r.atendimento),
        original,
      );
    } else {
      const os = await call(
        "salvar_ordem_servico",
        r.w,
        { cliente_id: r.cliente, veiculo_id: r.objeto },
        randomUUID(),
      );
      await assert.rejects(
        () =>
          call(
            "salvar_ordem_servico",
            r.w,
            { queixa_cliente: "NÃO DEVE SER SALVO" },
            randomUUID(),
            os.id,
            os.revisao - 1,
          ),
        (e) => e.code === "PT409",
      );
      assert.deepEqual(await call("consultar_ordem_servico", r.w, os.id), os);
    }
    console.log(
      "PASS " + perfil + ": edição antiga retorna PT409 e não muda nenhum dado.",
    );
  }
} finally {
  await c.db.close();
  if (limite) process.env.DB_VALIDATION_MIGRATION_LIMIT = limite;
  else delete process.env.DB_VALIDATION_MIGRATION_LIMIT;
}
