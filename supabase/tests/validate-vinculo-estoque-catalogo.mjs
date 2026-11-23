import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { criarBancoLocal } from "./banco-local.mjs";

// Insere o histórico antes da correção para reproduzir o catálogo duplicado real.
const limite = process.env.DB_VALIDATION_MIGRATION_LIMIT;
delete process.env.DB_VALIDATION_MIGRATION_LIMIT;
const db = await criarBancoLocal("20261105122543");
if (limite) process.env.DB_VALIDATION_MIGRATION_LIMIT = limite;
const one = async (sql, args = []) =>
  Object.values((await db.query(sql, args)).rows[0])[0];
const resultados = [];
const pass = (nome) => {
  resultados.push(nome);
  console.log("PASS", nome);
};
try {
  const usuario = randomUUID();
  await db.exec(
    `insert into auth.users values('${usuario}');select set_config('request.jwt.claim.sub','${usuario}',false);set role authenticated;`,
  );
  const w = await one("select public.criar_oficina('QA Vínculo estoque',null)");
  await db.exec("reset role");
  await db.query(
    "update public.assinaturas_oficina set codigo_plano='complete' where oficina_id=$1",
    [w],
  );
  await db.query("update public.oficinas set especialidade='retifica' where id=$1", [
    w,
  ]);
  await db.exec("set role authenticated");
  const produtos = [randomUUID(), randomUUID()];
  for (const produto of produtos) {
    await one("select public.salvar_produto_estoque($1,$2,$3)", [
      w,
      {
        descricao: "Pastilha FIRE QA",
        unidade: "un",
        preco_padrao_centavos: 3000,
        custo_centavos: 500,
        minimo: 0,
      },
      produto,
    ]);
    await one(
      "select public.movimentar_estoque($1,$2,'entrada',100,'Carga fictícia',$3,1)",
      [w, produto, randomUUID()],
    );
  }
  const catalogos = [randomUUID(), randomUUID(), randomUUID()];
  for (const c of catalogos)
    await one("select public.salvar_item_catalogo($1,$2,$3,null)", [
      w,
      c,
      {
        descricao: "Pastilha FIRE QA",
        tipo: "part",
        unidade: "un",
        preco_padrao_centavos: 3000,
        favorito: true,
      },
    ]);
  const ler = (id) => one("select public.consultar_ordem_servico($1,$2)", [w, id]);
  const saldo = () =>
    one(
      "select saldo::float8 from public.estoque_produtos where oficina_id=$1 and item_catalogo_id=$2",
      [w, produtos[0]],
    );
  const criar = (c, q = 1) =>
    one("select public.criar_os_pronta($1,$2,$3)", [
      w,
      {
        cliente_nome_livre: "QA Cliente fictício",
        carro_livre: "Fiat Palio",
        motor_livre: "Fire",
        desconto_centavos: 0,
        itens: [
          {
            id: randomUUID(),
            item_catalogo_id: c,
            tipo: "part",
            descricao: "Pastilha FIRE QA",
            unidade: "un",
            quantidade: q,
            preco_unitario_centavos: 3000,
            situacao: "pending",
          },
        ],
      },
      randomUUID(),
    ]);
  const vincular = (o, p, origem = "estoque") =>
    one("select public.vincular_estoque_item_os($1,$2,$3,$4,$5,$6)", [
      w,
      o.id,
      o.itens[0].id,
      p,
      origem,
      o.revisao,
    ]);
  const entregar = (o) =>
    one("select public.mover_ordem_no_mapa($1,$2,$3,'avancar')", [w, o.id, o.revisao]);
  let historico = await criar(catalogos[0]);
  await vincular(historico, produtos[0]);
  historico = await ler(historico.id);
  await entregar(historico);
  const legada = await criar(catalogos[0]);
  assert.equal(legada.itens[0].produto_estoque_id, null);
  for (const p of produtos) {
    let o = await criar(catalogos[2]);
    await vincular(o, p);
    o = await ler(o.id);
    await entregar(o);
  }
  const cliente = await criar(catalogos[0]);
  await vincular(cliente, null, "cliente");
  const externa = await criar(catalogos[0]);
  await vincular(externa, null, "externa");
  const saldoAntes = await saldo();
  await db.exec("reset role");
  await db.exec(
    await readFile(
      new URL(
        "../migrations/20261105170157_vinculo_estoque_catalogo_automatico.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec("set role authenticated");
  assert.equal(await saldo(), saldoAntes);
  assert.equal((await ler(legada.id)).itens[0].produto_estoque_id, null);
  pass("Migração preserva OS antigas, saldos e pagamentos");
  for (const c of [produtos[0], catalogos[0]]) {
    let o = await criar(c, 2);
    assert.equal(o.itens[0].item_catalogo_id, c);
    assert.equal(o.itens[0].produto_estoque_id, produtos[0]);
    assert.equal(o.itens[0].origem_peca, "estoque");
    const antes = await saldo();
    await entregar(o);
    o = await ler(o.id);
    assert.equal(o.situacao, "delivered");
    assert.equal(o.total_centavos, 6000);
    assert.equal(await saldo(), antes - 2);
    const movimentos = await one(
      "select count(*)::int from public.movimentacoes_estoque where oficina_id=$1 and ordem_servico_id=$2 and tipo='consumo_os'",
      [w, o.id],
    );
    assert.equal(movimentos, 1);
    try {
      await entregar(o);
    } catch {}
    assert.equal(await saldo(), antes - 2);
    pass(
      c === produtos[0]
        ? "Peça escolhida no estoque: baixa direta uma única vez"
        : "Catálogo duplicado com vínculo confirmado: baixa direta preserva preço e ID original",
    );
  }
  const anterior = await saldo();
  await entregar(await ler(legada.id));
  assert.equal(await saldo(), anterior - 1);
  assert.equal((await ler(legada.id)).itens[0].produto_estoque_id, produtos[0]);
  pass("OS já pronta antes da correção recupera o vínculo na entrega");
  for (const o of [cliente, externa]) {
    const s = await saldo();
    await entregar(await ler(o.id));
    assert.equal(await saldo(), s);
    assert.equal((await ler(o.id)).itens[0].produto_estoque_id, null);
  }
  pass("Peças do cliente e compras externas permanecem sem baixa");
  for (const [c, nome] of [
    [catalogos[1], "Nomes iguais sem vínculo não são confundidos"],
    [catalogos[2], "Vínculos diferentes continuam exigindo escolha"],
  ]) {
    const o = await criar(c);
    assert.equal(o.itens[0].produto_estoque_id, null);
    const s = await saldo();
    await assert.rejects(entregar(o), /Defina a origem/);
    assert.equal(await saldo(), s);
    assert.equal((await ler(o.id)).situacao, "ready");
    pass(nome);
  }
  const excesso = await criar(catalogos[0], 200),
    s = await saldo();
  await assert.rejects(entregar(excesso), /insuficiente/i);
  assert.equal(await saldo(), s);
  assert.equal((await ler(excesso.id)).situacao, "ready");
  pass("Saldo insuficiente mantém a OS pronta e não gera baixa parcial");
  const clienteId = (
    await one("select public.salvar_cliente($1,$2)", [
      w,
      { nome: "QA orçamento com peça" },
    ])
  ).id;
  const veiculoId = await one(
    "select public.cadastrar_veiculo_orcamento($1,$2,'Fiat Palio',null)",
    [w, clienteId],
  );
  let proposta = await one("select public.salvar_orcamento($1,$2,$3)", [
    w,
    {
      cliente_id: clienteId,
      veiculo_id: veiculoId,
      itens: [
        {
          item_catalogo_id: catalogos[0],
          tipo: "part",
          descricao: "Pastilha FIRE QA",
          unidade: "un",
          quantidade: 1,
          preco_unitario_centavos: 3000,
        },
      ],
      desconto_centavos: 0,
    },
    randomUUID(),
  ]);
  const token = randomUUID().replaceAll("-", "").repeat(2),
    hash = createHash("sha256").update(token).digest("hex");
  proposta = await one("select public.emitir_orcamento($1,$2,$3,7,$4)", [
    w,
    proposta.id,
    proposta.revisao,
    hash,
  ]);
  await db.exec("reset role;set role anon");
  await one("select public.responder_orcamento($1,'Cliente QA','approved',true)", [
    token,
  ]);
  await db.exec("reset role;set role authenticated");
  const convertida = await ler(
    await one("select public.converter_orcamento_em_os($1,$2)", [w, proposta.id]),
  );
  assert.equal(convertida.itens[0].produto_estoque_id, produtos[0]);
  assert.equal(convertida.itens[0].item_catalogo_id, catalogos[0]);
  pass("Orçamento aprovado e convertido em OS mantém o vínculo automaticamente");
  await db.exec("reset role");
  await db.query("update public.itens_catalogo set arquivado_em=now() where id=$1", [
    produtos[0],
  ]);
  await db.exec("set role authenticated");
  assert.equal((await criar(catalogos[0])).itens[0].produto_estoque_id, null);
  pass("Produto arquivado não é escolhido automaticamente");
  await db.exec("reset role");
  await db.query("update public.itens_catalogo set arquivado_em=null where id=$1", [
    produtos[0],
  ]);
  await db.exec("set role authenticated");
  const busca = await one(
    "select public.buscar_cadastros_operacao($1,'catalogo','',null,$2,'part')",
    [w, catalogos[0]],
  );
  assert.equal(busca[0].produto_estoque_id, produtos[0]);
  await assert.rejects(
    one("select private.produto_estoque_do_catalogo($1,$2)", [w, catalogos[0]]),
    /permission denied/i,
  );
  pass("Busca autorizada retorna o ID real; função interna não é pública");
  const funcionario = randomUUID();
  await db.exec("reset role");
  await db.query("insert into auth.users values($1)", [funcionario]);
  await db.query(
    "insert into public.membros_oficina(oficina_id,usuario_id,perfil,ativo) values($1,$2,'staff',true)",
    [w, funcionario],
  );
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [funcionario]);
  await db.exec("set role authenticated");
  const semCusto = await one(
    "select public.buscar_cadastros_operacao($1,'catalogo','',null,$2,'part')",
    [w, catalogos[0]],
  );
  assert.equal(semCusto[0].produto_estoque_id, produtos[0]);
  assert.equal(semCusto[0].custo_centavos, null);
  pass("Funcionário vincula pelo ID mesmo sem acesso aos custos");
  await db.exec("reset role");
  assert.equal(
    await one(
      "select count(*)::int from public.baixas_financeiras where oficina_id=$1",
      [w],
    ),
    0,
  );
  pass("Nenhum pagamento é lançado pela correção");
} finally {
  await db.close();
  await mkdir("output/vinculo-pecas-20261105", { recursive: true });
  await writeFile(
    "output/vinculo-pecas-20261105/banco-cenarios.json",
    JSON.stringify(resultados, null, 2),
  );
}
