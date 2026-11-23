import { codigoConflitoRevisao } from './banco-local.mjs';
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { criarBancoLocal } from "./banco-local.mjs";

const db = await criarBancoLocal("20261006000600");
const owner = randomUUID(),
  other = randomUUID(),
  produto = randomUUID();
let n = 0;
const scalar = async (sql, args = []) =>
  Object.values((await db.query(sql, args)).rows[0])[0];
const login = (id, role = "authenticated") =>
  db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${id}',false);set role ${role}`,
  );
const ok = (v, msg) => {
  assert.ok(v, msg);
  console.log("PASS", msg);
  n++;
};
const fail = async (fn, code, msg) => {
  await assert.rejects(fn, (e) => e.code === code);
  console.log("PASS", msg);
  n++;
};
try {
  await db.exec(`insert into auth.users values('${owner}'),('${other}')`);
  await login(owner);
  const w = await scalar("select public.criar_oficina('Teste gestão OS',null)");
  await fail(
    () => scalar("select public.listar_ordens_servico_gestao($1)", [w]),
    "42501",
    "Básico não acessa gestão de OS",
  );
  await db.exec(
    `reset role;update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id='${w}'`,
  );
  await login(owner);
  const c = (
    await scalar("select public.salvar_cliente($1,$2)", [
      w,
      { nome: "Cliente fictício de teste" },
    ])
  ).id;
  const v = await scalar(
    "select public.cadastrar_veiculo_orcamento($1,$2,'Veículo fictício',null)",
    [w, c],
  );
  const dados = {
    cliente_id: c,
    veiculo_id: v,
    queixa_cliente: "Ruído ao frear",
    responsavel: "Equipe de teste",
    diagnostico: "Conferir pastilhas",
    checklist: { "Pertences conferidos": true },
  };
  const criar = () =>
    scalar("select public.salvar_ordem_servico($1,$2,$3)", [
      w,
      dados,
      randomUUID(),
    ]);
  const ler = (id) =>
    scalar("select public.consultar_ordem_servico($1,$2)", [w, id]);
  const excluir = (o, m = "Cadastro duplicado") =>
    scalar("select public.excluir_ordem_servico($1,$2,$3,$4)", [
      w,
      o.id,
      o.revisao,
      m,
    ]);
  const restaurar = (o) =>
    scalar("select public.restaurar_ordem_servico($1,$2,$3)", [
      w,
      o.id,
      o.revisao,
    ]);
  const listar = (ex = false, busca = "") =>
    scalar("select public.listar_ordens_servico_gestao($1,$2,'',0,$3)", [
      w,
      busca,
      ex,
    ]);
  let o = await criar();
  o = await scalar("select public.salvar_ordem_servico($1,$2,$3,$4,$5)", [
    w,
    { ...dados, responsavel: "Responsável editado" },
    randomUUID(),
    o.id,
    o.revisao,
  ]);
  ok(
    o.responsavel === "Responsável editado" &&
      o.queixa_cliente === dados.queixa_cliente &&
      o.checklist["Pertences conferidos"],
    "Edição preserva dados preenchidos e registra correções",
  );
  await fail(
    () => excluir(o, "   "),
    "22023",
    "Motivo vazio bloqueado pelo banco",
  );
  await fail(
    () => excluir(o, null),
    "22023",
    "Motivo nulo bloqueado pelo banco",
  );
  await fail(
    () => excluir(o, "x".repeat(1001)),
    "22023",
    "Limite do motivo validado",
  );
  await fail(
    () => excluir({ ...o, revisao: o.revisao - 1 }),
    codigoConflitoRevisao,
    "Exclusão não sobrescreve edição concorrente",
  );
  await db.exec(
    `reset role;insert into public.apontamentos_tempo(id,oficina_id,ordem_servico_id,usuario_id,custo_hora_centavos) values(gen_random_uuid(),'${w}','${o.id}','${owner}',1000)`,
  );
  await login(owner);
  const antes = o;
  await excluir(o);
  o = await ler(o.id);
  ok(
    o.situacao === "cancelled" &&
      !!o.arquivado_em &&
      o.motivo_exclusao === "Cadastro duplicado" &&
      o.excluido_por === owner,
    "Excluir OS aberta cancela e registra data, motivo e autor",
  );
  ok(
    (await listar()).total === 0 && (await listar(true)).total === 1,
    "Excluída sai da listagem normal e aparece no filtro",
  );
  ok(
    (await scalar("select public.listar_ordens_servico($1)", [w])).total === 0,
    "API anterior também oculta excluídas",
  );
  ok(
    (await listar(true, "Veículo fictício")).total === 1 &&
      (await listar(true, "inexistente")).total === 0,
    "Busca funciona entre as excluídas",
  );
  ok(
    o.historico.length > antes.historico.length &&
      o.diagnostico === antes.diagnostico,
    "Histórico e dados anteriores preservados",
  );
  ok(
    (
      await scalar("select public.consultar_produtividade($1,$2)", [w, o.id])
    ).tempos.every((t) => t.encerrado_em),
    "Excluir encerra cronômetro ativo",
  );
  await excluir(antes);
  ok(
    (await ler(o.id)).revisao === o.revisao,
    "Repetição da exclusão não duplica eventos",
  );
  await fail(
    () =>
      scalar("select public.salvar_ordem_servico($1,$2,$3,$4,$5)", [
        w,
        dados,
        randomUUID(),
        o.id,
        o.revisao,
      ]),
    "22023",
    "OS excluída não pode ser editada por tela antiga",
  );
  await fail(
    () => restaurar({ ...o, revisao: o.revisao - 1 }),
    codigoConflitoRevisao,
    "Restauração exige revisão atual",
  );
  await restaurar(o);
  o = await ler(o.id);
  ok(
    !o.arquivado_em &&
      o.situacao === "cancelled" &&
      (await listar()).total === 1,
    "Restaurar recupera a lista sem reabrir atendimento cancelado",
  );
  await restaurar(o);
  ok(
    (await ler(o.id)).revisao === o.revisao,
    "Restauração repetida é idempotente",
  );

  // Atendimento com sinal: o cancelamento precisa respeitar o caixa.
  let paga = await criar();
  await scalar("select public.salvar_item_os($1,$2,$3,$4)", [
    w,
    paga.id,
    paga.revisao,
    {
      tipo: "service",
      descricao: "Serviço teste",
      quantidade: 1,
      preco_unitario_centavos: 10000,
    },
  ]);
  paga = await ler(paga.id);
  const titulo = await scalar("select public.preparar_financeiro_os($1,$2)", [
    w,
    paga.id,
  ]);
  await scalar(
    "select public.baixar_titulo_financeiro($1,$2,$3,3000,0,current_date,'banco','pix')",
    [w, titulo, randomUUID()],
  );
  paga = await ler(paga.id);
  await fail(
    () => excluir(paga),
    "22023",
    "OS ativa com pagamento não é excluída antes do estorno",
  );
  ok(
    !(await ler(paga.id)).arquivado_em &&
      (await ler(paga.id)).situacao === "open",
    "Falha financeira reverte exclusão por inteiro",
  );

  // A entrega já baixou estoque e registrou receita. Arquivar/restaurar não pode duplicar nem estornar.
  await scalar("select public.salvar_produto_estoque($1,$2,$3)", [
    w,
    {
      descricao: "Peça teste",
      unidade: "un",
      preco_padrao_centavos: 2000,
      custo_centavos: 1000,
      minimo: 0,
    },
    produto,
  ]);
  await scalar(
    "select public.movimentar_estoque($1,$2,'entrada',5,'Entrada de teste',$3,1)",
    [w, produto, randomUUID()],
  );
  await scalar("select public.adicionar_peca_estoque_os($1,$2,$3,2,$4)", [
    w,
    paga.id,
    produto,
    paga.revisao,
  ]);
  paga = await ler(paga.id);
  for (const i of paga.itens) {
    await scalar("select public.salvar_item_os($1,$2,$3,$4,$5)", [
      w,
      paga.id,
      paga.revisao,
      { situacao: "done" },
      i.id,
    ]);
    paga = await ler(paga.id);
  }
  for (const status of ["in_progress", "quality_check", "ready", "delivered"]) {
    await scalar(
      "select public.atualizar_mapa_ordem_servico($1,$2,$3,$4,null,null,null,$5)",
      [w, paga.id, paga.revisao, status, paga.recebido_em],
    );
    paga = await ler(paga.id);
  }
  const financeiroAntes = await scalar(
    "select public.consultar_financeiro_os($1,$2)",
    [w, paga.id],
  );
  await excluir(paga, "Arquivar atendimento concluído");
  let entregue = await ler(paga.id);
  ok(
    entregue.situacao === "delivered" && entregue.itens.length === 2,
    "Exclusão de entregue preserva situação e itens",
  );
  await restaurar(entregue);
  const financeiroDepois = await scalar(
    "select public.consultar_financeiro_os($1,$2)",
    [w, paga.id],
  );
  assert.deepEqual(financeiroDepois, financeiroAntes);
  ok(true, "Valores recebidos, saldo a receber e receita permanecem intactos");
  ok(
    (await scalar("select public.listar_estoque($1)", [w])).itens[0].saldo ===
      3,
    "Excluir e restaurar não duplicam a baixa do estoque",
  );
  await login(other);
  await fail(() => listar(true), "42501", "Outra empresa não vê as excluídas");
  await fail(() => excluir(paga), "42501", "Outra empresa não exclui OS");
  await fail(
    () => restaurar(entregue),
    "42501",
    "Outra empresa não restaura OS",
  );
  await login(owner, "anon");
  await fail(() => listar(), "42501", "Acesso anônimo bloqueado");
  await fail(() => excluir(paga), "42501", "Exclusão anônima bloqueada");
  console.log(`${n} verificações aprovadas.`);
} catch (e) {
  console.error(e.message, e.code, e.where ?? "");
  process.exitCode = 1;
} finally {
  await db.close();
}
