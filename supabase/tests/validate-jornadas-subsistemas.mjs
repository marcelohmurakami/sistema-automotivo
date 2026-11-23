import { codigoConflitoRevisao } from './banco-local.mjs';
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { criarCenarioSubsistemas } from "./subsistemas-fixture.mjs";
import { especialidades } from "../../src/lib/especialidades.ts";
import { concluirReparo, registrarRetirada } from "../../src/lib/assistenciaTecnica.ts";

const c = await criarCenarioSubsistemas();
const call = async (fn, args) =>
  Object.values(
    (
      await c.db.query(
        `select public.${fn}(${args.map((_, i) => "$" + (i + 1)).join(",")})`,
        args,
      )
    ).rows[0],
  )[0];
try {
  for (const [perfil, e] of Object.entries(especialidades)) {
    const { w, atendimento, proposta, produto, hoje, recurso } = c.registros[perfil];
    await c.login(c.ids[perfil]);
    const stock = async () =>
      Number(
        (await call("listar_estoque", [w])).itens.find((x) => x.id === produto).saldo,
      );
    let titulo, get;
    if (e.ramo === "automotivo") {
      const token = randomUUID().replaceAll("-", "").repeat(2);
      await call("emitir_orcamento", [
        w,
        proposta.id,
        proposta.revisao,
        7,
        createHash("sha256").update(token).digest("hex"),
      ]);
      await c.login("", "anon");
      const publico = await call("consultar_orcamento_publico", [token]);
      assert.equal(publico.versao.total_centavos, 10000);
      assert.ok(!JSON.stringify(publico).includes("custo_centavos"));
      await call("responder_orcamento", [token, "Cliente QA", "approved", true]);
      await c.login(c.ids[perfil]);
      const id = await call("converter_orcamento_em_os", [w, proposta.id]);
      assert.equal(await call("converter_orcamento_em_os", [w, proposta.id]), id);
      get = () => call("consultar_ordem_servico", [w, id]);
      let os = await get();
      assert.equal(os.ficha_especialidade.especialidade, perfil);
      assert.equal(os.tipo_servico, e.tipos[0]);
      for (const item of os.itens) {
        os = await get();
        await call("salvar_item_os", [
          w,
          id,
          os.revisao,
          { situacao: "done" },
          item.id,
        ]);
      }
      for (const estado of ["in_progress", "quality_check", "ready", "delivered"]) {
        os = await get();
        await call("atualizar_mapa_ordem_servico", [
          w,
          id,
          os.revisao,
          estado,
          null,
          null,
          null,
          new Date().toISOString(),
        ]);
      }
      os = await get();
      assert.equal(os.situacao, "delivered");
      assert.equal(os.total_centavos, 10000);
      titulo = await call("preparar_financeiro_os", [w, id]);
      assert.equal(await call("preparar_financeiro_os", [w, id]), titulo);
    } else {
      get = () => call("consultar_detalhes_atendimento", [w, atendimento]);
      const save = async (a) => {
        await call("salvar_atendimento_servico", [w, atendimento, a, a.revisao]);
        return get();
      };
      let d = await get();
      assert.equal(d.atendimento.valor_centavos, 15000);
      const revisaoAntiga = d.atendimento.revisao;
      d = await save({ ...d.atendimento, situacao: "aprovado" });
      await assert.rejects(
        () => save({ ...d.atendimento, revisao: revisaoAntiga }),
        (x) => x.code === codigoConflitoRevisao,
      );
      d = await save({ ...d.atendimento, situacao: "em_execucao" });
      const ag = {
        atendimento_id: atendimento,
        recurso_id: recurso,
        inicio: hoje + "T10:00:00-03:00",
        fim: hoje + "T11:00:00-03:00",
        situacao: "agendado",
      };
      await call("salvar_agenda_servico", [w, randomUUID(), ag]);
      await assert.rejects(
        () => call("salvar_agenda_servico", [w, randomUUID(), ag]),
        /horário|reserva|ocupado|conflit/i,
      );
      d = await save(
        e.ramo === "assistencia_tecnica"
          ? concluirReparo(d.atendimento, perfil)
          : { ...d.atendimento, situacao: "concluido" },
      );
      assert.equal(await stock(), 9);
      assert.equal(d.atendimento.ficha_especialidade.especialidade, perfil);
      if (e.ramo === "assistencia_tecnica") {
        d = await save(registrarRetirada(d.atendimento, "Cliente QA", perfil));
        assert.equal(await stock(), 9);
      }
      titulo = await call("faturar_atendimento_servico", [w, atendimento]);
      assert.equal(await call("faturar_atendimento_servico", [w, atendimento]), titulo);
      await call("reabrir_atendimento_servico", [
        w,
        atendimento,
        d.atendimento.revisao,
        "Retorno de teste",
      ]);
      assert.equal(await stock(), 10);
      d = await get();
      assert.equal(d.atendimento.situacao, "em_execucao");
      d = await save(
        e.ramo === "assistencia_tecnica"
          ? concluirReparo(d.atendimento, perfil)
          : { ...d.atendimento, situacao: "concluido" },
      );
      assert.equal(await stock(), 9);
      assert.equal(await call("faturar_atendimento_servico", [w, atendimento]), titulo);
      const report = await call("consultar_relatorios_servicos", [w, hoje, hoje]);
      assert.ok(report.detalhes.some((x) => x.atendimento.id === atendimento));
    }
    const payment = [
      w,
      titulo,
      randomUUID(),
      5000,
      0,
      hoje,
      "caixa",
      "pix",
      "Pagamento fictício",
    ];
    const pago = await call("baixar_titulo_financeiro", payment);
    assert.equal(await call("baixar_titulo_financeiro", payment), pago);
    await assert.rejects(
      () =>
        call("baixar_titulo_financeiro", [
          w,
          titulo,
          randomUUID(),
          999999,
          0,
          hoje,
          "caixa",
          "pix",
        ]),
      /saldo|valor/i,
    );
    await c.login(c.ids.stranger);
    await assert.rejects(get, (x) => x.code === "42501");
    console.log(
      "PASS " +
        perfil +
        ": orçamento, execução, conclusão, cobrança, pagamento parcial, repetição e isolamento" +
        (e.ramo === "automotivo"
          ? ", conversão em OS e entrega"
          : ", agenda, estoque e reabertura"),
    );
  }
} finally {
  await c.db.close();
}
