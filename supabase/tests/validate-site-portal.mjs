import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { criarCenarioSite } from "./site-fixture.mjs";

let c,
  passed = 0,
  failed = 0;
const check = async (name, fn) => {
  try {
    await fn();
    passed++;
    console.log("PASS", name);
  } catch (e) {
    failed++;
    console.error("FAIL", name, e.message);
  }
};
try {
  c = await criarCenarioSite();
  const {
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
  } = c;
  const readSite = () =>
    call("consultar_site_publicado", [esc(config.identificador_url)]);
  const portal = () => call("consultar_meu_portal", [esc(office)]);
  const history = () =>
    call("consultar_meu_historico_os", [esc(office), esc(order.id)]);
  const request = (
    items = [{ product_id: product, quantity: 2 }],
    key = randomUUID(),
    client = customer,
    notes = "Para o Polo",
  ) =>
    call("solicitar_pecas", [
      esc(office),
      esc(client),
      key ? esc(key) : "null",
      items === null ? "null" : json(items),
      esc(notes),
    ]);
  const rejects = async (fn, code = "22023") =>
    assert.rejects(fn, (e) => e.code === code);
  const configure = (patch) =>
    call("configurar_site", [esc(office), json({ ...config, ...patch })]);
  await login("", "anon");
  await check(
    "Visitante consulta site publicado e preço em centavos",
    async () =>
      assert.equal((await readSite()).produtos[0].preco_centavos, 3500),
  );
  await check("Endereço inexistente não entrega dados", async () =>
    assert.equal(
      await call("consultar_site_publicado", [esc("inexistente")]),
      null,
    ),
  );
  await check("Identidade pública contém somente logo e cor", async () =>
    assert.deepEqual(Object.keys((await readSite()).identidade).sort(), [
      "cor",
      "logo",
    ]),
  );
  for (const [name, args] of [
    ["administrar_site", [esc(office)]],
    ["consultar_meu_portal", [esc(office)]],
    ["consultar_meu_historico_os", [esc(office), esc(order.id)]],
  ])
    await check(`Anônimo bloqueado em ${name}`, () =>
      rejects(() => call(name, args), "42501"),
    );
  await login(ids.stranger);
  await check("Conta sem liberação recebe portal vazio", async () =>
    assert.deepEqual(await portal(), { clientes: [], ordens: [], pedidos: [] }),
  );
  await check("Conta externa não lê histórico", async () =>
    assert.deepEqual(await history(), []),
  );
  await check("Conta externa não solicita peças pelo cliente alheio", () =>
    rejects(() => request(), "42501"),
  );
  await check("Conta externa não administra site", () =>
    rejects(() => call("administrar_site", [esc(office)]), "42501"),
  );
  await login(ids.customer);
  await check("Cliente autorizado consulta somente suas OS", async () =>
    assert.deepEqual(
      (await portal()).ordens.map((o) => o.id),
      [order.id],
    ),
  );
  await check("Dados internos não aparecem no portal", async () =>
    assert.ok(!JSON.stringify(await portal()).includes("SEGREDO_OFICINA")),
  );
  await check("Histórico contém datas e omite anotações privadas", async () => {
    const h = await history();
    assert.ok(h.length > 0 && h.every((e) => e.occurred_at));
    assert.ok(!JSON.stringify(h).includes("ANOTACAO_PRIVADA_QA"));
  });
  await check("Manutenção da própria OS está disponível", async () =>
    assert.equal((await call("minhas_manutencoes", [esc(office)])).length, 1),
  );
  await check("Mesmo cliente não consulta outra oficina", async () =>
    assert.deepEqual(await call("consultar_meu_portal", [esc(otherOffice)]), {
      clientes: [],
      ordens: [],
      pedidos: [],
    }),
  );
  for (const table of [
    "clientes",
    "ordens_servico",
    "estoque_produtos",
    "pedidos_pecas",
    "produtos_site",
  ])
    await check(`RLS impede leitura direta de ${table}`, async () =>
      assert.equal(
        await scalar(
          `select count(*)::int from public.${table} where oficina_id='${office}'`,
        ),
        0,
      ),
    );
  await check("Cliente não altera configuração", () =>
    rejects(() => configure({ titulo: "Invasão" }), "42501"),
  );
  await check("Cliente não publica peça", () =>
    rejects(
      () => call("publicar_produto_site", [esc(office), esc(part), "false"]),
      "42501",
    ),
  );
  await check("Cliente não libera outro cadastro", () =>
    rejects(
      () =>
        call("definir_acesso_portal", [
          esc(office),
          esc(stranger),
          esc("stranger@site.test"),
        ]),
      "42501",
    ),
  );
  const key = randomUUID();
  let pedido;
  await check("Pedido autorizado é registrado", async () =>
    assert.ok((pedido = await request(undefined, key))),
  );
  await check("Reenvio com a mesma chave retorna o mesmo pedido", async () =>
    assert.equal(await request(undefined, key), pedido),
  );
  await check("Mesma chave com conteúdo diferente é rejeitada", () =>
    rejects(
      () => request([{ product_id: product, quantity: 3 }], key),
      "23514",
    ),
  );
  await check("Cliente não envia pedido usando outro cadastro", () =>
    rejects(() => request(undefined, randomUUID(), stranger), "42501"),
  );
  for (const [name, items] of [
    ["array vazio", []],
    ["objeto", {}],
    ["null", null],
    ["item inválido", [null]],
    ["sem produto", [{ quantity: 1 }]],
    ["UUID inválido", [{ product_id: "abc", quantity: 1 }]],
    ["quantidade zero", [{ product_id: product, quantity: 0 }]],
    ["negativa", [{ product_id: product, quantity: -1 }]],
    ["texto", [{ product_id: product, quantity: "abc" }]],
    ["NaN", [{ product_id: product, quantity: "NaN" }]],
    ["excesso", [{ product_id: product, quantity: 10001 }]],
    ["precisão excessiva", [{ product_id: product, quantity: 0.0001 }]],
    [
      "mais de 30 itens",
      Array.from({ length: 31 }, () => ({ product_id: product, quantity: 1 })),
    ],
  ])
    await check(`Validação de pedido: ${name}`, () =>
      rejects(() => request(items)),
    );
  await check("Chave de pedido obrigatória", () =>
    rejects(() => request(undefined, null)),
  );
  await check("Observação acima do limite é rejeitada", () =>
    rejects(() => request(undefined, randomUUID(), customer, "x".repeat(2001))),
  );
  await check("Pedido com um item indisponível é rejeitado por inteiro", () =>
    rejects(
      () =>
        request([
          { product_id: product, quantity: 1 },
          { product_id: randomUUID(), quantity: 1 },
        ]),
      "23514",
    ),
  );
  await login(ids.owner);
  await check("Somente um pedido persistiu após falhas e reenvios", async () =>
    assert.equal(
      (await call("administrar_site", [esc(office)])).pedidos.length,
      1,
    ),
  );
  await check("Pedido não movimenta estoque", async () =>
    assert.equal(
      await scalar(
        `select count(*)::int from public.movimentacoes_estoque where oficina_id='${office}'`,
      ),
      0,
    ),
  );
  await check("Serviço não pode ser publicado como peça", () =>
    rejects(() =>
      call("publicar_produto_site", [esc(office), esc(service), "true"]),
    ),
  );
  await check("Peça do catálogo sem estoque não pode ser publicada", () =>
    rejects(() =>
      call("publicar_produto_site", [esc(office), esc(legacy), "true"]),
    ),
  );
  await check("Conta não confirmada não pode receber acesso", () =>
    rejects(() =>
      call("definir_acesso_portal", [
        esc(office),
        esc(unconfirmed),
        esc("unconfirmed@site.test"),
      ]),
    ),
  );
  await check("E-mail diferente do cadastro não recebe acesso", () =>
    rejects(() =>
      call("definir_acesso_portal", [
        esc(office),
        esc(customer),
        esc("stranger@site.test"),
      ]),
    ),
  );
  for (const [name, patch] of [
    ["slug curto", { identificador_url: "abc" }],
    ["slug inválido", { identificador_url: "Meu Site" }],
    ["título vazio", { titulo: " " }],
    ["descrição longa", { descricao: "x".repeat(3001) }],
    ["pedidos sem portal", { portal_habilitado: false }],
    ["boolean inválido", { publicado: "abc" }],
  ])
    await check(`Configuração valida ${name}`, () =>
      rejects(() => configure(patch)),
    );
  await configure({});
  await call("publicar_produto_site", [esc(office), esc(part), "false"]);
  await check("Peça oculta sai do site", async () =>
    assert.ok(!(await readSite()).produtos.some((p) => p.id === product)),
  );
  await login(ids.customer);
  await check("Pedido com link antigo de peça oculta é bloqueado", () =>
    rejects(() => request(), "23514"),
  );
  await login(ids.owner);
  await call("publicar_produto_site", [esc(office), esc(part), "true"]);
  await admin(
    `update public.itens_catalogo set arquivado_em=now() where id='${part}'`,
  );
  await login(ids.customer);
  await check("Peça arquivada sai do site", async () =>
    assert.ok(!(await readSite()).produtos.some((p) => p.id === product)),
  );
  await check("Pedido antigo não aceita peça arquivada", () =>
    rejects(() => request(), "23514"),
  );
  await admin(
    `update public.itens_catalogo set arquivado_em=null where id='${part}'; update public.ordens_servico set situacao='cancelled',cancelado_em=now(),motivo_cancelamento='Teste de arquivo',arquivado_em=now(),motivo_exclusao='Teste de privacidade',excluido_por='${ids.owner}' where id='${order.id}'`,
  );
  await login(ids.customer);
  await check("OS arquivada não aparece no portal", async () =>
    assert.equal((await portal()).ordens.length, 0),
  );
  await check("Histórico de OS arquivada não é acessível", async () =>
    assert.deepEqual(await history(), []),
  );
  await check("Manutenção de OS arquivada não aparece", async () =>
    assert.deepEqual(await call("minhas_manutencoes", [esc(office)]), []),
  );
  await admin(
    `update public.ordens_servico set arquivado_em=null,motivo_exclusao=null,excluido_por=null where id='${order.id}'`,
  );
  await login(ids.owner);
  await configure({ publicado: false });
  await login(ids.customer);
  await check("Site despublicado não é público", async () =>
    assert.equal(await readSite(), null),
  );
  await check("Despublicação bloqueia imediatamente o portal", async () =>
    assert.equal((await portal()).clientes.length, 0),
  );
  await check("Despublicação bloqueia pedidos", () =>
    rejects(() => request(), "42501"),
  );
  await login(ids.owner);
  await configure({
    portal_habilitado: false,
    pedidos_pecas_habilitados: false,
  });
  await login(ids.customer);
  await check(
    "Portal desabilitado bloqueia acesso sem derrubar site",
    async () => {
      assert.equal((await readSite()).portal_habilitado, false);
      assert.equal((await portal()).clientes.length, 0);
    },
  );
  await login(ids.owner);
  await configure({});
  await call("definir_acesso_portal", [
    esc(office),
    esc(customer),
    esc("customer@site.test"),
    "true",
  ]);
  await login(ids.customer);
  await check(
    "Revogação remove OS, pedidos e cadastro imediatamente",
    async () =>
      assert.deepEqual(await portal(), {
        clientes: [],
        ordens: [],
        pedidos: [],
      }),
  );
  await check("Revogação impede histórico e manutenção", async () => {
    assert.deepEqual(await history(), []);
    assert.deepEqual(await call("minhas_manutencoes", [esc(office)]), []);
  });
  await check("Revogação impede novos pedidos", () =>
    rejects(() => request(), "42501"),
  );
  await login(ids.owner);
  await call("definir_acesso_portal", [
    esc(office),
    esc(customer),
    esc("customer@site.test"),
  ]);
  for (const plan of ["intermediate", "basic"]) {
    await admin(
      `update public.assinaturas_oficina set codigo_plano='${plan}' where oficina_id='${office}'`,
    );
    await login(ids.customer);
    await check(`${plan}: site e portal bloqueados`, async () => {
      assert.equal(await readSite(), null);
      assert.deepEqual(await portal(), {
        clientes: [],
        ordens: [],
        pedidos: [],
      });
    });
    await check(`${plan}: pedidos bloqueados`, () =>
      rejects(() => request(), "42501"),
    );
    await login(ids.owner);
    await check(`${plan}: administração bloqueada`, () =>
      rejects(() => call("administrar_site", [esc(office)]), "42501"),
    );
  }
  await admin(
    `update public.assinaturas_oficina set codigo_plano='complete' where oficina_id='${office}'`,
  );
  await login(ids.otherOwner);
  await check("Gestor de outra oficina não altera pedido", () =>
    rejects(
      () =>
        call("atualizar_pedido_site", [esc(office), esc(pedido), esc("ready")]),
      "42501",
    ),
  );
  await check("Slug não pode ser usado por duas oficinas", () =>
    rejects(() => call("configurar_site", [esc(otherOffice), json(config)])),
  );
  await admin(
    `insert into public.membros_oficina(oficina_id,usuario_id,perfil) values('${office}','${ids.staff}','staff')`,
  );
  await login(ids.staff);
  await check("Funcionário sem gestão não administra site", () =>
    rejects(() => call("administrar_site", [esc(office)]), "42501"),
  );
  await check("Funcionário sem gestão não libera acesso", () =>
    rejects(
      () =>
        call("definir_acesso_portal", [
          esc(office),
          esc(customer),
          esc("customer@site.test"),
        ]),
      "42501",
    ),
  );
  await login(ids.owner);
  for (const status of [
    "reviewing",
    "quoted",
    "confirmed",
    "ready",
    "fulfilled",
    "cancelled",
  ]) {
    await call("atualizar_pedido_site", [
      esc(office),
      esc(pedido),
      esc(status),
    ]);
    await login(ids.customer);
    await check(`Cliente acompanha pedido ${status}`, async () =>
      assert.equal(
        (await portal()).pedidos.find((p) => p.id === pedido).situacao,
        status,
      ),
    );
    await login(ids.owner);
  }
  await check("Situação de pedido inválida é rejeitada", () =>
    rejects(() =>
      call("atualizar_pedido_site", [
        esc(office),
        esc(pedido),
        esc("inexistente"),
      ]),
    ),
  );
  await check("Pedido inexistente não é atualizado", () =>
    rejects(() =>
      call("atualizar_pedido_site", [
        esc(office),
        esc(randomUUID()),
        esc("ready"),
      ]),
    ),
  );
  await login(ids.customer);
  await check("Cliente não altera situação de pedido", () =>
    rejects(
      () =>
        call("atualizar_pedido_site", [esc(office), esc(pedido), esc("ready")]),
      "42501",
    ),
  );
  await check("Escrita direta em pedidos é bloqueada", () =>
    rejects(
      () =>
        db.exec(
          `update public.pedidos_pecas set situacao='ready' where id='${pedido}'`,
        ),
      "42501",
    ),
  );
  await check(
    "Pedido aceita quantidade fracionada sem arredondar",
    async () => {
      const p = await request([{ product_id: product, quantity: 1.125 }]);
      assert.equal(
        (await portal()).pedidos.find((i) => i.id === p).itens[0].quantidade,
        1.125,
      );
    },
  );
  await check("Limite de quantidade aceito sem cobrar ou reservar", async () =>
    assert.ok(await request([{ product_id: product, quantity: 10000 }])),
  );
  await check("Reenvios simultâneos não duplicam pedido", async () => {
    const k = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => request(undefined, k)),
    );
    assert.equal(new Set(results).size, 1);
  });
  await login(ids.owner);
  await check("Eventos de pedidos não são duplicados", async () => {
    const total = (await call("administrar_site", [esc(office)])).pedidos
      .length;
    await admin("");
    assert.equal(
      await scalar(
        `select count(*)::int from public.eventos_negocio where oficina_id='${office}' and tipo_evento='parts.requested'`,
      ),
      total,
    );
  });
  await admin(
    `update public.clientes set email='outro-email@site.test' where id='${customer}'`,
  );
  await login(ids.customer);
  await check(
    "Mudança de e-mail do cadastro revoga acesso anterior",
    async () => assert.equal((await portal()).clientes.length, 0),
  );
  await admin(
    `update public.clientes set email='customer@site.test' where id='${customer}'`,
  );
  await login(ids.customer);
  await check("Restaurar e-mail não libera acesso sem conferência", async () =>
    assert.equal((await portal()).clientes.length, 0),
  );
  await login(ids.owner);
  await call("definir_acesso_portal", [
    esc(office),
    esc(customer),
    esc("customer@site.test"),
  ]);
  await admin(
    `update public.clientes set arquivado_em=now() where id='${customer}'`,
  );
  await login(ids.customer);
  await check("Cadastro arquivado bloqueia todo o portal", async () =>
    assert.deepEqual(await portal(), { clientes: [], ordens: [], pedidos: [] }),
  );
  await admin(
    `update public.clientes set arquivado_em=null where id='${customer}'; update public.assinaturas_oficina set valido_ate=now()-interval '1 day' where oficina_id='${office}'`,
  );
  await login(ids.customer);
  await check("Assinatura vencida bloqueia site e portal", async () => {
    assert.equal(await readSite(), null);
    assert.equal((await portal()).clientes.length, 0);
  });
  console.log(`\nSite/portal: ${passed} aprovadas; ${failed} falhas.`);
  if (failed) process.exitCode = 1;
} catch (e) {
  console.error("Falha de preparação:", e);
  process.exitCode = 1;
} finally {
  await c?.db.close();
}
