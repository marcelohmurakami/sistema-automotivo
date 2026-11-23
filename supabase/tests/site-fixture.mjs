import { randomUUID } from "node:crypto";
import { criarBancoLocal } from "./banco-local.mjs";

export async function criarCenarioSite() {
  const db = await criarBancoLocal("20261013000500");
  const esc = (x) => `'${String(x).replaceAll("'", "''")}'`;
  const json = (x) => `${esc(JSON.stringify(x))}::jsonb`;
  const scalar = async (sql) => Object.values((await db.query(sql)).rows[0])[0];
  const admin = (sql) => db.exec(`reset role; ${sql}`);
  const login = (id = "", role = "authenticated") =>
    db.exec(
      `reset role; select set_config('request.jwt.claim.sub',${esc(id)},false); set role ${role}`,
    );
  const ids = Object.fromEntries(
    ["owner", "otherOwner", "customer", "stranger", "unconfirmed", "staff"].map(
      (k) => [k, randomUUID()],
    ),
  );
  await admin(`alter table auth.users add column email text, add column email_confirmed_at timestamptz;
    insert into auth.users(id,email,email_confirmed_at) values ${Object.entries(
      ids,
    )
      .map(
        ([k, v]) =>
          `('${v}','${k.toLowerCase()}@site.test',${k === "unconfirmed" ? "null" : "now()"})`,
      )
      .join(",")}`);
  await login(ids.owner);
  const office = await scalar(
    "select public.criar_oficina('Oficina Horizonte QA',null)",
  );
  await login(ids.otherOwner);
  const otherOffice = await scalar(
    "select public.criar_oficina('Outra oficina QA',null)",
  );
  await admin(
    `update public.assinaturas_oficina set codigo_plano='complete' where oficina_id in ('${office}','${otherOffice}')`,
  );
  const config = {
    identificador_url: "oficina-horizonte-qa",
    titulo: "Oficina Horizonte",
    descricao: "Manutenção e cuidado com o seu veículo.",
    publicado: true,
    portal_habilitado: true,
    pedidos_pecas_habilitados: true,
  };
  await login(ids.owner);
  const call = (name, args) =>
    scalar(`select public.${name}(${args.join(",")})`);
  await call("configurar_site", [esc(office), json(config)]);
  const customer = (
    await call("salvar_cliente", [
      esc(office),
      json({
        nome: "Ana Cliente QA",
        email: "customer@site.test",
        telefone_e164: "+5511999999999",
      }),
    ])
  ).id;
  const stranger = (
    await call("salvar_cliente", [
      esc(office),
      json({ nome: "Cliente isolado QA", email: "stranger@site.test" }),
    ])
  ).id;
  const unconfirmed = (
    await call("salvar_cliente", [
      esc(office),
      json({ nome: "Conta não confirmada QA", email: "unconfirmed@site.test" }),
    ])
  ).id;
  await call("definir_acesso_portal", [
    esc(office),
    esc(customer),
    esc("customer@site.test"),
  ]);
  const part = randomUUID(),
    legacy = randomUUID(),
    service = randomUUID();
  await call("salvar_produto_estoque", [
    esc(office),
    json({
      descricao: "Filtro de óleo QA",
      unidade: "un",
      codigo: "FILTRO-QA",
      preco_padrao_centavos: 3500,
      custo_centavos: 1700,
    }),
    esc(part),
  ]);
  for (const [id, tipo] of [
    [legacy, "part"],
    [service, "service"],
  ])
    await call("salvar_item_catalogo", [
      esc(office),
      esc(id),
      json({
        descricao: "Catálogo antigo QA",
        tipo,
        unidade: "un",
        preco_padrao_centavos: 9000,
      }),
      "null",
    ]);
  await call("publicar_produto_site", [esc(office), esc(part), "true"]);
  const product = (
    await call("consultar_site_publicado", [esc(config.identificador_url)])
  ).produtos[0].id;
  const vehicle = await call("cadastrar_veiculo_orcamento", [
    esc(office),
    esc(customer),
    esc("Volkswagen Polo QA"),
    esc("QAA1A23"),
  ]);
  const order = await call("salvar_ordem_servico", [
    esc(office),
    json({
      cliente_id: customer,
      veiculo_id: vehicle,
      queixa_cliente: "Revisão",
      observacoes_internas: "SEGREDO_OFICINA",
      itens: [
        {
          descricao: "Revisão QA",
          tipo: "service",
          quantidade: 1,
          preco_unitario_centavos: 15000,
        },
      ],
    }),
    esc(randomUUID()),
  ]);
  await admin(`update public.ordens_servico set resumo_cliente='Revisão em andamento',situacao='in_progress' where id='${order.id}';
    update public.oficinas set identidade_documentos='{"cor":"#215a43","logo":"","rodape":"INTERNO_RODAPE","pix_qr":"INTERNO_PIX"}' where id='${office}';
    insert into public.manutencoes_programadas(id,oficina_id,ordem_servico_id,descricao,data_prevista) values(gen_random_uuid(),'${office}','${order.id}','Troca de óleo QA',current_date+30)`);
  await login(ids.owner);
  await call("registrar_anotacao_os", [
    esc(office),
    esc(order.id),
    esc("ANOTACAO_PRIVADA_QA"),
  ]);
  return {
    db,
    ids,
    office,
    otherOffice,
    customer,
    stranger,
    unconfirmed,
    part,
    legacy,
    service,
    product,
    order,
    config,
    esc,
    json,
    scalar,
    admin,
    login,
    call,
  };
}
