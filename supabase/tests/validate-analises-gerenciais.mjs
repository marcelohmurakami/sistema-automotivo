import assert from "node:assert/strict";
import { randomUUID as uuid, randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { criarCenarioSubsistemas } from "./subsistemas-fixture.mjs";
import {
  conferirConsolidacao,
  conferirCobertura,
} from "./analises-cenarios-adicionais.mjs";
process.env.DB_VALIDATION_RUNTIME ||= resolve(
  "node_modules/@electric-sql/pglite/dist/index.js",
);
process.env.DB_VALIDATION_MIGRATION_LIMIT ||= "20261102000100";
export async function validarAnalises(aposValidar) {
  let db;
  const resultados = [];
  try {
    const c = await criarCenarioSubsistemas();
    db = c.db;
    const call = async (fn, a) => {
      try {
        return Object.values(
          (
            await db.query(
              `select public.${fn}(${a.map((_, i) => "$" + (i + 1)).join(",")})`,
              a,
            )
          ).rows[0],
        )[0];
      } catch (e) {
        e.message = fn + ": " + e.message;
        throw e;
      }
    };
    for (const [perfil, r] of Object.entries(c.registros)) {
      await c.login(c.ids[perfil]);
      const checks = [];
      const w = r.w,
        hoje = r.hoje,
        mes = hoje.slice(0, 7) + "-01";
      let doc = r.atendimento;
      if (r.proposta) {
        const q = await call("emitir_orcamento", [
          w,
          r.proposta.id,
          r.proposta.revisao,
          7,
          randomBytes(32).toString("hex"),
        ]);
        await call("aprovar_orcamento_interno", [w, q.id, q.revisao, q.versao.id]);
        doc = await call("converter_orcamento_em_os", [w, q.id]);
      } else {
        const a = (await call("consultar_detalhes_atendimento", [w, doc])).atendimento;
        await call("salvar_atendimento_servico", [
          w,
          doc,
          { ...a, situacao: "aprovado" },
          a.revisao,
        ]);
      }
      for (const tipo of [
        "clientes",
        "dados",
        "tempos",
        "recursos",
        "contratos",
        "primeira_visita",
        "equipamentos",
        "comparacao",
        "filiais",
      ]) {
        const x = await call("consultar_analise_gerencial", [
          w,
          tipo,
          mes,
          hoje,
          { unidades: [w] },
          0,
        ]);
        assert(Array.isArray(x.linhas));
        assert(x.criterios.length > 30);
        checks.push("Consulta " + tipo);
        if (tipo === "clientes") assert(x.resumo.servicos > 0);
      }
      for (const tipo of [
        "documento",
        "contrato",
        "objeto",
        "problema",
        "recurso",
        "visita",
        "despesa",
        "receita",
      ])
        assert(Array.isArray(await call("buscar_opcoes_analiticas", [w, tipo, ""])));
      checks.push("Buscas limitadas");
      const comparacao = {
        reparo: 10000,
        manutencao_atual: 2000,
        troca: 150000,
        instalacao: 10000,
        revenda: 5000,
        manutencao_novo: 500,
        hora_parada: 1000,
        horas_reparo: 10,
        horas_troca: 2,
        meses: 12,
        evidencia: "Cotações fictícias QA",
      };
      await call("salvar_vinculo_analitico", [
        w,
        "comparacao",
        r.objeto,
        comparacao,
        null,
      ]);
      await call("salvar_vinculo_analitico", [
        w,
        "comparacao",
        r.objeto,
        comparacao,
        null,
      ]);
      const comp = await call("consultar_analise_gerencial", [
        w,
        "comparacao",
        mes,
        hoje,
        { objeto: r.objeto },
        0,
      ]);
      assert.equal(comp.linhas[0].reparo, 44000);
      assert.equal(comp.linhas[0].substituicao, 163000);
      checks.push(
        "Comparação econômica sem custo histórico duplicado e reenvio seguro",
      );
      await assert.rejects(
        () =>
          call("salvar_vinculo_analitico", [
            w,
            "comparacao",
            r.objeto,
            { ...comparacao, reparo: 1 },
            null,
          ]),
        (e) => e.code === "PT409",
      );
      checks.push("Conflito de revisão");
      const outra = Object.values(c.registros).find((x) => x.w !== w);
      await assert.rejects(
        () =>
          call("consultar_analise_gerencial", [outra.w, "clientes", mes, hoje, {}, 0]),
        (e) => e.code === "42501",
      );
      await assert.rejects(
        () =>
          call("consultar_analise_gerencial", [
            w,
            "filiais",
            mes,
            hoje,
            { unidades: [w, outra.w] },
            0,
          ]),
        (e) => e.code === "42501",
      );
      checks.push("Isolamento da empresa e consolidação");
      const contrato = uuid(),
        regras = {
          mensalidade: 10000,
          franquia_visitas: 2,
          franquia_minutos: 120,
          franquia_materiais: 2000,
          excedente_visita: 5000,
          excedente_hora: 6000,
          participacao_visita: 0,
          vencimento_dia: 10,
          servicos: ["Preventiva"],
          equipamentos: [],
        };
      await db.exec("reset role");
      await db.query(
        `update public.${r.proposta ? "ordens_servico" : "atendimentos_servicos"} set data_servico='2026-09-07' where id=$1`,
        [doc],
      );
      await c.login(c.ids[perfil]);
      await call("salvar_contrato_preventivo", [
        w,
        contrato,
        {
          cliente_id: r.cliente,
          nome: "Contrato de análise QA",
          inicio: "2025-01-01",
          regras,
        },
        null,
      ]);
      await call("salvar_vinculo_analitico", [
        w,
        "contrato_documento",
        doc,
        { contrato_id: contrato },
        null,
      ]);
      await call("registrar_consumo_contrato", [
        w,
        contrato,
        uuid(),
        {
          data: "2026-09-07",
          servico: "Preventiva",
          equipamento: "QA",
          visitas: 1,
          minutos: 60,
          materiais_centavos: 1500,
          observacoes: "Visita QA",
        },
        false,
      ]);
      await call("faturar_contrato", [w, contrato, "2026-09-01", true]);
      const despesa = uuid();
      await call("salvar_titulo_financeiro", [
        w,
        despesa,
        {
          natureza: "pagar",
          descricao: "Despesa direta de contrato QA",
          categoria: "outras_despesas",
          valor_centavos: 1234,
          competencia: "2026-09-07",
          vencimento: hoje,
        },
        null,
      ]);
      await call("salvar_vinculo_analitico", [
        w,
        "contrato_despesa",
        despesa,
        { contrato_id: contrato },
        null,
      ]);
      const custeio = await call("consultar_custeio_servico", [w, doc]);
      const relContrato = (
        await call("consultar_analise_gerencial", [
          w,
          "contratos",
          "2026-09-01",
          hoje,
          { contrato },
          0,
        ])
      ).linhas[0];
      assert.equal(relContrato.receita, 10000);
      assert.equal(relContrato.custo, custeio.custo + 1234);
      assert.equal(relContrato.visitas, 1);
      assert.equal(relContrato.materiais_declarados, 1500);
      assert.equal(relContrato.servicos, 1);
      checks.push(
        "Contrato: fatura sem somar receita da OS, custos sem duplicar franquia, visitas e despesa direta",
      );
      await assert.rejects(
        () =>
          call("salvar_vinculo_analitico", [
            w,
            "contrato_documento",
            doc,
            { contrato_id: uuid() },
            1,
          ]),
        (e) => e.code === "42501",
      );
      checks.push("Contrato de outra empresa/inexistente recusado");
      const box = uuid(),
        movel = uuid(),
        tecnico = uuid(),
        turnos = [{ dia: 1, inicio: "08:00", fim: "18:00" }];
      await call("salvar_ativo_agenda", [
        w,
        box,
        {
          nome: "Box analítico QA",
          tipo: "box",
          ativo: true,
          movel: false,
          bloqueios: [
            {
              inicio: "2026-09-07T12:00:00-03:00",
              fim: "2026-09-07T13:00:00-03:00",
              motivo: "Manutenção",
            },
          ],
        },
        null,
      ]);
      await call("salvar_ativo_agenda", [
        w,
        movel,
        {
          nome: "Equipamento sem jornada QA",
          tipo: "equipamento",
          ativo: true,
          movel: true,
          bloqueios: [],
        },
        null,
      ]);
      await call("salvar_perfil_distribuicao", [
        w,
        tecnico,
        {
          nome: "Técnico analítico QA",
          recurso_id: r.proposta ? null : r.recurso,
          funcionario_id: r.funcionario,
          ativo: true,
          jornada: turnos,
          bloqueios: [],
          habilidades: [],
          ferramentas: [],
          regioes: [],
        },
        null,
      ]);
      await call("salvar_vinculo_analitico", [w, "jornada", box, { turnos }, null]);
      const visita = uuid(),
        problema = uuid();
      // Dados históricos simulados somente no banco efêmero; não se alteram agendas reais.
      await db.exec("reset role");
      if (r.proposta)
        await db.query(
          "insert into public.agenda_atendimentos(id,oficina_id,cliente_id,recurso,servico,identificacao,inicio,fim,situacao,ordem_servico_id,visita,deslocamento_minutos,logistica,distribuicao,recursos_reservados) values($1,$2,$3,'Técnico analítico QA','Visita analítica QA','Ativo QA','2026-09-07T10:00:00-03:00','2026-09-07T11:00:00-03:00','concluido',$4,true,30,'{\"retorno_minutos\":20,\"margem_minutos\":10}',$5,$6)",
          [visita, w, r.cliente, doc, { perfil_id: tecnico }, [box, movel]],
        );
      else
        await db.query(
          "insert into public.agenda_servicos(id,oficina_id,atendimento_id,recurso_id,inicio,fim,situacao,visita,deslocamento_minutos,logistica,distribuicao,recursos_reservados) values($1,$2,$3,$4,'2026-09-07T10:00:00-03:00','2026-09-07T11:00:00-03:00','concluido',true,30,'{\"retorno_minutos\":20,\"margem_minutos\":10}',$5,$6)",
          [visita, w, doc, r.recurso, { perfil_id: tecnico }, [box, movel]],
        );
      await c.login(c.ids[perfil]);
      const recursos = (
        await call("consultar_analise_gerencial", [
          w,
          "recursos",
          "2026-09-07",
          "2026-09-07",
          {},
          0,
        ])
      ).linhas;
      assert.equal(recursos.find((x) => x.id === box).capacidade, 9);
      assert.equal(recursos.find((x) => x.id === box).reservadas, 1);
      assert.equal(recursos.find((x) => x.id === tecnico).reservadas, 2);
      assert.equal(recursos.find((x) => x.id === movel).capacidade, null);
      checks.push(
        "Capacidade desconta bloqueios; técnico inclui ida/margem/volta; recurso sem jornada não ganha capacidade fictícia",
      );
      await call("salvar_vinculo_analitico", [
        w,
        "problema",
        problema,
        { documento_id: doc, descricao: "Falha intermitente QA" },
        null,
      ]);
      await call("salvar_vinculo_analitico", [
        w,
        "visita",
        visita,
        {
          problema_id: problema,
          resultado: "resolvido",
          evidencia: "Teste funcional concluído",
        },
        null,
      ]);
      let primeira = await call("consultar_analise_gerencial", [
        w,
        "primeira_visita",
        "2026-09-01",
        "2026-09-30",
        {},
        0,
      ]);
      assert.equal(primeira.resumo.avaliaveis, 0);
      assert.equal(primeira.resumo.observacao, 1);
      primeira = await call("consultar_analise_gerencial", [
        w,
        "primeira_visita",
        "2026-09-01",
        "2026-10-31",
        {},
        0,
      ]);
      assert.equal(primeira.resumo.avaliaveis, 1);
      assert.equal(primeira.resumo.resolvidos, 1);
      checks.push("Primeira visita: denominador só após 30 dias de observação");
      const retorno = uuid();
      await db.exec("reset role");
      const tabela = r.proposta ? "agenda_atendimentos" : "agenda_servicos";
      // Clone usando jsonb_populate_record preserva campos específicos de cada ramo.
      await db.query(
        `insert into public.${tabela} select (jsonb_populate_record(null::public.${tabela},to_jsonb(g)||jsonb_build_object('id',$2::text,'inicio','2026-09-14T10:00:00-03:00','fim','2026-09-14T11:00:00-03:00'))).* from public.${tabela} g where id=$1`,
        [visita, retorno],
      );
      await c.login(c.ids[perfil]);
      await call("salvar_vinculo_analitico", [
        w,
        "visita",
        retorno,
        {
          problema_id: problema,
          resultado: "retorno",
          evidencia: "Sintoma reapareceu",
        },
        null,
      ]);
      primeira = await call("consultar_analise_gerencial", [
        w,
        "primeira_visita",
        "2026-09-01",
        "2026-10-31",
        {},
        0,
      ]);
      assert.equal(primeira.resumo.resolvidos, 0);
      assert.equal(primeira.linhas[0].retornos, 1);
      checks.push("Retorno do mesmo problema retira sucesso da primeira visita");
      const historico = (
        await call("consultar_analise_gerencial", [
          w,
          "equipamentos",
          mes,
          hoje,
          { objeto: r.objeto },
          0,
        ])
      ).linhas[0];
      assert.equal(historico.custo, custeio.custo);
      assert.equal(historico.servicos, 1);
      checks.push(
        "Histórico por identidade do ativo e custos da OS, sem a despesa exclusiva do contrato",
      );
      await assert.rejects(
        () =>
          call("salvar_vinculo_analitico", [
            w,
            "visita",
            retorno,
            { problema_id: uuid(), resultado: "resolvido", evidencia: "QA" },
            1,
          ]),
        (e) => e.code === "42501",
      );
      checks.push("Visita não aceita problema inexistente");
      await assert.rejects(
        () =>
          call("consultar_analise_gerencial", [
            w,
            "clientes",
            "2020-01-01",
            hoje,
            {},
            0,
          ]),
        (e) => e.code === "22023",
      );
      checks.push("Limite de período");
      await assert.rejects(
        () =>
          call("retirar_vinculo_analitico", [
            w,
            "problema",
            problema,
            1,
            "Correção QA",
          ]),
        (e) => e.code === "22023",
      );
      await call("retirar_vinculo_analitico", [
        w,
        "visita",
        retorno,
        1,
        "Vínculo de retorno incorreto QA",
      ]);
      await call("retirar_vinculo_analitico", [
        w,
        "visita",
        retorno,
        1,
        "Vínculo de retorno incorreto QA",
      ]);
      primeira = await call("consultar_analise_gerencial", [
        w,
        "primeira_visita",
        "2026-09-01",
        "2026-10-31",
        {},
        0,
      ]);
      assert.equal(primeira.resumo.resolvidos, 1);
      assert.equal(
        (await call("consultar_vinculo_analitico", [w, "visita", retorno])).ativo,
        false,
      );
      await call("salvar_vinculo_analitico", [
        w,
        "visita",
        retorno,
        {
          problema_id: problema,
          resultado: "retorno",
          evidencia: "Sintoma reapareceu",
        },
        2,
      ]);
      primeira = await call("consultar_analise_gerencial", [
        w,
        "primeira_visita",
        "2026-09-01",
        "2026-10-31",
        {},
        0,
      ]);
      assert.equal(primeira.resumo.resolvidos, 0);
      checks.push(
        "Retirar, repetir e reativar vínculo com histórico e revisão; problema com visitas protegido",
      );
      // Intervalos concorrentes de profissionais não duplicam o tempo decorrido da OS.
      await db.exec("reset role");
      await db.query(
        `update public.${r.proposta ? "ordens_servico" : "atendimentos_servicos"} set ${r.proposta ? "recebido_em" : "criado_em"}='2026-09-07T08:00:00-03:00',concluido_em='2026-09-07T12:00:00-03:00' where id=$1`,
        [doc],
      );
      for (const [ini, fim] of [
        ["08:00", "10:00"],
        ["09:00", "11:00"],
      ])
        await db.query(
          "insert into public.horas_producao_equipe(id,oficina_id,documento_id,funcionario_id,inicio,fim,custo_hora_centavos,descricao,autor) values($1,$2,$3,$4,$5,$6,0,'Apontamento histórico QA',$7)",
          [
            uuid(),
            w,
            doc,
            r.funcionario,
            "2026-09-07T" + ini + ":00-03:00",
            "2026-09-07T" + fim + ":00-03:00",
            c.ids[perfil],
          ],
        );
      if (r.proposta)
        await db.query(
          "insert into public.paradas_ordem_servico(oficina_id,ordem_servico_id,motivo,detalhes,iniciado_em,encerrado_em,criado_por) values($1,$2,'approval','Pausa QA','2026-09-07T09:30:00-03:00','2026-09-07T11:30:00-03:00',$3)",
          [w, doc, c.ids[perfil]],
        );
      else
        for (const [hora, estado] of [
          ["09:30", "aguardando"],
          ["11:30", "em_execucao"],
        ])
          await db.query(
            "insert into public.eventos_atendimento(oficina_id,atendimento_id,tipo,depois,criado_em,autor) values($1,$2,'situacao',$3,$4,$5)",
            [w, doc, estado, "2026-09-07T" + hora + ":00-03:00", c.ids[perfil]],
          );
      await c.login(c.ids[perfil]);
      const tempo = (
        await call("consultar_analise_gerencial", [
          w,
          "tempos",
          "2026-09-07",
          "2026-09-07",
          {},
          0,
        ])
      ).linhas.find((x) => x.id === doc);
      assert.equal(tempo.trabalho, 180);
      assert.equal(tempo.espera, 30);
      assert.equal(tempo.sem_registro, 30);
      assert.equal(tempo.sobreposicao, 90);
      assert.equal(tempo.horas_pessoa, 4);
      checks.push(
        "Trabalho/espera: união, sobreposição, horas-pessoa e tempo sem evidência",
      );
      const falta = await call("consultar_analise_gerencial", [
        w,
        "dados",
        "2026-09-01",
        hoje,
        {},
        0,
      ]);
      assert(falta.resumo.receita_pendente > 0);
      assert.equal(falta.resumo.conferidos, 0);
      checks.push("Margem com dados incompletos continua provisória");
      await conferirConsolidacao(c, call, perfil, r, checks);
      await conferirCobertura(c, call, perfil, r, doc, checks);
      r.docAnalise = doc;
      r.boxAnalise = box;
      r.contratoAnalise = contrato;
      r.problemaAnalise = problema;
      resultados.push({ perfil, checks });
      console.log("PASS", perfil, checks.length);
    }
    await mkdir("output/relatorios-avancados-20261102", { recursive: true });
    await writeFile(
      "output/relatorios-avancados-20261102/banco.json",
      JSON.stringify({ ok: true, resultados }, null, 2),
    );
    await aposValidar?.(c, resultados);
  } catch (e) {
    console.error(e.code, e.message, e.where || "", e.stack);
    process.exitCode = 1;
  } finally {
    await db?.close();
  }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) await validarAnalises();
