import assert from "node:assert/strict";
import { randomUUID as uuid } from "node:crypto";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { build, preview } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright";
import { criarCenarioSubsistemas } from "../supabase/tests/subsistemas-fixture.mjs";
import { especialidades } from "../src/lib/especialidades.ts";
process.env.DB_VALIDATION_RUNTIME ||= resolve(
  "node_modules/@electric-sql/pglite/dist/index.js",
);
process.env.DB_VALIDATION_MIGRATION_LIMIT ||= "20261030000600";
const antes = process.argv.includes("--antes"),
  rapido = process.argv.includes("--rapido"),
  pasta = resolve("output/revisao-os-layout-20261030");
await mkdir(pasta, { recursive: true });
let db, server, browser, page;
const resultados = [],
  errors = [],
  errosRpc = [];
try {
  const { db: b, login, ids, registros } = await criarCenarioSubsistemas();
  db = b;
  const one = async (s, a = []) => Object.values((await db.query(s, a)).rows[0])[0];
  const call = (n, a) =>
    one(
      `select public.${n}(${a.map((_, i) => "$" + (i + 1)).join(",")})`,
      a.map((x) => (x && typeof x === "object" ? JSON.stringify(x) : x)),
    );
  const contextos = {};
  for (const [perfil, r] of Object.entries(registros)) {
    await login(ids[perfil]);
    let doc = r.atendimento;
    if (r.proposta) {
      const os = await call("criar_os_pronta", [
        r.w,
        {
          cliente_id: r.cliente,
          veiculo_id: r.objeto,
          data_servico: "2026-10-30",
          itens: [
            {
              id: uuid(),
              tipo: "service",
              descricao: "Serviço realizado · " + especialidades[perfil].nome,
              unidade: "serv",
              quantidade: 1,
              preco_unitario_centavos: 37500,
              situacao: "done",
            },
          ],
        },
        uuid(),
      ]);
      doc = os.id;
    }
    contextos[perfil] = {
      usuario: ids[perfil],
      oficina: {
        id: r.w,
        nome: "QA · " + especialidades[perfil].nome,
        perfil: "owner",
        ramo: especialidades[perfil].ramo,
        especialidade: perfil,
        codigo_plano: "complete",
      },
      doc,
    };
  }
  let longo = false;
  let fila = Promise.resolve();
  const api = {
    name: "os-local",
    configurePreviewServer(s) {
      s.middlewares.use((req, res, next) => {
        const url = new URL(req.url, "http://localhost");
        if (url.pathname === "/test-context") {
          longo = url.searchParams.has("longo");
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify(
              contextos[url.searchParams.get("perfil")] || contextos.mecanica,
            ),
          );
          return;
        }
        if (!url.pathname.startsWith("/rest/v1/rpc/")) return next();
        res.setHeader("Content-Type", "application/json");
        const fn = url.pathname.split("/").at(-1);
        let text = "";
        req.on("data", (b) => (text += b));
        req.on("end", () => {
          fila = fila.then(async () => {
            try {
              assert.match(fn, /^[a-z_]+$/);
              const a = JSON.parse(text || "{}"),
                perfil = Object.keys(registros).find(
                  (k) => registros[k].w === a.p_oficina,
                );
              assert(perfil, "Fora da bancada: " + fn);
              await login(ids[perfil]);
              const keys = Object.keys(a);
              assert(keys.every((k) => /^p_[a-z_]+$/.test(k)));
              const data = await one(
                `select public.${fn}(${keys.map((k, i) => k + " => $" + (i + 1)).join(",")})`,
                keys.map((k) =>
                  a[k] &&
                  typeof a[k] === "object" &&
                  !["p_ids", "p_habilidades"].includes(k)
                    ? JSON.stringify(a[k])
                    : a[k],
                ),
              );
              if (longo && fn === "consultar_ordem_servico")
                data.dados_cliente.nome =
                  "Transportes São João e Filhos — Atendimento da unidade de manutenção e serviços especializados";
              if (longo && fn === "consultar_detalhes_atendimento")
                data.cliente.nome =
                  "Transportes São João e Filhos — Atendimento da unidade de manutenção e serviços especializados";
              res.end(JSON.stringify(data));
            } catch (e) {
              errosRpc.push({ fn, message: e.message, code: e.code });
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
        "qa-local-sem-acesso-externo",
      ),
    },
    build: {
      target: "esnext",
      outDir: resolve(pasta, "fixture-build"),
      rollupOptions: { input: "scripts/fixtures/detalhes-os.html" },
    },
  };
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
  const pendentes = new Set();
  page.on("request", (r) => {
    if (r.url().includes("/rest/v1/rpc/")) pendentes.add(r);
  });
  for (const evento of ["requestfinished", "requestfailed"])
    page.on(evento, (r) => pendentes.delete(r));
  const aguardar = async () => {
    await page.waitForTimeout(60);
    for (let t = 0; pendentes.size && t < 200; t++) await page.waitForTimeout(50);
    assert.equal(pendentes.size, 0, "RPCs não encerraram");
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
  };
  const ir = async (
    perfil,
    width = 1920,
    height = 1080,
    tema = "escuro",
    extras = false,
    longo = false,
  ) => {
    await page.setViewportSize({ width, height });
    await page.goto(
      base +
        "scripts/fixtures/detalhes-os.html?perfil=" +
        perfil +
        "&tema=" +
        tema +
        (extras ? "&extras=1" : "") +
        (longo ? "&longo=1" : ""),
    );
    await page.locator("dialog[open]").first().waitFor();
    await page
      .getByText("Carregando atendimento…", { exact: true })
      .waitFor({ state: "hidden" });
    await page.evaluate(() => document.fonts.ready);
    await page
      .locator(".os-identificacao-principal,.atendimento-cabecalho")
      .waitFor({ state: "attached" });
  };
  const medir = () =>
    page.evaluate(() => {
      const ds = [...document.querySelectorAll("dialog[open]")];
      const vis = (e) => e.checkVisibility() && e.getBoundingClientRect().width > 0;
      return {
        width: innerWidth,
        height: innerHeight,
        dialogos: ds.map((d) => ({ width: d.clientWidth, scroll: d.scrollWidth })),
        identificacao: document
          .querySelector("dialog[open] .os-identificacao-principal")
          ?.getBoundingClientRect()
          .toJSON(),
        cabecalho: document
          .querySelector("dialog[open] .os-cabecalho-resumo")
          ?.getBoundingClientRect()
          .toJSON(),
        fora: ds.flatMap((d) =>
          [...d.querySelectorAll("*")]
            .filter(vis)
            .filter((e) => !e.closest(".atendimento-abas"))
            .filter((e) => {
              const r = e.getBoundingClientRect(),
                dr = d.getBoundingClientRect();
              return r.width > 0 && (r.left < dr.left - 1 || r.right > dr.right + 1);
            })
            .map((e) => e.tagName + "." + e.className),
        ),
      };
    });
  const conferir = async (nome) => {
    await aguardar();
    const d = await medir();
    resultados.push({ nome, ...d });
    assert(
      d.dialogos.every((x) => x.scroll <= x.width + 1),
      nome + ": rolagem horizontal " + JSON.stringify(d),
    );
    assert.deepEqual(d.fora, [], nome + ": elementos fora da janela");
    if (d.identificacao) {
      assert(
        d.identificacao.width >= Math.min(180, d.dialogos[0].width - 50),
        nome + ": identificação espremida",
      );
      assert(d.cabecalho.height < 450, nome + ": cabeçalho excessivamente alto");
    }
    assert.deepEqual(errors, [], nome + ": erro React");
  };
  await ir("retifica");
  await page.screenshot({
    path: resolve(pasta, antes ? "antes-1920.png" : "depois-1920.png"),
    fullPage: true,
  });
  if (antes) {
    const d = await medir();
    await writeFile(resolve(pasta, "antes.json"), JSON.stringify(d, null, 2));
    assert(
      d.identificacao.width < 150 || d.dialogos.some((x) => x.scroll > x.width),
      "Falha original não reproduzida",
    );
    console.log(
      "REPRODUZIDO cabeçalho",
      d.identificacao.width,
      "px; largura da janela",
      d.dialogos[0],
    );
  } else {
    await conferir("retifica-1920-resumo");
    const perfis = rapido
      ? [
          "retifica",
          "assistencia_celulares",
          "manutencao_climatizacao",
          "limpeza_residencial",
        ]
      : Object.keys(registros);
    for (const perfil of perfis)
      for (const width of [1920, 390]) {
        await ir(perfil, width, width === 1920 ? 1080 : 844);
        await conferir(perfil + "-" + width + "-resumo");
        if (registros[perfil].proposta) {
          await page.getByText("Mais ações da OS", { exact: true }).click();
          await conferir(perfil + "-" + width + "-acoes");
          await page
            .getByRole("button", { name: "Registros do aparelho", exact: true })
            .click();
          await page
            .getByRole("dialog", { name: "Execuções registradas no aparelho" })
            .waitFor();
          await conferir(perfil + "-" + width + "-registros");
          await page
            .getByRole("dialog", { name: "Execuções registradas no aparelho" })
            .getByRole("button", { name: "Fechar janela", exact: true })
            .click();
          await page.getByText("Mais ações da OS", { exact: true }).click();
          for (const tab of ["Serviços", "Fotos"]) {
            await page
              .getByRole("navigation", { name: "Seções da ordem de serviço" })
              .getByRole("button", { name: tab, exact: true })
              .click();
            await conferir(perfil + "-" + width + "-" + tab);
          }
          for (const tab of [
            "detalhes",
            "pagamento",
            "comissoes",
            "documentos",
            "historico",
            "produtividade",
            "etapas",
          ]) {
            await page
              .getByLabel("Mais seções da OS", { exact: true })
              .selectOption(tab);
            await page.waitForTimeout(80);
            await conferir(perfil + "-" + width + "-" + tab);
          }
        } else {
          for (const tab of await page.locator(".atendimento-abas button").all()) {
            const nome = await tab.innerText();
            await tab.click();
            await page.waitForTimeout(80);
            await conferir(perfil + "-" + width + "-" + nome);
          }
        }
        if (registros[perfil].proposta) {
          await page
            .getByRole("navigation", { name: "Seções da ordem de serviço" })
            .getByRole("button", { name: "Resumo", exact: true })
            .click();
          await page.getByRole("button", { name: "Editar OS", exact: true }).click();
          await page.locator("dialog[open] form").first().waitFor();
          await conferir(perfil + "-" + width + "-editor");
          for (const summary of await page
            .locator("dialog[open] form details > summary")
            .all()) {
            if (
              (await summary.isVisible()) &&
              (await summary.locator("..").getAttribute("open")) === null
            )
              await summary.click();
          }
          await conferir(perfil + "-" + width + "-opcionais");
        }
        console.log("PASS abas", perfil, width);
      }
    for (const perfil of [
      "retifica",
      "assistencia_celulares",
      "manutencao_climatizacao",
      "limpeza_residencial",
    ])
      for (const tema of ["claro", "escuro"])
        for (const width of [320, 768, 1366, 1920]) {
          await ir(perfil, width, width === 1920 ? 1080 : 900, tema, true);
          await conferir(perfil + "-" + tema + "-" + width + "-css-todos");
          if (width === 1920 || width === 320)
            await page.screenshot({
              path: resolve(pasta, perfil + "-" + tema + "-" + width + ".png"),
              fullPage: true,
            });
        }
    for (const perfil of ["retifica", "assistencia_celulares"])
      for (const width of [320, 390, 768, 1366, 1920]) {
        await ir(perfil, width, 1080, "escuro", true, true);
        await conferir(perfil + "-" + width + "-nome-longo");
      }
    assert.deepEqual(errosRpc, []);
    console.log("PASS", resultados.length, "verificações integradas de detalhes");
  }
} catch (e) {
  console.error(e.stack);
  process.exitCode = 1;
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
} finally {
  await writeFile(
    resolve(
      pasta,
      antes ? "reproducao.json" : rapido ? "rapido.json" : "resultado.json",
    ),
    JSON.stringify({ ok: !process.exitCode, resultados, errors, errosRpc }, null, 2),
  );
  await browser?.close();
  if (server) {
    server.httpServer.closeAllConnections();
    await new Promise((r) => server.httpServer.close(r));
  }
  await db?.close();
}
