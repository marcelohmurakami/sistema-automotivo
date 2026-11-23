import { codigoConflitoRevisao } from './banco-local.mjs';
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { criarBancoLocal } from "./banco-local.mjs";
let db,
  n = 0;
const owner = randomUUID(),
  other = randomUUID(),
  customer = randomUUID(),
  esc = (x) => `'${String(x).replaceAll("'", "''")}'`;
let w, c, v, os;
const scalar = async (q, args = []) =>
  Object.values((await db.query(q, args)).rows[0])[0];
const login = async (u, role = "authenticated") =>
  db.exec(
    `reset role;select set_config('request.jwt.claim.sub',${esc(u)},false);set role ${role}`,
  );
const op = (acao, d) =>
  scalar("select public.operar_produtividade($1,$2,$3::jsonb)", [
    w,
    acao,
    JSON.stringify(d),
  ]);
const read = () =>
  scalar("select public.consultar_produtividade($1,$2)", [w, os]);
const ok = (a, m) => {
  assert.ok(a, m);
  console.log("PASS", m);
  n++;
};
const fail = async (f, m) => {
  await assert.rejects(f, (e) =>
    [
      "42501",
      "22023",
      codigoConflitoRevisao,
      "23514",
      "23505",
      "23P01",
      "P0002",
      "23502",
      "PT409",
    ].includes(e.code),
  );
  console.log("PASS", m);
  n++;
};
try {
  db = await criarBancoLocal("20261003000100");
  await db.exec(
    `alter table auth.users add column if not exists email text;alter table auth.users add column if not exists email_confirmed_at timestamptz;insert into auth.users values('${owner}','owner@example.com',now()),('${other}','other@example.com',now()),('${customer}','customer@example.com',now());`,
  );
  await login(owner);
  w = await scalar("select public.criar_oficina('Bancada produtividade',null)");
  await fail(() => read(), "Básico bloqueia produtividade");
  await db.exec(
    `reset role;update public.assinaturas_oficina set codigo_plano='complete' where oficina_id='${w}'`,
  );
  await login(owner);
  c = (
    await scalar("select public.salvar_cliente($1,$2::jsonb)", [
      w,
      JSON.stringify({
        nome: "Cliente bancada",
        email: "customer@example.com",
      }),
    ])
  ).id;
  v = await scalar("select public.cadastrar_veiculo_orcamento($1,$2,$3,$4)", [
    w,
    c,
    "Polo",
    "QAQ1A23",
  ]);
  os = (
    await scalar("select public.salvar_ordem_servico($1,$2::jsonb,$3)", [
      w,
      JSON.stringify({ cliente_id: c, veiculo_id: v }),
      randomUUID(),
    ])
  ).id;
  const item = randomUUID();
  await scalar("select public.salvar_item_catalogo($1,$2,$3::jsonb,null)", [
    w,
    item,
    JSON.stringify({
      descricao: "Serviço pacote",
      tipo: "service",
      unidade: "un",
      preco_padrao_centavos: 12000,
    }),
  ]);
  const pacote = randomUUID();
  await op("salvar_pacote", {
    id: pacote,
    nome: "Revisão",
    itens: [{ item_catalogo_id: item, quantidade: 2 }],
  });
  ok((await read()).pacotes.length === 1, "Pacote cadastrado");
  await fail(
    () =>
      op("salvar_pacote", { id: randomUUID(), nome: "Inválido", itens: [] }),
    "Pacote vazio rejeitado",
  );
  await fail(
    () =>
      op("salvar_pacote", {
        id: randomUUID(),
        nome: "Inválido",
        itens: [{ item_catalogo_id: item, quantidade: -1 }],
      }),
    "Quantidade negativa rejeitada",
  );
  await fail(
    () =>
      op("salvar_pacote", {
        id: pacote,
        revisao: 0,
        nome: "Concorrente",
        itens: [{ item_catalogo_id: item, quantidade: 1 }],
      }),
    "Revisão antiga do pacote bloqueada",
  );
  const pitens = await scalar("select public.itens_do_pacote($1,$2)", [
    w,
    pacote,
  ]);
  ok(
    pitens[0].preco_unitario_centavos === 12000,
    "Pacote usa preço do catálogo",
  );
  let ordem = await scalar("select public.consultar_ordem_servico($1,$2)", [
    w,
    os,
  ]);
  await op("aplicar_pacote", { os, pacote, revisao: ordem.revisao });
  ordem = await scalar("select public.consultar_ordem_servico($1,$2)", [w, os]);
  ok(ordem.total_centavos === 24000, "Pacote aplicado calcula total da OS");
  await fail(
    () => op("aplicar_pacote", { os, pacote, revisao: 1 }),
    "Duplo clique com revisão antiga não duplica pacote",
  );
  const v2 = await scalar(
    "select public.cadastrar_veiculo_orcamento($1,$2,$3,$4)",
    [w, c, "Gol", "QAQ1A24"],
  );
  const ag = randomUUID(),
    agDados = {
      id: ag,
      cliente_id: c,
      veiculo_id: v2,
      recurso: "Box 1",
      inicio: "2027-01-10T10:00:00Z",
      fim: "2027-01-10T11:00:00Z",
      servico: "Revisão",
    };
  await op("salvar_agenda", agDados);
  ok((await read()).agenda.length === 1, "Agendamento cadastrado");
  await fail(
    () => op("salvar_agenda", { ...agDados, id: randomUUID() }),
    "Sobreposição no mesmo box bloqueada",
  );
  await fail(
    () =>
      op("salvar_agenda", { ...agDados, id: randomUUID(), recurso: "Box 2" }),
    "Mesmo veículo em boxes diferentes bloqueado",
  );
  await fail(
    () =>
      op("salvar_agenda", {
        ...agDados,
        id: randomUUID(),
        inicio: agDados.fim,
        fim: agDados.inicio,
      }),
    "Horário invertido rejeitado",
  );
  await op("salvar_agenda", {
    ...agDados,
    id: randomUUID(),
    inicio: agDados.fim,
    fim: "2027-01-10T12:00:00Z",
  });
  ok((await read()).agenda.length === 2, "Horários adjacentes aceitos");
  const convertido = await op("converter_agenda", { id: ag, revisao: 1 });
  ok(!!convertido.os, "Agenda abre OS");
  ok(
    (await op("converter_agenda", { id: ag, revisao: 1 })).os === convertido.os,
    "Conversão da agenda idempotente",
  );
  await fail(
    () => op("cancelar_agenda", { id: ag, revisao: 1 }),
    "Agenda convertida não é cancelada",
  );
  await op("previsao_tempo", { os, minutos: 60, custo_hora_centavos: 6000 });
  await op("iniciar", { os });
  await op("iniciar", { os });
  ok(
    (await read()).tempos.length === 1,
    "Iniciar duas vezes mantém um período",
  );
  await fail(
    () => op("iniciar", { os: convertido.os }),
    "Dois cronômetros simultâneos da mesma pessoa bloqueados",
  );
  await db.exec(
    `reset role;update public.apontamentos_tempo set iniciado_em=now()-interval '1 hour' where ordem_servico_id='${os}'`,
  );
  await login(owner);
  await op("pausar", { os });
  ok(
    (await read()).tempos[0].custo_centavos >= 6000,
    "Custo do tempo calculado",
  );
  await op("pausar", { os });
  ok((await read()).tempos.length === 1, "Pausa repetida não cria período");
  const mid = randomUUID();
  await op("manutencao", {
    id: mid,
    os,
    descricao: "Revisar freios",
    data: "2027-03-10",
    km: 60000,
  });
  await op("manutencao", {
    id: mid,
    os,
    descricao: "Revisar freios",
    data: "2027-03-10",
    km: 60000,
  });
  ok((await read()).manutencoes.length === 1, "Recomendação idempotente");
  await fail(
    () => op("manutencao", { id: randomUUID(), os, descricao: "Sem prazo" }),
    "Manutenção exige data ou quilometragem",
  );
  await op("salvar_vistoria", {
    os,
    dados: {
      combustivel: 50,
      pertences: "Triângulo",
      avarias: [{ local: "frente", descricao: "Risco no para-choque" }],
    },
  });
  await fail(
    () => op("salvar_vistoria", { os, revisao: 0, dados: { avarias: [] } }),
    "Vistoria concorrente bloqueada",
  );
  const entradaOS = await scalar(
    "select public.consultar_ordem_servico($1,$2)",
    [w, os],
  );
  ok(
    entradaOS.pertences === "Triângulo" &&
      entradaOS.combustivel_percentual === 50 &&
      entradaOS.checklist["Avarias de entrada registradas"],
    "Vistoria sincroniza combustível, pertences e checklist da OS",
  );
  const token = "d".repeat(64),
    hash = createHash("sha256").update(token).digest("hex");
  await op("link_vistoria", { os, hash });
  await login("", "anon");
  const vist = await scalar("select public.consultar_vistoria_publica($1)", [
    token,
  ]);
  ok(
    vist.dados.pertences === "Triângulo",
    "Link público expõe somente vistoria",
  );
  await fail(
    () =>
      scalar("select public.consultar_vistoria_publica($1)", ["a".repeat(64)]),
    "Token errado bloqueado",
  );
  await fail(
    () =>
      scalar("select public.confirmar_vistoria($1,$2,false)", [
        token,
        "Cliente",
      ]),
    "Confirmação exige consentimento",
  );
  await scalar("select public.confirmar_vistoria($1,$2,true)", [
    token,
    "Cliente",
  ]);
  await scalar("select public.confirmar_vistoria($1,$2,true)", [
    token,
    "Cliente",
  ]);
  await login(owner);
  ok(
    !!(await read()).vistoria.confirmado_em,
    "Confirmação da vistoria persistida",
  );
  await fail(
    () => op("salvar_vistoria", { os, revisao: 1, dados: { avarias: [] } }),
    "Vistoria confirmada é imutável",
  );
  const adicional = await op("criar_adicional", { os, id: randomUUID() });
  let orc = await scalar("select public.consultar_orcamento($1,$2)", [
    w,
    adicional.orcamento,
  ]);
  orc = await scalar("select public.salvar_orcamento($1,$2::jsonb,$3,$4,$5)", [
    w,
    JSON.stringify({
      cliente_id: c,
      veiculo_id: v,
      itens: [
        {
          descricao: "Adicional",
          tipo: "service",
          unidade: "un",
          quantidade: 1,
          preco_unitario_centavos: 5000,
        },
      ],
      desconto_centavos: 500,
    }),
    randomUUID(),
    orc.id,
    orc.revisao,
  ]);
  await fail(
    () => op("aplicar_adicional", { os, id: orc.id }),
    "Adicional não aprovado não altera OS",
  );
  const tok = "e".repeat(64);
  orc = await scalar("select public.emitir_orcamento($1,$2,$3,7,$4)", [
    w,
    orc.id,
    orc.revisao,
    createHash("sha256").update(tok).digest("hex"),
  ]);
  await login("", "anon");
  await scalar("select public.responder_orcamento($1,$2,$3,true)", [
    tok,
    "Cliente",
    "approved",
  ]);
  await login(owner);
  await op("aplicar_adicional", { os, id: orc.id });
  await op("aplicar_adicional", { os, id: orc.id });
  ordem = await scalar("select public.consultar_ordem_servico($1,$2)", [w, os]);
  ok(
    ordem.total_centavos === 28500,
    "Adicional inclui valores e desconto uma única vez",
  );
  ok(ordem.itens.length === 2, "Itens originais preservados");
  await fail(
    () =>
      scalar("select public.corrigir_item_os($1,$2,$3,$4,$5::jsonb)", [
        w,
        os,
        ordem.itens.find((i) => i.descricao === "Adicional").id,
        ordem.revisao,
        JSON.stringify({
          descricao: "Adicional",
          quantidade: 1,
          preco_unitario_centavos: 9000,
        }),
      ]),
    "Não altera preço de adicional aprovado pela correção de item",
  );
  await db.exec("reset role");
  await fail(
    () =>
      scalar(
        "update public.orcamentos set veiculo_id=$1 where id=$2 returning id",
        [v2, orc.id],
      ),
    "Adicional mantém veículo original",
  );
  await login(owner);

  await fail(
    () => scalar("select public.converter_orcamento_em_os($1,$2)", [w, orc.id]),
    "Adicional não gera segunda OS",
  );
  await fail(
    () => op("retorno", { os, id: randomUUID(), motivo: "Retorno teste" }),
    "Retorno exige OS entregue",
  );
  await db.exec(
    `reset role;update public.itens_ordem_servico set situacao='done' where ordem_servico_id='${os}';update public.ordens_servico set situacao='delivered',entregue_em=now() where id='${os}'`,
  );
  await login(owner);
  const rid = randomUUID(),
    ret = await op("retorno", {
      id: rid,
      os,
      motivo: "Verificar ruído novamente",
    });
  ok(!!ret.os && ret.os !== os, "Retorno cria nova OS vinculada");
  ok(
    (await op("retorno", { id: rid, os, motivo: "Verificar ruído novamente" }))
      .os === ret.os,
    "Retorno idempotente",
  );
  ok(
    (await scalar("select public.consultar_ordem_servico($1,$2)", [w, ret.os]))
      .total_centavos === 0,
    "Retorno começa sem cobrança",
  );
  await fail(() => op("iniciar", { os }), "OS entregue não inicia cronômetro");
  await scalar("select public.configurar_site($1,$2::jsonb)", [
    w,
    JSON.stringify({
      identificador_url: "bancada-portal",
      titulo: "Bancada",
      publicado: true,
      portal_habilitado: true,
    }),
  ]);
  await scalar("select public.definir_acesso_portal($1,$2,$3)", [
    w,
    c,
    "customer@example.com",
  ]);
  await login(customer);
  ok(
    (await scalar("select public.minhas_manutencoes($1)", [w])).length === 1,
    "Cliente autorizado vê recomendação",
  );
  await fail(() => read(), "Cliente externo não acessa painel interno");
  await login(other);
  ok(
    (await scalar("select public.minhas_manutencoes($1)", [w])).length === 0,
    "Outra conta não vê recomendação",
  );
  await fail(
    () => op("pausar", { os: ret.os }),
    "Outra conta não opera oficina",
  );
  await fail(
    () => scalar("select * from public.agenda_atendimentos"),
    "Acesso direto às tabelas bloqueado",
  );
  await login(owner);
  await op("concluir_manutencao", { id: mid });
  ok(!!(await read()).manutencoes[0].concluida_em, "Recomendação concluída");

  // Integração entre os recursos novos e estoque/financeiro existentes.
  await fail(
    () => op("salvar_agenda", { ...agDados, id: randomUUID() }),
    "Horário convertido continua reservado",
  );
  await fail(
    () => op("salvar_agenda", { ...agDados, revisao: 0 }),
    "Revisão antiga não sobrescreve agenda",
  );
  await fail(
    () =>
      op("manutencao", {
        id: mid,
        os: ret.os,
        descricao: "Outro veículo",
        km: 1,
      }),
    "Chave de manutenção não é reutilizada em outra OS",
  );
  await db.exec("reset role");
  ok(
    (await scalar(
      "select valor_centavos from public.titulos_financeiros where oficina_id=$1 and ordem_servico_id=$2",
      [w, os],
    )) === 28500,
    "Financeiro recebe total original mais adicional e desconto",
  );
  await fail(
    () =>
      scalar(
        "update public.orcamentos set situacao='cancelled' where id=$1 returning id",
        [orc.id],
      ),
    "Adicional incorporado não pode ser cancelado",
  );
  await fail(
    () =>
      scalar("select public.confirmar_vistoria($1,$2,true)", [
        "z".repeat(64),
        "Cliente",
      ]),
    "Token malformado rejeitado",
  );
  await db.exec(
    `update public.vistorias_entrada set expira_em=now()-interval '1 day' where ordem_servico_id='${os}'`,
  );
  await login("", "anon");
  await fail(
    () => scalar("select public.consultar_vistoria_publica($1)", [token]),
    "Vistoria expirada não é exposta",
  );
  await login(owner);
  const produto = randomUUID();
  await scalar("select public.salvar_produto_estoque($1,$2::jsonb,$3)", [
    w,
    JSON.stringify({
      descricao: "Peça do pacote",
      unidade: "un",
      custo_centavos: 2000,
      preco_padrao_centavos: 3500,
    }),
    produto,
  ]);
  await scalar(
    "select public.movimentar_estoque($1,$2,'entrada',10,'Estoque bancada',$3,1)",
    [w, produto, randomUUID()],
  );
  const pacotePeca = randomUUID();
  await op("salvar_pacote", {
    id: pacotePeca,
    nome: "Pacote peças",
    itens: [{ item_catalogo_id: produto, quantidade: 2 }],
  });
  let retOS = await scalar("select public.consultar_ordem_servico($1,$2)", [
    w,
    ret.os,
  ]);
  await op("aplicar_pacote", {
    os: ret.os,
    pacote: pacotePeca,
    revisao: retOS.revisao,
  });
  retOS = await scalar("select public.consultar_ordem_servico($1,$2)", [
    w,
    ret.os,
  ]);
  ok(
    retOS.itens[0].item_catalogo_id === produto,
    "Pacote preserva vínculo da peça com estoque",
  );
  await scalar("select public.salvar_item_os($1,$2,$3,$4::jsonb,$5)", [
    w,
    ret.os,
    retOS.revisao,
    JSON.stringify({ situacao: "done" }),
    retOS.itens[0].id,
  ]);
  await op("iniciar", { os: ret.os });
  await db.exec(
    `reset role;update public.ordens_servico set situacao='delivered',entregue_em=now() where id='${ret.os}'`,
  );
  await login(owner);
  ok(
    (await scalar("select public.listar_estoque($1)", [w])).itens.find(
      (x) => x.id === produto,
    )?.saldo === 8,
    "Entrega de pacote baixa duas peças",
  );
  ok(
    (
      await scalar("select public.consultar_produtividade($1,$2)", [w, ret.os])
    ).tempos.every((x) => x.encerrado_em),
    "Entrega encerra cronômetros abertos",
  );
  await db.exec("reset role");
  ok(
    (await scalar(
      "select valor_centavos from public.titulos_financeiros where oficina_id=$1 and ordem_servico_id=$2",
      [w, ret.os],
    )) === 7000,
    "Pacote gera valor correto no financeiro",
  );
  await db.exec(
    `insert into public.membros_oficina(oficina_id,usuario_id,perfil) values('${w}','${other}','staff')`,
  );
  await login(other);
  ok((await read()).pacotes.length === 2, "Funcionário consulta pacotes");
  await fail(
    () =>
      op("salvar_pacote", {
        id: randomUUID(),
        nome: "Sem permissão",
        itens: [{ item_catalogo_id: item, quantidade: 1 }],
      }),
    "Funcionário não altera preços de pacotes",
  );
  await fail(
    () =>
      op("previsao_tempo", {
        os: convertido.os,
        minutos: 20,
        custo_hora_centavos: 100,
      }),
    "Funcionário não altera custo da hora",
  );
  await op("iniciar", { os: convertido.os });
  await login(owner);
  await op("iniciar", { os: convertido.os });
  ok(
    (
      await scalar("select public.consultar_produtividade($1,$2)", [
        w,
        convertido.os,
      ])
    ).tempos.filter((x) => !x.encerrado_em).length === 2,
    "Duas pessoas trabalham na mesma OS em períodos independentes",
  );
  await login(other);
  await op("pausar", { os: convertido.os });
  await login(owner);
  ok(
    (
      await scalar("select public.consultar_produtividade($1,$2)", [
        w,
        convertido.os,
      ])
    ).tempos.filter((x) => !x.encerrado_em).length === 1,
    "Pausa não encerra o cronômetro de outra pessoa",
  );
  await op("pausar", { os: convertido.os });
  await fail(
    () =>
      op("salvar_vistoria", {
        os: convertido.os,
        dados: { avarias: [{ local: "inventado", descricao: "Risco" }] },
      }),
    "Região de avaria inválida rejeitada",
  );
  await fail(
    () =>
      op("salvar_vistoria", {
        os: convertido.os,
        dados: { avarias: [], combustivel: 101 },
      }),
    "Combustível fora da faixa rejeitado",
  );
  await fail(
    () =>
      op("salvar_pacote", {
        id: randomUUID(),
        nome: "Muito preciso",
        itens: [{ item_catalogo_id: item, quantidade: 0.0001 }],
      }),
    "Precisão inválida no pacote rejeitada",
  );
  await db.exec(
    `reset role;update public.assinaturas_oficina set situacao='suspended' where oficina_id='${w}'`,
  );
  await login(owner);
  await fail(() => read(), "Assinatura suspensa bloqueia produtividade");
  await login(customer);
  ok(
    (await scalar("select public.minhas_manutencoes($1)", [w])).length === 0,
    "Suspensão bloqueia recomendações do portal",
  );

  console.log(`${n} cenários aprovados na bancada isolada.`);
} catch (e) {
  console.error("FAIL", e.message, e.code, e.where || "");
  process.exitCode = 1;
} finally {
  if (db) await db.close();
}
