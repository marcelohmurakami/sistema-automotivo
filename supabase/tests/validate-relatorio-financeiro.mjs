import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";
import { criarBancoLocal } from "./banco-local.mjs";
const js = ts.transpile(readFileSync("src/lib/relatorioFinanceiro.ts", "utf8"), {
  module: ts.ModuleKind.ESNext,
});
const { detalharFinanceiro, agruparSerie, periodoAnterior } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`
);
const uid = "99000000-1302-4000-8000-000000000001",
  other = "99000000-1302-4000-8000-000000000002",
  staff = "99000000-1302-4000-8000-000000000003";
let db;
const scalar = async (sql) => Object.values((await db.query(sql)).rows[0])[0];
const login = async (u) =>
  db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${u}',false);set role authenticated`,
  );
const sum = (xs, k) => xs.reduce((s, x) => s + x[k], 0);
try {
  db = await criarBancoLocal("20261013000200");
  await db.exec(`insert into auth.users values('${uid}'),('${other}'),('${staff}')`);
  await login(uid);
  const w = await scalar(
    "select public.criar_oficina('Teste relatório detalhado',null)",
  );
  const hoje = await scalar(
    "select (now() at time zone 'America/Sao_Paulo')::date::text",
  );
  const data = (n) =>
      new Date(Date.parse(hoje) + n * 86400000).toISOString().slice(0, 10),
    inicio = data(-12);
  const consultar = (i = inicio, f = hoje) =>
    scalar(`select public.consultar_relatorio_financeiro('${w}','${i}','${f}')`);
  await assert.rejects(consultar, (e) => e.code === "42501");
  await db.exec(
    `reset role;update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id='${w}';insert into public.membros_oficina(oficina_id,usuario_id,perfil) values('${w}','${staff}','staff')`,
  );
  await login(uid);
  let d = await consultar();
  assert.equal(d.serie.length, 13);
  assert.equal(d.resumo.receitas, 0);
  assert.equal(d.saldo_final, 0);
  assert.equal(d.vencimentos.length, 6);
  assert.equal(d.atrasos.length, 4);
  console.log("PASS: período vazio não inventa valores e contém todos os dias");
  const criar = async (
    natureza,
    categoria,
    valor,
    competencia = hoje,
    vencimento = hoje,
  ) => {
    const id = await scalar("select gen_random_uuid()");
    await db.exec(
      `reset role;insert into public.titulos_financeiros(id,oficina_id,natureza,categoria,descricao,pessoa,valor_centavos,competencia,vencimento) values('${id}','${w}','${natureza}','${categoria}','Teste ${categoria}','Pessoa fictícia',${valor},'${competencia}','${vencimento}')`,
    );
    await login(uid);
    return id;
  };
  const pagar = (id, valor, taxa = 0, dia = hoje, forma = "pix") =>
    scalar(
      `select public.baixar_titulo_financeiro('${w}','${id}',gen_random_uuid(),${valor},${taxa},'${dia}','banco','${forma}')`,
    );
  const receita = await criar("receber", "servicos", 100000, hoje, data(-8));
  await pagar(receita, 40000, 1000, hoje, "credito");
  const despesa = await criar("pagar", "aluguel", 15000, inicio, data(7));
  await pagar(despesa, 5000);
  const compra = await criar("pagar", "compra_estoque", 20000);
  await pagar(compra, 20000);
  const aporte = await criar("receber", "aporte", 30000);
  await pagar(aporte, 30000);
  const retirada = await criar("pagar", "retirada", 5000);
  await pagar(retirada, 5000);
  const passado = await criar(
    "receber",
    "outras_receitas",
    20000,
    data(-20),
    data(-20),
  );
  const baixa = await pagar(passado, 20000, 200, data(-20), "credito");
  await db.exec(
    `select public.estornar_baixa_financeira('${w}','${baixa}','${hoje}','Estorno teste');reset role;update public.titulos_financeiros set cancelado_em=now(),motivo_cancelamento='Teste' where id='${passado}'`,
  );
  await login(uid);
  const variavel = await criar("pagar", "agua_luz", 12000, hoje, data(15));
  await db.exec(
    `reset role;update public.titulos_financeiros set valor_variavel=true where id='${variavel}'`,
  );
  await login(uid);
  const provisorio = await criar("receber", "servicos", 9000, hoje, data(30));
  await db.exec(
    `reset role;update public.titulos_financeiros set provisorio=true where id='${provisorio}'`,
  );
  await login(uid);
  for (const n of [-80, -60, -30, -7, 0, 1, 8, 16, 31]) {
    await criar("receber", "outras_receitas", 100, hoje, data(n));
    await criar("pagar", "terceiros", 200, hoje, data(n));
  }
  // Mais de 30 títulos e mais de 100 registros precisam entrar integralmente nas somas.
  await db.exec(
    `reset role;insert into public.titulos_financeiros(oficina_id,natureza,categoria,descricao,valor_centavos,competencia,vencimento) select '${w}','receber','outras_receitas','Volume '||n,100,'${hoje}','${hoje}' from generate_series(1,125) n`,
  );
  await login(uid);
  const produto = await scalar("select gen_random_uuid()");
  await db.exec(
    `select public.salvar_produto_estoque('${w}','{"descricao":"Peça teste","unidade":"un","custo_centavos":2000,"preco_padrao_centavos":3500}','${produto}')`,
  );
  await db.exec(
    `select public.movimentar_estoque('${w}','${produto}','entrada',10,'Saldo inicial da bancada',gen_random_uuid(),1)`,
  );
  const c = (
    await scalar(
      `select public.salvar_cliente('${w}','{"nome":"Cliente estoque teste"}')`,
    )
  ).id;
  const v = await scalar(
    `select public.cadastrar_veiculo_orcamento('${w}','${c}','Motor teste',null)`,
  );
  const os = (
    await scalar(
      `select public.salvar_ordem_servico('${w}','{"cliente_id":"${c}","veiculo_id":"${v}"}',gen_random_uuid())`,
    )
  ).id;
  await db.exec(
    `begin;reset role;update public.estoque_produtos set saldo=9 where oficina_id='${w}' and item_catalogo_id='${produto}';insert into public.movimentacoes_estoque(oficina_id,item_catalogo_id,tipo,quantidade,saldo_apos,custo_centavos,motivo,ordem_servico_id,chave,criado_por,criado_em) values('${w}','${produto}','consumo_os',-2,8,2000,'Teste consumo','${os}',gen_random_uuid(),'${uid}','${hoje} 01:00:00-03'),('${w}','${produto}','estorno',1,9,2000,'Teste devolução','${os}',gen_random_uuid(),'${uid}','${hoje} 02:00:00-03');commit`,
  );
  await login(uid);
  const antesTransfer = await consultar();
  await db.exec(
    `select public.transferir_financeiro('${w}',gen_random_uuid(),10000,'${hoje}','banco','caixa')`,
  );
  d = await consultar();
  assert.deepEqual(d.resumo, antesTransfer.resumo);
  assert.equal(d.saldo_final, antesTransfer.saldo_final);
  assert.equal(d.resumo.receitas, 113400);
  assert.equal(d.resumo.despesas, 28800);
  assert.equal(d.resumo.pecas, 2000);
  assert.equal(d.resumo.taxas, 800);
  assert.equal(d.resumo.entradas, 49200);
  assert.equal(d.resumo.saidas, 30000);
  assert.equal(d.saldo_inicial, 19800);
  assert.equal(d.saldo_final, 39000);
  assert.equal(d.variaveis_pendentes, 1);
  assert.equal(sum(d.serie, "receitas"), d.resumo.receitas);
  assert.equal(
    sum(d.serie, "custos"),
    d.resumo.despesas + d.resumo.pecas + d.resumo.taxas,
  );
  assert.equal(sum(d.serie, "entradas"), d.resumo.entradas);
  assert.equal(sum(d.serie, "saidas"), d.resumo.saidas);
  assert.equal(
    sum(
      d.categorias.filter((c) => c.natureza === "receber"),
      "valor",
    ),
    d.resumo.receitas,
  );
  assert.equal(
    sum(
      d.categorias.filter((c) => c.natureza === "pagar"),
      "valor",
    ),
    31600,
  );
  assert.equal(sum(d.formas, "liquido"), d.resumo.entradas);
  assert.equal(sum(d.vencimentos, "receber"), d.resumo.receber);
  assert.equal(sum(d.vencimentos, "pagar"), d.resumo.pagar);
  assert.equal(sum(d.atrasos, "receber"), d.resumo.receber_atrasado);
  assert.equal(sum(d.atrasos, "pagar"), d.resumo.pagar_atrasado);
  assert.equal(d.pendencias.filter((p) => p.natureza === "receber").length, 8);
  assert.deepEqual(d.inicio_anterior, data(-25));
  assert.equal(d.fim_anterior, data(-13));
  console.log(
    "PASS: totais conciliados, taxas, estornos, estoque consumido/devolvido, compra sem duplicidade, transferência e mais de 100 títulos",
  );
  const titulos = await scalar(
    `select jsonb_agg(to_jsonb(t)) from public.titulos_financeiros t where oficina_id='${w}'`,
  );
  const baixas = await scalar(
    `select jsonb_agg(to_jsonb(b)) from public.baixas_financeiras b where oficina_id='${w}'`,
  );
  const demo = detalharFinanceiro(
    titulos,
    baixas,
    [
      { data: hoje, valor: 4000 },
      { data: hoje, valor: -2000 },
    ],
    inicio,
    hoje,
    hoje,
  );
  for (const k of Object.keys(demo)) assert.deepEqual(demo[k], d[k], k);
  assert.equal(sum(agruparSerie(d.serie, "mes"), "receitas"), d.resumo.receitas);
  assert.deepEqual(periodoAnterior("2024-03-01", "2024-03-31"), {
    inicio: "2024-01-30",
    fim: "2024-02-29",
  });
  mkdirSync("output", { recursive: true });
  writeFileSync("output/relatorio-financeiro-fixture.json", JSON.stringify(d));
  console.log(
    "PASS: demonstração e banco produzem detalhes iguais; agrupamento e ano bissexto corretos",
  );
  // Quitação do legado reduz pendências sem inventar recebimento ou receita adicional.
  await db.exec(
    `reset role;insert into private.saldos_importados(oficina_id,titulo_id,valor_centavos) values('${w}','${receita}',10000)`,
  );
  await login(uid);
  const legado = await consultar();
  assert.equal(legado.resumo.receber, d.resumo.receber - 10000);
  assert.equal(sum(legado.vencimentos, "receber"), legado.resumo.receber);
  assert.equal(legado.resumo.entradas, d.resumo.entradas);
  const parcelas = [
    { valor_centavos: 10000, vencimento: hoje },
    { valor_centavos: 10000, vencimento: data(15) },
    { valor_centavos: 10000, vencimento: data(45) },
  ];
  const ids = await scalar(
    `select public.criar_conta_parcelada('${w}',gen_random_uuid(),'${JSON.stringify({ natureza: "receber", categoria: "outras_receitas", descricao: "Venda em três parcelas", valor_centavos: 30000, competencia: hoje })}','${JSON.stringify(parcelas)}')`,
  );
  await pagar(ids[0], 5000, 100);
  const parcelado = await consultar();
  assert.equal(parcelado.resumo.receitas, legado.resumo.receitas + 30000);
  assert.equal(parcelado.resumo.receber, legado.resumo.receber + 25000);
  assert.equal(parcelado.resumo.entradas, legado.resumo.entradas + 4900);
  assert.equal(parcelado.vencimentos[1].receber, legado.vencimentos[1].receber + 5000);
  assert.equal(parcelado.vencimentos[3].receber, legado.vencimentos[3].receber + 10000);
  assert.equal(parcelado.vencimentos[5].receber, legado.vencimentos[5].receber + 10000);
  console.log(
    "PASS: venda parcelada conta uma vez; cada vencimento mantém seu saldo após recebimento parcial",
  );
  const umDia = await consultar(hoje, hoje);
  assert.equal(umDia.serie.length, 1);
  const longo = await consultar(data(-366), hoje);
  assert.equal(longo.serie.length, 367);
  await assert.rejects(
    () => consultar(data(-367), hoje),
    (e) => e.code === "22023",
  );
  await assert.rejects(
    () => consultar(hoje, inicio),
    (e) => e.code === "22023",
  );
  await login(staff);
  await assert.rejects(consultar, (e) => e.code === "42501");
  await login(other);
  await assert.rejects(consultar, (e) => e.code === "42501");
  await db.exec("reset role;set role anon");
  await assert.rejects(consultar, (e) => e.code === "42501");
  console.log(
    "PASS: saldos importados, limites de período, isolamento por oficina e restrição à gerência",
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  if (db) await db.close();
}
