import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build, preview } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright";

const pasta = resolve("output/orcamento-simples-20261124");
await mkdir(pasta, { recursive: true });
const config = {
  configFile: false,
  envDir: false,
  logLevel: "error",
  plugins: [react(), tailwindcss()],
  define: {
    "import.meta.env.VITE_SUPABASE_URL": '""',
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": '""',
  },
  build: {
    outDir: resolve(pasta, "build"),
    rollupOptions: { input: "scripts/fixtures/orcamento-simples.html" },
  },
};
if (!process.argv.includes("--sem-build")) await build(config);
const server = await preview({ ...config, preview: { host: "127.0.0.1", port: 0 } });
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const base = server.resolvedUrls.local[0] + "scripts/fixtures/orcamento-simples.html";
const resultados = [],
  erros = [];
let ctx, p;
const button = (name) => p.getByRole("button", { name, exact: true });
try {
  const fonte = await readFile("src/lib/especialidades.ts", "utf8");
  const perfis = [
    ...fonte
      .slice(fonte.indexOf("export const especialidades:"))
      .matchAll(/^  (\w+): \{/gm),
  ].map((m) => m[1]);
  for (const perfil of perfis)
    for (const width of [390, 1366]) {
      await ctx?.close();
      ctx = await browser.newContext({
        viewport: { width, height: 900 },
        locale: "pt-BR",
        timezoneId: "America/Sao_Paulo",
      });
      p = await ctx.newPage();
      p.setDefaultTimeout(15000);
      p.on("pageerror", (e) => erros.push(e.message));
      await p.goto(base + "?perfil=" + perfil);
      await button("Salvar orçamento").waitFor();
      const form = p.locator(".documento-simples"),
        opcoes = form.locator(".documento-mais-opcoes > summary");
      assert.equal(
        await form.getByLabel("Desconto (%)", { exact: true }).isVisible(),
        false,
      );
      assert.equal(
        await form
          .getByLabel("Forma de pagamento (opcional)", { exact: true })
          .isVisible(),
        false,
      );
      assert.equal(await form.locator(".os-editor-catalogo").count(), 0);
      const pesquisa = form.getByRole("textbox", {
        name: /^Buscar serviço ou .*: orçamento$/,
      });
      await pesquisa.press("ArrowDown");
      await pesquisa.press("Enter");
      assert.equal(
        await form.locator(".os-editor-item").count(),
        0,
        "Busca vazia não inclui um favorito invisível",
      );
      const auto = await button("Cliente sem cadastro").isVisible();
      if (auto) {
        if (perfil === "retifica" && width === 1366) {
          await p.getByRole("combobox", { name: "Cliente", exact: true }).fill("Ana");
          await p
            .getByRole("option", { name: "Ana Carolina Silva", exact: true })
            .click();
        } else {
          await button("Cliente sem cadastro").click();
          await p
            .getByLabel("Nome do cliente", { exact: true })
            .fill("Cliente QA orçamento simples");
        }
        if (perfil === "retifica") {
          await p.getByLabel("Carro", { exact: true }).fill("Volkswagen Gol");
          await p.getByLabel("Motor", { exact: true }).fill("AP 1.6");
        } else {
          await button("Novo veículo").click();
          await p
            .getByLabel("Nome / modelo do veículo", { exact: true })
            .fill("Volkswagen Gol");
          await p.getByLabel("Placa (opcional)", { exact: true }).fill("ABC1D23");
          await button("Cadastrar e selecionar").click();
        }
      } else {
        await button("Novo cliente").click();
        await p
          .getByLabel("Nome do novo cliente", { exact: true })
          .fill("Cliente QA orçamento simples");
        await button("Cadastrar e selecionar").click();
        await form
          .locator(".cadastro-rapido-campos input")
          .first()
          .fill("Equipamento QA");
        if (await p.getByLabel("Endereço completo", { exact: true }).isVisible())
          await p
            .getByLabel("Endereço completo", { exact: true })
            .fill("Rua de Teste, 123");
        await button("Cadastrar e selecionar").click();
      }
      const busca = form.getByRole("textbox", {
        name: /^Buscar serviço ou .*: orçamento$/,
      });
      await busca.fill("óleo");
      await p.getByRole("button", { name: /^Adicionar Troca de óleo/ }).click();
      await p
        .getByLabel("Quantidade de Troca de óleo — mão de obra", { exact: true })
        .fill("2");
      await busca.fill("alinhamento");
      await busca.press("ArrowDown");
      await busca.press("Enter");
      assert.equal(await form.locator(".os-editor-item").count(), 2);
      await opcoes.click();
      await p.getByLabel("Desconto (%)", { exact: true }).fill("10");
      await p
        .getByLabel("Observações (opcional)", { exact: true })
        .fill("Orientação QA preservada");
      await opcoes.click();
      assert.match(
        await form.getByRole("region", { name: "Valores do orçamento" }).innerText(),
        /198,00/,
      );
      assert(await form.evaluate((e) => e.scrollWidth <= e.clientWidth + 1));
      assert(
        await p
          .locator("dialog[open]")
          .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      );
      await busca.fill("óleo");
      await busca.scrollIntoViewIfNeeded();
      await p.screenshot({ path: resolve(pasta, perfil + "-" + width + ".png") });
      await busca.fill("");
      if (perfil === "retifica" && width === 390) {
        await p.evaluate(() => (window.qaFalhaSalvar = true));
        await button("Salvar orçamento").click();
        await form.getByRole("alert").waitFor();
        assert.equal(await form.locator(".os-editor-item").count(), 2);
        await p.evaluate(() => (window.qaFalhaSalvar = false));
      }
      const inicio = performance.now();
      await button("Salvar orçamento").click();
      await form.waitFor({ state: "hidden" });
      const segundos = (performance.now() - inicio) / 1000;
      const registro = await p.evaluate(
        (auto) =>
          auto
            ? JSON.parse(localStorage.patio_orcamentos_v2).at(-1)
            : JSON.parse(localStorage["patio_servicos:demo"]).atendimentos.at(-1),
        auto,
      );
      if (auto) {
        assert.equal(registro.versao.total_centavos, 19800);
        assert.equal(registro.versao.observacoes, "Orientação QA preservada");
        assert.equal(registro.itens.length, 2);
      } else {
        assert.equal(registro.valor_centavos, 19800);
        assert.equal(registro.dados.observacoes_cliente, "Orientação QA preservada");
      }
      if (perfil === "retifica") {
        await button("Editar orçamento").click();
        await form.waitFor();
        await opcoes.click();
        assert.equal(
          await form.locator('textarea[name="observacoes"]').inputValue(),
          "Orientação QA preservada",
        );
        await opcoes.click();
        await button("Item avulso").click();
        await p
          .getByLabel("Nome do serviço ou peça", { exact: true })
          .fill("Serviço avulso QA");
        await p.getByLabel("Preço unitário (R$)", { exact: true }).fill("50");
        await button("Adicionar serviço").click();
        await button("Salvar alterações").click();
        await form.waitFor({ state: "hidden" });
        const editado = await p.evaluate(() =>
          JSON.parse(localStorage.patio_orcamentos_v2).at(-1),
        );
        assert.equal(editado.itens.length, 3);
        assert.equal(editado.versao.total_centavos, 24800);
        assert.equal(editado.versao.observacoes, "Orientação QA preservada");
      }
      resultados.push({
        perfil,
        width,
        segundos,
        ok: true,
        cenario:
          "Cliente, identificação, busca com teclado, quantidade, desconto, opções recolhidas, salvar e persistir",
      });
      console.log("PASS", perfil, width, segundos.toFixed(3));
    }
  assert.deepEqual(erros, []);
} catch (e) {
  process.exitCode = 1;
  console.error(e.stack);
  if (p) {
    await p.screenshot({ path: resolve(pasta, "falha.png") });
    await writeFile(resolve(pasta, "falha.txt"), await p.locator("body").innerText());
  }
} finally {
  await browser.close();
  await server.httpServer.close();
  await writeFile(
    resolve(pasta, "resultados.json"),
    JSON.stringify({ ok: !process.exitCode, resultados, erros }, null, 2),
  );
}
