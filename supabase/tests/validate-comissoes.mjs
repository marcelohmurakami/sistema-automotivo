import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { criarBancoLocal } from "./banco-local.mjs";
const db = await criarBancoLocal("20261006000100");
const owner = randomUUID(),
  staff = randomUUID(),
  manager = randomUUID(),
  other = randomUUID();
let n = 0,
  w,
  os,
  hoje;
const scalar = async (sql, args = []) =>
  Object.values((await db.query(sql, args)).rows[0])[0];
const login = async (u, role = "authenticated") =>
  db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${u}',false);set role ${role}`,
  );
const ok = (v, m) => {
  assert.ok(v, m);
  console.log("PASS", m);
  n++;
};
const fail = async (fn, m, code) => {
  await assert.rejects(fn, (e) =>
    code
      ? e.code === code
      : ["22023", "23514", "23505", "42501", "P0002", "PT409"].includes(e.code),
  );
  console.log("PASS", m);
  n++;
};
const read = (office = w, ordem = os) =>
  scalar("select public.consultar_comissoes($1,$2,$2,null,$3)", [
    office,
    hoje,
    ordem,
  ]);
const regra = (id, d, rev = null, office = w) =>
  scalar("select public.salvar_profissional_comissao($1,$2,$3::jsonb,$4)", [
    office,
    id,
    JSON.stringify(d),
    rev,
  ]);
const ordem = () =>
  scalar("select public.consultar_ordem_servico($1,$2)", [w, os]);
const atribuir = async (rows, rev) =>
  scalar("select public.definir_comissoes_os($1,$2,$3,$4::jsonb)", [
    w,
    os,
    rev ?? (await ordem()).revisao,
    JSON.stringify(rows),
  ]);
const pagar = (titulo, valor, chave = randomUUID(), data = hoje) =>
  scalar("select public.baixar_titulo_financeiro($1,$2,$3,$4,0,$5,$6,$7)", [
    w,
    titulo,
    chave,
    valor,
    data,
    "banco",
    "pix",
  ]);
const estornar = (baixa) =>
  scalar("select public.estornar_baixa_financeira($1,$2,$3,$4)", [
    w,
    baixa,
    hoje,
    "Correção da bancada",
  ]);
const financeiro = () =>
  scalar("select public.consultar_financeiro($1,$2,$2)", [w, hoje]);
try {
  await db.exec(
    `insert into auth.users(id) values('${owner}'),('${staff}'),('${manager}'),('${other}')`,
  );
  await login(owner);
  w = await scalar("select public.criar_oficina('Bancada comissões',null)");
  hoje = await scalar(
    "select (now() at time zone 'America/Sao_Paulo')::date::text",
  );
  await fail(() => read(w, null), "Plano Básico bloqueia comissões", "42501");
  await db.exec(
    `reset role;update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id='${w}';insert into public.membros_oficina(oficina_id,usuario_id,perfil) values('${w}','${staff}','staff'),('${w}','${manager}','manager')`,
  );
  await login(owner);
  const p = randomUUID(),
    fixo = randomUUID();
  const padrao = {
    nome: "Ana Mecânica",
    tipo: "percentual",
    valor: 10,
    liberacao: "recebimento",
    usuario_id: staff,
  };
  await regra(p, padrao);
  await regra(fixo, {
    nome: "Bruno Funileiro",
    tipo: "fixo",
    valor: 15,
    liberacao: "entrega",
  });
  ok(
    (await read(w, null)).profissionais.length === 2,
    "Cadastro percentual e fixo, com ou sem usuário",
  );
  await fail(
    () => regra(randomUUID(), { ...padrao, valor: 101 }),
    "Percentual maior que 100 rejeitado",
  );
  await fail(
    () => regra(randomUUID(), { ...padrao, valor: -1 }),
    "Valor negativo rejeitado",
  );
  await fail(
    () => regra(randomUUID(), { ...padrao, valor: 1.234 }),
    "Precisão inválida rejeitada",
  );
  await fail(
    () => regra(randomUUID(), { ...padrao, usuario_id: other }),
    "Vínculo com usuário de outra oficina rejeitado",
  );
  await fail(
    () => regra(p, { ...padrao, valor: 20 }, 0),
    "Regra concorrente com revisão antiga bloqueada",
    "PT409",
  );
  await login(manager);
  ok(
    (await read(w, null)).profissionais.length === 2,
    "Gerente pode consultar",
  );
  await fail(
    () => regra(p, padrao, 1),
    "Somente proprietário altera regras",
    "42501",
  );
  await login(staff);
  await fail(() => read(w, null), "Funcionário não consulta valores", "42501");
  await fail(
    () => db.query("select * from public.comissoes_servico"),
    "Leitura direta de comissões bloqueada",
    "42501",
  );
  await login(other);
  await fail(() => read(w, null), "Outra oficina não consulta", "42501");
  await login(owner, "anon");
  await fail(() => read(w, null), "Anônimo bloqueado", "42501");
  await login(owner);
  const c = (
    await scalar("select public.salvar_cliente($1,$2::jsonb)", [
      w,
      JSON.stringify({ nome: "Cliente comissões" }),
    ])
  ).id;
  const v = await scalar(
    "select public.cadastrar_veiculo_orcamento($1,$2,$3,$4)",
    [w, c, "Gol", "COM1A23"],
  );
  os = (
    await scalar("select public.salvar_ordem_servico($1,$2::jsonb,$3)", [
      w,
      JSON.stringify({ cliente_id: c, veiculo_id: v }),
      randomUUID(),
    ])
  ).id;
  for (const d of [
    {
      tipo: "service",
      descricao: "Revisão",
      quantidade: 1,
      preco_unitario_centavos: 10000,
    },
    {
      tipo: "service",
      descricao: "Polimento",
      quantidade: 2,
      preco_unitario_centavos: 5000,
    },
    {
      tipo: "part",
      descricao: "Peça do cliente",
      quantidade: 1,
      preco_unitario_centavos: 10000,
      origem_peca: "cliente",
    },
  ]) {
    await scalar("select public.salvar_item_os($1,$2,$3,$4::jsonb)", [
      w,
      os,
      (await ordem()).revisao,
      JSON.stringify(d),
    ]);
  }
  const itens = (await ordem()).itens;
  await fail(
    () => atribuir([{ item_id: itens[2].id, profissional_id: p }]),
    "Peça não gera comissão",
  );
  await fail(
    () => atribuir([{ item_id: randomUUID(), profissional_id: p }]),
    "Item externo não aceito",
  );
  await fail(
    () =>
      atribuir([
        { item_id: itens[0].id, profissional_id: p },
        { item_id: itens[0].id, profissional_id: fixo },
      ]),
    "Item duplicado rejeitado",
  );
  await atribuir([
    { item_id: itens[0].id, profissional_id: p },
    { item_id: itens[1].id, profissional_id: fixo },
  ]);
  let d = await read();
  ok(
    d.resumo.prevista === 4000 && d.resumo.disponivel === 0,
    "Previsão soma 10% de 100 + 15 por unidade de serviço; não libera antes de entregar",
  );
  const velha = (await ordem()).revisao;
  await regra(p, { ...padrao, valor: 20 }, 1);
  await atribuir([{ item_id: itens[0].id, profissional_id: p }]);
  ok(
    (await read()).itens.find((x) => x.profissional_id === p).valor === 10,
    "Regra atribuída preservada após mudança do percentual",
  );
  await fail(
    () => atribuir([{ item_id: itens[0].id, profissional_id: null }], velha),
    "Atribuição concorrente não sobrescreve",
    "PT409",
  );
  await db.exec(
    `reset role;update public.ordens_servico set desconto_centavos=3000 where id='${os}';update public.itens_ordem_servico set origem_peca='cliente' where id='${itens[2].id}'`,
  );
  await login(owner);
  ok(
    (await read()).resumo.prevista === 3900,
    "Desconto geral reduz somente base percentual; valor fixo preservado",
  );
  for (const i of itens)
    await scalar("select public.salvar_item_os($1,$2,$3,$4::jsonb,$5)", [
      w,
      os,
      (await ordem()).revisao,
      '{"situacao":"done"}',
      i.id,
    ]);
  const receita = await scalar("select public.preparar_financeiro_os($1,$2)", [
    w,
    os,
  ]);
  const recebimento = await pagar(receita, 13500);
  ok(
    (await read()).resumo.disponivel === 0,
    "Sinal antes da entrega não libera comissão",
  );
  for (const status of ["in_progress", "quality_check", "ready", "delivered"]) {
    const o = await ordem();
    await scalar(
      "select public.atualizar_mapa_ordem_servico($1,$2,$3,$4,null,null,null,$5)",
      [w, os, o.revisao, status, o.recebido_em],
    );
  }
  d = await read();
  const percentual = d.itens.find((x) => x.profissional_id === p),
    fixa = d.itens.find((x) => x.profissional_id === fixo);
  ok(
    percentual.prevista_centavos === 900 &&
      percentual.disponivel_centavos === 450,
    "Pagamento de metade da OS libera metade da comissão",
  );
  ok(
    fixa.prevista_centavos === 3000 && fixa.disponivel_centavos === 3000,
    "Regra por entrega libera valor fixo integral",
  );
  ok(
    d.itens.every((x) => x.titulo_id && x.congelada_em),
    "Entrega cria despesas e congela cálculo",
  );
  const fin = await financeiro();
  ok(
    fin.resumo.despesas === 3900 &&
      fin.ordens.find((x) => x.ordem_servico_id === os).despesas === 3900,
    "Custo integral aparece no lucro da OS e do financeiro, mesmo ainda não pago",
  );
  ok(
    fin.itens.filter((x) => x.comissao_id).length === 2,
    "Financeiro identifica os títulos integrados",
  );
  await fail(
    () => pagar(percentual.titulo_id, 451),
    "Pagamento acima do liberado bloqueado",
  );
  await fail(
    () => pagar(percentual.titulo_id, 100, randomUUID(), "2020-01-01"),
    "Pagamento anterior à entrega bloqueado",
  );
  const key = randomUUID(),
    baixa = await pagar(percentual.titulo_id, 200, key);
  ok(
    (await pagar(percentual.titulo_id, 200, key)) === baixa,
    "Reenvio do pagamento não duplica",
  );
  ok(
    (await read()).itens.find((x) => x.id === percentual.id)
      .disponivel_centavos === 250,
    "Pagamento parcial reduz saldo da comissão",
  );
  await fail(
    () => estornar(recebimento),
    "Estorno de cliente exige corrigir comissão já paga",
  );
  const rev = await estornar(baixa);
  ok((await estornar(baixa)) === rev, "Estorno de comissão idempotente");
  await estornar(recebimento);
  ok(
    (await read()).itens.find((x) => x.id === percentual.id)
      .disponivel_centavos === 0,
    "Estorno do cliente recolhe comissão ainda não paga",
  );
  await pagar(receita, 27000);
  ok(
    (await read()).itens.find((x) => x.id === percentual.id)
      .disponivel_centavos === 900,
    "Quitação libera o restante sem perda de centavos",
  );
  await pagar(percentual.titulo_id, 900);
  await pagar(fixa.titulo_id, 3000);
  ok(
    (await read()).resumo.pago === 3900 &&
      (await read()).resumo.disponivel === 0,
    "Quitação das duas comissões fecha os saldos",
  );
  ok(
    (await financeiro()).resumo.saidas === 3900,
    "Pagamentos integram o caixa sem duplicar despesas",
  );
  await fail(
    () => atribuir([{ item_id: itens[0].id, profissional_id: fixo }]),
    "Comissão de OS entregue não pode ser reatribuída",
  );
  const tf = (
    await scalar("select public.consultar_financeiro($1,$2,$2,$3,$4)", [
      w,
      hoje,
      "",
      "periodo",
    ])
  ).itens.find((x) => x.comissao_id === percentual.id);
  await fail(
    () =>
      scalar("select public.salvar_titulo_financeiro($1,$2,$3::jsonb,$4)", [
        w,
        tf.id,
        JSON.stringify({ ...tf, valor_centavos: 500 }),
        tf.revisao,
      ]),
    "Comissão não pode ser adulterada pela edição financeira",
  );
  await regra(p, { ...padrao, valor: 30, ativo: false }, 2);
  ok(
    (await read()).itens.find((x) => x.id === percentual.id).valor === 10,
    "Desativar profissional preserva comissão e histórico",
  );
  await db.exec(
    `reset role;update public.ordens_servico set situacao='delivered' where id='${os}'`,
  );
  await login(owner);
  ok(
    (await read()).itens.length === 2 &&
      (await financeiro()).resumo.despesas === 3900,
    "Entrega repetida não duplica despesas",
  );
  const entregue = os;
  const nova = async () => {
    const carro = await scalar(
      "select public.cadastrar_veiculo_orcamento($1,$2,$3,$4)",
      [w, c, "Veículo da bancada", null],
    );
    os = (
      await scalar("select public.salvar_ordem_servico($1,$2::jsonb,$3)", [
        w,
        JSON.stringify({ cliente_id: c, veiculo_id: carro }),
        randomUUID(),
      ])
    ).id;
    await scalar("select public.salvar_item_os($1,$2,$3,$4::jsonb)", [
      w,
      os,
      (await ordem()).revisao,
      JSON.stringify({
        tipo: "service",
        descricao: "Serviço extra",
        quantidade: 1,
        preco_unitario_centavos: 10000,
      }),
    ]);
    return (await ordem()).itens[0];
  };
  let extra = await nova();
  await fail(
    () => atribuir([{ item_id: extra.id, profissional_id: p }]),
    "Profissional inativo não recebe nova atribuição",
  );
  await login(manager);
  await atribuir([{ item_id: extra.id, profissional_id: fixo }]);
  ok(
    (await read()).itens.length === 1,
    "Gerente atribui sem poder alterar a regra",
  );
  await atribuir([{ item_id: extra.id, profissional_id: null }]);
  ok(
    (await read()).itens.length === 0,
    "Remover atribuição antes da entrega não deixa despesa",
  );
  await atribuir([{ item_id: extra.id, profissional_id: fixo }]);
  let co = await ordem();
  await scalar(
    "select public.atualizar_mapa_ordem_servico($1,$2,$3,$4,null,null,null,$5,$6)",
    [w, os, co.revisao, "cancelled", co.recebido_em, "Cliente cancelou"],
  );
  ok(
    (await read()).resumo.prevista === 0 &&
      (await read()).itens[0].titulo_id === null,
    "OS cancelada zera previsão e não cria comissão a pagar",
  );
  await login(owner);
  extra = await nova();
  await atribuir([{ item_id: extra.id, profissional_id: fixo }]);
  await db.exec(
    `reset role;update public.itens_ordem_servico set situacao='cancelled' where id='${extra.id}'`,
  );
  await login(owner);
  ok(
    (await read()).resumo.prevista === 0,
    "Serviço cancelado não gera comissão",
  );
  co = await ordem();
  await scalar(
    "select public.atualizar_mapa_ordem_servico($1,$2,$3,$4,null,null,null,$5,$6)",
    [w, os, co.revisao, "cancelled", co.recebido_em, "Bancada concluída"],
  );
  extra = await nova();
  await atribuir([{ item_id: extra.id, profissional_id: fixo }]);
  await scalar("select public.salvar_item_os($1,$2,$3,$4::jsonb,$5)", [
    w,
    os,
    (await ordem()).revisao,
    '{"situacao":"done"}',
    extra.id,
  ]);
  await login(staff);
  for (const status of ["in_progress", "quality_check", "ready", "delivered"]) {
    const o = await ordem();
    await scalar(
      "select public.atualizar_mapa_ordem_servico($1,$2,$3,$4,null,null,null,$5)",
      [w, os, o.revisao, status, o.recebido_em],
    );
  }
  await login(owner);
  const comissaoStaff = (await read()).itens[0];
  ok(
    comissaoStaff.disponivel_centavos === 1500 && !!comissaoStaff.titulo_id,
    "Entrega feita por funcionário gera comissão pela regra da gerência",
  );
  const tituloStaff = (await financeiro()).itens.find(
    (x) => x.comissao_id === comissaoStaff.id,
  );
  await fail(
    () =>
      scalar("select public.cancelar_titulo_financeiro($1,$2,$3,$4)", [
        w,
        tituloStaff.id,
        tituloStaff.revisao,
        "Tentativa manual",
      ]),
    "Comissão sem pagamento também é protegida contra cancelamento manual",
  );
  await fail(
    () =>
      scalar("select public.salvar_titulo_financeiro($1,$2,$3::jsonb,$4)", [
        w,
        tituloStaff.id,
        JSON.stringify({ ...tituloStaff, valor_centavos: 1 }),
        tituloStaff.revisao,
      ]),
    "Comissão sem pagamento não pode ser reduzida pelo financeiro",
  );
  await scalar("select public.salvar_titulo_financeiro($1,$2,$3::jsonb,$4)", [
    w,
    tituloStaff.id,
    JSON.stringify({
      ...tituloStaff,
      observacoes: "Vencimento combinado com profissional",
    }),
    tituloStaff.revisao,
  ]);
  ok(
    (await financeiro()).itens
      .find((x) => x.id === tituloStaff.id)
      .observacoes.includes("combinado"),
    "Observação e vencimento continuam editáveis no financeiro",
  );
  os = entregue;
  await fail(
    () =>
      scalar("select public.consultar_comissoes($1,$2,$3)", [
        w,
        "2020-01-01",
        "2026-01-01",
      ]),
    "Período excessivo rejeitado",
  );
  await fail(
    () =>
      scalar("select public.consultar_comissoes($1,$2,$2,null,$3)", [
        w,
        hoje,
        randomUUID(),
      ]),
    "Filtro de OS inexistente não vaza dados",
  );
  await login(other);
  const w2 = await scalar(
    "select public.criar_oficina('Outra oficina comissões',null)",
  );
  await db.exec(
    `reset role;update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id='${w2}'`,
  );
  await login(other);
  await fail(
    () => regra(p, padrao, 3, w2),
    "UUID de outra oficina não permite alterar regra",
  );
  await login(owner);
  await fail(
    () => db.query("update public.profissionais_comissao set valor=100"),
    "Escrita direta bloqueada",
    "42501",
  );
  await db.exec(
    `reset role;update public.assinaturas_oficina set situacao='suspended' where oficina_id='${w}'`,
  );
  await login(owner);
  await fail(() => read(), "Assinatura suspensa bloqueia comissões", "42501");
  console.log(`${n} verificações de comissões aprovadas.`);
} catch (e) {
  console.error(e.message, e.code, e.where ?? "");
  process.exitCode = 1;
} finally {
  await db.close();
}
