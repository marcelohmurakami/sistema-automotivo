import assert from "node:assert/strict";
import { randomUUID as uuid } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { criarCenarioSubsistemas } from "./subsistemas-fixture.mjs";
process.env.DB_VALIDATION_MIGRATION_LIMIT ||= "20261027000100";
const { db, registros, login, ids } = await criarCenarioSubsistemas();
const call = async (fn, args) =>
  Object.values(
    (
      await db.query(
        `select public.${fn}(${args.map((_, i) => "$" + (i + 1)).join(",")})`,
        args,
      )
    ).rows[0],
  )[0];
const resultados = [];
try {
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='private.cotas_trajeto'::regclass")).rows[0].relrowsecurity, true);
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await db.query("select has_table_privilege($1,'private.cotas_trajeto','select,insert,update,delete') as acesso", [role])).rows[0].acesso, false);
  }
  for (const [perfil, r] of Object.entries(registros)) {
    await login(ids[perfil]);
    const auto = !!r.proposta,
      recurso = auto ? "Equipe externa QA" : uuid();
    if (!auto)
      await call("salvar_recurso_agenda", [r.w, recurso, "Equipe externa QA", true]);
    const base = {
      cliente_id: r.cliente,
      veiculo_id: null,
      identificacao: "Objeto QA",
      servico: "Visita QA",
      atendimento_id: r.atendimento,
      recurso_id: recurso,
      recurso,
      inicio: "2026-11-10T10:00:00-03:00",
      fim: "2026-11-10T11:00:00-03:00",
      situacao: "agendado",
      visita: true,
      deslocamento_minutos: 30,
      logistica: {
        origem: "Rua A, 100, Campinas, SP",
        destino: "Rua B, 200, Campinas, SP",
        margem_minutos: 10,
        retorno_minutos: 25,
        distancia_metros: 9000,
        retorno_metros: 10000,
        fonte: "openrouteservice",
        calculado_em: "2026-10-27T12:00:00Z",
      },
    };
    const save = (id, dados, revisao) =>
      auto
        ? call("operar_produtividade", [
            r.w,
            "salvar_agenda",
            { ...dados, id, revisao },
          ])
        : call("salvar_agenda_servico", [r.w, id, dados, revisao ?? null]);
    const read = async (id) => {
      await db.exec("reset role");
      const a = (
        await db.query(
          `select * from public.${auto ? "agenda_atendimentos" : "agenda_servicos"} where id=$1`,
          [id],
        )
      ).rows[0];
      await login(ids[perfil]);
      return a;
    };
    const id = uuid();
    await save(id, base);
    let row = await read(id);
    assert.equal(row.logistica.retorno_minutos, 25);
    assert.equal(row.logistica.destino, base.logistica.destino);
    assert.equal(row.deslocamento_minutos, 30);
    const sobrepor = (inicio, fim) =>
      assert.rejects(
        () =>
          save(uuid(), {
            ...base,
            visita: false,
            inicio: `2026-11-10T${inicio}:00-03:00`,
            fim: `2026-11-10T${fim}:00-03:00`,
          }),
        (e) => e.code === "23P01",
      );
    await sobrepor("09:00", "09:21"); // Margem começa 09:20.
    await sobrepor("11:15", "11:40"); // Retorno termina 11:25.
    await save(uuid(), {
      ...base,
      visita: false,
      inicio: "2026-11-10T09:00:00-03:00",
      fim: "2026-11-10T09:20:00-03:00",
    });
    await save(uuid(), {
      ...base,
      visita: false,
      inicio: "2026-11-10T11:25:00-03:00",
      fim: "2026-11-10T12:00:00-03:00",
    });
    await assert.rejects(
      () => save(uuid(), { ...base, inicio: "2026-11-11T10:00:00-03:00", fim: null }),
      (e) => ["22023", "23502"].includes(e.code),
    );
    for (const valor of [-1, 1.5, 721])
      await assert.rejects(
        () =>
          save(uuid(), {
            ...base,
            inicio: "2026-11-11T10:00:00-03:00",
            fim: "2026-11-11T11:00:00-03:00",
            logistica: { ...base.logistica, retorno_minutos: valor },
          }),
        (e) => e.code === "22023",
      );
    await assert.rejects(
      () =>
        save(id, { ...base, logistica: { ...base.logistica, margem_minutos: 20 } }, 1),
      (e) => e.code === "23P01",
    );
    assert.equal((await read(id)).revisao, 1, "Conflito não altera o registro");
    await save(id, { ...base, logistica: { ...base.logistica, margem_minutos: 5 } }, 1);
    await assert.rejects(
      () => save(id, base, 1),
      (e) => e.code === "PT409",
    );
    await login(ids.stranger);
    await assert.rejects(
      () => save(uuid(), base),
      (e) => e.code === "42501",
    );
    await assert.rejects(
      () => call("autorizar_calculo_trajeto", [r.w]),
      (e) => e.code === "42501",
    );
    await login(ids[perfil]);
    if (auto)
      await call("operar_produtividade", [r.w, "cancelar_agenda", { id, revisao: 2 }]);
    else await save(id, { ...base, situacao: "cancelado" }, 2);
    await save(uuid(), { ...base, visita: false });
    const next = uuid();
    await save(next, {
      ...base,
      inicio: "2026-11-12T23:30:00-03:00",
      fim: "2026-11-12T23:50:00-03:00",
    });
    if (!auto) {
      const pagina = await call("pagina_servicos", [
        r.w,
        { tela: "agenda", inicio: "2026-11-13", fim: "2026-11-14" },
      ]);
      assert.ok(
        pagina.agenda.some((x) => x.id === next),
        "Retorno que cruza meia-noite aparece na agenda seguinte",
      );
      const serie = uuid();
      await call("agendar_serie_servico", [
        r.w,
        serie,
        {
          ...base,
          inicio: "2026-12-01T10:00:00-03:00",
          fim: "2026-12-01T11:00:00-03:00",
        },
        2,
        7,
      ]);
      const pg = await call("pagina_servicos", [
        r.w,
        { tela: "agenda", inicio: "2026-12-01", fim: "2026-12-10" },
      ]);
      assert.equal(
        pg.agenda.filter((x) => x.logistica?.retorno_minutos === 25).length,
        2,
        "Recorrência preserva logística",
      );
      if (perfil.startsWith("limpeza_")) {
        const detalhe = await call("consultar_detalhes_atendimento", [
          r.w,
          r.atendimento,
        ]);
        await call("programar_visitas_limpeza", [
          r.w,
          uuid(),
          {
            ...base,
            nova_situacao: "orcamento",
            inicio: "2027-01-05T10:00:00-03:00",
            fim: "2027-01-05T11:00:00-03:00",
          },
          2,
          7,
          detalhe.atendimento.revisao,
        ]);
        const independentes = await call("pagina_servicos", [
          r.w,
          { tela: "agenda", inicio: "2027-01-05", fim: "2027-01-14" },
        ]);
        assert.equal(independentes.agenda.length, 2);
        assert.ok(
          independentes.agenda.every(
            (x) =>
              x.logistica?.destino === base.logistica.destino &&
              x.logistica?.retorno_minutos === 25,
          ),
        );
        assert.equal(
          new Set(independentes.agenda.map((x) => x.atendimento_id)).size,
          2,
          "Visitas de limpeza independentes preservam a logística sem juntar os atendimentos",
        );
      }
    }
    resultados.push({ perfil, passou: true });
  }
  const r = Object.values(registros)[0];
  await login(ids[Object.keys(registros)[0]]);
  for (let i = 0; i < 15; i++) await call("autorizar_calculo_trajeto", [r.w]);
  await assert.rejects(
    () => call("autorizar_calculo_trajeto", [r.w]),
    (e) => e.code === "22023",
  );
  await login("", "anon");
  await assert.rejects(
    () => call("autorizar_calculo_trajeto", [r.w]),
    (e) => e.code === "42501",
  );
  await mkdir("output/logistica-visitas-20261027", { recursive: true });
  await writeFile(
    "output/logistica-visitas-20261027/banco.json",
    JSON.stringify(
      {
        data: new Date().toISOString(),
        resultados,
        controle_acesso: true,
        limite_consultas: true,
      },
      null,
      2,
    ),
  );
  console.log(
    `Logística validada nos ${resultados.length} subsetores: ida, margem, retorno, conflito, cancelamento, revisão, isolamento e recorrência.`,
  );
} finally {
  await db.close();
}
