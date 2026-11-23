import { codigoConflitoRevisao } from './banco-local.mjs';
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { criarBancoLocal } from "./banco-local.mjs";
const db = await criarBancoLocal("20261006000700");
const owner = randomUUID(),
  outsider = randomUUID();
const scalar = async (sql, args = []) =>
  Object.values((await db.query(sql, args)).rows[0])[0];
const login = (u, role = "authenticated") =>
  db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${u || ""}',false);set role ${role}`,
  );
let count = 0;
const ok = (v, msg) => {
  assert.ok(v, msg);
  console.log("PASS", msg);
  count++;
};
const fail = async (fn, code, msg) => {
  await assert.rejects(fn, (e) => e.code === code);
  console.log("PASS", msg);
  count++;
};
try {
  await db.exec(`insert into auth.users values('${owner}'),('${outsider}')`);
  await login(owner);
  const w = await scalar(
    "select public.criar_oficina('Oficina de teste autorização',null)",
  );
  await fail(
    () =>
      scalar("select public.autorizar_servico_pela_os($1,$2,1,$3,1,$4)", [
        w,
        randomUUID(),
        randomUUID(),
        randomUUID(),
      ]),
    "42501",
    "Plano básico não autoriza OS",
  );
  await db.exec(
    `reset role;update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id='${w}'`,
  );
  await login(owner);
  const c = (
    await scalar("select public.salvar_cliente($1,$2)", [
      w,
      { nome: "Cliente fictício" },
    ])
  ).id;
  const ler = (id) =>
    scalar("select public.consultar_ordem_servico($1,$2)", [w, id]);
  const proposta = (id) =>
    scalar("select public.consultar_orcamento($1,$2)", [w, id]);
  const criar = async () => {
    const v = await scalar(
      "select public.cadastrar_veiculo_orcamento($1,$2,'Veículo teste',null)",
      [w, c],
    );
    const q = await scalar("select public.salvar_orcamento($1,$2,$3)", [
      w,
      {
        cliente_id: c,
        veiculo_id: v,
        desconto_centavos: 1000,
        itens: [
          {
            descricao: "Mão de obra",
            tipo: "service",
            unidade: "serv",
            quantidade: 1,
            preco_unitario_centavos: 10000,
            grupo_servico: "Revisão",
          },
          {
            descricao: "Peça",
            tipo: "part",
            unidade: "un",
            quantidade: 2,
            preco_unitario_centavos: 5000,
            grupo_servico: "Peças",
            depende_grupo: "Revisão",
          },
        ],
      },
      randomUUID(),
    ]);
    const id = await scalar(
      "select public.criar_os_aguardando_orcamento($1,$2)",
      [w, q.id],
    );
    return { q, o: await ler(id) };
  };
  const autorizar = (o, q, wid = w) =>
    scalar("select public.autorizar_servico_pela_os($1,$2,$3,$4,$5,$6)", [
      wid,
      o.id,
      o.revisao,
      q.id,
      q.revisao,
      q.versao.id,
    ]);
  let { q, o } = await criar();
  ok(
    o.orcamento_pendente.total_centavos === 19000 &&
      o.orcamento_pendente.pode_autorizar,
    "Resumo exibe versão e valor integral antes do clique",
  );
  const lista = await scalar("select public.listar_ordens_servico_gestao($1)", [
    w,
  ]);
  ok(
    lista.itens[0].orcamento_pendente.versao_id === q.versao.id,
    "Listagem entrega versão esperada para proteger concorrência",
  );
  await fail(
    () => autorizar({ ...o, revisao: o.revisao - 1 }, q),
    codigoConflitoRevisao,
    "OS alterada bloqueia autorização antiga",
  );
  await fail(
    () => autorizar(o, { ...q, revisao: q.revisao - 1 }),
    codigoConflitoRevisao,
    "Orçamento alterado bloqueia autorização antiga",
  );
  await fail(
    () => autorizar(o, { ...q, versao: { ...q.versao, id: randomUUID() } }),
    codigoConflitoRevisao,
    "Versão diferente não pode ser autorizada",
  );
  await login(outsider);
  await fail(
    () => autorizar(o, q),
    "42501",
    "Outra oficina não consegue autorizar",
  );
  await login(null, "anon");
  await fail(
    () => autorizar(o, q),
    "42501",
    "Visitante não tem acesso à autorização interna",
  );
  await login(owner);
  await db.exec(
    `reset role;insert into public.paradas_ordem_servico(oficina_id,ordem_servico_id,motivo,detalhes,criado_por) values('${w}','${o.id}','parts','Peça em trânsito','${owner}')`,
  );
  await login(owner);
  const aprovado = await autorizar(o, q);
  ok(
    aprovado.id === o.id &&
      aprovado.itens.length === 2 &&
      aprovado.total_centavos === 19000,
    "Rascunho aprovado incorpora serviços, peças e desconto na mesma OS",
  );
  ok(
    !aprovado.orcamento_aguardando_id &&
      aprovado.orcamento_origem_id === q.id &&
      aprovado.situacao === "open",
    "Libera autorização sem iniciar execução automaticamente",
  );
  ok(
    aprovado.recebido_em === o.recebido_em && aprovado.autorizacao_oficina_em,
    "Entrada preservada e data de autorização registrada",
  );
  ok(
    aprovado.paradas.find((p) => p.motivo === "approval").encerrado_em &&
      !aprovado.paradas.find((p) => p.motivo === "parts").encerrado_em,
    "Encerra só pendência de aprovação, mantendo outras paradas",
  );
  const depois = await proposta(q.id);
  ok(
    depois.situacao === "approved" &&
      depois.versao.publicado_em &&
      depois.aprovacao.total_aprovado_centavos === 19000,
    "Orçamento sincronizado e versão congelada",
  );
  await db.exec("reset role");
  const a = await scalar(
    "select to_jsonb(a) from public.aprovacoes_orcamento a where versao_orcamento_id=$1",
    [q.versao.id],
  );
  ok(
    a.metodo_verificacao === "oficina" &&
      a.usuario_autorizador_id === owner &&
      a.token_acesso_id === null &&
      a.nome_informado === "Responsável da oficina",
    "Evidência identifica a oficina e o usuário sem simular assinatura do cliente",
  );
  await fail(
    () =>
      db.query(
        "update public.versoes_orcamento set observacoes=$1 where id=$2",
        ["Alteração indevida", q.versao.id],
      ),
    "23514",
    "Versão autorizada é imutável",
  );
  await login(owner);
  const repetido = await autorizar(o, q);
  ok(
    repetido.itens.length === 2 && repetido.revisao === aprovado.revisao,
    "Repetição do clique é idempotente",
  );
  ({ q, o } = await criar());
  const token = randomBytes(32).toString("hex"),
    hash = createHash("sha256").update(token).digest("hex");
  q = await scalar("select public.emitir_orcamento($1,$2,$3,7,$4)", [
    w,
    q.id,
    q.revisao,
    hash,
  ]);
  o = await ler(o.id);
  ok(
    (await autorizar(o, q)).total_centavos === 19000,
    "Orçamento já emitido também pode ser autorizado pela OS",
  );
  await fail(
    () =>
      scalar(
        "select public.responder_grupos_orcamento($1,'Cliente','approved',true,array['Revisão'])",
        [token],
      ),
    "22023",
    "Resposta posterior do cliente não sobrescreve autorização já registrada",
  );
  ({ q, o } = await criar());
  await db.exec(
    `reset role;update public.versoes_orcamento set publicado_em=now()-interval '8 days',expira_em=now()-interval '1 day' where id='${q.versao.id}';update public.orcamentos set situacao='awaiting_approval' where id='${q.id}'`,
  );
  await login(owner);
  await fail(() => autorizar(o, q), "22023", "Orçamento vencido exige revisão");
  ok(
    !(await ler(o.id)).orcamento_pendente.pode_autorizar,
    "Atalho desabilitado para proposta vencida",
  );
  ({ q, o } = await criar());
  await scalar("select public.excluir_ordem_servico($1,$2,$3,$4)", [
    w,
    o.id,
    o.revisao,
    "Teste de cancelamento",
  ]);
  await fail(
    () => autorizar(o, q),
    "22023",
    "OS excluída não é reativada pela autorização",
  );
  console.log(`${count} verificações de autorização pela OS passaram.`);
} finally {
  await db.close();
}
