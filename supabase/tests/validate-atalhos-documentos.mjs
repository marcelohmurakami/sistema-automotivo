import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { criarCenarioSubsistemas } from "./subsistemas-fixture.mjs";
import { especialidades } from "../../src/lib/especialidades.ts";
const { db, ids, registros, login } = await criarCenarioSubsistemas();
const one = async (sql, args = []) =>
  Object.values((await db.query(sql, args)).rows[0])[0];
const call = (fn, args) =>
  one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")})`, args);
let checks = 0;
try {
  for (const [perfil, r] of Object.entries(registros)) {
    await login(ids[perfil]);
    const tipos = especialidades[perfil].tipos;
    if (r.proposta) {
      const p = r.proposta;
      const q = await call("editar_identificacao_orcamento", [
        r.w,
        p.id,
        p.revisao,
        "entrega",
        "2026-12-10T17:30:00-03:00",
      ]);
      assert.equal(
        Date.parse(q.versao.entrega_prevista_em),
        Date.parse("2026-12-10T20:30:00Z"),
      );
      assert.equal(q.versao.total_centavos, p.versao.total_centavos);
      assert.deepEqual(q.itens, p.itens);
      checks += 3;
      await assert.rejects(
        () =>
          call("editar_identificacao_orcamento", [
            r.w,
            p.id,
            p.revisao,
            "tipo",
            tipos[0],
          ]),
        /mudou/,
      );
      checks++;
      const i = await call("editar_identificacao_orcamento", [
        r.w,
        q.id,
        q.revisao,
        "tipo",
        tipos[1] || "",
      ]);
      assert.equal(i.versao.tipo_servico, tipos[1] || null);
      checks++;
      const lista = await call("listar_orcamentos_gestao", [r.w, "", "", 0, false]);
      const linha = lista.itens.find((x) => x.id === q.id);
      assert.equal(linha.tipo_servico, i.versao.tipo_servico);
      assert.equal(linha.entrega_prevista_em, i.versao.entrega_prevista_em);
      checks += 2;
      const emitido = await call("emitir_orcamento", [
        r.w,
        i.id,
        i.revisao,
        7,
        randomUUID().replaceAll("-", "").repeat(2),
      ]);
      const revisado = await call("editar_identificacao_orcamento", [
        r.w,
        i.id,
        emitido.revisao,
        "tipo",
        tipos[0],
      ]);
      assert.equal(revisado.situacao, "draft");
      assert.notEqual(revisado.versao.id, emitido.versao.id);
      assert.equal(revisado.versao.entrega_prevista_em, i.versao.entrega_prevista_em);
      const antigo = await call("consultar_orcamento", [r.w, i.id, emitido.versao.id]);
      assert.equal(antigo.versao.tipo_servico, i.versao.tipo_servico);
      checks += 4;
      const osId = await call("criar_os_aguardando_orcamento", [r.w, revisado.id]);
      const os = await call("consultar_ordem_servico", [r.w, osId]);
      assert.equal(os.entrega_prevista_em, revisado.versao.entrega_prevista_em);
      checks++;
      await login(ids.stranger);
      await assert.rejects(() =>
        call("editar_identificacao_orcamento", [
          r.w,
          q.id,
          revisado.revisao,
          "tipo",
          "",
        ]),
      );
      checks++;
    } else {
      const d = await call("consultar_detalhes_atendimento", [r.w, r.atendimento]);
      const a = d.atendimento;
      await call("salvar_atendimento_servico", [
        r.w,
        a.id,
        {
          ...a,
          dados: {
            ...a.dados,
            tipo_servico: tipos[1] || tipos[0],
            entrega_prevista_em: "2026-12-10T20:30:00.000Z",
          },
          ficha_especialidade: {
            ...a.ficha_especialidade,
            campos: { ...a.ficha_especialidade.campos, prazo_servico: "2026-12-10" },
          },
        },
        a.revisao,
      ]);
      const novo = await call("consultar_detalhes_atendimento", [r.w, a.id]);
      assert.equal(
        novo.atendimento.dados.entrega_prevista_em,
        "2026-12-10T20:30:00.000Z",
      );
      assert.equal(novo.atendimento.dados.tipo_servico, tipos[1] || tipos[0]);
      assert.equal(novo.atendimento.valor_centavos, a.valor_centavos);
      assert.equal(novo.atendimento.vencimento, a.vencimento);
      assert.deepEqual(novo.itens, d.itens);
      checks += 5;
      await assert.rejects(
        () => call("salvar_atendimento_servico", [r.w, a.id, a, a.revisao]),
        /alterado|mudou/i,
      );
      checks++;
    }
    console.log(`PASS ${perfil}`);
  }
  await login("", "anon");
  await assert.rejects(() =>
    call("editar_identificacao_orcamento", [
      registros.mecanica.w,
      registros.mecanica.proposta.id,
      1,
      "tipo",
      "",
    ]),
  );
  checks++;
  console.log(
    `PASS ${checks} verificações nos 26 subsistemas: persistência, fuso, valores e itens preservados, versionamento, conversão e acesso.`,
  );
} finally {
  await db.close();
}
