import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { criarBancoLocal } from "./banco-local.mjs";

const db = await criarBancoLocal("20261014000100");
const one = async (sql, args = []) =>
  Object.values((await db.query(sql, args)).rows[0])[0];
try {
  const usuario = randomUUID();
  await db.exec(
    `insert into auth.users values('${usuario}');select set_config('request.jwt.claim.sub','${usuario}',false);set role authenticated;`,
  );
  const oficina = await one(
    "select public.criar_oficina('Teste entrega das peças',null)",
  );
  await db.query("reset role");
  await db.query(
    "update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id=$1",
    [oficina],
  );
  await db.query("set role authenticated");
  const produto = randomUUID();
  await one("select public.salvar_produto_estoque($1,$2,$3)", [
    oficina,
    {
      descricao: "Pastilha fictícia",
      unidade: "un",
      preco_padrao_centavos: 1500,
      custo_centavos: 500,
      minimo: 0,
    },
    produto,
  ]);
  await one("select public.movimentar_estoque($1,$2,'entrada',10,'Teste local',$3,1)", [
    oficina,
    produto,
    randomUUID(),
  ]);
  const ler = (id) =>
    one("select public.consultar_ordem_servico($1,$2)", [oficina, id]);
  const saldo = async () =>
    (await one("select public.listar_estoque($1)", [oficina])).itens[0].saldo;
  const entregar = (os) =>
    one("select public.mover_ordem_no_mapa($1,$2,$3,'avancar')", [
      oficina,
      os.id,
      os.revisao,
    ]);
  const vincular = (os, item, origem) =>
    one("select public.vincular_estoque_item_os($1,$2,$3,$4,$5,$6)", [
      oficina,
      os.id,
      item,
      origem === "estoque" ? produto : null,
      origem,
      os.revisao,
    ]);
  for (const origem of ["cliente", "externa", "estoque"]) {
    const veiculo = await one(
      "select public.cadastrar_veiculo_orcamento($1,null,'Veículo fictício',null)",
      [oficina],
    );
    let os = await one("select public.criar_os_pronta($1,$2,$3)", [
      oficina,
      {
        cliente_nome_livre: "Cliente fictício",
        cliente_id: null,
        veiculo_id: veiculo,
        desconto_centavos: 0,
        itens: [1, 2].map(() => ({
          id: randomUUID(),
          tipo: "part",
          descricao: "Pastilha de regulagem FIRE",
          unidade: "un",
          quantidade: 2,
          preco_unitario_centavos: 1500,
          situacao: "pending",
        })),
      },
      randomUUID(),
    ]);
    const inicial = os,
      saldoAntes = await saldo();
    await assert.rejects(entregar(os), /Defina a origem da peça/);
    assert.equal((await ler(os.id)).situacao, "ready");
    assert.equal(await saldo(), saldoAntes);
    await vincular(os, os.itens[0].id, origem);
    os = await ler(os.id);
    await assert.rejects(
      vincular(inicial, os.itens[1].id, origem),
      (e) => e.code === "PT409",
    );
    await vincular(os, os.itens[1].id, origem);
    os = await ler(os.id);
    await entregar(os);
    os = await ler(os.id);
    assert.equal(os.situacao, "delivered");
    assert.equal(os.total_centavos, inicial.total_centavos);
    assert.equal(await saldo(), saldoAntes - (origem === "estoque" ? 4 : 0));
    const movimentos = await one(
      "select public.consultar_movimentacoes_estoque($1,$2)",
      [oficina, produto],
    );
    assert.equal(
      movimentos.filter((m) => m.ordem_servico_id === os.id).length,
      origem === "estoque" ? 2 : 0,
    );
    console.log(
      `PASS banco: entrega com origem ${origem}, revisão concorrente, total e estoque corretos`,
    );
  }
  await db.query("reset role");
  assert.equal(
    await one(
      "select count(*)::int from public.baixas_financeiras where oficina_id=$1",
      [oficina],
    ),
    0,
  );
  console.log("PASS entrega não registra pagamento automaticamente");
} finally {
  await db.close();
}
