import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { criarBancoLocal } from "./banco-local.mjs";

const db = await criarBancoLocal("20261006000400");
const owner = randomUUID(),
  other = randomUUID();
let n = 0;
const scalar = async (sql, args = []) =>
  Object.values((await db.query(sql, args)).rows[0])[0];
const login = (id, role = "authenticated") =>
  db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${id || ""}',false);set role ${role}`,
  );
const ok = (value, nome) => {
  assert.ok(value, nome);
  console.log("PASS", nome);
  n++;
};
const fail = async (fn, code, nome) => {
  await assert.rejects(fn, (e) => e.code === code);
  console.log("PASS", nome);
  n++;
};
try {
  await db.exec(`insert into auth.users(id) values('${owner}'),('${other}')`);
  await login(owner);
  const oficina = await scalar(
    "select public.criar_oficina('Orçamentos rápidos',null)",
  );
  await fail(
    () =>
      scalar("select public.criar_os_aguardando_orcamento($1,$2)", [
        oficina,
        randomUUID(),
      ]),
    "42501",
    "Básico não abre OS vinculada",
  );
  await fail(
    () =>
      scalar("select public.itens_do_pacote($1,$2)", [oficina, randomUUID()]),
    "42501",
    "Básico não usa pacotes por RPC",
  );
  await db.exec(
    `reset role;update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id='${oficina}'`,
  );
  await login(owner);
  const cliente = (
    await scalar("select public.salvar_cliente($1,$2::jsonb)", [
      oficina,
      JSON.stringify({ nome: "Cliente de orçamento rápido" }),
    ])
  ).id;
  const veiculo = await scalar(
    "select public.cadastrar_veiculo_orcamento($1,$2,'Onix sem placa',null)",
    [oficina, cliente],
  );
  ok(veiculo, "Veículo cadastrado somente pelo nome, sem placa");
  const servico = randomUUID();
  await scalar("select public.salvar_item_catalogo($1,$2,$3::jsonb)", [
    oficina,
    servico,
    JSON.stringify({
      tipo: "service",
      descricao: "Revisão cadastrada",
      unidade: "serv",
      preco_padrao_centavos: 20000,
    }),
  ]);
  const dados = {
    cliente_id: cliente,
    veiculo_id: veiculo,
    observacoes: "Entrada de teste",
    condicoes: "Após aprovação",
    desconto_centavos: 3000,
    itens: [
      {
        item_catalogo_id: servico,
        tipo: "service",
        descricao: "Revisão cadastrada",
        unidade: "serv",
        quantidade: 1,
        preco_unitario_centavos: 20000,
        grupo_servico: "Revisão",
      },
      {
        item_catalogo_id: null,
        tipo: "service",
        descricao: "Ajuste exclusivo deste orçamento",
        unidade: "un",
        quantidade: 1,
        preco_unitario_centavos: 10000,
        grupo_servico: "Opcional",
      },
    ],
  };
  let quantidadeOrcamentos = 0;
  const novo = async () => {
    const carro =
      quantidadeOrcamentos++ === 0
        ? veiculo
        : await scalar(
            "select public.cadastrar_veiculo_orcamento($1,$2,'Outro veículo',null)",
            [oficina, cliente],
          );
    return scalar("select public.salvar_orcamento($1,$2::jsonb,$3)", [
      oficina,
      JSON.stringify({ ...dados, veiculo_id: carro }),
      randomUUID(),
    ]);
  };
  const ler = (id) =>
    scalar("select public.consultar_ordem_servico($1,$2)", [oficina, id]);
  const criar = (q) =>
    scalar("select public.criar_os_aguardando_orcamento($1,$2)", [
      oficina,
      q.id,
    ]);
  const emitir = async (q) => {
    const token = randomBytes(32).toString("hex");
    const proposta = await scalar(
      "select public.emitir_orcamento($1,$2,$3,7,$4)",
      [
        oficina,
        q.id,
        q.revisao,
        createHash("sha256").update(token).digest("hex"),
      ],
    );
    return { token, proposta };
  };
  let q = await novo();
  const osId = await criar(q);
  let os = await ler(osId);
  ok(
    os.orcamento_aguardando_id === q.id && os.orcamento_origem_id === null,
    "OS vinculada ao rascunho sem simular aprovação",
  );
  ok(
    os.itens.length === 0 && os.total_centavos === 0,
    "OS pendente não cobra nem libera itens sem autorização",
  );
  ok(
    os.paradas.some((p) => p.motivo === "approval" && !p.encerrado_em),
    "OS fica parada aguardando aprovação",
  );
  ok((await criar(q)) === osId, "Repetir criação retorna a mesma OS");
  ok(
    (await scalar("select public.consultar_orcamento($1,$2)", [oficina, q.id]))
      .ordem_servico_id === osId,
    "Orçamento encontra a OS pendente",
  );
  ok(
    (await scalar(
      "select count(*) from public.itens_catalogo where oficina_id=$1",
      [oficina],
    )) === 1,
    "Serviço avulso fica salvo fora do catálogo",
  );
  ok(
    q.itens.some(
      (i) =>
        i.descricao === dados.itens[1].descricao && i.item_catalogo_id === null,
    ),
    "Item avulso persiste na versão do orçamento",
  );
  await fail(
    () =>
      scalar("select public.salvar_item_os($1,$2,$3,$4::jsonb)", [
        oficina,
        osId,
        os.revisao,
        JSON.stringify({
          tipo: "service",
          descricao: "Tentativa",
          quantidade: 1,
          preco_unitario_centavos: 100,
        }),
      ]),
    "23514",
    "Não adiciona item direto à OS aguardando orçamento",
  );
  await fail(
    () =>
      scalar("select public.resolver_parada_os($1,$2,$3)", [
        oficina,
        osId,
        os.paradas[0].id,
      ]),
    "23514",
    "Não remove a pendência antes do aceite",
  );
  await db.exec("reset role");
  await fail(
    () =>
      db.query(
        "update public.ordens_servico set situacao='in_progress' where id=$1",
        [osId],
      ),
    "23514",
    "Banco bloqueia iniciar OS sem aprovação",
  );
  await fail(
    () =>
      db.query(
        "update public.ordens_servico set orcamento_aguardando_id=null where id=$1",
        [osId],
      ),
    "23514",
    "Banco impede desvincular a aprovação pendente",
  );
  await login(other);
  await fail(
    () => criar(q),
    "42501",
    "Outra empresa não cria ou consulta OS do orçamento",
  );
  await login(owner);
  const envio = await emitir(q);
  await login(null, "anon");
  await fail(() => criar(q), "42501", "Público não abre OS por RPC");
  await scalar(
    "select public.responder_grupos_orcamento($1,'Cliente fictício','approved',true,array['Revisão'])",
    [envio.token],
  );
  await login(owner);
  os = await ler(osId);
  ok(
    !os.orcamento_aguardando_id && os.orcamento_origem_id === q.id,
    "Aprovação pública libera a mesma OS",
  );
  ok(
    os.itens.length === 1 && os.itens[0].item_catalogo_id === servico,
    "Aprovação parcial copia somente os serviços autorizados",
  );
  ok(
    os.total_centavos === 18000 && os.desconto_centavos === 2000,
    "Desconto proporcional e total autorizado preservados",
  );
  ok(
    !os.paradas.some((p) => p.motivo === "approval" && !p.encerrado_em),
    "Aceite resolve a parada de aprovação",
  );
  ok(
    os.historico.some((h) =>
      h.descricao.includes("Itens autorizados incorporados"),
    ),
    "Liberação mantém histórico auditável",
  );
  ok((await criar(q)) === osId, "Nova chamada após aprovação não duplica a OS");
  ok(
    (await scalar("select public.converter_orcamento_em_os($1,$2)", [
      oficina,
      q.id,
    ])) === osId,
    "Conversão tradicional encontra a OS já liberada",
  );
  q = await novo();
  const segunda = await criar(q),
    envio2 = await emitir(q);
  await login(null, "anon");
  await scalar(
    "select public.responder_grupos_orcamento($1,'Cliente fictício','declined',true,array[]::text[])",
    [envio2.token],
  );
  await login(owner);
  const recusada = await ler(segunda);
  ok(
    recusada.orcamento_aguardando_id === q.id && recusada.itens.length === 0,
    "Recusa não libera execução nem insere itens",
  );
  q = await novo();
  const envio3 = await emitir(q);
  await login(null, "anon");
  await scalar(
    "select public.responder_grupos_orcamento($1,'Cliente fictício','approved',true,array['Revisão','Opcional'])",
    [envio3.token],
  );
  await login(owner);
  const normal = await criar(q);
  ok(
    (await ler(normal)).total_centavos === 27000,
    "Orçamento já aprovado continua convertendo normalmente",
  );
  console.log(`${n} verificações concluídas.`);
} finally {
  await db.close();
}
