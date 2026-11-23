import assert from "node:assert/strict";
import { criarBancoLocal } from "./banco-local.mjs";
let db;
try {
  db = await criarBancoLocal("20261003000100");
  const uid = "99000000-0000-4000-8000-000000000001",
    outro = "99000000-0000-4000-8000-000000000002";
  const scalar = async (sql) => Object.values((await db.query(sql)).rows[0])[0];
  const login = async (id) =>
    db.exec(
      `reset role; select set_config('request.jwt.claim.sub','${id}',false); set role authenticated`,
    );
  const json = (dados) =>
    `'${JSON.stringify(dados).replaceAll("'", "''")}'::jsonb`;
  const ok = (v, msg) => {
    assert.ok(v, msg);
    console.log("PASS", msg);
  };
  const falha = async (fn, msg) => {
    await assert.rejects(fn);
    console.log("PASS", msg);
  };
  await db.exec(`insert into auth.users values('${uid}'),('${outro}')`);
  await login(uid);
  const w = await scalar(
    "select public.criar_oficina('Entrega prometida QA',null)",
  );
  await db.exec(
    `reset role; update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id='${w}'`,
  );
  await login(uid);
  const c = (
    await scalar(
      `select public.salvar_cliente('${w}','{"nome":"Cliente entrega QA"}')`,
    )
  ).id;
  const v = await scalar(
    `select public.cadastrar_veiculo_orcamento('${w}','${c}','Gol','QAQ5A10')`,
  );
  const dados = {
    cliente_id: c,
    veiculo_id: v,
    queixa_cliente: "Revisão",
    diagnostico: "Filtro",
    observacoes_internas: "Preservar",
    resumo_cliente: "Troca de filtro",
    responsavel: "Ana",
    prioridade: "high",
    quilometragem_entrada: 30000,
    combustivel_percentual: 50,
    pertences: "Chave",
    condicoes_garantia: "Conforme atendimento",
    checklist: { Conferido: true },
    entrega_prevista_em: "2026-10-05T20:30:00Z",
  };
  let os = await scalar(
    `select public.salvar_ordem_servico('${w}',${json(dados)},gen_random_uuid())`,
  );
  const consultar = () =>
    scalar(`select public.consultar_ordem_servico('${w}','${os.id}')`);
  const salvar = (data, revisao = os.revisao) =>
    scalar(
      `select public.salvar_ordem_servico('${w}',${json({ ...dados, entrega_prevista_em: data })},gen_random_uuid(),'${os.id}',${revisao})`,
    );
  ok(
    Date.parse(os.entrega_prevista_em) ===
      Date.parse(dados.entrega_prevista_em),
    "criação persiste o instante combinado",
  );
  const antiga = os.revisao;
  os = await salvar("2026-10-06T21:00:00Z");
  ok(
    os.diagnostico === "Filtro" &&
      os.responsavel === "Ana" &&
      os.checklist.Conferido &&
      os.prioridade === "high" &&
      os.pertences === "Chave" &&
      os.quilometragem_entrada === 30000,
    "alterar entrega preserva dados e checklist do atendimento",
  );
  const historico = os.historico.find(
    (h) => h.metadados?.depois?.entrega_prevista_em === "2026-10-06T21:00:00Z",
  );
  ok(
    historico &&
      Date.parse(historico.metadados.antes.entrega_prevista_em) ===
        Date.parse(dados.entrega_prevista_em),
    "histórico registra prazo anterior e novo",
  );
  const lista = await scalar(`select public.listar_ordens_servico('${w}')`);
  const mapa = await scalar(
    `select entrega_prevista_em from public.ordens_servico where id='${os.id}'`,
  );
  ok(
    Date.parse(lista.itens[0].entrega_prevista_em) === Date.parse(mapa),
    "listagem e mapa leem o mesmo prazo salvo",
  );
  await falha(
    () => salvar("2026-10-08T21:00:00Z", antiga),
    "revisão antiga não sobrescreve a entrega de outro usuário",
  );
  os = await salvar(null);
  ok(
    os.entrega_prevista_em === null &&
      (await consultar()).entrega_prevista_em === null,
    "remover a data persiste sem inventar previsão",
  );
  for (const status of ["in_progress", "quality_check", "ready"]) {
    await db.exec(
      `select public.atualizar_mapa_ordem_servico('${w}','${os.id}',${os.revisao},'${status}',null,null,null,'${os.recebido_em}')`,
    );
    os = await consultar();
  }
  const concluida = os.concluido_em;
  os = await salvar("2026-10-08T21:00:00Z");
  ok(
    os.situacao === "ready" && os.concluido_em === concluida,
    "alterar promessa em OS pronta preserva a data real de conclusão",
  );
  await login(outro);
  await falha(
    () => salvar("2026-10-09T21:00:00Z"),
    "outra oficina não altera a promessa",
  );
  await login(uid);
  await db.exec(
    `select public.atualizar_mapa_ordem_servico('${w}','${os.id}',${os.revisao},'delivered',null,null,'${os.entrega_prevista_em}','${os.recebido_em}')`,
  );
  os = await consultar();
  await falha(
    () => salvar(null),
    "atendimento entregue mantém sua promessa no histórico",
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await db?.close();
}
