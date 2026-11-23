import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { inflateSync } from "node:zlib";
import { criarBancoLocal } from "./banco-local.mjs";
import {
  hojeNoAparelho,
  validarDataServico,
  dataServicoDoCampo,
} from "../../src/lib/dataServico.ts";
import { documentoDaOS } from "../../src/lib/documentoCliente.ts";
import { gerarPdfFichaComplementarOS } from "../../src/services/pdfFichaComplementarOS.ts";

const tzAnterior = process.env.TZ;
process.env.TZ = "America/Sao_Paulo";
assert.equal(hojeNoAparelho(new Date("2026-10-14T01:30:00Z")), "2026-10-13");
assert.equal(hojeNoAparelho(new Date("2026-10-14T04:30:00Z")), "2026-10-14");
if (tzAnterior === undefined) delete process.env.TZ;
else process.env.TZ = tzAnterior;
assert.equal(validarDataServico("2024-02-29"), "2024-02-29");
for (const v of [
  "",
  null,
  "2026-02-29",
  "2026-13-01",
  "13/10/2026",
  "infinity",
  "0000-01-01",
])
  assert.throws(() => validarDataServico(v));
assert.equal(
  dataServicoDoCampo({ criado_em: "2026-10-14T01:30:00Z" }),
  "2026-10-13",
);
assert.equal(
  dataServicoDoCampo({
    data_servico: "2026-09-18",
    criado_em: "2026-10-14T01:30:00Z",
    concluido_em: "2026-10-16T12:00:00Z",
  }),
  "2026-09-18",
);
console.log(
  "PASS data local na virada do dia, datas inválidas e compatibilidade com OS antigas",
);

const db = await criarBancoLocal("20261013000300");
const one = async (sql, args = []) =>
  Object.values((await db.query(sql, args)).rows[0])[0];
try {
  const u = randomUUID();
  await db.exec(
    `insert into auth.users values('${u}');select set_config('request.jwt.claim.sub','${u}',false);set role authenticated;`,
  );
  const w = await one("select public.criar_oficina('Teste data serviço',null)");
  await db.exec(
    `reset role;update public.assinaturas_oficina set codigo_plano='complete' where oficina_id='${w}';set role authenticated`,
  );
  const hoje = await one(
    "select (now() at time zone 'America/Sao_Paulo')::date::text",
  );
  const cliente = (
    await one("select public.salvar_cliente($1,$2)", [
      w,
      { nome: "Cliente de teste" },
    ])
  ).id;
  const v = await one(
    "select public.cadastrar_veiculo_orcamento($1,$2,'Motor teste',null)",
    [w, cliente],
  );
  const padrao = await one("select public.salvar_ordem_servico($1,$2,$3)", [
    w,
    { cliente_id: cliente, veiculo_id: v },
    randomUUID(),
  ]);
  assert.equal(padrao.data_servico, hoje);
  const dados = {
    cliente_nome_livre: "Cliente particular",
    cliente_id: null,
    veiculo_id: await one(
      "select public.cadastrar_veiculo_orcamento($1,null,'Outro motor',null)",
      [w],
    ),
    data_servico: "2026-09-18",
    itens: [
      {
        id: randomUUID(),
        tipo: "service",
        descricao: "Ajuste rápido",
        unidade: "serv",
        quantidade: 1,
        preco_unitario_centavos: 15000,
        situacao: "pending",
      },
    ],
    desconto_centavos: 0,
  };
  const chave = randomUUID();
  let o = await one("select public.salvar_os_com_itens($1,$2,$3)", [
    w,
    dados,
    chave,
  ]);
  assert.equal(o.data_servico, "2026-09-18");
  assert.equal(o.situacao, "open");
  assert.equal(o.cliente_id, null);
  assert.notEqual(o.recebido_em.slice(0, 10), "2026-09-18");
  assert.equal(o.concluido_em, null);
  assert.equal(
    (
      await one("select public.salvar_os_com_itens($1,$2,$3)", [
        w,
        { ...dados, data_servico: "2026-09-19" },
        chave,
      ])
    ).data_servico,
    "2026-09-18",
  );
  const entrada = o.recebido_em,
    criacao = o.criado_em;
  o = await one("select public.salvar_ordem_servico($1,$2,$3,$4,$5)", [
    w,
    { data_servico: "2026-09-19" },
    randomUUID(),
    o.id,
    o.revisao,
  ]);
  assert.equal(o.data_servico, "2026-09-19");
  assert.equal(o.recebido_em, entrada);
  assert.equal(o.criado_em, criacao);
  o = await one("select public.salvar_ordem_servico($1,$2,$3,$4,$5)", [
    w,
    { resumo_cliente: "Ajuste de observação" },
    randomUUID(),
    o.id,
    o.revisao,
  ]);
  assert.equal(o.data_servico, "2026-09-19");
  await one(
    "select public.atualizar_mapa_ordem_servico($1,$2,$3,$4,null,null,null,$5)",
    [w, o.id, o.revisao, "in_progress", o.recebido_em],
  );
  o = await one("select public.consultar_ordem_servico($1,$2)", [w, o.id]);
  assert.equal(o.data_servico, "2026-09-19");
  for (const data of ["", null, "2026-02-29", "infinity"])
    await assert.rejects(
      () =>
        one("select public.salvar_ordem_servico($1,$2,$3,$4,$5)", [
          w,
          { data_servico: data },
          randomUUID(),
          o.id,
          o.revisao,
        ]),
      (e) => e.code === "22023",
    );
  console.log(
    "PASS padrão de hoje, data escolhida, edição parcial, idempotência e avanço preservam as datas operacionais",
  );
  const pronta = await one("select public.criar_os_pronta($1,$2,$3)", [
    w,
    {
      ...dados,
      veiculo_id: await one(
        "select public.cadastrar_veiculo_orcamento($1,null,'Serviço pronto',null)",
        [w],
      ),
      itens: [{ ...dados.itens[0], id: randomUUID() }],
    },
    randomUUID(),
  ]);
  assert.equal(pronta.data_servico, "2026-09-18");
  assert.equal(pronta.situacao, "ready");
  assert.ok(pronta.concluido_em);
  assert.notEqual(pronta.concluido_em.slice(0, 10), "2026-09-18");
  const impressao = documentoDaOS(pronta, { nome: "Oficina teste" });
  assert.equal(
    impressao.informacoes.find((i) => i.rotulo === "Data do serviço").valor,
    "18/09/2026",
  );
  const pdf = gerarPdfFichaComplementarOS(
    { ...pronta, responsavel: "Funcionário de teste" },
    { nome: "Oficina teste" },
  );
  const textoPdf = [...pdf.output().matchAll(/stream\n([\s\S]*?)\nendstream/g)]
    .map((m) => inflateSync(Buffer.from(m[1], "latin1")).toString("latin1"))
    .join("\n");
  assert.match(textoPdf, /18\/09\/2026/);
  const antiga = {
    ...pronta,
    data_servico: null,
    concluido_em: "2026-10-12T12:00:00Z",
  };
  assert.equal(
    documentoDaOS(antiga, { nome: "Oficina teste" }).informacoes.find(
      (i) => i.rotulo === "Data do serviço",
    ).valor,
    "12/10/2026",
  );
  const quantidade = await one(
    "select count(*) from public.titulos_financeiros where oficina_id=$1",
    [w],
  );
  assert.equal(quantidade, 0);
  console.log(
    "PASS criação pronta e impressões usam a data escolhida; legado mantém data anterior; nenhuma movimentação financeira criada",
  );
  const outro = randomUUID();
  await db.exec(
    `reset role;insert into auth.users values('${outro}');select set_config('request.jwt.claim.sub','${outro}',false);set role authenticated`,
  );
  await assert.rejects(
    () =>
      one("select public.salvar_ordem_servico($1,$2,$3,$4,$5)", [
        w,
        { data_servico: "2026-09-20" },
        randomUUID(),
        o.id,
        o.revisao,
      ]),
    (e) => e.code === "42501",
  );
  console.log("PASS isolamento entre oficinas preservado");
} finally {
  await db.close();
}
