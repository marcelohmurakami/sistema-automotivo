import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { criarCenarioSubsistemas } from "./subsistemas-fixture.mjs";

process.env.DB_VALIDATION_MIGRATION_LIMIT ||= "20261026000100";
let db;
const resultados = [];
try {
  const fixture = await criarCenarioSubsistemas();
  db = fixture.db;
  const { ids, registros, login } = fixture;
  const one = async (sql, args = []) =>
    Object.values((await db.query(sql, args)).rows[0])[0];
  const call = (fn, args) =>
    one(`select public.${fn}(${args.map((_, i) => "$" + (i + 1)).join(",")})`, args);
  const token = () => {
    const texto = randomBytes(32).toString("hex");
    return { texto, hash: createHash("sha256").update(texto).digest("hex") };
  };
  const falha = async (fn, codigo) => assert.rejects(fn, (e) => e.code === codigo);
  const perfis = Object.entries(registros).filter(([, r]) => r.atendimento);
  for (const [perfil, r] of perfis) {
    for (const origem of ["link", "portal", "equipe"]) {
      await login(ids[perfil]);
      const original = await call("consultar_detalhes_atendimento", [
        r.w,
        r.atendimento,
      ]);
      const id = randomUUID();
      await call("salvar_atendimento_servico", [
        r.w,
        id,
        {
          ...original.atendimento,
          id,
          numero: undefined,
          valor_centavos: 0,
          dados: { documento: "orcamento", segredo: "NAO_PUBLICAR_DADOS" },
          resumo_cliente: "Escopo público",
        },
        null,
      ]);
      const itens = original.itens.map((i) => ({
        ...i,
        id: randomUUID(),
        grupo_servico: "Reparo principal",
      }));
      itens.push({
        id: randomUUID(),
        tipo: "servico",
        descricao: "Serviço adicional opcional",
        quantidade: 1,
        unidade: "un",
        preco_centavos: 10000,
        custo_centavos: 777,
        origem: "externa",
        grupo_servico: "Adicional",
        depende_grupo: "Reparo principal",
      });
      await call("salvar_itens_atendimento", [
        r.w,
        id,
        1,
        itens,
        2500,
        0,
        "CUSTO_INTERNO_SECRETO",
      ]);
      let d = await call("consultar_detalhes_atendimento", [r.w, id]);
      const revInicial = d.atendimento.revisao;
      let rev = revInicial;
      const segredo = token();
      if (origem === "portal") {
        await call("compartilhar_atendimento_cliente", [
          r.w,
          id,
          rev,
          true,
          "Escopo público",
        ]);
        rev++;
        await login(ids.customer);
        const portal = await call("consultar_meu_portal", [r.w]);
        const a = portal.atendimentos.find((a) => a.id === id);
        assert.equal(a.itens[0].grupo_servico, "Reparo principal");
        await login(ids.stranger);
        await falha(
          () =>
            call("responder_meu_orcamento_servico", [
              r.w,
              id,
              rev,
              ["Reparo principal"],
              "Cliente QA",
              "aprovado",
              true,
            ]),
          "42501",
        );
        await login(ids.customer);
      } else if (origem === "link") {
        await call("gerar_link_proposta_atendimento", [r.w, id, rev, segredo.hash, 7]);
        await login("", "anon");
        const p = await call("consultar_proposta_atendimento", [segredo.texto]);
        assert.equal(p.documento.total_centavos, 22500);
        assert.equal(p.documento.itens.length, 3);
        for (const privado of [
          "custo_centavos",
          "produto_id",
          "NAO_PUBLICAR_DADOS",
          "CUSTO_INTERNO_SECRETO",
          "ficha_especialidade",
          "telefone",
        ])
          assert.ok(!JSON.stringify(p).includes(privado), privado);
        await falha(
          () =>
            call("responder_link_proposta_atendimento", [
              segredo.texto,
              "Cliente QA",
              "aprovado",
              ["Adicional"],
              true,
            ]),
          "22023",
        );
        await falha(
          () =>
            call("responder_link_proposta_atendimento", [
              segredo.texto,
              "Cliente QA",
              "aprovado",
              [],
              true,
            ]),
          "22023",
        );
        await falha(
          () =>
            call("responder_link_proposta_atendimento", [
              segredo.texto,
              "Cliente QA",
              "aprovado",
              ["Inventado"],
              true,
            ]),
          "22023",
        );
        await falha(
          () =>
            call("responder_link_proposta_atendimento", [
              segredo.texto,
              "Cliente QA",
              "aprovado",
              ["Reparo principal"],
              false,
            ]),
          "22023",
        );
        await falha(
          () =>
            call("responder_link_proposta_atendimento", [
              segredo.texto,
              " ",
              "aprovado",
              ["Reparo principal"],
              true,
            ]),
          "22023",
        );
        await falha(
          () => one("select documento from public.propostas_atendimento"),
          "42501",
        );
        await falha(
          () => one("select hash_token from public.links_proposta_atendimento"),
          "42501",
        );
        await falha(
          () =>
            call("aprovar_grupos_atendimento", [
              r.w,
              id,
              rev,
              ["Reparo principal"],
              "Intruso",
              true,
            ]),
          "42501",
        );
      }
      const resposta = () =>
        origem === "link"
          ? call("responder_link_proposta_atendimento", [
              segredo.texto,
              "Cliente QA",
              "aprovado",
              ["Reparo principal"],
              true,
            ])
          : origem === "portal"
            ? call("responder_meu_orcamento_servico", [
                r.w,
                id,
                rev,
                ["Reparo principal"],
                "Cliente QA",
                "aprovado",
                true,
              ])
            : call("aprovar_grupos_atendimento", [
                r.w,
                id,
                rev,
                ["Reparo principal"],
                "Cliente QA",
                true,
              ]);
      await resposta();
      await resposta(); // repetição de rede não duplica nem altera a decisão
      if (origem === "link")
        await falha(
          () =>
            call("responder_link_proposta_atendimento", [
              segredo.texto,
              "Cliente QA",
              "aprovado",
              ["Reparo principal", "Adicional"],
              true,
            ]),
          "PT409",
        );
      await login(ids[perfil]);
      d = await call("consultar_detalhes_atendimento", [r.w, id]);
      assert.equal(d.atendimento.situacao, "aprovado");
      assert.equal(d.atendimento.dados.documento, "ordem");
      assert.equal(d.atendimento.valor_centavos, 13500);
      assert.equal(d.atendimento.revisao, rev + 1);
      assert.equal(d.itens.length, 2);
      assert.equal(d.comercial.desconto_centavos, 1500);
      assert.equal(d.comercial.orcado_centavos, 22500);
      assert.equal(d.propostas.length, 1);
      assert.equal(d.propostas[0].documento.itens.length, 3);
      assert.equal(d.propostas[0].total_aprovado_centavos, 13500);
      assert.equal(d.propostas[0].origem, origem);
      assert.equal(d.eventos.filter((e) => e.tipo === "resposta_orcamento").length, 1);
      const saldo = await one(
        "select saldo from public.estoque_produtos where oficina_id=$1 and item_catalogo_id=$2",
        [r.w, r.produto],
      );
      assert.equal(Number(saldo), 10);
      const conta = await call("faturar_atendimento_servico", [r.w, id]);
      assert.equal(
        await one(
          "select valor_centavos from public.titulos_financeiros where oficina_id=$1 and id=$2",
          [r.w, conta],
        ),
        13500,
      );
      assert.equal(await call("faturar_atendimento_servico", [r.w, id]), conta);
      resultados.push({
        perfil,
        origem,
        ok: true,
        totalOriginal: 22500,
        totalAutorizado: 13500,
      });
    }
    console.log(
      `PASS ${perfil}: aprovação parcial por link, portal e equipe; descontos, dependências, histórico, isolamento e repetição`,
    );
  }
  // Casos negativos e ciclo de edição/reenvio no mesmo contrato usado pelos 16 subsetores.
  const r = registros.assistencia_celulares;
  await login(ids.assistencia_celulares);
  const novo = async () => {
    const id = randomUUID();
    await call("salvar_atendimento_servico", [
      r.w,
      id,
      {
        cliente_id: r.cliente,
        objeto_id: r.objeto,
        titulo: "Proposta de teste",
        situacao: "orcamento",
        valor_centavos: 12345,
        vencimento: r.hoje,
        dados: { documento: "orcamento" },
      },
    ]);
    return id;
  };
  const id = await novo(),
    t1 = token(),
    t2 = token();
  await call("gerar_link_proposta_atendimento", [r.w, id, 1, t1.hash, 1]);
  await call("gerar_link_proposta_atendimento", [r.w, id, 1, t2.hash, 7]);
  await login("", "anon");
  await falha(() => call("consultar_proposta_atendimento", [t1.texto]), "P0002");
  await login(ids.assistencia_celulares);
  let a = (await call("consultar_detalhes_atendimento", [r.w, id])).atendimento;
  await call("salvar_atendimento_servico", [
    r.w,
    id,
    { ...a, titulo: "Proposta alterada" },
    a.revisao,
  ]);
  await login("", "anon");
  await falha(
    () =>
      call("responder_link_proposta_atendimento", [
        t2.texto,
        "Cliente QA",
        "aprovado",
        ["Atendimento"],
        true,
      ]),
    "P0002",
  );
  await login(ids.assistencia_celulares);
  const t3 = token();
  await call("gerar_link_proposta_atendimento", [r.w, id, 2, t3.hash, 7]);
  await login("", "anon");
  await call("responder_link_proposta_atendimento", [
    t3.texto,
    "Cliente QA",
    "recusado",
    [],
    true,
  ]);
  await call("responder_link_proposta_atendimento", [
    t3.texto,
    "Cliente QA",
    "recusado",
    [],
    true,
  ]);
  await falha(
    () =>
      call("responder_link_proposta_atendimento", [
        t3.texto,
        "Cliente QA",
        "aprovado",
        ["Atendimento"],
        true,
      ]),
    "PT409",
  );
  await login(ids.assistencia_celulares);
  assert.equal(
    (await call("consultar_detalhes_atendimento", [r.w, id])).atendimento
      .valor_centavos,
    12345,
  );
  const t4 = token();
  await call("gerar_link_proposta_atendimento", [r.w, id, 3, t4.hash, 1]);
  await db.exec("reset role");
  await db.query(
    "update public.links_proposta_atendimento set expira_em=now()-interval '1 second' where hash_token=$1",
    [t4.hash],
  );
  await login("", "anon");
  await falha(() => call("consultar_proposta_atendimento", [t4.texto]), "P0002");
  await falha(() => call("consultar_proposta_atendimento", ["invalido"]), "P0002");
  await login(ids.assistencia_celulares);
  const t5 = token();
  await call("gerar_link_proposta_atendimento", [r.w, id, 3, t5.hash, 7]);
  await call("revogar_links_proposta_atendimento", [r.w, id]);
  await login("", "anon");
  await falha(() => call("consultar_proposta_atendimento", [t5.texto]), "P0002");
  await login(ids.stranger);
  await falha(
    () => call("gerar_link_proposta_atendimento", [r.w, id, 3, token().hash, 7]),
    "42501",
  );
  await falha(() => call("revogar_links_proposta_atendimento", [r.w, id]), "42501");
  // O link funciona no plano com orçamentos, sem exigir o plano do portal.
  await db.exec("reset role");
  await db.query(
    "update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id=$1",
    [r.w],
  );
  await login(ids.assistencia_celulares);
  const semPortal = await novo(),
    tokenSemPortal = token();
  await call("gerar_link_proposta_atendimento", [
    r.w,
    semPortal,
    1,
    tokenSemPortal.hash,
    7,
  ]);
  await login("", "anon");
  assert.equal(
    (await call("consultar_proposta_atendimento", [tokenSemPortal.texto])).documento
      .total_centavos,
    12345,
  );
  await call("responder_link_proposta_atendimento", [
    tokenSemPortal.texto,
    "Cliente QA",
    "aprovado",
    ["Atendimento"],
    true,
  ]);
  await db.exec("reset role");
  await db.query(
    "update public.assinaturas_oficina set codigo_plano='basic' where oficina_id=$1",
    [r.w],
  );
  await login("", "anon");
  await falha(
    () => call("consultar_proposta_atendimento", [tokenSemPortal.texto]),
    "P0002",
  );
  await login(ids.assistencia_celulares);
  await falha(
    () => call("gerar_link_proposta_atendimento", [r.w, id, 3, token().hash, 7]),
    "42501",
  );
  await db.exec("reset role");
  await db.query(
    "update public.assinaturas_oficina set codigo_plano='complete' where oficina_id=$1",
    [r.w],
  );
  // A recusa no portal fecha a resposta, preservando o orçamento para revisão.
  await login(ids.assistencia_celulares);
  const recusadoPortal = await novo();
  await call("compartilhar_atendimento_cliente", [
    r.w,
    recusadoPortal,
    1,
    true,
    "Proposta QA",
  ]);
  await login(ids.customer);
  await call("responder_meu_orcamento_servico", [
    r.w,
    recusadoPortal,
    2,
    [],
    "Cliente QA",
    "recusado",
    true,
  ]);
  const portalRecusado = (await call("consultar_meu_portal", [r.w])).atendimentos.find(
    (a) => a.id === recusadoPortal,
  );
  assert.equal(portalRecusado.resposta.decisao, "recusado");
  assert.equal(portalRecusado.valor_centavos, 12345);
  await db.exec("reset role");
  assert.equal(
    await one(
      "select dados->>'orcamento_recusado_revisao' from public.atendimentos_servicos where id=$1",
      [recusadoPortal],
    ),
    "3",
  );
  await login(ids.assistencia_celulares);
  const reenvio = token();
  await call("gerar_link_proposta_atendimento", [
    r.w,
    recusadoPortal,
    3,
    reenvio.hash,
    7,
  ]);
  await db.exec("reset role");
  assert.equal(
    await one(
      "select dados ? 'orcamento_recusado_revisao' from public.atendimentos_servicos where id=$1",
      [recusadoPortal],
    ),
    false,
  );
  assert.equal(
    await one(
      "select count(*)::integer from public.propostas_atendimento where atendimento_id=$1 and decisao='recusado'",
      [recusadoPortal],
    ),
    1,
  );
  await login(ids.customer);
  const portalReenviado = (await call("consultar_meu_portal", [r.w])).atendimentos.find(
    (a) => a.id === recusadoPortal,
  );
  assert.equal(portalReenviado.resposta, null);
  await call("responder_meu_orcamento_servico", [
    r.w,
    recusadoPortal,
    3,
    ["Atendimento"],
    "Cliente QA",
    "aprovado",
    true,
  ]);
  await login("", "anon");
  assert.equal(
    (await call("consultar_proposta_atendimento", [reenvio.texto])).decisao,
    "aprovado",
  );
  await db.exec("reset role");
  const snapshot = await one(
    "select id from public.propostas_atendimento where atendimento_id=$1 and decisao is not null",
    [id],
  );
  await falha(
    () =>
      db.query("update public.propostas_atendimento set documento='{}' where id=$1", [
        snapshot,
      ]),
    "22023",
  );
  await falha(
    () => db.query("delete from public.propostas_atendimento where id=$1", [snapshot]),
    "22023",
  );
  assert.equal(
    await one(
      "select has_function_privilege('anon','private.fotografar_proposta_atendimento(uuid,uuid,integer)','execute')",
    ),
    false,
  );
  assert.equal(
    await one(
      "select has_function_privilege('authenticated','private.responder_proposta_atendimento(uuid,text,text,text[],boolean,text)','execute')",
    ),
    false,
  );
  await mkdir("output/aprovacao-servicos-20261026", { recursive: true });
  await writeFile(
    "output/aprovacao-servicos-20261026/banco.json",
    JSON.stringify(
      {
        aprovado: true,
        subsetores: perfis.length,
        cenarios: resultados.length,
        resultados,
        negativos: [
          "versão alterada",
          "link substituído",
          "expiração",
          "revogação",
          "decisão conflitante",
          "isolamento",
          "nome e confirmação",
          "grupos inválidos",
          "dependências",
          "imutabilidade",
          "acesso direto bloqueado",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS ${resultados.length} fluxos em ${perfis.length} subsetores e casos negativos de segurança/concorrência lógica.`,
  );
} catch (e) {
  console.error(e.message, e.code, e.where, e.stack);
  process.exitCode = 1;
} finally {
  await db?.close();
}
