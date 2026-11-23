import assert from "node:assert/strict";
import { randomUUID as uuid } from "node:crypto";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { build, preview } from './lib/vite-conferencia.mjs';
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from './lib/chrome-conferencia.mjs';
import {
  criarCenarioSubsistemas,
  exemplosSubsistemas,
} from "../supabase/tests/subsistemas-fixture.mjs";
import { especialidades } from "../src/lib/especialidades.ts";
process.env.DB_VALIDATION_RUNTIME ||= resolve(
  "node_modules/@electric-sql/pglite/dist/index.js",
);
process.env.DB_VALIDATION_MIGRATION_LIMIT ||= "20261029001100";
const pasta=resolve(process.env.QA_OUTPUT || "output/auditoria-financeiro-estoque-20261029/interface");
await mkdir(pasta, { recursive: true });
const { db, ids, registros, login } = await criarCenarioSubsistemas();
const one = async (s, a = []) => Object.values((await db.query(s, a)).rows[0])[0];
const call = (fn, a) =>
  one(`select public.${fn}(${a.map((_, i) => "$" + (i + 1)).join(",")})`, a);
const contextos = {};
for (const [perfil, r] of Object.entries(registros)) {
  await login(ids[perfil]);
  let documento = r.atendimento,
    ramo = "atendimento";
  if (!documento) {
    ramo = "os";
    const os = await call("salvar_ordem_servico", [
      r.w,
      { cliente_id: r.cliente, veiculo_id: r.objeto },
      uuid(),
    ]);
    documento = os.id;
    await call("adicionar_peca_estoque_os", [r.w, documento, r.produto, 2, os.revisao]);
  }
  await call("salvar_fornecedor", [r.w, uuid(), { nome: "Fornecedor de testes" }]);
  await call("salvar_fornecedor", [r.w, uuid(), { nome: "Fornecedor alternativo" }]);
  const serial = uuid();
  await call("salvar_produto_estoque", [
    r.w,
    { descricao: "Unidade individual QA", unidade: "un", custo_centavos: 1000 },
    serial,
  ]);
  await call("configurar_planejamento_estoque", [r.w, serial, 1, { rastreado: true }]);
  const p = (await call("listar_estoque", [r.w])).itens.find((i) => i.id === serial);
  const dep = await call("salvar_deposito_estoque", [
    r.w,
    uuid(),
    { nome: "Veículo QA", tipo: "veiculo" },
    null,
  ]);
  const fornecedor = (await call("listar_fornecedores", [r.w, "Fornecedor de testes"]))
    .itens[0].id;
  const compraCredito = uuid();
  await call("registrar_compra_deposito", [
    r.w,
    compraCredito,
    fornecedor,
    r.hoje,
    r.hoje,
    "CREDITO-TOTAL",
    "",
    [{ produto_id: r.produto, quantidade: 2, custo_centavos: 2000 }],
    0,
    "banco",
    "pix",
    dep,
  ]);
  const prod = await call("consultar_produto_estoque", [r.w, r.produto]),
    dev = uuid();
  await call("abrir_devolucao_fornecedor", [
    r.w,
    dev,
    fornecedor,
    r.produto,
    dep,
    2,
    prod.revisao,
    "Crédito integral de teste",
  ]);
  await call("atualizar_devolucao_fornecedor", [
    r.w,
    dev,
    1,
    "credito",
    {
      quantidade: 2,
      credito_centavos: 4000,
      observacoes: "Crédito integral confirmado",
    },
  ]);
  const co = await call("consultar_compra_estoque", [r.w, compraCredito]);
  await call("aplicar_credito_fornecedor", [
    r.w,
    uuid(),
    dev,
    co.titulo.id,
    4000,
    2,
    "Abatimento integral",
  ]);
  contextos[perfil] = {
    dep,
    compraCredito,
    tituloCredito: co.titulo.id,
    usuario: ids[perfil],
    oficina: {
      id: r.w,
      nome: "Empresa QA " + perfil,
      perfil: "owner",
      ramo: especialidades[perfil].ramo,
      especialidade: perfil,
      codigo_plano: "complete",
    },
    documento,
    ramo,
    serial: p,
    produto: r.produto,
    descricao: exemplosSubsistemas[perfil][2],
  };
}
// Adaptador local das RPCs reais. Só aceita as empresas fictícias desta bancada.
let fila = Promise.resolve();
const errosRpc = [];
const api = {
  name: "qa-suprimentos-api",
  configurePreviewServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = new URL(req.url, "http://localhost");
      res.setHeader("Content-Type", "application/json");
      if (url.pathname === "/test-context") {
        fila = fila.then(async () => {
          const c = contextos[url.searchParams.get("perfil")] || contextos.mecanica;
          await login(c.usuario);
          const serial = await call("consultar_produto_estoque", [
            c.oficina.id,
            c.serial.id,
          ]);
          res.end(JSON.stringify({ ...c, serial }));
        });
        return;
      }
      if (!url.pathname.startsWith("/rest/v1/rpc/")) {
        res.removeHeader("Content-Type");
        next();
        return;
      }
      const fn = url.pathname.split("/").at(-1);
      if (!/^[a-z_]+$/.test(fn)) {
        res.statusCode = 400;
        res.end("{}");
        return;
      }
      let text = "";
      req.on("data", (b) => (text += b));
      req.on("end", () => {
        fila = fila.then(async () => {
          try {
            const args = JSON.parse(text || "{}"),
              perfil = Object.keys(registros).find(
                (k) => registros[k].w === args.p_oficina,
              );
            if (!perfil) throw Error("Empresa fora da bancada");
            await login(ids[perfil]);
            const keys = Object.keys(args);
            assert.ok(keys.every((k) => /^p_[a-z_]+$/.test(k)));
            const data = await one(
              `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(",")})`,
              keys.map((k) =>
                ([
                  "reservar_estoque_atendimento",
                  "reservar_estoque_deposito",
                  "transferir_estoque",
                ].includes(fn) &&
                  k === "p_unidades") ||
                (fn === "resolver_conciliacao" && k === "p_baixas")
                  ? "{" + args[k].join(",") + "}"
                  : args[k],
              ),
            );
            res.end(JSON.stringify(data));
          } catch (e) {
            errosRpc.push({ fn, code: e.code, message: e.message });
            res.statusCode = 400;
            res.end(JSON.stringify({ code: e.code || "QA", message: e.message }));
          }
        });
      });
    });
  },
};
const config = {
  configFile: false,
  envDir: false,
  plugins: [react(), tailwindcss(), api],
  logLevel: "error",
  define: {
    "import.meta.env.VITE_SUPABASE_URL": "window.location.origin",
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
      "qa-local-no-external-access",
    ),
  },
  build: {
    target: "esnext",
    outDir: "output/auditoria-financeiro-estoque-20261029/fixture-build",
    rollupOptions: { input: "scripts/fixtures/financeiro-estoque.html" },
  },
};
let browser, server, page;
const resultados = [],
  errors = [];
try {
  await build(config);
  server = await preview({ ...config, preview: { host: "127.0.0.1", port: 0 } });
  const base = server.resolvedUrls.local[0];
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_BROWSER ||
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  });
  const ctx = await browser.newContext({
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  });
  await ctx.route("**/*", (r) =>
    new URL(r.request().url()).origin === new URL(base).origin
      ? r.continue()
      : r.abort(),
  );
  page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const ir = async (perfil, rota, largura = 390, tema = "escuro") => {
    await page.setViewportSize({ width: largura, height: 960 });
    await page.goto(
      base +
        "scripts/fixtures/financeiro-estoque.html?perfil=" +
        perfil +
        "&rota=" +
        encodeURIComponent(rota) +
        "&tema=" +
        tema,
    );
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.evaluate(() => document.fonts.ready);
  };
  const layout = async (nome) => {
    const r = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      fora: [...document.querySelectorAll("main *,dialog[open] *")]
        .filter((e) => e.checkVisibility())
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.left < -1 || r.right > innerWidth + 1;
        })
        .map((e) => e.tagName + "." + e.className),
    }));
    assert.ok(r.scroll <= r.width + 1, nome + JSON.stringify(r));
    assert.deepEqual(r.fora, [], nome);
    assert.deepEqual(errors, []);
    resultados.push({ nome, ...r });
  };
  for (const perfil of (process.argv.includes("--visual") ? [] : Object.keys(registros))) {
    if (process.argv.includes("--rapido") && perfil !== "mecanica") continue;
    const r = registros[perfil];
    await ir(perfil, "/financeiro?aba=contas");
    await page
      .getByRole("button", { name: "Nova conta a receber", exact: true })
      .first()
      .click();
    await page
      .getByLabel("Descrição", { exact: true })
      .fill("QA recebimento integrado");
    await page.getByLabel("Valor total (R$)", { exact: true }).fill("100");
    await layout("criar-receita-" + perfil);
    await page.getByRole("button", { name: "Salvar lançamento", exact: true }).click();
    await page
      .getByRole("button", { name: "Receber QA recebimento integrado", exact: true })
      .click();
    await page.getByLabel("Valor recebido agora (R$)").fill("30");
    await page.getByText("Taxa deste recebimento (opcional)", { exact: true }).click();
    await page.getByLabel("Taxa descontada deste recebimento (R$)").fill("1");
    await layout("receber-parcial-" + perfil);
    await page.getByRole("button", { name: "Confirmar registro", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await login(ids[perfil]);
    const titulo = await one(
      "select id from public.titulos_financeiros where oficina_id=$1 and descricao=$2",
      [r.w, "QA recebimento integrado"],
    );
    assert.equal(
      (await call("consultar_contas_financeiras", [r.w, r.hoje])).find(
        (c) => c.codigo === "banco",
      ).saldo,
      2900,
    );
    await ir(perfil, "/financeiro?aba=conciliacao");
    await page.getByRole("button", { name: "Importar extrato", exact: true }).click();
    await page
      .getByLabel("Arquivo", { exact: true })
      .setInputFiles({
        name: "extrato-qa.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          "data;descricao;valor;id\n" +
            r.hoje +
            ";Recebimento integrado;29,00;UI-FIN-1",
        ),
      });
    await page
      .getByRole("button", { name: "Conferir importação", exact: true })
      .click();
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Importar para conferir", exact: true })
      .click();
    await page.getByRole("button", { name: /Recebimento integrado/ }).click();
    await page.getByRole("checkbox").first().check();
    await layout("conciliar-recebimento-" + perfil);
    await page
      .getByRole("button", { name: "Conciliar selecionados", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await ir(perfil, "/financeiro?titulo=" + titulo);
    await page.getByRole("button", { name: /^QA recebimento integrado/ }).click();
    await page
      .getByRole("button", { name: "Estornar este registro", exact: true })
      .click();
    await page
      .getByLabel("Motivo", { exact: true })
      .fill("Pagamento devolvido pelo banco na conferência");
    await page.getByRole("button", { name: "Confirmar", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await login(ids[perfil]);
    assert.equal(
      (await call("consultar_contas_financeiras", [r.w, r.hoje])).find(
        (c) => c.codigo === "banco",
      ).saldo,
      0,
    );
    await layout("estornar-recebimento-" + perfil);
    await ir(perfil, "/compras");
    await page.getByRole("button", { name: "Registrar compra", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Receber em qual local de estoque?", exact: true })
      .selectOption({ label: "Veículo QA" });
    await page
      .getByRole("combobox", { name: "Fornecedor", exact: true })
      .fill("Fornecedor de testes");
    await page
      .locator("[role=option]")
      .filter({ hasText: "Fornecedor de testes" })
      .click();
    await page.getByLabel("Nota / documento", { exact: true }).fill("NF-UI-INTEGRADA");
    await page.getByRole("combobox", { name: /^(Peça|Material|Produto) do estoque$/ }).fill(exemplosSubsistemas[perfil][2]);
    await page.locator("[role=option]").first().click();
    assert.equal(
      await page.getByLabel("Quantidade", { exact: true }).getAttribute("step"),
      "1",
    );
    await page.getByLabel("Quantidade", { exact: true }).fill("2");
    await page.getByLabel("Custo unitário (R$)", { exact: true }).fill("20");
    await page.getByRole("combobox", { name: "Esta compra", exact: true }).selectOption("prazo");
    await layout("compra-deposito-" + perfil);
    await page.getByRole("button", { name: /Confirmar compra e entrada/ }).click();
    await page
      .getByRole("button", { name: "Registrar pagamento", exact: true })
      .waitFor();
    await login(ids[perfil]);
    const compraEmAberto = (await call("listar_compras_estoque", [r.w, "NF-UI-INTEGRADA"])).itens[0];
    assert.equal(compraEmAberto.total_centavos, 4000);
    assert.equal(compraEmAberto.aberto_centavos, 4000);
    await layout("compra-pagamento-" + perfil);
    await page
      .getByRole("button", { name: "Registrar pagamento", exact: true })
      .click();
    await page.getByLabel("Valor pago (R$)", { exact: true }).fill("10");
    await page
      .getByRole("button", { name: "Confirmar pagamento", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Registrar pagamento", exact: true })
      .waitFor();
    await login(ids[perfil]);
    const comp = (await call("listar_compras_estoque", [r.w, "NF-UI-INTEGRADA"]))
      .itens[0];
    assert.equal(comp.total_centavos, 4000);
    assert.equal(comp.aberto_centavos, 3000);
    assert.equal(
      (await call("consultar_contas_financeiras", [r.w, r.hoje])).find(
        (c) => c.codigo === "banco",
      ).saldo,
      -1000,
    );
    assert.equal(
      (await call("consultar_depositos_estoque", [r.w, r.produto])).itens.find(
        (d) => d.id === contextos[perfil].dep,
      ).saldo,
      2,
    );
    await ir(perfil, "/financeiro?titulo=" + contextos[perfil].tituloCredito);
    await page
      .getByRole("button", { name: /^Compra/ })
      .first()
      .click();
    await page.getByText("Crédito do fornecedor abatido", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    await page
      .getByLabel("Descrição", { exact: true })
      .fill("Compra quitada por crédito conferida");
    await page.getByRole("button", { name: "Salvar lançamento", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await layout("credito-integral-editar-" + perfil);
    console.log("PASS FINANCEIRO UI", perfil);
  }
  if(process.argv.includes('--visual')) for(const tema of ['claro','escuro']) for(const largura of [320,390,768,1440]) {
    await ir('mecanica','/financeiro?titulo='+contextos.mecanica.tituloCredito,largura,tema);
    await page.getByRole('button',{name:/^Compra/}).first().click();await page.getByText('Crédito do fornecedor abatido',{exact:true}).waitFor();
    await layout('credito-'+tema+'-'+largura);await page.screenshot({path:resolve(pasta,'credito-'+tema+'-'+largura+'.png'),fullPage:true});
    await page.getByRole('button',{name:'Editar',exact:true}).click();await layout('editar-credito-'+tema+'-'+largura);
    await ir('mecanica','/compras',largura,tema);await page.getByRole('button',{name:'Registrar compra',exact:true}).click();await layout('comprar-'+tema+'-'+largura);
  }
  assert.deepEqual(errosRpc, []);
  console.log("PASS", resultados.length, "verificações de interface financeira");
} catch (e) {
  console.error(e);
  if (page) {
    await page
      .screenshot({ path: resolve(pasta, "falha.png"), fullPage: true })
      .catch(() => {});
    await writeFile(
      resolve(pasta, "falha.txt"),
      await page
        .locator("body")
        .innerText()
        .catch(() => ""),
    );
  }
  process.exitCode = 1;
} finally {
  await writeFile(
    resolve(pasta, process.argv.includes("--visual") ? "visual.json" : process.argv.includes("--rapido") ? "rapido.json" : "completo.json"),
    JSON.stringify({ resultados, errors, errosRpc }, null, 2),
  );
  await browser?.close();
  if (server) { server.httpServer.closeAllConnections(); await new Promise((r) => server.httpServer.close(r)); }
  await db.close();
}
