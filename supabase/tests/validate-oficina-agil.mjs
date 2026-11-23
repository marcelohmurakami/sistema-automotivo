import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { criarBancoLocal } from "./banco-local.mjs";
const db = await criarBancoLocal("20261005000500");
let n = 0;
const scalar = async (q, p = []) =>
  Object.values((await db.query(q, p)).rows[0])[0];
const call = (nome, args) =>
  scalar(
    `select public.${nome}(${args.map((_, i) => "$" + (i + 1)).join(",")})`,
    args.map((x) =>
      x && typeof x === "object" && !Array.isArray(x) ? JSON.stringify(x) : x,
    ),
  );
const login = (u, role = "authenticated") =>
  db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${u}',false);set role ${role}`,
  );
const ok = (v, m) => {
  assert.ok(v, m);
  console.log("PASS", m);
  n++;
};
const fails = async (fn, m) => {
  await assert.rejects(fn);
  console.log("PASS", m);
  n++;
};
const owner = randomUUID(),
  other = randomUUID(),
  staff = randomUUID();
try {
  await db.exec(
    `alter table auth.users add column if not exists email text;alter table auth.users add column if not exists email_confirmed_at timestamptz;insert into auth.users values('${owner}','owner@example.com',now()),('${other}','other@example.com',now()),('${staff}','staff@example.com',now())`,
  );
  await login(owner);
  const w = await call("criar_oficina", ["Bancada oficina ágil", null]);
  await fails(
    () => call("consultar_oportunidades", [w]),
    "Básico não acessa oportunidades de orçamentos",
  );
  await db.exec(
    `reset role;update public.assinaturas_oficina set codigo_plano='complete' where oficina_id='${w}'`,
  );
  await login(owner);
  const c = (
    await call("salvar_cliente", [
      w,
      {
        nome: "Cliente integração",
        telefone_e164: "+5516999990000",
        email: "cliente@example.com",
      },
    ])
  ).id;
  const v = await call("cadastrar_veiculo_orcamento", [w, c, "Gol", "QAZ1A23"]);
  const item = (grupo, preco, depende = "") => ({
    grupo_servico: grupo,
    depende_grupo: depende,
    descricao: "Serviço " + grupo,
    tipo: "service",
    unidade: "un",
    quantidade: 1,
    preco_unitario_centavos: preco,
    explicacao_cliente: "Peça apresenta desgaste observado",
    prioridade_servico: "urgente",
    minutos_previstos: 60,
    custo_hora_centavos: 4000,
    custo_unitario_previsto_centavos: 1200,
  });
  const dados = {
    cliente_id: c,
    veiculo_id: v,
    itens: [
      item("Freios", 10000),
      item("Discos", 5000, "Freios"),
      item("Revisão", 9000),
    ],
    desconto_centavos: 1001,
    outros_custos_centavos: 700,
    observacoes: "Teste",
    condicoes: "Após aprovação",
  };
  let q = await call("salvar_orcamento", [w, dados, randomUUID()]);
  ok(
    q.itens[1].depende_grupo === "Freios" &&
      q.itens[0].custo_hora_centavos === 4000,
    "Grupos, explicação e custos persistidos",
  );
  ok(
    q.versao.outros_custos_centavos === 700,
    "Outros custos preservados no rascunho",
  );
  await fails(
    () =>
      call("salvar_orcamento", [
        w,
        { ...dados, itens: [item("Freios", 5000, "Ausente")] },
        randomUUID(),
      ]),
    "Dependência inexistente rejeitada",
  );
  await fails(
    () =>
      call("salvar_orcamento", [
        w,
        { ...dados, itens: [item("Freios", 5000, "Freios")] },
        randomUUID(),
      ]),
    "Grupo não depende de si mesmo",
  );
  const token = "ab".repeat(32),
    hash = createHash("sha256").update(token).digest("hex");
  await call("emitir_orcamento", [w, q.id, q.revisao, 7, hash]);
  await login("", "anon");
  let pub = await call("consultar_orcamento_publico", [token]);
  ok(
    pub.itens[0].grupo_servico === "Freios" &&
      !JSON.stringify(pub).includes("custo_"),
    "Cliente vê explicação e grupos, nunca custos internos",
  );
  await fails(
    () =>
      call("responder_grupos_orcamento", [
        token,
        "Cliente",
        "approved",
        true,
        ["Discos"],
      ]),
    "Cliente não aprova serviço sem dependência",
  );
  await fails(
    () =>
      call("responder_grupos_orcamento", [
        token,
        "Cliente",
        "approved",
        true,
        [],
      ]),
    "Aprovação vazia rejeitada",
  );
  await fails(
    () =>
      call("responder_grupos_orcamento", [
        token,
        "Cliente",
        "approved",
        true,
        ["Inventado"],
      ]),
    "Grupo não existente rejeitado",
  );
  await fails(
    () =>
      call("responder_grupos_orcamento", [
        token,
        "Cliente",
        "approved",
        false,
        ["Freios"],
      ]),
    "Consentimento obrigatório",
  );
  pub = await call("responder_grupos_orcamento", [
    token,
    "Cliente",
    "approved",
    true,
    ["Discos", "Freios"],
  ]);
  ok(
    pub.aprovacao.total_aprovado_centavos === 14374,
    "Desconto proporcional arredondado em centavos",
  );
  ok(
    pub.versao.total_centavos === 22999 && pub.itens.length === 3,
    "Proposta original preservada após aprovação parcial",
  );
  await call("responder_grupos_orcamento", [
    token,
    "Cliente",
    "approved",
    true,
    ["Freios", "Discos"],
  ]);
  ok(true, "Repetir aprovação com grupos em outra ordem é idempotente");
  await fails(
    () =>
      call("responder_grupos_orcamento", [
        token,
        "Cliente",
        "approved",
        true,
        ["Freios"],
      ]),
    "Nova seleção não altera autorização registrada",
  );
  await login(owner);
  const os = await call("converter_orcamento_em_os", [w, q.id]);
  let o = await call("consultar_ordem_servico", [w, os]);
  ok(
    o.itens.length === 2 && o.total_centavos === 14374,
    "Conversão cria OS somente com itens autorizados",
  );
  const resumo = (await call("listar_orcamentos", [w, "", "", 0])).itens.find(
    (x) => x.id === q.id,
  );
  ok(
    resumo.total_centavos === 22999 && resumo.total_aprovado_centavos === 14374,
    "Listagem distingue valor proposto e autorizado",
  );
  ok(
    (await call("converter_orcamento_em_os", [w, q.id])) === os,
    "Conversão repetida mantém a mesma OS",
  );
  let oportunidades = await call("consultar_oportunidades", [w]);
  ok(
    oportunidades.itens.some(
      (x) => x.origem === "adiados" && x.origem_id === q.id,
    ),
    "Serviço adiado vira oportunidade",
  );
  await call("acompanhar_oportunidade", [
    w,
    "adiados",
    q.id,
    { situacao: "contatado", anotacao: "Cliente quer voltar" },
  ]);
  const op = (await call("consultar_oportunidades", [w])).itens.find(
    (x) => x.origem_id === q.id,
  );
  const retorno = await call("acompanhar_oportunidade", [
    w,
    "adiados",
    q.id,
    { revisao: op.revisao, acao: "orcamento" },
  ]);
  const rq = await call("consultar_orcamento", [w, retorno.orcamento]);
  ok(
    rq.itens.length === 1 && rq.itens[0].grupo_servico === "Revisão",
    "Novo orçamento contém apenas o serviço adiado",
  );
  await fails(
    () =>
      call("acompanhar_oportunidade", [
        w,
        "adiados",
        q.id,
        { revisao: op.revisao, situacao: "descartado" },
      ]),
    "Concorrência no acompanhamento protegida",
  );
  await call("modelo_funilaria", [w, os]);
  const etapas = await call("consultar_etapas_execucao", [w, os]);
  ok(etapas.length === 6, "Modelo de funilaria cria seis etapas");
  await fails(
    () => call("modelo_funilaria", [w, os]),
    "Modelo não duplica etapas existentes",
  );
  const fornecedor = randomUUID();
  await call("salvar_fornecedor", [
    w,
    fornecedor,
    { nome: "Pintura terceirizada", documento: "12345678000190" },
  ]);
  const etapa = {
    ...etapas[0],
    nome: "Pintura externa",
    situacao: "concluida",
    fornecedor_id: fornecedor,
    custo_centavos: 7500,
    gerar_conta: true,
    vencimento: "2026-12-20",
  };
  await call("salvar_etapa_execucao", [w, os, etapa.id, etapa, etapa.revisao]);
  const salva = (await call("consultar_etapas_execucao", [w, os]))[0];
  ok(
    !!salva.titulo_financeiro_id,
    "Conclusão de terceiro gera conta a pagar ligada à OS",
  );
  await fails(
    () =>
      call("salvar_etapa_execucao", [w, os, etapa.id, etapa, etapa.revisao]),
    "Duplo salvamento com revisão antiga rejeitado",
  );
  await call("salvar_etapa_execucao", [
    w,
    os,
    etapa.id,
    { ...etapa, observacoes: "Conferido" },
    salva.revisao,
  ]);
  await db.exec("reset role");
  ok(
    (await scalar(
      "select count(*)::int from public.titulos_financeiros where oficina_id=$1 and categoria=$2",
      [w, "terceiros"],
    )) === 1,
    "Conta do terceiro não é duplicada",
  );
  await login(owner);
  const linhas = [
    { nome: "Importado 1", telefone_e164: "+5516999991111" },
    { nome: "Importado 2", email: "dois@example.com" },
  ];
  const imp = await call("importar_cadastros", [
    w,
    randomUUID(),
    "clientes",
    JSON.stringify(linhas),
  ]);
  ok(imp.importados === 2, "Importação em lote cadastra clientes");
  ok(
    (
      await call("importar_cadastros", [
        w,
        randomUUID(),
        "clientes",
        JSON.stringify(linhas),
      ])
    ).repetida,
    "Arquivo repetido não duplica clientes",
  );
  const falhas = [{ nome: "Não deve persistir" }, { nome: "X" }];
  await fails(
    () =>
      call("importar_cadastros", [
        w,
        randomUUID(),
        "clientes",
        JSON.stringify(falhas),
      ]),
    "Uma linha inválida desfaz o lote inteiro",
  );
  await db.exec("reset role");
  ok(
    (await scalar(
      "select count(*)::int from public.clientes where oficina_id=$1 and nome='Não deve persistir'",
      [w],
    )) === 0,
    "Importação possui rollback completo",
  );
  await login(owner);
  const hoje = await scalar("select (now() at time zone 'America/Sao_Paulo')::date::text"),
    nota = {
      chave_nfe: "1".repeat(44),
      emitente: { nome: "Fornecedor NF-e", documento: "98765432000100" },
      data: hoje,
      vencimento: hoje,
      total_xml_centavos: 3000,
      total_conferido_centavos: 3000,
      itens: [
        {
          descricao: "Filtro XML",
          unidade: "un",
          quantidade: 2,
          custo_centavos: 1500,
          preco_venda_centavos: 2400,
        },
      ],
    };
  const compra = await call("importar_compra_nfe", [w, randomUUID(), nota]);
  const compraLida = await call("consultar_compra_estoque", [w, compra.compra]);
  ok(
    compraLida.itens.length === 1 && compraLida.titulo.valor_centavos === 3000,
    "NF-e cadastra fornecedor, produto, estoque e conta em uma transação",
  );
  ok(
    (await call("importar_compra_nfe", [w, randomUUID(), nota])).repetida,
    "Chave de acesso repetida não movimenta estoque novamente",
  );
  await fails(
    () =>
      call("importar_compra_nfe", [
        w,
        randomUUID(),
        { ...nota, chave_nfe: "2".repeat(44), total_conferido_centavos: 10 },
      ]),
    "Total conferido divergente rejeitado",
  );
  const preparado = await call("preparar_financeiro_os", [w, os]);
  const titulo = typeof preparado === "string" ? preparado : preparado.id;
  const pixId = randomUUID();
  await call("reservar_cobranca_pix", [
    w,
    titulo,
    pixId,
    5000,
    "cliente@example.com",
    "teste",
  ]);
  await call("reservar_cobranca_pix", [
    w,
    titulo,
    pixId,
    5000,
    "cliente@example.com",
    "teste",
  ]);
  ok(true, "Reserva Pix idempotente");
  await fails(
    () =>
      call("reservar_cobranca_pix", [
        w,
        titulo,
        randomUUID(),
        10000,
        "cliente@example.com",
        "teste",
      ]),
    "Cobranças reservadas não ultrapassam o saldo",
  );
  const confirmacao = {
    referencia: pixId,
    provedor_id: "123456",
    recebedor_id: "654321",
    valor_centavos: 5000,
    moeda: "BRL",
    ambiente: "teste",
    situacao: "aprovado",
    taxa_centavos: 100,
  };
  await fails(
    () => call("atualizar_cobranca_pix", [pixId, confirmacao]),
    "Usuário não consegue forjar confirmação Pix",
  );
  await login("", "service_role");
  await fails(
    () =>
      call("atualizar_cobranca_pix", [
        pixId,
        { ...confirmacao, valor_centavos: 4999 },
      ]),
    "Valor externo divergente rejeitado",
  );
  await call("atualizar_cobranca_pix", [pixId, confirmacao]);
  await call("atualizar_cobranca_pix", [pixId, confirmacao]);
  await login(owner);
  const cobrancas = await call("consultar_cobrancas_pix", [w, titulo]);
  ok(
    cobrancas[0].situacao === "aprovado" && !!cobrancas[0].baixa_id,
    "Confirmação Pix registra pagamento parcial",
  );
  await db.exec("reset role");
  ok(
    (await scalar(
      "select count(*)::int from public.baixas_financeiras where chave=$1",
      [pixId],
    )) === 1,
    "Webhook repetido não duplica recebimento",
  );
  await login("", "service_role");
  await call("atualizar_cobranca_pix", [
    pixId,
    { ...confirmacao, situacao: "pendente" },
  ]);
  await login(owner);
  ok(
    (await call("consultar_cobrancas_pix", [w, titulo]))[0].situacao ===
      "aprovado",
    "Evento pendente atrasado não desfaz pagamento",
  );
  await login("", "service_role");
  await call("atualizar_cobranca_pix", [
    pixId,
    { ...confirmacao, situacao: "estornado", reembolsado_centavos: 5000 },
  ]);
  await call("atualizar_cobranca_pix", [
    pixId,
    { ...confirmacao, situacao: "estornado", reembolsado_centavos: 5000 },
  ]);
  await db.exec("reset role");
  ok(
    (await scalar(
      "select count(*)::int from public.baixas_financeiras where estorno_de=$1",
      [cobrancas[0].baixa_id],
    )) === 1,
    "Reembolso integral confirmado gera estorno único",
  );
  await login(owner);
  const foto = randomUUID(),
    reserva = await call("reservar_foto_os_offline", [
      w,
      os,
      foto,
      "a".repeat(64),
      "before",
      1200,
      "Foto da bancada",
    ]);
  ok(
    (
      await call("reservar_foto_os_offline", [
        w,
        os,
        foto,
        "a".repeat(64),
        "before",
        1200,
        "Foto da bancada",
      ])
    ).id === reserva.id,
    "Retomada offline reutiliza a reserva da foto",
  );
  await fails(
    () =>
      call("reservar_foto_os_offline", [
        w,
        os,
        foto,
        "b".repeat(64),
        "before",
        1200,
        "Outra",
      ]),
    "Mesma chave não aceita conteúdo diferente",
  );
  await login(other);
  await fails(
    () => call("consultar_oportunidades", [w]),
    "Outra empresa não lê oportunidades",
  );
  await fails(
    () => call("consultar_etapas_execucao", [w, os]),
    "Outra empresa não lê etapas",
  );
  await fails(
    () => call("consultar_cobrancas_pix", [w, titulo]),
    "Outra empresa não lê cobranças",
  );
  await fails(
    () => call("importar_compra_nfe", [w, randomUUID(), nota]),
    "Outra empresa não importa compras",
  );
  console.log(`${n} cenários aprovados na oficina ágil.`);
} catch (e) {
  console.error("FAIL", e.message, e.code, e.where || "");
  process.exitCode = 1;
} finally {
  await db.close();
}
