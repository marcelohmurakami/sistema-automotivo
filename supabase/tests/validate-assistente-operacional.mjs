import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { criarCenarioSubsistemas } from "./subsistemas-fixture.mjs";
process.env.DB_VALIDATION_MIGRATION_LIMIT ||= "20261023000300";
const { db, registros, ids, login } = await criarCenarioSubsistemas();
const one = async (sql, args = []) =>
  Object.values((await db.query(sql, args)).rows[0])[0];
const call = (fn, args) =>
  one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")})`, args);
let checagens = 0;
async function esperarErro(fn, padrao) {
  await assert.rejects(fn, padrao);
  checagens++;
}
try {
  for (const [perfil, f] of Object.entries(registros)) {
    await login(ids[perfil]);
    const sessao = randomUUID();
    const preparar = async (acao, dados) => {
      const turno = await call("iniciar_turno_assistente", [f.w, sessao, randomUUID()]);
      return call("preparar_assistente", [f.w, sessao, turno.versao, acao, dados]);
    };
    const consultar = (tipo, busca = "", id = null, cliente = null) =>
      call("consultar_assistente", [f.w, tipo, busca, id, cliente]);
    for (const tipo of [
      "clientes",
      "catalogo",
      "objetos",
      "servicos",
      "parados",
      "estoque",
      "contas",
      "devedores",
      "financeiro",
      "agenda",
      "recursos",
    ]) {
      const r = await consultar(tipo, "", null, tipo === "objetos" ? f.cliente : null);
      assert.ok(Array.isArray(r.linhas), `${perfil}/${tipo}`);
      if (!["financeiro", "agenda"].includes(tipo)) {
        assert.equal(
          r.inicio,
          null,
          `${perfil}/${tipo}: não anuncia filtro inexistente`,
        );
        assert.equal(r.fim, null);
      }
      checagens++;
    }
    const catalogo = (await consultar("catalogo")).linhas.find(
      (i) => i.tipo === "service",
    );
    const dados = {
      tipo: "orcamento",
      alvo_id: null,
      cliente_id: f.cliente,
      objeto_id: f.objeto,
      identificacao: null,
      motor: f.atendimento ? null : "GM Família 1",
      motor_sugerido: !f.atendimento,
      titulo: "Serviço solicitado pelo usuário",
      data: f.atendimento ? f.hoje : "2026-09-17",
      observacao: "Detalhe informado",
      forma_pagamento: "Carteira",
      vencimento_pagamento: f.hoje,
      entrega_prevista: `${f.hoje}T17:00:00-03:00`,
      desconto_centavos: 0,
      itens: [
        {
          catalogo_id: catalogo.id,
          descricao: null,
          tipo: "service",
          quantidade: 2,
          preco_centavos: 1,
        },
      ],
    };
    const p = await preparar("documento", dados);
    assert.equal(p.total_centavos, 20000, "preço sempre vem do catálogo");
    assert.equal(p.itens[0].origem, "Preço do catálogo");
    const antes = await consultar("servicos");
    const r = await call("confirmar_assistente", [f.w, p.id]);
    assert.equal(r.mensagem, "Documento salvo.");
    if (!f.atendimento) {
      let q = await call("consultar_orcamento", [f.w, r.id]);
      assert.equal(
        q.versao.data_servico,
        dados.data,
        "Data conferida permanece no orçamento",
      );
      assert.equal(q.versao.dados_veiculo.motor, dados.motor);
      assert.notEqual(
        q.versao.dados_veiculo.modelo,
        dados.motor,
        "Carro não vira nome de motor",
      );
      q = await call("revisar_orcamento", [f.w, q.id, q.revisao]);
      assert.equal(q.versao.data_servico, dados.data, "Revisão preserva a data");
      q = await call("salvar_orcamento", [
        f.w,
        {
          cliente_id: f.cliente,
          veiculo_id: q.veiculo_id,
          itens: q.itens,
          observacoes: "Edição posterior",
          desconto_centavos: 0,
        },
        randomUUID(),
        q.id,
        q.revisao,
      ]);
      assert.equal(
        q.versao.dados_veiculo.motor,
        dados.motor,
        "Edição comum preserva motor",
      );
      assert.equal(q.versao.data_servico, dados.data, "Edição comum não apaga a data");
      q = await call("emitir_orcamento", [
        f.w,
        q.id,
        q.revisao,
        7,
        randomUUID().replaceAll("-", "").repeat(2),
      ]);
      await call("aprovar_orcamento_interno", [f.w, q.id, q.revisao, q.versao.id]);
      const convertido = await call("converter_orcamento_em_os", [f.w, q.id]);
      const ficha = await call("consultar_ordem_servico", [f.w, convertido]);
      assert.equal(ficha.data_servico, dados.data, "Conversão em OS preserva a data");
      checagens += 4;
      assert.equal(
        ficha.dados_veiculo.motor,
        dados.motor,
        "Conversão em OS preserva motor",
      );
    }
    if (f.atendimento) {
      const parados = await consultar("parados", "", r.id);
      assert.equal(
        parados.linhas.length,
        1,
        `${perfil}: orçamento aguardando aprovação aparece nos parados`,
      );
      assert.equal(parados.linhas[0].motivo, "Aguardando aprovação do orçamento");
      await db.exec("reset role");
      await db.query(
        'update public.atendimentos_servicos set dados=dados||\'{"orcamento_enviado":"nao"}\'::jsonb where id=$1',
        [r.id],
      );
      await login(ids[perfil]);
      assert.equal(
        (await consultar("parados", "", r.id)).linhas.length,
        0,
        "Rascunho recebido não é serviço parado",
      );
      await db.exec("reset role");
      await db.query(
        "update public.atendimentos_servicos set dados=dados||'{\"orcamento_enviado\":\"sim\"}'::jsonb,ficha_especialidade=jsonb_set(ficha_especialidade,'{campos,pendencia}','\"Aguardando peças de teste\"') where id=$1",
        [r.id],
      );
      await login(ids[perfil]);
      assert.equal(
        (await consultar("parados", "", r.id)).linhas[0].motivo,
        "Aguardando peças de teste",
        "Motivo vem da ficha técnica",
      );
    }
    assert.deepEqual(
      await call("confirmar_assistente", [f.w, p.id]),
      r,
      "confirmação duplicada retorna o mesmo registro",
    );
    const criada = await preparar("documento", {
      ...dados,
      tipo: "ordem_servico",
      objeto_id: null,
      identificacao: `Identificação nova ${perfil}`,
    });
    const salvo = await call("confirmar_assistente", [f.w, criada.id]);
    const os = (await consultar("servicos", "", salvo.id)).linhas[0];
    const dataFiltrada = await call("consultar_assistente", [
      f.w,
      "servicos",
      "",
      salvo.id,
      null,
      dados.data,
      dados.data,
    ]);
    assert.equal(dataFiltrada.linhas.length, 1);
    assert.equal(dataFiltrada.inicio, dados.data);
    assert.equal(
      (
        await call("consultar_assistente", [
          f.w,
          "servicos",
          "",
          salvo.id,
          null,
          "2000-01-01",
          "2000-01-31",
        ])
      ).linhas.length,
      0,
    );
    assert.equal(Number(os.total_centavos), 20000);
    if (!f.atendimento)
      assert.equal(os.motor, dados.motor, "OS nova consulta motor separado");
    assert.equal(os.cliente_id, f.cliente);
    // Identificação é livre: opcionais conhecidos ficam separados e não dependem de busca de cadastro.
    const ramo = await one("select ramo from public.oficinas where id=$1", [f.w]);
    const opcionais = !f.atendimento
      ? { placa: "QAQ1A23" }
      : ramo === "limpeza"
        ? { endereco: "Rua de teste 23" }
        : {
            marca: "Marca QA",
            modelo: "Modelo QA",
            serie: "SERIE-QA",
            endereco: "Rua de teste 23",
          };
    const livre = await preparar("documento", {
      ...dados,
      objeto_id: null,
      identificacao: `Nome livre ${perfil}`,
      opcionais,
    });
    assert.equal(
      livre.campos.find((c) => c.editar === "veiculo" || c.editar === "identificacao")
        .valor,
      `Nome livre ${perfil}`,
    );
    const livreSalvo = await call("confirmar_assistente", [f.w, livre.id]);
    if (!f.atendimento) {
      const q = await call("consultar_orcamento", [f.w, livreSalvo.id]);
      assert.equal(q.versao.dados_veiculo.placa, "QAQ1A23");
      assert.equal(q.versao.dados_veiculo.motor, dados.motor);
    } else {
      const d = await call("consultar_detalhes_atendimento", [f.w, livreSalvo.id]);
      assert.deepEqual(d.objeto.dados, opcionais);
    }
    const semNome = await preparar("documento", {
      ...dados,
      tipo: "ordem_servico",
      objeto_id: null,
      identificacao: null,
      motor: f.atendimento ? null : "AP",
      motor_sugerido: false,
      opcionais: null,
      itens: Array.from({ length: 7 }, () => ({ ...dados.itens[0], quantidade: 1 })),
    });
    assert.equal(semNome.itens.length, 7);
    assert.match(
      semNome.campos.find((c) => c.editar === "veiculo" || c.editar === "identificacao")
        .valor,
      /não informado/,
    );
    const semNomeSalvo = await call("confirmar_assistente", [f.w, semNome.id]);
    const livreOS = (await consultar("servicos", "", semNomeSalvo.id)).linhas[0];
    assert.equal(Number(livreOS.total_centavos), 70000);
    if (!f.atendimento) {
      assert.equal(livreOS.motor, "AP");
      assert.notEqual(livreOS.identificacao, "AP");
    }
    await esperarErro(
      () =>
        preparar("documento", {
          ...dados,
          objeto_id: null,
          opcionais: { sql: "select 1" },
        }),
      /opcional inválido/,
    );
    await esperarErro(
      () =>
        preparar("documento", {
          ...dados,
          objeto_id: null,
          opcionais: f.atendimento ? { placa: "ABC1234" } : { serie: "123" },
        }),
      /ramo/,
    );
    checagens += 8;
    const extra = await preparar("documento", {
      ...dados,
      tipo: "adicionar_itens",
      motor: null,
      motor_sugerido: false,
      forma_pagamento: null,
      vencimento_pagamento: null,
      entrega_prevista: null,
      alvo_id: salvo.id,
      itens: [{ ...dados.itens[0], quantidade: 1 }],
    });
    await call("confirmar_assistente", [f.w, extra.id]);
    assert.equal(
      Number((await consultar("servicos", "", salvo.id)).linhas[0].total_centavos),
      30000,
    );
    const nota = await preparar("anotacao", {
      alvo_id: salvo.id,
      texto: "Cliente pediu contato antes de executar.",
    });
    await call("confirmar_assistente", [f.w, nota.id]);
    const garantia = await preparar("garantia", {
      alvo_id: salvo.id,
      motivo: "recorrencia",
      descricao: "Cliente relatou retorno do problema.",
      custo_centavos: 1500,
      minutos: 30,
    });
    await call("confirmar_assistente", [f.w, garantia.id]);
    const auto = !f.atendimento;
    const ag = await preparar("agendamento", {
      alvo_id: auto ? null : salvo.id,
      cliente_id: f.cliente,
      identificacao: "Atendimento de teste",
      recurso_id: auto ? null : f.recurso,
      recurso: "Bancada QA",
      inicio: `${f.hoje}T15:00:00-03:00`,
      fim: `${f.hoje}T16:00:00-03:00`,
      visita: !auto,
      deslocamento_minutos: auto ? 0 : 20,
      descricao: "Conferência do serviço",
    });
    await call("confirmar_assistente", [f.w, ag.id]);
    const conflito = await preparar("agendamento", {
      alvo_id: auto ? null : salvo.id,
      cliente_id: f.cliente,
      identificacao: "Atendimento de teste",
      recurso_id: auto ? null : f.recurso,
      recurso: "Bancada QA",
      inicio: `${f.hoje}T15:30:00-03:00`,
      fim: `${f.hoje}T16:30:00-03:00`,
      visita: !auto,
      deslocamento_minutos: auto ? 0 : 20,
      descricao: "Conferência do serviço",
    });
    await esperarErro(
      () => call("confirmar_assistente", [f.w, conflito.id]),
      /horário|ocupado/i,
    );
    const velha = await preparar("documento", dados);
    await call("iniciar_turno_assistente", [f.w, sessao, randomUUID()]);
    await esperarErro(
      () => call("confirmar_assistente", [f.w, velha.id]),
      /expirou|substituído/,
    );
    await esperarErro(
      () =>
        preparar("documento", {
          ...dados,
          itens: [
            {
              catalogo_id: null,
              descricao: "Sem preço",
              tipo: "service",
              quantidade: 1,
              preco_centavos: null,
            },
          ],
        }),
      /preço/,
    );
    await esperarErro(
      () =>
        preparar("documento", {
          ...dados,
          itens: [{ ...dados.itens[0], quantidade: 1.001 }],
        }),
      /inteiras/,
    );
    await esperarErro(() => consultar("sql"), /permitida/);
    assert.ok((await consultar("servicos")).linhas.length > antes.linhas.length);
    checagens += 15;
    console.log(
      `PASS ${perfil}: consultas, catálogo, orçamento, OS, inclusão, anotação, garantia, agenda, conflito e confirmação única`,
    );
  }
  const f = registros.mecanica;
  await login(ids.mecanica);
  const prepararIsolado = async (acao, dados) => {
    const sessao = randomUUID();
    const turno = await call("iniciar_turno_assistente", [f.w, sessao, randomUUID()]);
    return call("preparar_assistente", [f.w, sessao, turno.versao, acao, dados]);
  };
  const titulo = randomUUID();
  await call("salvar_titulo_financeiro", [
    f.w,
    titulo,
    {
      natureza: "receber",
      descricao: "Conta teste assistente",
      categoria: "servicos",
      valor_centavos: 10000,
      competencia: f.hoje,
      vencimento: f.hoje,
      pessoa: "Cliente QA",
    },
  ]);
  const recebimento = {
    titulo_id: titulo,
    valor_centavos: 4000,
    taxa_centavos: 100,
    forma: "pix",
    conta: "banco",
    data: f.hoje,
    vencimento_restante: "2027-01-15",
    observacao: "Pagamento parcial informado pelo usuário",
  };
  const pagamento = await prepararIsolado("recebimento", recebimento);
  assert.equal(pagamento.total_centavos, 4000);
  assert.equal(
    Number(
      await one("select aberto_centavos from private.financeiro_saldos where id=$1", [
        titulo,
      ]).catch(() => -1),
    ),
    -1,
    "tabela privada não exposta ao usuário",
  );
  const pago = await call("confirmar_assistente", [f.w, pagamento.id]);
  assert.equal(pago.mensagem, "Pagamento registrado.");
  assert.deepEqual(await call("confirmar_assistente", [f.w, pagamento.id]), pago);
  let contas = await call("consultar_assistente", [f.w, "contas", "", titulo]);
  assert.equal(Number(contas.linhas[0].aberto_centavos), 6000);
  assert.equal(contas.linhas[0].vencimento, "2027-01-15");
  const defasado = await prepararIsolado("recebimento", {
    ...recebimento,
    valor_centavos: 2000,
    vencimento_restante: null,
  });
  const baixa = await call("baixar_titulo_financeiro", [
    f.w,
    titulo,
    randomUUID(),
    1000,
    0,
    f.hoje,
    "caixa",
    "dinheiro",
    "Outro operador",
  ]);
  await esperarErro(
    () => call("confirmar_assistente", [f.w, defasado.id]),
    /saldo mudou/,
  );
  await call("estornar_baixa_financeira", [f.w, baixa, f.hoje, "Estorno teste"]);
  const resumo = await call("consultar_assistente", [
    f.w,
    "financeiro",
    "",
    null,
    null,
    f.hoje,
    f.hoje,
  ]);
  assert.equal(
    Number(resumo.linhas[0].recebido_centavos),
    4000,
    "estornos descontados do recebido",
  );
  await esperarErro(
    () => prepararIsolado("recebimento", { ...recebimento, valor_centavos: 6001 }),
    /valor/,
  );
  const catalogo = (await call("consultar_assistente", [f.w, "catalogo"])).linhas.find(
    (c) => c.tipo === "service",
  );
  const documento = {
    tipo: "ordem_servico",
    cliente_id: f.cliente,
    objeto_id: f.objeto,
    titulo: "Serviço teste",
    data: f.hoje,
    itens: [{ catalogo_id: catalogo.id, quantidade: 1 }],
    desconto_centavos: 0,
  };
  const precoAntigo = await prepararIsolado("documento", documento);
  await db.exec("reset role");
  await db.query(
    "update public.itens_catalogo set preco_padrao_centavos=12000,revisao=revisao+1 where id=$1",
    [catalogo.id],
  );
  await login(ids.mecanica);
  await esperarErro(
    () => call("confirmar_assistente", [f.w, precoAntigo.id]),
    /catálogo mudou/,
  );
  const expirada = await prepararIsolado("documento", documento);
  await db.exec("reset role");
  await db.query(
    "update public.propostas_assistente set expira_em=now()-interval '1 second' where id=$1",
    [expirada.id],
  );
  await login(ids.mecanica);
  await esperarErro(() => call("confirmar_assistente", [f.w, expirada.id]), /expirou/);
  const staff = randomUUID();
  await db.exec("reset role");
  await db.query("insert into auth.users(id) values($1)", [staff]);
  await db.query(
    "insert into public.membros_oficina(oficina_id,usuario_id,perfil,ativo) values($1,$2,'staff',true)",
    [f.w, staff],
  );
  await login(staff);
  await esperarErro(
    () => call("consultar_assistente", [f.w, "financeiro"]),
    /gerência/,
  );
  await esperarErro(
    () => call("confirmar_assistente", [f.w, pagamento.id]),
    /indisponível/,
  );
  await db.exec("reset role");
  await db.query(
    "update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id=$1",
    [f.w],
  );
  await login(ids.mecanica);
  await esperarErro(() => call("consultar_assistente", [f.w, "clientes"]), /plano/);
  await db.exec("reset role");
  await db.query(
    "update public.assinaturas_oficina set codigo_plano='complete' where oficina_id=$1",
    [f.w],
  );
  await login(ids.mecanica);
  checagens += 12;
  const sessao = randomUUID(),
    chave = randomUUID();
  const turno = await call("iniciar_turno_assistente", [f.w, sessao, chave]);
  await esperarErro(
    () => call("iniciar_turno_assistente", [f.w, sessao, chave]),
    /processamento/,
  );
  await call("concluir_turno_assistente", [
    f.w,
    sessao,
    chave,
    { texto: "Resposta de teste" },
  ]);
  assert.equal(
    (await call("iniciar_turno_assistente", [f.w, sessao, chave])).resposta.texto,
    "Resposta de teste",
  );
  await esperarErro(
    () =>
      call("preparar_assistente", [
        f.w,
        sessao,
        turno.versao,
        "anotacao",
        {
          alvo_id: registros.assistencia_celulares.atendimento,
          texto: "Não pode acessar outro cliente",
        },
      ]),
    /indisponível/,
  );
  await login(ids.stranger);
  await esperarErro(() => call("consultar_assistente", [f.w, "clientes"]));
  await esperarErro(() =>
    call("iniciar_turno_assistente", [f.w, sessao, randomUUID()]),
  );
  console.log(
    `PASS assistente: ${checagens} verificações em 26 subsetores; nenhum dado remoto alterado.`,
  );
} finally {
  await db.close();
}
