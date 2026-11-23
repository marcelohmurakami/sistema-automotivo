import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { criarCenarioSubsistemas } from "./subsistemas-fixture.mjs";
import { cenariosEspecialidades } from "./cenarios-especialidades.mjs";
import { especialidades } from "../../src/lib/especialidades.ts";
import {
  validarFichaEspecialidade,
  perfilAtendimento,
} from "../../src/lib/perfisAtendimento.ts";
import {
  concluirReparo,
  registrarRetirada,
  aguardaRetirada,
  aguardaAceite,
} from "../../src/lib/assistenciaTecnica.ts";
import { aceiteServicoPendente } from "../../src/lib/aceiteServico.ts";
import { gerarPdfAtendimento } from "../../src/services/pdfAtendimento.ts";

assert.deepEqual(
  Object.keys(cenariosEspecialidades).sort(),
  Object.keys(especialidades).sort(),
  "Nenhum subsetor pode ficar fora",
);
const c = await criarCenarioSubsistemas({ realista: true }),
  resultados = [];
const rpc = async (fn, ...args) =>
  Object.values(
    (
      await c.db.query(
        `select public.${fn}(${args.map((_, i) => "$" + (i + 1)).join(",")})`,
        args,
      )
    ).rows[0],
  )[0];
const pasta = "output/avaliacao-completa-2026-10-19";
await mkdir(pasta + "/pdf", { recursive: true });
try {
  for (const [perfil, cenario] of Object.entries(cenariosEspecialidades)) {
    const e = especialidades[perfil],
      r = c.registros[perfil],
      { w, produto, hoje, funcionario } = r;
    await c.login(c.ids[perfil]);
    const saldo = async () =>
      Number(
        (await rpc("listar_estoque", w)).itens.find((i) => i.id === produto).saldo,
      );
    let titulo, get, final, total;
    if (e.ramo === "automotivo") {
      const token = randomUUID().replaceAll("-", "").repeat(2);
      await rpc(
        "emitir_orcamento",
        w,
        r.proposta.id,
        r.proposta.revisao,
        7,
        createHash("sha256").update(token).digest("hex"),
      );
      await c.login("", "anon");
      const publico = await rpc("consultar_orcamento_publico", token);
      assert.equal(
        publico.versao.ficha_especialidade,
        undefined,
        "Ficha técnica interna não é publicada",
      );
      await rpc("responder_orcamento", token, "Cliente fictício", "approved", true);
      await c.login(c.ids[perfil]);
      const id = await rpc("converter_orcamento_em_os", w, r.proposta.id);
      assert.equal(await rpc("converter_orcamento_em_os", w, r.proposta.id), id);
      get = () => rpc("consultar_ordem_servico", w, id);
      let os = await get();
      assert.deepEqual(os.ficha_especialidade.campos, cenario.entrada);
      const ficha = {
        ...os.ficha_especialidade,
        campos: { ...cenario.entrada, ...cenario.saida },
      };
      validarFichaEspecialidade(ficha);
      await rpc(
        "salvar_ordem_servico",
        w,
        { ficha_especialidade: ficha },
        randomUUID(),
        id,
        os.revisao,
      );
      os = await get();
      const p = os.itens.find((i) => i.tipo === "part");
      await rpc(
        "vincular_estoque_item_os",
        w,
        id,
        p.id,
        perfil === "acessorios" ? null : produto,
        perfil === "acessorios" ? "cliente" : "estoque",
        os.revisao,
      );
      const parada = await rpc(
        "registrar_parada_os",
        w,
        id,
        "approval",
        "Conferir autorização do escopo fictício",
      );
      await rpc("resolver_parada_os", w, id, parada);
      await rpc("modelo_etapas_especialidade", w, id);
      await rpc("modelo_etapas_especialidade", w, id);
      assert.deepEqual(
        (await rpc("consultar_etapas_execucao", w, id)).map((x) => x.nome),
        perfilAtendimento(perfil).etapas,
      );
      for (const i of (await get()).itens) {
        os = await get();
        await rpc("salvar_item_os", w, id, os.revisao, { situacao: "done" }, i.id);
      }
      for (const estado of ["in_progress", "quality_check", "ready", "delivered"]) {
        os = await get();
        await rpc(
          "atualizar_mapa_ordem_servico",
          w,
          id,
          os.revisao,
          estado,
          null,
          null,
          null,
          new Date().toISOString(),
        );
      }
      final = (await get()).ficha_especialidade;
      assert.deepEqual(final.campos, ficha.campos);
      assert.equal(
        await saldo(),
        perfil === "acessorios" ? 10 : 9,
        "Material do cliente não consome estoque da empresa",
      );
      total = perfil === "acessorios" ? 10000 : 15000;
      assert.equal((await get()).total_centavos, total);
      titulo = await rpc("preparar_financeiro_os", w, id);
      assert.equal(await rpc("preparar_financeiro_os", w, id), titulo);
      // Ficha da OS pode evoluir sem reescrever o orçamento aceito pelo cliente.
      assert.deepEqual(
        (await rpc("consultar_orcamento", w, r.proposta.id)).versao.ficha_especialidade
          .campos,
        cenario.entrada,
      );
    } else {
      const id = r.atendimento;
      get = () => rpc("consultar_detalhes_atendimento", w, id);
      const save = async (a) => {
        await rpc("salvar_atendimento_servico", w, id, a, a.revisao);
        return get();
      };
      let d = await get();
      assert.deepEqual(d.atendimento.ficha_especialidade.campos, cenario.entrada);
      const setCampos = (campos) =>
        save({
          ...d.atendimento,
          ficha_especialidade: { ...d.atendimento.ficha_especialidade, campos },
        });
      const campos = { ...cenario.entrada, ...cenario.saida };
      validarFichaEspecialidade({ ...d.atendimento.ficha_especialidade, campos });
      await assert.rejects(
        () =>
          setCampos({
            ...campos,
            [perfil === "assistencia_eletrodomesticos"
              ? "viscosidade"
              : "codigo_produto"]: "Campo de outro setor",
          }),
        (e) => e.code === "22023",
      );
      d = await save({ ...d.atendimento, situacao: "aprovado" });
      d = await save({ ...d.atendimento, situacao: "em_execucao" });
      if (perfil === "limpeza_vidros")
        await assert.rejects(
          () => save({ ...d.atendimento, situacao: "concluido" }),
          /suspenso/,
        );
      await rpc("salvar_equipe_atendimento", w, id, d.atendimento.revisao, [
        { funcionario_id: funcionario, percentual: 10, custo_hora_centavos: 2500 },
      ]);
      d = await get();
      // Horas já trabalhadas precisam estar no passado, mesmo quando a suíte roda cedo.
      const fimHoras = Date.now() - 60_000;
      const inicioHoras = fimHoras - 90 * 60_000;
      await assert.rejects(
        () =>
          rpc(
            "registrar_horas_atendimento",
            w,
            id,
            randomUUID(),
            funcionario,
            new Date(Date.now() + 60 * 60_000).toISOString(),
            new Date(Date.now() + 150 * 60_000).toISOString(),
            "Horas futuras devem ser recusadas",
          ),
        /horas futuras/,
      );
      await rpc(
        "registrar_horas_atendimento",
        w,
        id,
        randomUUID(),
        funcionario,
        new Date(inicioHoras).toISOString(),
        new Date(fimHoras).toISOString(),
        "Execução fictícia",
      );
      d = await setCampos(campos);
      d = await save(
        e.ramo === "assistencia_tecnica"
          ? concluirReparo(d.atendimento, perfil)
          : { ...d.atendimento, situacao: "concluido" },
      );
      assert.equal(await saldo(), 9);
      if (e.ramo === "assistencia_tecnica") {
        assert.equal(
          aguardaRetirada(d.atendimento),
          perfil !== "assistencia_eletrodomesticos",
        );
        assert.equal(
          aguardaAceite(d.atendimento),
          perfil === "assistencia_eletrodomesticos",
        );
        d = await save(
          registrarRetirada(d.atendimento, "Responsável fictício", perfil),
        );
        assert.equal(aguardaRetirada(d.atendimento), false);
        assert.equal(aguardaAceite(d.atendimento), false);
      } else {
        assert.ok(aceiteServicoPendente(d.atendimento));
        await assert.rejects(
          () =>
            setCampos({
              ...campos,
              situacao_aceite: "Aceito com ressalvas",
              aceite: "Cliente fictício",
              data_aceite: hoje,
            }),
          /ressalvas/,
        );
        d = await setCampos({
          ...campos,
          situacao_aceite: "Aceito com ressalvas",
          aceite: "Cliente fictício",
          data_aceite: hoje,
          ressalvas_aceite: "Ressalvas e escopo conferidos nesta visita",
        });
        assert.ok(!aceiteServicoPendente(d.atendimento));
      }
      for (const [k, v] of Object.entries(campos))
        assert.equal(
          d.atendimento.ficha_especialidade.campos[k],
          v,
          perfil + ": " + k + " preservado",
        );
      assert.equal(d.horas.length, 1);
      assert.equal(d.equipe.length, 1);
      for (const modo of ["orcamento", "atendimento", "tecnica"])
        await writeFile(
          `${pasta}/pdf/${perfil}-${modo}.pdf`,
          Buffer.from(
            gerarPdfAtendimento(
              d,
              { nome: "QA · " + e.nome, especialidade: perfil },
              modo,
            ).output("arraybuffer"),
          ),
        );
      titulo = await rpc("faturar_atendimento_servico", w, id);
      assert.equal(await rpc("faturar_atendimento_servico", w, id), titulo);
      await rpc(
        "reabrir_atendimento_servico",
        w,
        id,
        d.atendimento.revisao,
        "Conferência adicional solicitada",
      );
      d = await get();
      assert.equal(await saldo(), 10);
      assert.equal(d.atendimento.situacao, "em_execucao");
      assert.equal(aguardaRetirada(d.atendimento), false);
      if (e.ramo !== "assistencia_tecnica")
        assert.equal(
          d.atendimento.ficha_especialidade.campos.situacao_aceite,
          "Pendente",
        );
      d = await save(
        e.ramo === "assistencia_tecnica"
          ? concluirReparo(d.atendimento, perfil)
          : { ...d.atendimento, situacao: "concluido" },
      );
      assert.equal(await saldo(), 9);
      assert.equal(await rpc("faturar_atendimento_servico", w, id), titulo);
      await rpc(
        "salvar_qualidade_atendimento",
        w,
        id,
        randomUUID(),
        {
          tipo: "retrabalho",
          motivo: "Conferência adicional fictícia",
          aberto_em: hoje,
          custo_centavos: 1750,
          minutos: 20,
          funcionario_id: funcionario,
          nota: 4,
        },
        null,
      );
      const rel = await rpc("consultar_relatorios_servicos", w, hoje, hoje);
      assert.ok(rel.qualidade.some((x) => x.custo_centavos === 1750));
      assert.ok(rel.detalhes.some((x) => x.atendimento.id === id));
      final = d.atendimento.ficha_especialidade;
      total = d.atendimento.valor_centavos;
    }
    const pagamento = [
      w,
      titulo,
      randomUUID(),
      5000,
      0,
      hoje,
      "banco",
      "pix",
      "Sinal fictício",
    ];
    const baixa = await rpc("baixar_titulo_financeiro", ...pagamento);
    assert.equal(await rpc("baixar_titulo_financeiro", ...pagamento), baixa);
    await assert.rejects(
      () =>
        rpc(
          "baixar_titulo_financeiro",
          w,
          titulo,
          randomUUID(),
          total,
          0,
          hoje,
          "banco",
          "pix",
        ),
      /saldo|valor/i,
    );
    await c.login(c.ids.stranger);
    await assert.rejects(get, (e) => e.code === "42501");
    resultados.push({
      perfil,
      nome: e.nome,
      caso: cenario.caso,
      camposEntrada: Object.keys(cenario.entrada).length,
      camposSaida: Object.keys(cenario.saida).length,
      resultado: "aprovado",
    });
    console.log("PASS " + perfil + ": " + cenario.caso);
  }
  await writeFile(pasta + "/jornadas-banco.json", JSON.stringify(resultados, null, 2));
  console.log(
    "PASS 26/26 jornadas especializadas; 48 PDFs; materiais, aceite, estoque, horas, reabertura, pagamento e isolamento",
  );
} finally {
  await c.db.close();
}
