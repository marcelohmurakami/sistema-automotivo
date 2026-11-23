import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { preview } from "vite";
import { chromium } from "playwright";
const root = resolve("output/os-velocidade-20261116"),
  out = resolve(process.env.QA_OUTPUT || resolve(root, "interface"));
await mkdir(out, { recursive: true });
const server = await preview({
    configFile: false,
    build: { outDir: resolve(process.env.QA_FIXTURE_BUILD || resolve(root, "depois-controlado/build")) },
    preview: { host: "127.0.0.1", port: 0 },
  }),
  browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  }),
  resultados = [],
  erros = [];
let p;
const ok = (nome, extras = {}) => resultados.push({ nome, ...extras, ok: true });
try {
  for (const tema of ["escuro", "claro"])
    for (const largura of [320, 390, 768, 1366, 1920]) {
      const ctx = await browser.newContext({
        viewport: { width: largura, height: 900 },
        locale: "pt-BR",
      });
      p = await ctx.newPage();
      p.setDefaultTimeout(20000);
      p.on("pageerror", (e) => erros.push(e.message));
      const btn = (name) => p.getByRole("button", { name, exact: true }),
        base =
          server.resolvedUrls.local[0] +
          "scripts/fixtures/os-velocidade.html?n=12&tema=" +
          tema;
      try {
        await p.goto(base);
        await p.getByRole("button", { name: /^Editar OS #/ }).waitFor();
        const n = await p.evaluate(() => window.qa.numero);
        await p
          .getByLabel("Buscar ordens de serviço", { exact: true })
          .fill("inexistente");
        await p.getByText("Nenhuma OS encontrada", { exact: true }).waitFor();
        await btn("Limpar busca de ordens de serviço").click();
        await btn("Editar OS #" + n).waitFor();
        ok("Limpar busca em um clique", { tema, largura });
        await p
          .getByRole("button", { name: new RegExp("^Abrir OS #" + n + " de ") })
          .click();
        await btn("Editar OS").waitFor();
        const acima = await btn("Editar OS").evaluate(
          (b) =>
            b.getBoundingClientRect().bottom <=
            document.querySelector(".os-resumo-limpo").getBoundingClientRect().top,
        );
        assert(acima);
        assert.equal(await btn("Editar OS").count(), 1);
        await p.screenshot({ path: resolve(out, `consulta-${tema}-${largura}.png`) });
        ok("Editar antes da lista de serviços, sem botão duplicado", { tema, largura });
        await btn("Editar OS").click();
        await btn("Salvar alterações da OS").waitFor();
        await p.getByLabel("Quantidade de QA serviço 1", { exact: true }).fill("2");
        await p.getByLabel("Desconto (%)", { exact: true }).fill("10");
        await p.locator('textarea[name="resumo_cliente"]').fill("Conferência QA");
        await p.getByLabel("Data do serviço", { exact: true }).fill("2026-11-15");
        await btn("Editar QA serviço 1: OS").click();
        await p.getByLabel("Preço unitário (R$)", { exact: true }).fill("125");
        await p.locator("summary").filter({ hasText: "Custos e margem" }).click();
        await p.getByLabel("Custo direto por unidade (R$)", { exact: true }).fill("40");
        await btn("Salvar item").click();
        await btn("Remover QA serviço 2: OS").click();
        await btn("Desfazer").click();
        assert.equal(await p.locator(".os-editor-item").count(), 12);
        ok("Quantidade, preço, desconto, custo e desfazer", { tema, largura });
        await p
          .locator("summary")
          .filter({ hasText: "Informações adicionais do atendimento" })
          .click();
        await p
          .locator("summary")
          .filter({ hasText: "Entrada, diagnóstico e garantia" })
          .click();
        await p
          .getByLabel("Diagnóstico técnico (opcional)", { exact: true })
          .fill("Diagnóstico QA");
        await p
          .getByLabel("Observações internas (opcional)", { exact: true })
          .fill("Uso interno");
        await p
          .locator("summary")
          .filter({ hasText: "Entrada, diagnóstico e garantia" })
          .click();
        ok("Informações opcionais preenchidas e recolhidas", { tema, largura });
        const d = p.locator("dialog[open]");
        assert(await d.evaluate((e) => e.scrollWidth <= e.clientWidth + 1));
        assert(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        );
        await p.screenshot({ path: resolve(out, `edicao-${tema}-${largura}.png`) });
        ok("Edição sem rolagem horizontal", { tema, largura });
        if (tema === "escuro" && largura === 390) {
          await p.evaluate(() => {
            window.qa.falhar = true;
          });
          await btn("Salvar alterações da OS").click();
          await p.locator("dialog[open] [role=alert]").waitFor();
          assert.equal(
            await p.locator('textarea[name="resumo_cliente"]').inputValue(),
            "Conferência QA",
          );
          assert.equal(
            await p.evaluate(
              () => JSON.parse(localStorage.getItem("patio_os_v1"))[0].total_centavos,
            ),
            120000,
          );
          await p.evaluate(() => {
            window.qa.falhar = false;
          });
          ok("Falha de gravação mantém valores digitados e dados anteriores");
        }
        await btn("Salvar alterações da OS").dblclick();
        await p.locator("dialog[open] .os-resumo-limpo").waitFor();
        await btn("Editar OS").waitFor();
        const reg = await p.evaluate(() => ({
          os: JSON.parse(localStorage.getItem("patio_os_v1"))[0],
          gravacoes: window.qa.gravacoes,
        }));
        assert.equal(reg.os.total_centavos, 121500);
        assert.equal(reg.os.itens.length, 12);
        assert.equal(reg.os.itens[0].custo_unitario_previsto_centavos, 4000);
        assert.equal(reg.os.diagnostico, "Diagnóstico QA");
        assert.equal(reg.os.observacoes_internas, "Uso interno");
        assert.equal(reg.os.data_servico, "2026-11-15");
        assert.equal(reg.gravacoes, 1);
        ok("Duplo clique salva uma vez, com custos e opcionais corretos", {
          tema,
          largura,
        });
        assert(
          await p
            .locator("dialog[open]")
            .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
        );
        ok("Consulta sem rolagem horizontal", { tema, largura });
        if (tema === "claro" && largura === 1920) {
          await btn("Editar OS").click();
          await p
            .locator('textarea[name="resumo_cliente"]')
            .fill("Alteração ainda não salva");
          await p.evaluate(() => {
            const o = JSON.parse(localStorage.getItem("patio_os_v1"))[0];
            localStorage.setItem(
              "patio_os_v1",
              JSON.stringify([
                {
                  ...o,
                  revisao: o.revisao + 1,
                  resumo_cliente: "Alteração em outro aparelho",
                },
              ]),
            );
          });
          await btn("Salvar alterações da OS").click();
          await p
            .locator("dialog[open]")
            .getByText("OS alterada. Reabra antes de salvar.", { exact: true })
            .waitFor();
          assert.equal(
            await p.locator('textarea[name="resumo_cliente"]').inputValue(),
            "Alteração ainda não salva",
          );
          await p
            .getByRole("dialog", { name: "Editar OS #" + n, exact: true })
            .getByRole("button", { name: "Fechar janela", exact: true })
            .click();
          await btn("Editar OS").click();
          assert.equal(
            await p.locator('textarea[name="resumo_cliente"]').inputValue(),
            "Alteração em outro aparelho",
          );
          ok("Conflito preserva digitação e reabertura traz revisão atual");
        }
        if (largura === 1920) {
          await p.goto(base + "&encerrada");
          await p.getByRole("button", { name: /^Abrir OS #/ }).click();
          await p.locator("dialog[open] .os-resumo-limpo").waitFor();
          assert.equal(await btn("Editar OS").count(), 0);
          await btn("Imprimir nota da OS").waitFor();
          ok("OS entregue preserva histórico e impressão", { tema, largura });
        }
        console.log("PASS interface", tema, largura);
      } catch (e) {
        await p.screenshot({ path: resolve(out, "falha.png") });
        await writeFile(resolve(out, "falha.txt"), await p.locator("body").innerText());
        throw e;
      } finally {
        await ctx.close();
      }
    }
  assert.deepEqual(erros, []);
} catch (e) {
  process.exitCode = 1;
  console.error(e.stack);
  if (p && !p.isClosed()) await p.screenshot({ path: resolve(out, "falha.png") });
} finally {
  await browser.close();
  server.httpServer.close();
  await writeFile(
    resolve(out, "resultados.json"),
    JSON.stringify({ ok: !process.exitCode, resultados, erros }, null, 2),
  );
  console.log(
    JSON.stringify({ ok: !process.exitCode, verificacoes: resultados.length }),
  );
}
