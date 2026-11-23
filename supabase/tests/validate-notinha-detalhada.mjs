import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { criarBancoLocal } from "./banco-local.mjs";
const db = await criarBancoLocal("20261008000700");
const uid = randomUUID(),
  outro = randomUUID();
const scalar = async (sql, args = []) =>
  Object.values((await db.query(sql, args)).rows[0])[0];
const login = (id) =>
  db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${id}',false);set role authenticated`,
  );
try {
  await db.exec(
    `alter table auth.users add column email_confirmed_at timestamptz;insert into auth.users values('${uid}',now()),('${outro}',now())`,
  );
  await login(uid);
  const w = await scalar(
    "select public.criar_oficina('Teste nota detalhada',null)",
  );
  const c = await scalar("select public.salvar_cliente($1,$2)", [
    w,
    { nome: "Cliente teste", endereco: "Rua original" },
  ]);
  const itens = [
    {
      tipo: "service",
      descricao: "Retífica",
      quantidade: 2,
      preco_unitario_centavos: 10000,
    },
  ];
  const key = randomUUID(),
    det = {
      data_servico: "2026-10-08",
      vencimento: "2026-11-08",
      motor: "GM",
      assinatura: "pendente",
    };
  const emitir = (d = det, k = key) =>
    scalar("select public.emitir_notinha_detalhada($1,$2,$3,$4,500,'',$5)", [
      w,
      k,
      c.id,
      itens,
      d,
    ]);
  const id = await emitir();
  assert.equal(await emitir({ ...det, motor: "Alterado" }), id);
  let notas = await scalar("select public.listar_notinhas($1)", [w]);
  assert.deepEqual(notas[0].detalhes, det);
  assert.equal(notas[0].dados_cliente.endereco, "Rua original");
  assert.equal(notas[0].total_centavos, 19500);
  for (const invalido of [
    { vencimento: "2026-02-30" },
    { assinatura: "pago" },
    { motor: { a: 1 } },
    { pix_copia_cola: "inválido" },
    { campo: "não permitido" },
  ])
    await assert.rejects(() => emitir(invalido, randomUUID()));
  await login(outro);
  await assert.rejects(
    () => emitir(det, randomUUID()),
    (e) => e.code === "42501",
  );
  await login(uid);
  await scalar("select public.cancelar_notinha($1,$2)", [w, id]);
  notas = await scalar("select public.listar_notinhas($1)", [w]);
  assert.equal(notas[0].situacao, "cancelled");
  assert.deepEqual(notas[0].detalhes, det);
  await scalar("select public.emitir_notinha($1,$2,$3,$4,0,'')", [
    w,
    randomUUID(),
    c.id,
    itens,
  ]);
  notas = await scalar("select public.listar_notinhas($1)", [w]);
  assert.deepEqual(notas[0].detalhes, {});
  console.log(
    "PASS: metadados, endereço, totais, idempotência, isolamento, validação, cancelamento e emissão legada.",
  );
} finally {
  await db.close();
}
