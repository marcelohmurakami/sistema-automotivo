import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { criarBancoLocal } from "./banco-local.mjs";
import { especialidades } from "../../src/lib/especialidades.ts";
import {
  perfisAtendimento,
  novaFichaEspecialidade,
} from "../../src/lib/perfisAtendimento.ts";
const db = await criarBancoLocal("20261014000200");
const scalar = async (s, a = []) => Object.values((await db.query(s, a)).rows[0])[0];
const user = randomUUID(),
  outro = randomUUID();
const login = (id) =>
  db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${id}',false);set role authenticated;`,
  );
try {
  await db.exec(
    `alter table auth.users add column email_confirmed_at timestamptz;insert into auth.users values('${user}',now()),('${outro}',now());`,
  );
  await login(user);
  for (const [id, e] of Object.entries(especialidades)) {
    const w = await scalar("select public.configurar_nova_empresa($1,$2,$3,$4,$5,$6)", [
      randomUUID(),
      `Teste ${id}`,
      "",
      {},
      e.ramo,
      id,
    ]);
    await db.exec(
      `reset role;update public.assinaturas_oficina set codigo_plano='complete' where oficina_id='${w}';set role authenticated;`,
    );
    const p = perfisAtendimento[id],
      ficha = novaFichaEspecialidade(id);
    for (const c of p.grupos.flatMap((g) => g.campos))
      ficha.campos[c.id] =
        c.tipo === "data"
          ? "2028-02-29"
          : c.tipo === "numero"
            ? c.passo === 1 ? "4" : "4.125"
            : c.opcoes?.[0] || "Medição técnica";
    ficha.checklist[p.checklist[0]] = true;
    const cliente = await scalar("select public.salvar_cliente($1,$2)", [
      w,
      { nome: "Cliente fictício" },
    ]);
    if (e.ramo === "automotivo") {
      const v = await scalar(
        "select public.cadastrar_veiculo_orcamento($1,$2,$3,null)",
        [w, cliente.id, "Veículo de teste"],
      );
      const dados = {
        cliente_id: cliente.id,
        veiculo_id: v,
        tipo_servico: e.tipos[0],
        ficha_especialidade: ficha,
        itens: [
          {
            id: randomUUID(),
            situacao: "pending",
            tipo: "service",
            descricao: "Serviço de teste",
            unidade: "serv",
            quantidade: 1,
            preco_unitario_centavos: 10000,
          },
        ],
        desconto_centavos: 0,
        observacoes: "Texto público",
        condicoes: "Condições",
      };
      let os = await scalar("select public.salvar_os_com_itens($1,$2,$3)", [
        w,
        dados,
        randomUUID(),
      ]);
      assert.deepEqual(os.ficha_especialidade, ficha);
      const idem = randomUUID();
      const veiculoOrcamento = await scalar(
        "select public.cadastrar_veiculo_orcamento($1,$2,$3,null)",
        [w, cliente.id, "Segundo veículo"],
      );
      const dadosOrcamento = { ...dados, veiculo_id: veiculoOrcamento };
      let q = await scalar("select public.salvar_orcamento($1,$2,$3)", [
        w,
        dadosOrcamento,
        idem,
      ]);
      assert.deepEqual(q.versao.ficha_especialidade, ficha);
      assert.equal(
        (
          await scalar("select public.salvar_orcamento($1,$2,$3)", [
            w,
            dadosOrcamento,
            idem,
          ])
        ).id,
        q.id,
      );
      const token = randomUUID().replaceAll("-", "").repeat(2);
      await scalar("select public.emitir_orcamento($1,$2,$3,7,$4)", [
        w,
        q.id,
        q.revisao,
        createHash("sha256").update(token).digest("hex"),
      ]);
      const publica = await scalar("select public.consultar_orcamento_publico($1)", [
        token,
      ]);
      assert.equal(
        publica.versao.ficha_especialidade,
        undefined,
        "Ficha interna não pode vazar no orçamento público",
      );
      q = await scalar("select public.consultar_orcamento($1,$2)", [w, q.id]);
      q = await scalar("select public.revisar_orcamento($1,$2,$3)", [
        w,
        q.id,
        q.revisao,
      ]);
      assert.deepEqual(q.versao.ficha_especialidade, ficha, "Revisão preserva ficha");
      await scalar("select public.emitir_orcamento($1,$2,$3,7,$4)", [
        w,
        q.id,
        q.revisao,
        createHash("sha256")
          .update(token + "2")
          .digest("hex"),
      ]);
      q = await scalar("select public.consultar_orcamento($1,$2)", [w, q.id]);
      await scalar("select public.aprovar_orcamento_interno($1,$2,$3,$4)", [
        w,
        q.id,
        q.revisao,
        q.versao.id,
      ]);
      const convertido = await scalar(
        "select public.converter_orcamento_em_os($1,$2)",
        [w, q.id],
      );
      assert.notEqual(convertido, os.id);
      assert.deepEqual(
        (await scalar("select public.consultar_ordem_servico($1,$2)", [w, convertido]))
          .ficha_especialidade,
        ficha,
      );
      os = await scalar("select public.salvar_ordem_servico($1,$2,$3,$4,$5)", [
        w,
        { diagnostico: "Atualização parcial" },
        randomUUID(),
        os.id,
        os.revisao,
      ]);
      assert.deepEqual(
        os.ficha_especialidade,
        ficha,
        "Salvar outros dados não apaga ficha",
      );
      await scalar("select public.modelo_etapas_especialidade($1,$2)", [w, os.id]);
      await scalar("select public.modelo_etapas_especialidade($1,$2)", [w, os.id]);
      assert.deepEqual(
        (
          await scalar("select public.consultar_etapas_execucao($1,$2)", [w, os.id])
        ).map((x) => x.nome),
        p.etapas,
      );
      assert.ok(
        (
          await scalar(
            "select public.consultar_relatorios_gestao($1,'2026-10-01','2026-10-31')",
            [w],
          )
        ).ordens.some(
          (o) => o.id === os.id && o.ficha_especialidade.especialidade === id,
        ),
      );
      os = await scalar("select public.consultar_ordem_servico($1,$2)", [w, os.id]);
      for (const invalida of [
        { ...ficha, campos: { invasor: "x" } },
        { ...ficha, versao: 2 },
        { ...ficha, checklist: { [p.checklist[0]]: "true" } },
        { ...ficha, etapa: "Inexistente" },
        { ...ficha, campos: { [p.grupos[0].campos[0].id]: "x".repeat(1501) } },
      ]) {
        await assert.rejects(
          () =>
            scalar("select public.salvar_ordem_servico($1,$2,$3,$4,$5)", [
              w,
              { ficha_especialidade: invalida },
              randomUUID(),
              os.id,
              os.revisao,
            ]),
          (err) => err.code === "22023",
        );
      }
      await login(outro);
      await assert.rejects(() =>
        scalar("select public.consultar_ordem_servico($1,$2)", [w, os.id]),
      );
      await assert.rejects(() =>
        scalar("select public.modelo_etapas_especialidade($1,$2)", [w, os.id]),
      );
      await login(user);
      if (id === "mecanica") {
        await scalar("select public.salvar_especialidade_empresa($1,'autoeletrica')", [
          w,
        ]);
        os = await scalar("select public.salvar_ordem_servico($1,$2,$3,$4,$5)", [
          w,
          {
            ficha_especialidade: {
              ...ficha,
              campos: { ...ficha.campos, reparo: "Histórico preservado" },
            },
          },
          randomUUID(),
          os.id,
          os.revisao,
        ]);
        assert.equal(os.ficha_especialidade.especialidade, "mecanica");
        const outroVeiculo = await scalar(
          "select public.cadastrar_veiculo_orcamento($1,$2,$3,null)",
          [w, cliente.id, "Terceiro veículo"],
        );
        await assert.rejects(
          () =>
            scalar("select public.salvar_ordem_servico($1,$2,$3)", [
              w,
              { ...dados, veiculo_id: outroVeiculo, tipo_servico: null },
              randomUUID(),
            ]),
          (err) => err.code === "22023",
        );
      }
    } else {
      const objeto = randomUUID(),
        atendimento = randomUUID();
      await scalar("select public.salvar_objeto_atendimento($1,$2,$3)", [
        w,
        objeto,
        { cliente_id: cliente.id, nome: "Equipamento / local fictício", dados: {} },
      ]);
      ficha.etapa = p.etapas[1];
      const dados = {
        cliente_id: cliente.id,
        objeto_id: objeto,
        titulo: "Atendimento de teste",
        situacao: "aprovado",
        valor_centavos: 12000,
        vencimento: "2026-10-20",
        dados: { tipo_servico: e.tipos[0] },
        ficha_especialidade: ficha,
      };
      await scalar("select public.salvar_atendimento_servico($1,$2,$3)", [
        w,
        atendimento,
        dados,
      ]);
      let t = (
        await scalar("select public.consultar_servicos($1)", [w])
      ).atendimentos.find((x) => x.id === atendimento);
      assert.deepEqual(t.ficha_especialidade, ficha);
      const semFicha = { ...dados };
      delete semFicha.ficha_especialidade;
      await scalar("select public.salvar_atendimento_servico($1,$2,$3,$4)", [
        w,
        atendimento,
        semFicha,
        t.revisao,
      ]);
      t = (await scalar("select public.consultar_servicos($1)", [w])).atendimentos.find(
        (x) => x.id === atendimento,
      );
      assert.deepEqual(t.ficha_especialidade, ficha);
      await assert.rejects(
        () =>
          scalar("select public.salvar_atendimento_servico($1,$2,$3,$4)", [
            w,
            atendimento,
            { ...dados, ficha_especialidade: novaFichaEspecialidade("mecanica") },
            t.revisao,
          ]),
        (err) => err.code === "22023",
      );
      await login(outro);
      await assert.rejects(() => scalar("select public.consultar_servicos($1)", [w]));
      await login(user);
    }
    console.log(`PASS ${id}: persistência, validação e isolamento`);
  }
} finally {
  await db.close();
}
