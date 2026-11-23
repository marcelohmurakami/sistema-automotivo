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
const pasta=resolve(process.env.QA_OUTPUT || "output/logistica-estoque-20261029/novos-fluxos");
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
  contextos[perfil] = {
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
                [
                  "reservar_estoque_atendimento",
                  "reservar_estoque_deposito",
                  "transferir_estoque",
                ].includes(fn) && k === "p_unidades"
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
    outDir: "output/logistica-estoque-20261029/fixture-build",
    rollupOptions: { input: "scripts/fixtures/suprimentos.html" },
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
  const ir = async (perfil, tela = "", largura = 1440, tema = "escuro") => {
    await page.setViewportSize({ width: largura, height: 960 });
    await page.goto(
      `${base}scripts/fixtures/suprimentos.html?perfil=${perfil}&tela=${tela}&tema=${tema}`,
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
  for (const perfil of Object.keys(registros)) {
    if (process.argv.includes("--rapido") && perfil !== "mecanica") continue;
    const r = registros[perfil],
      nome = exemplosSubsistemas[perfil][2];
    await login(ids[perfil]);
    const etiqueta = await call("preparar_etiqueta_estoque", [r.w, r.produto]);
    await ir(perfil, "depositos", 390);
    await page.getByRole("button", { name: "+ Novo local", exact: true }).click();
    await page.getByLabel("Nome do local", { exact: true }).fill("Veículo QA");
    await page.getByRole("combobox", { name: /^Tipo/ }).selectOption("veiculo");
    await page.getByLabel("Identificação (opcional)").fill("Equipe externa");
    await page.getByRole("button", { name: "Salvar local", exact: true }).click();
    await page.getByRole("button", { name: /Veículo QA.*Ver saldo/ }).waitFor();
    await page
      .getByRole("button", { name: "Transferir produtos", exact: true })
      .click();
    await page.getByRole("combobox", { name: "Adicionar produto" }).fill(nome);
    await page.locator("[role=option]").first().click();
    await page
      .getByRole("combobox", { name: /^Destino/ })
      .selectOption({ label: "Veículo QA" });
    await page.getByLabel("Quantidade a transferir").fill("3");
    await page.getByLabel("Motivo", { exact: true }).fill("Abastecer equipe externa");
    await layout("transferencia-" + perfil);
    await page
      .getByRole("button", { name: "Confirmar transferência", exact: true })
      .click();
    await page.getByRole("button", { name: /Veículo QA.*Ver saldo/ }).click();
    await page.getByText("3 un livres", { exact: true }).waitFor();
    await layout("saldo-veiculo-" + perfil);
    await ir(perfil, "");
    await page.getByLabel("Mais opções de compras").selectOption("devolucoes");
    await page.getByRole("button", { name: "+ Nova devolução", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Fornecedor", exact: true })
      .fill("Fornecedor de testes");
    await page
      .getByRole("option", { name: "Fornecedor de testes", exact: true })
      .click();
    await page.getByRole("button", { name: "Ler código", exact: true }).click();
    if (perfil === "mecanica")
      await page
        .getByLabel("Ler foto")
        .setInputFiles(
          resolve("output/logistica-estoque-20261029/etiquetas/termica.png"),
        );
    else {
      await page.getByRole("textbox").last().fill(etiqueta.codigo);
      await page.getByRole("button", { name: "Localizar", exact: true }).click();
    }
    await page
      .getByRole("combobox", { name: /^Local de estoque/ })
      .selectOption({ label: "Veículo QA · 3 livres" });
    await page.getByLabel("Quantidade a devolver").fill("1");
    await page
      .getByLabel("Motivo da devolução", { exact: true })
      .fill("Defeito constatado no teste");
    await layout("devolucao-" + perfil);
    await page
      .getByRole("button", { name: "Confirmar devolução", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Acompanhamento da devolução", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Registrar envio / análise", exact: true })
      .click();
    await page.getByRole("combobox", { name: /^Situação/ }).selectOption("analise");
    await page.getByLabel("Protocolo (opcional)").fill("RMA-UI");
    await page.getByRole("button", { name: "Confirmar registro", exact: true }).click();
    await page.getByText(/Em análise · RMA-UI/).waitFor();
    await page.getByRole("button", { name: "Registrar crédito", exact: true }).click();
    await page.getByLabel("Valor total concedido (R$)").fill("20");
    await page
      .getByLabel("Justificativa / confirmação do fornecedor")
      .fill("Crédito confirmado pelo fornecedor de testes");
    await page.getByRole("button", { name: "Confirmar registro", exact: true }).click();
    await page
      .getByRole("button", { name: "Usar crédito em uma conta", exact: true })
      .waitFor();
    await layout("credito-disponivel-" + perfil);
    // A compra de destino é fictícia e não cria pagamento bancário.
    await login(ids[perfil]);
    const f = (await call("listar_fornecedores", [r.w, "Fornecedor de testes"]))
      .itens[0];
    await call("registrar_compra_estoque", [
      r.w,
      uuid(),
      f.id,
      r.hoje,
      r.hoje,
      "NF-UI-CREDITO",
      "Teste de crédito",
      [{ produto_id: r.produto, quantidade: 2, custo_centavos: 2000 }],
      0,
      "banco",
      "outro",
    ]);
    await page.getByRole("button", { name: "Fechar janela", exact: true }).click();
    await page.getByRole("button", { name: new RegExp(nome + ".*RMA-UI") }).click();
    await page
      .getByRole("button", { name: "Usar crédito em uma conta", exact: true })
      .click();
    await page.getByLabel("Conta de compra").selectOption({ index: 1 });
    await page.getByLabel("Valor a abater (R$)").fill("20");
    await page
      .getByLabel("Justificativa / confirmação do fornecedor")
      .fill("Abatimento na compra de testes");
    await page.getByRole("button", { name: "Confirmar registro", exact: true }).click();
    await page
      .getByRole("button", { name: "Usar crédito em uma conta", exact: true })
      .waitFor({ state: "hidden" });
    await page.getByText("Histórico e créditos utilizados", { exact: true }).click();
    await page.getByRole("button", { name: "Desfazer uso", exact: true }).click();
    await page
      .getByLabel("Motivo", { exact: true })
      .fill("Conferência de estorno do crédito");
    await page.getByRole("button", { name: "Confirmar estorno", exact: true }).click();
    await page
      .getByRole("button", { name: "Usar crédito em uma conta", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Encerrar acompanhamento", exact: true })
      .click();
    await page
      .getByLabel("Justificativa / confirmação do fornecedor")
      .fill("Concluído com crédito disponível");
    await page.getByRole("button", { name: "Confirmar registro", exact: true }).click();
    await page.getByRole("button", { name: "Fechar janela", exact: true }).click();
    await page.getByLabel("Mais opções de compras").selectOption("catalogos");
    await page
      .getByRole("button", { name: "Importar catálogo CSV", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Fornecedor", exact: true })
      .fill("Fornecedor de testes");
    await page
      .getByRole("option", { name: "Fornecedor de testes", exact: true })
      .click();
    await page
      .getByLabel("Arquivo CSV · até 500 linhas")
      .setInputFiles({
        name: "catalogo-ui.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          "codigo;descricao;preco;unidade;aplicacao;disponibilidade;prazo_dias\nUI-001;" +
            nome +
            " catálogo;35,50;un;Aplicação " +
            perfil +
            ";disponivel;3",
        ),
      });
    await page.getByRole("heading", { name: "1 produtos conferidos" }).waitFor();
    await layout("importar-catalogo-" + perfil);
    await page
      .getByRole("button", { name: "Confirmar importação", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Vincular ao estoque", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Adicionar produto", exact: true })
      .fill(nome);
    await page.locator("[role=option]").first().click();
    await page.getByRole("button", { name: "Criar pedido", exact: true }).click();
    await page.getByLabel("Quantidade", { exact: true }).fill("2");
    await page.getByRole("button", { name: "Confirmar pedido", exact: true }).click();
    await page.getByRole("button", { name: "Receber entrega", exact: true }).waitFor();
    await layout("pedido-catalogo-" + perfil);
    await page.getByRole("button", { name: "Receber entrega", exact: true }).click();
    await page.getByRole("button", { name: "Confirmar registro", exact: true }).click();
    await page.getByRole("dialog").getByText("0 pendentes", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Fechar janela", exact: true }).click();
    await layout("catalogo-" + perfil);
    if (perfil === "mecanica") {
      await page.screenshot({
        path: resolve(pasta, "catalogos-desktop.png"),
        fullPage: true,
      });
      await ir(perfil, "etiquetas", 390);
      await page.getByRole("button", { name: "Etiquetas", exact: true }).click();
      await layout("etiquetas-mobile");
      const download = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Baixar PDF para imprimir", exact: true })
        .click();
      await (await download).saveAs(resolve(pasta, "etiquetas-ui.pdf"));
    }
    console.log("PASS NOVOS UI", perfil);
  }
  for (const tema of ["claro", "escuro"])
    for (const largura of [320, 390, 768, 1440]) {
      for (const tela of ["depositos", ""]) {
        await ir("mecanica", tela, largura, tema);
        if (!tela) {
          for (const aba of ["Devoluções e créditos", "Catálogos dos fornecedores"]) {
            await page.getByLabel("Mais opções de compras").selectOption({ label: aba });
            await page
              .getByText(
                aba === "Devoluções e créditos"
                  ? "Nenhuma devolução nesta seleção. Devoluções registradas em pedidos aparecem aqui automaticamente."
                  : "Preço e disponibilidade são os informados no arquivo, sem consulta em tempo real. Confirme-os com o fornecedor.",
              )
              .waitFor();
            await layout(`responsivo-${aba}-${tema}-${largura}`);
            if (largura === 390 || largura === 1440)
              await page.screenshot({
                path: resolve(
                  pasta,
                  `${aba === "Devoluções e créditos" ? "devolucoes" : "catalogos"}-${tema}-${largura}.png`,
                ),
                fullPage: true,
              });
          }
        } else {
          await page.getByRole("button", { name: /Veículo QA.*Ver saldo/ }).waitFor();
          await layout(`responsivo-depositos-${tema}-${largura}`);
          if (largura === 390 || largura === 1440)
            await page.screenshot({
              path: resolve(pasta, `depositos-${tema}-${largura}.png`),
              fullPage: true,
            });
        }
      }
    }
  assert.deepEqual(errosRpc, []);
  console.log("PASS", resultados.length, "verificações novas de interface");
} catch (e) {
  console.error(e);
  if (page) {
    await page
      .screenshot({ path: resolve(pasta, "falha-ui.png"), fullPage: true })
      .catch(() => {});
    await writeFile(
      resolve(pasta, "falha-ui.txt"),
      await page
        .locator("body")
        .innerText()
        .catch(() => ""),
    );
  }
  process.exitCode = 1;
} finally {
  await writeFile(
    resolve(
      pasta,
      process.argv.includes("--rapido") ? "interface-rapido.json" : "interface.json",
    ),
    JSON.stringify({ resultados, errors, errosRpc }, null, 2),
  );
  await browser?.close();
  if (server) await new Promise((r) => server.httpServer.close(r));
  await db.close();
}
