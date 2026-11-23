import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { build, preview } from './lib/vite-conferencia.mjs';
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from './lib/chrome-conferencia.mjs';
import { validarAnalises } from "../supabase/tests/validate-analises-gerenciais.mjs";
import { especialidades } from "../src/lib/especialidades.ts";
const pasta=resolve(process.env.QA_OUTPUT || "output/relatorios-avancados-20261102");
const formularios = process.argv.includes("--formularios");
await mkdir(pasta, { recursive: true });
await validarAnalises(async ({ db, login, ids, registros }) => {
  let server, browser, page;
  const erros = [],
    resultados = [];
  try {
    let fila = Promise.resolve();
    const api = {
      name: "analises-local",
      configurePreviewServer(s) {
        s.middlewares.use((req, res, next) => {
          const url = new URL(req.url, "http://localhost");
          if (url.pathname === "/test-context") {
            const perfil = url.searchParams.get("perfil"),
              r = registros[perfil];
            assert(r);
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                usuario: ids[perfil],
                oficina: {
                  id: r.w,
                  nome: "QA · " + especialidades[perfil].nome,
                  perfil: "owner",
                  ramo: especialidades[perfil].ramo,
                  especialidade: perfil,
                  codigo_plano: "complete",
                  recursos: ["reports", "finance", "employee_reports"],
                },
              }),
            );
            return;
          }
          if (!url.pathname.startsWith("/rest/v1/rpc/")) return next();
          res.setHeader("Content-Type", "application/json");
          const fn = url.pathname.split("/").at(-1);
          let body = "";
          req.on("data", (b) => (body += b));
          req.on("end", () => {
            fila = fila.then(async () => {
              try {
                assert.match(fn, /^[a-z_]+$/);
                const a = JSON.parse(body || "{}"),
                  perfil = Object.keys(registros).find(
                    (k) => registros[k].w === a.p_oficina,
                  );
                assert(perfil, "Fora da bancada " + fn);
                await login(ids[perfil]);
                const keys = Object.keys(a);
                assert(keys.every((k) => /^p_[a-z_]+$/.test(k)));
                const data = Object.values(
                  (
                    await db.query(
                      `select public.${fn}(${keys.map((k, i) => k + " => $" + (i + 1)).join(",")})`,
                      keys.map((k) =>
                        a[k] && typeof a[k] === "object" ? JSON.stringify(a[k]) : a[k],
                      ),
                    )
                  ).rows[0],
                )[0];
                res.end(JSON.stringify(data));
              } catch (e) {
                erros.push({ fn, message: e.message, code: e.code });
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
        rollupOptions: { input: "scripts/fixtures/analises.html" },
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
      acceptDownloads: true,
    });
    await ctx.route("**/*", (r) =>
      new URL(r.request().url()).origin === new URL(base).origin
        ? r.continue()
        : r.abort(),
    );
    page = await ctx.newPage();
    page.on("pageerror", (e) => erros.push({ react: e.message }));
    const pendentes = new Set();
    page.on("request", (r) => {
      if (r.url().includes("/rest/v1/rpc/")) pendentes.add(r);
    });
    for (const e of ["requestfailed", "requestfinished"])
      page.on(e, (r) => pendentes.delete(r));
    async function aguardar() {
      await page.waitForTimeout(120);
      for (let i = 0; pendentes.size && i < 200; i++) await page.waitForTimeout(50);
      assert.equal(pendentes.size, 0);
      await page.evaluate(() => document.fonts.ready);
      assert.deepEqual(erros, []);
      assert.equal(await page.locator('.an-pagina [role="alert"]').count(), 0);
    }
    async function medir(nome) {
      await aguardar();
      const m = await page.evaluate(() => {
        const root = document.querySelector(".an-pagina");
        return {
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
          root: root.clientWidth,
          overflow: [...root.querySelectorAll("*")]
            .filter(
              (e) =>
                e.checkVisibility() && !["OPTION", "svg", "path"].includes(e.tagName),
            )
            .filter((e) => {
              const b = e.getBoundingClientRect();
              return b.width > 0 && (b.right > innerWidth + 1 || b.left < -1);
            })
            .map((e) => e.tagName + "." + e.className),
        };
      });
      resultados.push({ nome, ...m });
      assert(m.scroll <= m.width + 1, nome + " overflow " + JSON.stringify(m));
      assert.deepEqual(m.overflow, [], nome);
    }
    const temas = [
      "clientes",
      "dados",
      "tempos",
      "recursos",
      "contratos",
      "primeira_visita",
      "equipamentos",
      "comparacao",
      "filiais",
    ];
    async function ir(perfil, width, tema = "escuro", extras = false) {
      await page.setViewportSize({ width, height: 1080 });
      await page.goto(
        base +
          "scripts/fixtures/analises.html?perfil=" +
          perfil +
          "&tema=" +
          tema +
          (extras ? "&extras=1" : ""),
      );
      await page.getByRole("heading", { name: "Análises para decidir" }).waitFor();
      await aguardar();
      await page.getByRole("combobox", { name: "Período dos relatórios", exact: true }).selectOption("personalizado");
      const datas = page.locator("input[type=date]");
      await datas.nth(0).fill("2026-09-01");
      await datas.nth(1).fill("2026-11-02");
      if (await page.getByRole("button", { name: "Aplicar período", exact: true }).count())
        await page.getByRole("button", { name: "Aplicar período", exact: true }).click();
      await aguardar();
    }
    async function escolher(tipo) {
      await page.locator(".an-filtros select").selectOption(tipo);
      await aguardar();
    }
    async function opcao(rotulo, nome) {
      const input = page.getByRole("combobox", { name: rotulo, exact: true });
      await input.fill(nome);
      await page.waitForTimeout(450);
      await aguardar();
      await page.locator('.selecao-rapida-opcoes').getByRole("option").filter({ hasText: nome }).first().click();
      await aguardar();
    }
    if (!formularios) {
      for (const perfil of Object.keys(registros)) {
        await ir(perfil, 1920);
        for (const tipo of temas) {
          await escolher(tipo);
          await medir(perfil + " " + tipo + " 1920");
          assert(
            (await page.locator(".an-linha").count()) > 0,
            perfil + " " + tipo + " sem dados",
          );
          await page.setViewportSize({ width: 390, height: 844 });
          await medir(perfil + " " + tipo + " 390");
          await page.setViewportSize({ width: 1920, height: 1080 });
        }
        // Correção, gravação repetida e retirada via formulário real.
        await escolher("comparacao");
        await page
          .getByRole("button", { name: "Editar comparação", exact: true })
          .first()
          .click();
        await aguardar();
        await page.locator("input[name=reparo]").fill("250");
        await page
          .getByRole("button", { name: "Salvar informações", exact: true })
          .click();
        await aguardar();
        await page
          .getByText("Informações salvas. A análise foi atualizada.", { exact: true })
          .waitFor();
        await page.locator("input[name=reparo]").fill("260");
        await page
          .getByRole("button", { name: "Salvar informações", exact: true })
          .click();
        await aguardar();
        await page
          .getByText("Retirar este vínculo da análise", { exact: true })
          .click();
        await page.getByLabel("Motivo da correção").fill("Premissa de teste retirada");
        await page
          .getByRole("button", { name: "Retirar vínculo", exact: true })
          .click();
        await aguardar();
        assert(
          (await page.getByText("Informe as premissas", { exact: true }).count()) > 0,
        );
        await page
          .getByRole("button", { name: "Salvar informações", exact: true })
          .click();
        await aguardar();
        await medir(perfil + " comparação editar retirar reativar");
        const download = page.waitForEvent("download");
        await page.getByRole("button", { name: "Baixar página" }).click();
        const arquivo = await download;
        assert.match(arquivo.suggestedFilename(), /^analise-comparacao-/);
        resultados.push({ nome: perfil + " exportação CSV" });
        console.log("UI PASS", perfil);
      }
      for (const perfil of [
        "mecanica",
        "assistencia_celulares",
        "manutencao_climatizacao",
        "limpeza_geral",
      ])
        for (const width of [320, 768, 1366, 1920])
          for (const tema of ["claro", "escuro"]) {
            await ir(perfil, width, tema, true);
            for (const tipo of ["clientes", "tempos", "recursos", "comparacao"]) {
              await escolher(tipo);
              await medir(`${perfil} ${tipo} ${width} ${tema} todos CSS`);
            }
            console.log("LAYOUT PASS", perfil, width, tema);
            if (width === 1920 || width === 320)
              await page.screenshot({
                path: resolve(pasta, `${perfil}-${width}-${tema}.png`),
                fullPage: true,
              });
          }
      await ir("mecanica", 1920);
      await escolher("recursos");
      await page
        .getByText("Complementar os dados desta análise", { exact: true })
        .click();
      await opcao("Box ou equipamento", "Box analítico QA");
      await medir("Formulário disponibilidade desktop");
      await page.setViewportSize({ width: 320, height: 844 });
      await medir("Formulário disponibilidade 320");
      await page.screenshot({
        path: resolve(pasta, "disponibilidade-320.png"),
        fullPage: true,
      });
      await page.getByRole("button", { name: "Adicionar turno" }).click();
      await page
        .getByRole("button", { name: "Salvar informações", exact: true })
        .click();
      await aguardar();
    } else {
      for (const perfil of Object.keys(registros)) {
        await ir(perfil, perfil.startsWith("limpeza") ? 390 : 1366);
        await escolher("contratos");
        await page
          .getByText("Complementar os dados desta análise", { exact: true })
          .click();
        await opcao("Ordem de serviço", "OS");
        await opcao("Contrato preventivo", "Contrato de análise QA");
        await page
          .getByRole("button", { name: "Salvar informações", exact: true })
          .click();
        await aguardar();
        await page
          .getByText("Retirar este vínculo da análise", { exact: true })
          .click();
        await page
          .getByLabel("Motivo da correção")
          .fill("Corrigir contrato na bancada");
        await page
          .getByRole("button", { name: "Retirar vínculo", exact: true })
          .click();
        await aguardar();
        assert(
          (await page.getByText("Sem OS vinculadas", { exact: true }).count()) > 0,
        );
        await page
          .getByRole("button", { name: "Salvar informações", exact: true })
          .click();
        await aguardar();
        await medir(perfil + " contrato vincular retirar reativar");
        await escolher("primeira_visita");
        await page
          .getByText("Complementar os dados desta análise", { exact: true })
          .click();
        await opcao("OS de origem", "OS");
        const descricao = "Falha UI " + perfil;
        await page.locator("input[name=descricao]").fill(descricao);
        await page
          .getByRole("button", { name: "Salvar informações", exact: true })
          .click();
        await aguardar();
        await page
          .getByRole("combobox", { name: /O que deseja registrar/ })
          .selectOption("visita");
        await aguardar();
        await opcao("Visita encerrada", "07/09/2026");
        await opcao("Problema acompanhado", descricao);
        await page
          .getByRole("combobox", { name: /^Resultado/ })
          .selectOption("resolvido");
        await page
          .locator("textarea[name=evidencia]")
          .fill("Funcionamento conferido no atendimento fictício.");
        await page
          .getByRole("button", { name: "Salvar informações", exact: true })
          .click();
        await aguardar();
        await page.getByLabel("Buscar resultado", { exact: true }).fill(descricao);
        await page.getByRole("button", { name: "Buscar", exact: true }).click();
        await aguardar();
        assert.equal(await page.locator(".an-linha").count(), 1);
        assert(
          (await page
            .getByText("Resolvido na primeira visita", { exact: true })
            .count()) > 0,
        );
        await page
          .getByRole("combobox", { name: /^Resultado/ })
          .selectOption("pendente");
        await page
          .getByRole("button", { name: "Salvar informações", exact: true })
          .click();
        await aguardar();
        assert(
          (await page
            .getByText("Exigiu continuidade/retorno", { exact: true })
            .count()) > 0,
        );
        await medir(perfil + " problema visita resultado corrigido");
        console.log("FORM PASS", perfil);
      }
      await ir("assistencia_celulares", 1920);
      for (const tipo of temas) {
        await escolher(tipo);
        await page.screenshot({
          path: resolve(pasta, "analise-" + tipo + ".png"),
          fullPage: true,
        });
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await escolher("clientes");
      await page.screenshot({
        path: resolve(pasta, "analise-clientes-390.png"),
        fullPage: true,
      });
    }
    await writeFile(
      resolve(pasta, formularios ? "formularios.json" : "interface.json"),
      JSON.stringify({ ok: true, resultados, erros }, null, 2),
    );
    console.log("UI OK", resultados.length);
  } catch (e) {
    if (page)
      await page
        .screenshot({ path: resolve(pasta, "falha-interface.png"), fullPage: true })
        .catch(() => {});
    await writeFile(
      resolve(pasta, "interface-falha.json"),
      JSON.stringify({ ok: false, erro: e.message, erros, resultados }, null, 2),
    );
    throw e;
  } finally {
    await browser?.close();
    await server?.httpServer?.close();
  }
});
process.exit(process.exitCode || 0);
