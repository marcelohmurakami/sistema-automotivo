import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { build, preview } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright";
import { auditarNumeros } from "../supabase/tests/auditar-numeros-relatorios.mjs";
import { especialidades } from "../src/lib/especialidades.ts";
const pasta = resolve("output/auditoria-numeros-20261102");
const mobileServicos = process.argv.includes('--mobile-servicos');

await mkdir(pasta, { recursive: true });
await auditarNumeros(async ({ db, login, ids, registros }) => {
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
      hasTouch: true,
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
      assert.equal(await page.locator('.estrutura-sistema [role="alert"]').count(), 0);
    }
    async function medir(nome) {
      await aguardar();
      const m = await page.evaluate(() => {
        const root = document.querySelector(".estrutura-sistema");
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
      // Tabelas podem rolar dentro de seu próprio contêiner.
      const vazamentos = await page.evaluate(() =>
        [...document.querySelectorAll("main *")]
          .filter(
            (e) =>
              e.checkVisibility() &&
              e.getBoundingClientRect().right > innerWidth + 1 &&
              !["OPTION", "svg", "path"].includes(e.tagName),
          )
          .filter((e) => {
            let p = e.parentElement;
            while (p && p !== document.body) {
              if (
                /auto|scroll|hidden|clip/.test(getComputedStyle(p).overflowX) &&
                p.getBoundingClientRect().right <= innerWidth + 1
              )
                return false;
              p = p.parentElement;
            }
            return true;
          })
          .map((e) => e.tagName + "." + e.className),
      );
      assert.deepEqual(vazamentos, [], nome);
    }
    const moeda = (n) =>
      (n / 100)
        .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        .replaceAll("\u00a0", " ");
    const conferirTexto = async (loc, valor, regra) => {
      const texto = (await loc.innerText()).replaceAll("\u00a0", " ");
      assert(
        texto.includes(valor),
        regra + ": " + valor + " não encontrado em " + texto.slice(0, 450),
      );
      resultados.push({ nome: regra, valor, correto: true });
    };
    const abrirSecao = async (nome) => {
      const summary = page.locator("summary").filter({ hasText: nome }).first();
      if (
        (await summary.count()) &&
        !(await summary.evaluate((e) => e.parentElement.open))
      )
        await summary.click();
      await aguardar();
    };
    for (const [perfil, r] of Object.entries(registros)) {
      if (mobileServicos && r.proposta) continue;
      const auto = !!r.proposta,
        esp = r.esperado;
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto(
        base +
          "scripts/fixtures/analises.html?perfil=" +
          perfil +
          "&aba=financeiro&extras=1",
      );
      await page
        .getByRole("heading", {
          name: auto ? "Relatórios" : "Relatórios da empresa",
          exact: true,
        })
        .waitFor()
        .catch(async () => {
          await page.locator(auto ? ".rel-pagina" : ".relatorios-servicos").waitFor();
        });
      await aguardar();
      if (auto) {
        await conferirTexto(
          page
            .locator(".gestao-cards")
            .filter({ hasText: "Margem média por OS conferida" }),
          moeda(esp.margem),
          perfil + " margem conferida na tela",
        );
        await abrirSecao("Funcionários: produção");
        const tabela = page
          .locator("details")
          .filter({
            has: page.locator("summary").filter({ hasText: "Funcionários: produção" }),
          });
        await conferirTexto(tabela, "112,50", perfil + " atribuição de 75% exibida");
        await conferirTexto(tabela, "37,50", perfil + " atribuição de 25% exibida");
        await medir(perfil + " equipe 1920");
        await page.setViewportSize({ width: 360, height: 800 });
        await medir(perfil + " equipe 360");
      } else {
        for (const [nome, v] of [
          ["Faturamento", esp.receita],
          ["Custos dos atendimentos", esp.custo],
          ["Margem dos atendimentos", esp.margem],
        ])
          await conferirTexto(
            page.locator(".rs-indicador").filter({ hasText: nome }).first(),
            moeda(v),
            perfil + " " + nome,
          );
        await page.getByRole("button", { name: "Equipe", exact: true }).click();
        await aguardar();
        await conferirTexto(
          page.locator(".rs-ranking"),
          "112,50",
          perfil + " atribuição de 75% exibida",
        );
        await conferirTexto(
          page.locator(".rs-ranking"),
          "37,50",
          perfil + " atribuição de 25% exibida",
        );
        await conferirTexto(
          page
            .locator("table")
            .filter({ hasText: "Produção e custos" })
            .locator("tbody tr")
            .filter({ hasText: "Profissional QA" }),
          "2",
          perfil + " horas da produção exibidas",
        );
        for (const width of [1920, 768, 390, 360]) {
          await page.setViewportSize({ width, height: 844 });
          await medir(perfil + " equipe " + width);
        }
        await page.getByRole("button", { name: "Resultado", exact: true }).click();
        await aguardar();
        await page.setViewportSize({width:390,height:844});
        const ponto=page.locator('.gv-painel svg [role="button"]').last();
        await ponto.tap();
        await page.getByRole('tooltip').waitFor();
        resultados.push({nome:perfil+' gráfico responde ao toque',correto:true});
        const fechar=page.getByRole('button',{name:/Fechar detalhes de/});
        if(await fechar.count())await fechar.click();
      }
      for (const width of [1920, 768, 390, 360]) {
        await page.setViewportSize({ width, height: 844 });
        await medir(perfil + " financeiro " + width);
        if (
          width === 390 &&
          [
            "mecanica",
            "assistencia_celulares",
            "manutencao_climatizacao",
            "limpeza_geral",
          ].includes(perfil)
        )
          { await page.evaluate(()=>window.scrollTo(0,0)); await page.screenshot({
            path: resolve(pasta, perfil + "-financeiro-celular.png"),
          }); }
      }
      await page
        .getByRole(auto ? "tab" : "button", {
          name: auto ? "Estoque e peças" : "Estoque",
          exact: true,
        })
        .click();
      await aguardar();
      await conferirTexto(
        page.locator("main"),
        "180,00",
        perfil + " valor do estoque na tela",
      );
      for (const width of [1920, 768, 390, 360]) {
        await page.setViewportSize({ width, height: 844 });
        await medir(perfil + " estoque " + width);
      }
      await page
        .getByRole(auto ? "tab" : "button", { name: "Análises", exact: true })
        .click();
      await page.getByRole("heading", { name: "Análises para decidir" }).waitFor();
      await aguardar();
      await page.locator(".an-filtros select").selectOption("clientes");
      await aguardar();
      await conferirTexto(
        page.locator(".an-pagina"),
        moeda(esp.receita),
        perfil + " faturamento na análise de clientes",
      );
      await conferirTexto(
        page.locator(".an-pagina"),
        moeda(esp.margem),
        perfil + " margem na análise de clientes",
      );
      for (const width of [1920, 768, 390, 360]) {
        await page.setViewportSize({ width, height: 844 });
        await medir(perfil + " analises " + width);
        if (
          width === 390 &&
          [
            "mecanica",
            "assistencia_celulares",
            "manutencao_climatizacao",
            "limpeza_geral",
          ].includes(perfil)
        )
          await page.screenshot({
            path: resolve(pasta, perfil + "-analise-celular.png"),
          });
      }
      {
        await page.evaluate(() => (document.documentElement.dataset.tema = "claro"));
        await medir(perfil + " analises claro 360");
      }
      console.log("UI", perfil, "OK");
    }
    await writeFile(
      resolve(pasta, mobileServicos ? "interface-servicos.json" : "interface.json"),
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
