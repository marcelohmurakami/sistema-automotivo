import { codigoConflitoRevisao } from './banco-local.mjs';
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { criarBancoLocal } from "./banco-local.mjs";
const db = await criarBancoLocal("20261006000500");
const owner = randomUUID(),
  other = randomUUID();
let n = 0;
const scalar = async (sql, args = []) =>
  Object.values((await db.query(sql, args)).rows[0])[0];
const login = (id, role = "authenticated") =>
  db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${id || ""}',false);set role ${role}`,
  );
const ok = (v, t) => {
  assert.ok(v, t);
  console.log("PASS", t);
  n++;
};
const fail = async (fn, code, t) => {
  await assert.rejects(fn, (e) => e.code === code);
  console.log("PASS", t);
  n++;
};
try {
  await db.exec(`insert into auth.users(id) values('${owner}'),('${other}')`);
  await login(owner);
  const w = await scalar(
    "select public.criar_oficina('Gestão de orçamentos',null)",
  );
  await fail(
    () => scalar("select public.listar_orcamentos_gestao($1)", [w]),
    "42501",
    "Plano sem orçamentos bloqueado",
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
  const v = await scalar(
    "select public.cadastrar_veiculo_orcamento($1,$2,'Onix',null)",
    [w, c],
  );
  const dados = {
    cliente_id: c,
    veiculo_id: v,
    observacoes: "Diagnóstico completo",
    condicoes: "Após aprovação",
    desconto_centavos: 1200,
    outros_custos_centavos: 400,
    itens: [
      {
        tipo: "service",
        descricao: "Revisão",
        unidade: "serv",
        quantidade: 2,
        preco_unitario_centavos: 10000,
        grupo_servico: "Motor",
        explicacao_cliente: "Verificar ruído",
        prioridade_servico: "urgente",
        minutos_previstos: 60,
        custo_hora_centavos: 1000,
        custo_unitario_previsto_centavos: 2000,
      },
    ],
  };
  const criar = () =>
    scalar("select public.salvar_orcamento($1,$2,$3)", [
      w,
      dados,
      randomUUID(),
    ]);
  const ler = (id) =>
    scalar("select public.consultar_orcamento($1,$2)", [w, id]);
  const editar = (q, d = dados) =>
    scalar("select public.editar_orcamento($1,$2,$3,$4,$5)", [
      w,
      d,
      randomUUID(),
      q.id,
      q.revisao,
    ]);
  const excluir = (q, m = "Orçamento duplicado") =>
    scalar("select public.excluir_orcamento($1,$2,$3,$4)", [
      w,
      q.id,
      q.revisao,
      m,
    ]);
  const listar = (ex = false) =>
    scalar("select public.listar_orcamentos_gestao($1,'','',0,$2)", [w, ex]);
  let q = await criar();
  const versao = q.versao.id;
  q = await editar(q, {
    ...dados,
    observacoes: "Editado",
    desconto_centavos: 1500,
  });
  ok(
    q.versao.id === versao &&
      q.versao.observacoes === "Editado" &&
      q.versao.total_centavos === 18500,
    "Rascunho edita mesma versão e recalcula total",
  );
  ok(
    q.itens[0].explicacao_cliente === "Verificar ruído" &&
      q.itens[0].minutos_previstos === 60 &&
      q.versao.outros_custos_centavos === 400,
    "Edição preserva campos detalhados e custos",
  );
  await fail(
    () => editar({ ...q, revisao: q.revisao - 1 }),
    codigoConflitoRevisao,
    "Edição concorrente não sobrescreve dados",
  );
  const token = randomBytes(32).toString("hex");
  q = await scalar("select public.emitir_orcamento($1,$2,$3,7,$4)", [
    w,
    q.id,
    q.revisao,
    createHash("sha256").update(token).digest("hex"),
  ]);
  const emitida = q.versao.id;
  await fail(
    () => editar(q, { ...dados, desconto_centavos: 999999 }),
    "22023",
    "Erro de validação reverte criação da nova versão",
  );
  ok(
    (await ler(q.id)).versao.id === emitida &&
      (await scalar("select public.consultar_orcamento_publico($1)", [token]))
        .situacao === "awaiting_approval",
    "Falha mantém versão emitida e link válidos",
  );
  q = await editar(q, { ...dados, observacoes: "Segunda versão" });
  ok(
    q.situacao === "draft" &&
      q.historico.length === 2 &&
      q.versao.id !== emitida &&
      q.versao.observacoes === "Segunda versão",
    "Edição de emitido cria rascunho e preserva histórico",
  );
  ok(
    (
      await scalar("select public.consultar_orcamento($1,$2,$3)", [
        w,
        q.id,
        emitida,
      ])
    ).versao.total_centavos === 18500,
    "Versão anterior permanece intacta",
  );
  await fail(
    () => scalar("select public.consultar_orcamento_publico($1)", [token]),
    "P0002",
    "Revisão revoga link da versão anterior",
  );
  await fail(
    () => excluir(q, "   "),
    "22023",
    "Exclusão exige motivo válido no banco",
  );
  await fail(
    () => excluir({ ...q, revisao: q.revisao - 1 }),
    codigoConflitoRevisao,
    "Exclusão exige revisão atual",
  );
  await excluir(q);
  const removido = await ler(q.id);
  ok(
    !!removido.arquivado_em &&
      removido.motivo_exclusao === "Orçamento duplicado",
    "Exclusão conserva documento e motivo",
  );
  ok(
    (await listar()).total === 0 && (await listar(true)).total === 1,
    "Excluído sai da lista principal e aparece na lixeira",
  );
  await excluir(q);
  ok(
    (await ler(q.id)).revisao === removido.revisao,
    "Repetir exclusão não duplica evento",
  );
  await fail(() => editar(removido), "22023", "Excluído não aceita edição");
  await fail(
    () =>
      scalar("select public.salvar_orcamento($1,$2,$3,$4,$5)", [
        w,
        dados,
        randomUUID(),
        q.id,
        removido.revisao,
      ]),
    "22023",
    "RPC antiga também impede edição de excluído",
  );
  await fail(
    () =>
      scalar("select public.gerar_link_orcamento($1,$2,$3)", [
        w,
        q.id,
        "a".repeat(64),
      ]),
    "22023",
    "Excluído não gera novos links",
  );
  await fail(
    () =>
      scalar("select public.criar_os_aguardando_orcamento($1,$2)", [w, q.id]),
    "22023",
    "Excluído não gera OS",
  );
  await scalar("select public.restaurar_orcamento($1,$2,$3)", [
    w,
    q.id,
    removido.revisao,
  ]);
  q = await ler(q.id);
  ok(
    !q.arquivado_em &&
      (await listar()).total === 1 &&
      (await listar(true)).total === 0,
    "Restauração devolve o orçamento com dados intactos",
  );
  const os = await scalar(
    "select public.criar_os_aguardando_orcamento($1,$2)",
    [w, q.id],
  );
  await fail(
    () => excluir(q),
    "22023",
    "Não abandona OS aguardando aprovação ao excluir orçamento",
  );
  const v2 = await scalar(
    "select public.cadastrar_veiculo_orcamento($1,$2,'Veículo corrigido',null)",
    [w, c],
  );
  q = await editar(q, { ...dados, veiculo_id: v2 });
  const osPendente = await scalar(
    "select public.consultar_ordem_servico($1,$2)",
    [w, os],
  );
  ok(
    osPendente.veiculo_id === v2 && osPendente.orcamento_aguardando_id === q.id,
    "Correção do veículo acompanha OS pendente sem liberar execução",
  );
  const token2 = randomBytes(32).toString("hex");
  q = await scalar("select public.emitir_orcamento($1,$2,$3,7,$4)", [
    w,
    q.id,
    q.revisao,
    createHash("sha256").update(token2).digest("hex"),
  ]);
  await scalar(
    "select public.responder_grupos_orcamento($1,'Cliente fictício','approved',true,array['Motor'])",
    [token2],
  );
  q = await ler(q.id);
  ok(
    q.edicao_bloqueada === true,
    "Orçamento que autorizou OS sinaliza proteção de edição",
  );
  await fail(
    () => editar(q),
    "22023",
    "Edição não altera valores já executáveis na OS",
  );
  await excluir(q);
  ok(
    (await scalar("select public.consultar_ordem_servico($1,$2)", [w, os]))
      .orcamento_origem_id === q.id,
    "Excluir aprovado preserva vínculo e valores da OS",
  );
  await fail(
    () => scalar("select public.consultar_orcamento_publico($1)", [token2]),
    "P0002",
    "Exclusão revoga link de aprovado",
  );
  await login(other);
  await fail(() => excluir(q), "42501", "Outra oficina não exclui orçamento");
  await fail(() => editar(q), "42501", "Outra oficina não edita orçamento");
  await fail(() => listar(true), "42501", "Outra oficina não lê a lixeira");
  await login(null, "anon");
  await fail(
    () => listar(),
    "42501",
    "Anônimo não acessa gestão de orçamentos",
  );
  await db.exec("reset role");
  ok(
    await scalar(
      "select exists(select 1 from public.registros_auditoria where entidade_id=$1 and acao='orcamento.excluido' and metadados->>'motivo'='Orçamento duplicado')",
      [q.id],
    ),
    "Auditoria registra motivo e autor da exclusão",
  );
  console.log(`${n} verificações de edição e exclusão aprovadas.`);
} finally {
  await db.close();
}
