import { codigoConflitoRevisao } from './banco-local.mjs';
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { criarBancoLocal } from "./banco-local.mjs";
import { especialidades, especialidadePadrao } from "../../src/lib/especialidades.ts";
import {
  novaFichaEspecialidade,
  perfisAtendimento,
} from "../../src/lib/perfisAtendimento.ts";
import { perfisServicos } from "../../src/lib/perfisServicos.ts";
const db = await criarBancoLocal("20261014000200");
const valor = async (sql, args = []) =>
  Object.values((await db.query(sql, args)).rows[0])[0];
const user = randomUUID();
try {
  await db.exec(
    `alter table auth.users add column email_confirmed_at timestamptz;insert into auth.users values('${user}',now());select set_config('request.jwt.claim.sub','${user}',false);set role authenticated;`,
  );
  const hoje = await valor(
    "select (now() at time zone 'America/Sao_Paulo')::date::text",
  );
  for (const ramo of ["assistencia_tecnica", "manutencao_campo", "limpeza"]) {
    const w = await valor(
      "select public.configurar_nova_empresa($1,$2,'','{}',$3,$4)",
      [randomUUID(), `Teste ${ramo}`, ramo, especialidadePadrao(ramo)],
    );
    await db.exec(
      `reset role;update public.assinaturas_oficina set codigo_plano='complete' where oficina_id='${w}';set role authenticated;`,
    );
    const c = await valor("select public.salvar_cliente($1,$2)", [
      w,
      { nome: "Cliente fictício" },
    ]);
    const objeto = randomUUID();
    await valor("select public.salvar_objeto_atendimento($1,$2,$3)", [
      w,
      objeto,
      { cliente_id: c.id, nome: "Local / equipamento", dados: {} },
    ]);
    for (const id of Object.keys(perfisServicos).filter(
      (id) => especialidades[id].ramo === ramo,
    )) {
      const ficha = novaFichaEspecialidade(id);
      ficha.campos.prazo_servico = hoje;
      ficha.etapa = perfisAtendimento[id].etapas[1];
      const atendimento = randomUUID();
      const dados = {
        cliente_id: c.id,
        objeto_id: objeto,
        titulo: `Teste ${id}`,
        situacao: "aprovado",
        valor_centavos: 15000,
        vencimento: "2099-12-01",
        dados: { tipo_servico: especialidades[id].tipos.at(-1) },
        ficha_especialidade: ficha,
      };
      const salvar = (d, revisao) =>
        valor("select public.salvar_atendimento_servico($1,$2,$3,$4)", [
          w,
          atendimento,
          d,
          revisao ?? null,
        ]);
      await salvar(dados);
      await salvar(dados);
      let lista = (await valor("select public.consultar_servicos($1)", [w]))
        .atendimentos;
      assert.equal(lista.filter((t) => t.id === atendimento).length, 1);
      assert.deepEqual(
        lista.find((t) => t.id === atendimento).ficha_especialidade,
        ficha,
      );
      let alertas = await valor("select public.consultar_alertas($1)", [w]);
      assert.equal(
        alertas.find((a) => a.id === atendimento)?.data,
        hoje,
        "Alerta usa prazo do serviço, não vencimento",
      );
      await assert.rejects(
        () =>
          salvar(
            {
              ...dados,
              ficha_especialidade: novaFichaEspecialidade(especialidadePadrao(ramo)),
            },
            1,
          ),
        (e) => e.code === "22023",
      );
      await assert.rejects(
        () => salvar({ ...dados, dados: { tipo_servico: "motor" } }, 1),
        (e) => e.code === "22023",
      );
      await assert.rejects(
        () => salvar({ ...dados, ficha_especialidade: null }, 1),
        (e) => e.code === "22023",
      );
      await assert.rejects(() =>
        salvar(
          {
            ...dados,
            ficha_especialidade: { ...ficha, campos: { prazo_servico: "2026-02-30" } },
          },
          1,
        ),
      );
      await assert.rejects(
        () =>
          salvar(
            { ...dados, ficha_especialidade: novaFichaEspecialidade("mecanica") },
            1,
          ),
        (e) => e.code === "22023",
      );
      const atual = {
        ...dados,
        ficha_especialidade: {
          ...ficha,
          campos: { ...ficha.campos, prazo_servico: "" },
        },
      };
      await salvar(atual, 1);
      await assert.rejects(
        () => salvar(atual, 1),
        (e) => e.code === codigoConflitoRevisao,
      );
      alertas = await valor("select public.consultar_alertas($1)", [w]);
      assert.ok(!alertas.some((a) => a.id === atendimento));
      const titulo = await valor("select public.faturar_atendimento_servico($1,$2)", [
        w,
        atendimento,
      ]);
      assert.equal(
        await valor("select public.faturar_atendimento_servico($1,$2)", [
          w,
          atendimento,
        ]),
        titulo,
      );
      console.log(
        `PASS ${id}: perfil por atendimento, tipo, prazo, revisões e cobrança única`,
      );
    }
  }
  await db.exec("reset role");
  assert.equal(
    Number(await valor("select count(*) from public.ordens_servico")),
    0,
    "Nenhuma OS automotiva criada",
  );
  const catalogo = await valor("select private.perfis_atendimento()");
  assert.deepEqual(Object.keys(catalogo).sort(), Object.keys(perfisAtendimento).sort());
  for (const [id, p] of Object.entries(perfisAtendimento)) {
    assert.deepEqual(catalogo[id].etapas, p.etapas);
    assert.deepEqual(
      Object.keys(catalogo[id].campos).sort(),
      p.grupos.flatMap((g) => g.campos.map((c) => c.id)).sort(),
    );
  }
  console.log("PASS catálogos sincronizados e isolamento do automotivo");
} finally {
  await db.close();
}
