import assert from "node:assert/strict";
import { randomUUID as uuid, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { criarCenarioSubsistemas } from "./subsistemas-fixture.mjs";
import { calcularGestao } from "../../src/lib/relatoriosGestao.ts";
import { resumirServicos } from "../../src/lib/relatoriosServicos.ts";
import { concluirReparo, registrarRetirada } from "../../src/lib/assistenciaTecnica.ts";
import { especialidades } from "../../src/lib/especialidades.ts";
process.env.DB_VALIDATION_MIGRATION_LIMIT ||= "20261102220242";
process.env.DB_VALIDATION_RUNTIME ||= resolve(
  "node_modules/@electric-sql/pglite/dist/index.js",
);
const pasta = "output/auditoria-numeros-20261102";
export async function auditarNumeros(observer) {
  await mkdir(pasta, { recursive: true });
  const resultados = [];
  let c;
  try {
    c = await criarCenarioSubsistemas();
    const call = async (n, a) => {
      try {
        return Object.values(
          (
            await c.db.query(
              `select public.${n}(${a.map((_, i) => "$" + (i + 1)).join(",")})`,
              a.map((x) => (x && typeof x === "object" ? JSON.stringify(x) : x)),
            )
          ).rows[0],
        )[0];
      } catch (e) {
        e.message = n + ": " + e.message;
        throw e;
      }
    };
    await c.db.exec("reset role");
    for (const name of [
      "consultar_relatorios_gestao",
      "consultar_relatorios_servicos",
      "consultar_relatorio_financeiro",
      "consultar_produto_estoque",
    ]) {
      const rows = (
        await c.db.query(
          "select pg_get_functiondef(oid) def from pg_proc where proname=$1",
          [name],
        )
      ).rows;
      await writeFile(pasta + "/" + name + ".sql", rows.map((r) => r.def).join("\n"));
    }
    for (const [perfil, r] of Object.entries(c.registros)) {
      await c.login(c.ids[perfil]);
      const w = r.w,
        hoje = r.hoje,
        mes = hoje.slice(0, 7) + "-01",
        auto = !!r.proposta;
      const checks = [],
        divergencias = [];
      const eq = (obtido, esperado, regra) => {
        const correto = JSON.stringify(obtido) === JSON.stringify(esperado);
        checks.push({ regra, obtido, esperado, correto });
        if (!correto) divergencias.push({ regra, obtido, esperado });
      };
      let doc = r.atendimento,
        titulo;
      if (auto) {
        const proposta = await call("salvar_orcamento", [
          w,
          {
            cliente_id: r.cliente,
            veiculo_id: r.objeto,
            tipo_servico: especialidades[perfil].tipos[0],
            itens: [
              {
                tipo: "service",
                descricao: "Serviço de auditoria",
                unidade: "un",
                quantidade: 1,
                preco_unitario_centavos: 10000,
              },
              {
                tipo: "part",
                descricao: "Material de auditoria",
                unidade: "un",
                quantidade: 1,
                preco_unitario_centavos: 5000,
              },
            ],
          },
          uuid(),
        ]);
        const q = await call("emitir_orcamento", [
          w,
          proposta.id,
          proposta.revisao,
          7,
          randomBytes(32).toString("hex"),
        ]);
        await call("aprovar_orcamento_interno", [w, q.id, q.revisao, q.versao.id]);
        doc = await call("converter_orcamento_em_os", [w, q.id]);
        let os = await call("consultar_ordem_servico", [w, doc]);
        await call("vincular_estoque_item_os", [
          w,
          doc,
          os.itens.find((i) => i.tipo === "part").id,
          r.produto,
          "estoque",
          os.revisao,
        ]);
      } else {
        const a = (await call("consultar_detalhes_atendimento", [w, doc])).atendimento;
        await call("salvar_atendimento_servico", [
          w,
          doc,
          { ...a, situacao: "aprovado" },
          a.revisao,
        ]);
      }
      const custoServico = auto ? 0 : 3000,
        receita = 15000;
      await call("registrar_horas_equipe", [
        w,
        uuid(),
        doc,
        r.funcionario,
        "2026-01-10T08:00:00-03:00",
        "2026-01-10T10:00:00-03:00",
        3000,
        "Execução realista da auditoria",
      ]);
      const terceiro = await call("registrar_custo_servico", [
        w,
        doc,
        uuid(),
        {
          categoria: "terceiros",
          valor: 1234,
          descricao: "Fornecedor terceirizado da auditoria",
          data: hoje,
          vencimento: hoje,
        },
      ]);
      const outro = uuid();
      await call("salvar_funcionario", [
        w,
        outro,
        { nome: "Profissional de apoio QA", ativo: true },
      ]);
      if (auto) {
        let os = await call("consultar_ordem_servico", [w, doc]);
        for (const item of os.itens) {
          os = await call("consultar_ordem_servico", [w, doc]);
          await call("salvar_item_os", [
            w,
            doc,
            os.revisao,
            { situacao: "done" },
            item.id,
          ]);
        }
        for (const status of ["in_progress", "quality_check", "ready", "delivered"]) {
          os = await call("consultar_ordem_servico", [w, doc]);
          await call("atualizar_mapa_ordem_servico", [
            w,
            doc,
            os.revisao,
            status,
            null,
            null,
            null,
            new Date().toISOString(),
          ]);
        }
        titulo = await call("preparar_financeiro_os", [w, doc]);
      } else {
        let a = (await call("consultar_detalhes_atendimento", [w, doc])).atendimento;
        await call("salvar_atendimento_servico", [
          w,
          doc,
          { ...a, situacao: "em_execucao" },
          a.revisao,
        ]);
        a = (await call("consultar_detalhes_atendimento", [w, doc])).atendimento;
        await call("salvar_atendimento_servico", [
          w,
          doc,
          especialidades[perfil].ramo === "assistencia_tecnica"
            ? concluirReparo(a, perfil)
            : { ...a, situacao: "concluido" },
          a.revisao,
        ]);
        if (especialidades[perfil].ramo === "assistencia_tecnica") {
          a = (await call("consultar_detalhes_atendimento", [w, doc])).atendimento;
          await call("salvar_atendimento_servico", [
            w,
            doc,
            registrarRetirada(a, "Cliente fictício", perfil),
            a.revisao,
          ]);
        }
        titulo = await call("faturar_atendimento_servico", [w, doc]);
      }
      const pagamento = [
        w,
        titulo,
        uuid(),
        5000,
        123,
        hoje,
        "caixa",
        "pix",
        "Recebimento parcial de teste",
      ];
      const baixa = await call("baixar_titulo_financeiro", pagamento);
      eq(
        await call("baixar_titulo_financeiro", pagamento),
        baixa,
        "Reenvio não duplica recebimento",
      );
      const cust = () => call("consultar_custeio_servico", [w, doc]);
      const relatorio = async () =>
        auto
          ? calcularGestao(
              await call("consultar_relatorios_gestao", [w, mes, hoje]),
              mes,
              hoje,
            )
          : resumirServicos(
              await call("consultar_relatorios_servicos", [w, mes, hoje]),
              mes,
              hoje,
            );
      const custoRelatorio = async () => {
        const x = await relatorio();
        return auto ? x.osFinanceiro[0].custo : x.custo;
      };
      let d = await cust();
      eq(d.receita, receita, "Receita da OS igual ao subtotal dos itens");
      eq(
        d.custo,
        2000 + custoServico + 6000 + 1234 + 123,
        "Custo completo calculado de forma independente",
      );
      eq(
        (await call("consultar_contas_financeiras", [w, hoje])).find(
          (x) => x.codigo === "caixa",
        ).saldo,
        4877,
        "Caixa recebe somente pagamento parcial líquido da taxa",
      );
      await c.db.exec("reset role");
      const fontes = (
        await c.db.query(
          "select valor_centavos-(select coalesce(sum(case when b.estorno_de is null then b.valor_centavos else -b.valor_centavos end),0) from public.baixas_financeiras b where b.titulo_id=t.id) aberto from public.titulos_financeiros t where id=$1",
          [titulo],
        )
      ).rows[0];
      const stock = (
        await c.db.query(
          "select saldo,reservado from public.estoque_produtos where item_catalogo_id=$1",
          [r.produto],
        )
      ).rows[0];
      await c.login(c.ids[perfil]);
      eq(Number(fontes.aberto), 10000, "Recebível mantém saldo não recebido");
      eq(Number(stock.saldo), 9, "Estoque consome uma unidade");
      eq(Number(stock.reservado), 0, "Reserva liberada após consumo");
      const atribuicao = await call("consultar_contribuicao_equipe", [w, doc]);
      await call("salvar_atribuicao_equipe", [
        w,
        doc,
        {
          criterio: "manual",
          participantes: [
            { funcionario_id: r.funcionario, execucao_bp: 7500, venda_bp: 0 },
            { funcionario_id: outro, execucao_bp: 2500, venda_bp: 10000 },
          ],
          fontes: {},
        },
        atribuicao.documento.assinatura,
        null,
      ]);
      const equipe = await call("resumo_contribuicao_equipe", [w, mes, hoje]);
      eq(
        equipe.funcionarios.reduce((s, x) => s + x.receita, 0),
        receita,
        "Equipe conserva receita atribuída",
      );
      eq(
        equipe.funcionarios.reduce((s, x) => s + x.custo, 0),
        d.custo,
        "Equipe conserva custos atribuídos",
      );
      eq(
        equipe.funcionarios.find((x) => x.funcionario_id === r.funcionario).minutos,
        120,
        "Horas atribuídas ao profissional correto",
      );
      const analise = await call("consultar_analise_gerencial", [
        w,
        "clientes",
        mes,
        hoje,
        {},
        0,
      ]);
      eq(analise.resumo.receita, receita, "Análise de clientes corresponde à OS");
      eq(
        analise.resumo.margem,
        receita - d.custo,
        "Margem do cliente usa todos os custos",
      );
      const ap = await call("consultar_apuracao_completa", [w, mes, hoje]);
      eq(
        ap.grupos.receita,
        receita,
        "Competência registra OS inteira independentemente do pagamento",
      );
      eq(
        ap.resultado_liquido,
        receita - 2000 - 1234 - 123,
        "Apuração usa estoque consumido, despesas e taxas sem duplicação",
      );
      eq(
        equipe.funcionarios.find((x) => x.funcionario_id === r.funcionario).receita,
        11250,
        "Execução atribui 75% ao responsável",
      );
      eq(
        equipe.funcionarios.find((x) => x.funcionario_id === outro).receita,
        3750,
        "Execução atribui 25% ao apoio",
      );
      eq(
        equipe.funcionarios.find((x) => x.funcionario_id === outro).vendas,
        15000,
        "Venda é separada da execução sem duplicar receita",
      );
      if (auto) {
        const bruto = await call("consultar_relatorios_gestao", [w, mes, hoje]);
        const rel = calcularGestao(bruto, mes, hoje);
        eq(
          rel.osFinanceiro[0].custo,
          d.custo,
          "Relatório de gestão concilia custo com OS",
        );
        eq(
          rel.clientes[0].margem,
          receita - d.custo,
          "Ranking antigo de clientes concilia margem",
        );
        const p = bruto.produtos.find((x) => x.id === r.produto);
        eq(Number(p.saldo), 9, "Estoque no relatório de gestão concilia saldo");
        eq(Number(p.reservado), 0, "Estoque no relatório concilia reserva");
      } else {
        const bruto = await call("consultar_relatorios_servicos", [w, mes, hoje]);
        const rel = resumirServicos(bruto, mes, hoje);
        eq(rel.custo, d.custo, "Relatório de serviços concilia custo com OS");
        eq(rel.margem, receita - d.custo, "Resultado da empresa concilia margem");
        eq(rel.entradas, 4877, "Relatório da empresa concilia caixa recebido");
        eq(
          rel.devedores.reduce((s, x) => s + x.valor, 0),
          10000,
          "Ranking de devedores concilia saldo",
        );
        eq(
          rel.funcionarios.reduce((s, x) => s + x.valor, 0),
          receita,
          "Ranking antigo de funcionários concilia atribuição",
        );
        const p = bruto.estoque.find((x) => x.id === r.produto);
        eq(Number(p.saldo), 9, "Estoque no relatório concilia saldo");
        eq(Number(p.reservado), 0, "Estoque no relatório concilia reserva");
        eq(Number(p.consumido), 1, "Consumo no relatório confere com movimentos");
      }
      await call("estornar_baixa_financeira", [
        w,
        baixa,
        hoje,
        "Recebimento lançado na conta incorreta",
      ]);
      eq((await cust()).custo, d.custo - 123, "Estorno retira taxa do custo");
      eq(
        (await call("consultar_contas_financeiras", [w, hoje])).find(
          (x) => x.codigo === "caixa",
        ).saldo,
        0,
        "Estorno restaura caixa",
      );
      await call("baixar_titulo_financeiro", [
        w,
        titulo,
        uuid(),
        receita,
        0,
        hoje,
        "caixa",
        "dinheiro",
        "Quitação fictícia",
      ]);
      eq(
        (await call("consultar_contas_financeiras", [w, hoje])).find(
          (x) => x.codigo === "caixa",
        ).saldo,
        receita,
        "Quitação após estorno mantém caixa correto",
      );
      const garantia = await call("registrar_custo_servico", [
        w,
        doc,
        uuid(),
        {
          categoria: "garantia",
          valor: 700,
          descricao: "Material e correção de retorno",
          data: hoje,
          vencimento: hoje,
        },
      ]);
      eq((await cust()).custo, d.custo - 123 + 700, "Custo de retorno impacta margem");
      await call("baixar_titulo_financeiro", [
        w,
        terceiro,
        uuid(),
        1234,
        0,
        hoje,
        "caixa",
        "pix",
        "Fornecedor pago",
      ]);
      await call("baixar_titulo_financeiro", [
        w,
        garantia,
        uuid(),
        700,
        0,
        hoje,
        "caixa",
        "pix",
        "Retorno pago",
      ]);
      eq(
        (await call("consultar_contas_financeiras", [w, hoje])).find(
          (x) => x.codigo === "caixa",
        ).saldo,
        receita - 1234 - 700,
        "Pagamentos de custos conciliam caixa sem alterar faturamento",
      );
      eq(
        await custoRelatorio(),
        d.custo - 123 + 700,
        "Relatório atualiza estorno e custo posterior da garantia",
      );
      const banco = uuid();
      await call("salvar_conta_financeira", [
        w,
        banco,
        { nome: "Banco auditoria", tipo: "banco", ativo: true },
        null,
      ]);
      const transf = uuid();
      await call("transferir_financeiro", [w, transf, 1000, hoje, "caixa", banco]);
      const financeiro = await call("consultar_relatorio_financeiro", [w, mes, hoje]);
      eq(
        financeiro.saldo_final,
        13066,
        "Relatório financeiro consolida saldos sem duplicar transferências",
      );
      if (!auto) {
        let x = await relatorio();
        eq(x.entradas, 15000, "Transferência não infla recebimentos operacionais");
        eq(x.saidas, 1934, "Transferência não infla pagamentos operacionais");
        eq(
          x.formas.reduce((s, x) => s + x.valor, 0),
          15000,
          "Ranking de formas de pagamento exclui transferências",
        );
        eq(
          x.despesas.reduce((s, x) => s + x.valor, 0),
          1934,
          "Despesas excluem transferências entre contas",
        );
      }
      await call("estornar_transferencia_financeira", [
        w,
        transf,
        hoje,
        "Conferência de estorno da transferência",
      ]);
      const parametros = {
        salarios: 100000,
        encargos: 20,
        beneficios: 10000,
        prolabore: 0,
        indiretos: 80000,
        depreciacao: 0,
        profissionais: 1,
        dias: 20,
        horas: 8,
        ocupacao: 50,
        margem: 20,
        impostos: 10,
        taxas: 0,
        rateio: "horas",
      };
      await call("salvar_parametros_custeio", [w, mes, parametros, null]);
      let completo = await cust();
      eq(
        completo.indiretos,
        2000,
        "Duas horas apropriam R$20 de indiretos em 80h produtivas",
      );
      eq(
        completo.mao_obra_apropriada,
        0,
        "Mão de obra já apontada não é estimada de novo",
      );
      eq(
        completo.custo,
        2000 + custoServico + 6000 + 1234 + 700 + 2000,
        "Custo completo com indiretos preserva todas as fontes",
      );
      const revisao = {
        minutos: 120,
        categorias: Object.fromEntries(
          [
            "materiais",
            "mao_obra",
            "terceiros",
            "deslocamento",
            "impostos",
            "comissoes",
            "garantia",
            "outros",
          ].map((k) => [k, "Conferido na auditoria fictícia"]),
        ),
        desconsideradas: {},
      };
      await call("conferir_custeio_servico", [
        w,
        doc,
        completo.assinatura,
        revisao,
        null,
      ]);
      completo = await cust();
      eq(completo.conferido, true, "Conferência das fontes é refletida na OS");
      eq(
        await custoRelatorio(),
        completo.custo,
        "Relatório usa também custos indiretos apropriados",
      );
      const distribuicao = await call("consultar_contribuicao_equipe", [w, doc]);
      await call("salvar_atribuicao_equipe", [
        w,
        doc,
        {
          criterio: "manual",
          participantes: [
            { funcionario_id: r.funcionario, execucao_bp: 7500, venda_bp: 0 },
            { funcionario_id: outro, execucao_bp: 2500, venda_bp: 10000 },
          ],
          fontes: {},
        },
        distribuicao.documento.assinatura,
        distribuicao.atribuicao.revisao,
      ]);
      const resumo = await relatorio();
      if (auto) {
        eq(
          resumo.equipe.reduce((s, x) => s + x.receita, 0),
          receita,
          "Ranking automotivo respeita atribuição compartilhada",
        );
        eq(
          resumo.osFinanceiro[0].conferido,
          true,
          "Conferência válida chega ao relatório automotivo",
        );
      } else {
        eq(
          resumo.custosPendentes,
          0,
          "Relatório de serviços reconhece custos conferidos",
        );
        eq(
          resumo.funcionarios.find((x) => x.id === r.funcionario).horas,
          2,
          "Relatório de equipe mostra as horas da produção",
        );
        eq(
          resumo.funcionarios.find((x) => x.id === outro).valor,
          3750,
          "Ranking de equipe preserva percentual manual",
        );
      }
      const clientesFinal = await call("consultar_analise_gerencial", [
        w,
        "clientes",
        mes,
        hoje,
        {},
        0,
      ]);
      eq(
        clientesFinal.resumo.margem,
        receita - completo.custo,
        "Análise gerencial concilia o resultado final com indiretos e retorno",
      );
      const estrangeiro = Object.values(c.registros).find((x) => x.w !== w).w;
      await assert.rejects(
        () =>
          call(auto ? "consultar_relatorios_gestao" : "consultar_relatorios_servicos", [
            estrangeiro,
            mes,
            hoje,
          ]),
        (e) => e.code === "42501",
      );
      eq(true, true, "Relatório bloqueia acesso entre empresas");
      r.docRelatorio = doc;
      if (auto) {
        await c.db.exec('begin');
        await call('salvar_complemento_gestao',[w,'os',doc,{custo_externo_centavos:999,custos_conferidos:false},0]);
        eq((await cust()).custo,completo.custo+999,'Custo adicional legado é preservado no custeio da OS');
        eq(await custoRelatorio(),completo.custo+999,'Custo adicional legado não desaparece do relatório');
        await call('registrar_custo_servico',[w,doc,uuid(),{categoria:'outros',valor:999,descricao:'Apropriação do custo adicional legado',data:hoje,vencimento:hoje,fonte_origem:'complemento:'+doc}]);
        eq((await cust()).custo,completo.custo+999,'Lançar custo legado no financeiro não duplica a margem');
        await c.db.exec('rollback');await c.login(c.ids[perfil]);
      }
      if (!auto) {
        // Datas históricas controladas apenas na base isolada. A reabertura usa
        // a operação pública real e toda a simulação é desfeita ao final.
        await c.db.exec("begin; reset role; set local session_replication_role=replica");
        await c.db.query("update public.movimentacoes_estoque set criado_em='2026-10-10T12:00:00Z' where atendimento_id=$1 and tipo='saida'", [doc]);
        await c.db.exec("set local session_replication_role=origin");
        await c.login(c.ids[perfil]);
        const atual = (await call('consultar_detalhes_atendimento',[w,doc])).atendimento;
        await call('reabrir_atendimento_servico',[w,doc,atual.revisao,'Revisão de serviço concluído no mês passado']);
        const passado = await call('consultar_relatorios_servicos',[w,'2026-10-01','2026-10-31']);
        const esteMes = await call('consultar_relatorios_servicos',[w,mes,hoje]);
        const ambos = await call('consultar_relatorios_servicos',[w,'2026-10-01',hoje]);
        eq(Number(passado.estoque.find(p=>p.id===r.produto).consumido),1,'Devolução atual preserva consumo no mês anterior');
        eq(Number(esteMes.estoque.find(p=>p.id===r.produto).consumido),-1,'Devolução reduz consumo no mês em que aconteceu');
        eq(Number(ambos.estoque.find(p=>p.id===r.produto).consumido),0,'Período completo liquida consumo e devolução');
        eq(Number(esteMes.estoque.find(p=>p.id===r.produto).saldo),10,'Reabertura devolve material ao saldo');
        await c.db.exec('rollback');await c.login(c.ids[perfil]);
      }
      r.esperado = {
        receita,
        custo: completo.custo,
        margem: receita - completo.custo,
        caixa: 13066,
        estoque: 9,
        funcionario: r.funcionario,
        apoio: outro,
      };
      resultados.push({ perfil, checks, divergencias });
      console.log(
        perfil,
        checks.length,
        "verificações;",
        divergencias.length,
        "divergências",
      );
    }
    if (observer) await observer(c);
  } catch (e) {
    console.error(e.message, e.code, e.where);
    process.exitCode = 1;
    await writeFile(
      pasta + "/erro.json",
      JSON.stringify({ message: e.message, code: e.code, where: e.where }, null, 2),
    );
  } finally {
    await c?.db.close();
  }
  const saida = {
    data: new Date().toISOString(),
    concluido: resultados.length === 26,
    ok:
      !process.exitCode &&
      resultados.length === 26 &&
      resultados.every((r) => !r.divergencias.length),
    verificacoes: resultados.reduce((s, r) => s + r.checks.length, 0),
    divergencias: resultados.reduce((s, r) => s + r.divergencias.length, 0),
    resultados,
  };
  await writeFile(
    pasta + (process.argv.includes("--antes") ? "/antes.json" : "/numeros.json"),
    JSON.stringify(saida, null, 2),
  );
  console.log(
    JSON.stringify({
      ok: saida.ok,
      concluido: saida.concluido,
      verificacoes: saida.verificacoes,
      divergencias: saida.divergencias,
    }),
  );
  if (!saida.ok) process.exitCode = 1;
  return saida;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await auditarNumeros();
