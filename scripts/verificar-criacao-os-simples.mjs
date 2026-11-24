import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build, preview } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright";

const pasta = resolve("output/criacao-os-simples-20261124");
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
    rollupOptions: { input: "scripts/fixtures/pagamento-entrega.html" },
  },
};
if (!process.argv.includes("--sem-build")) await build(config);
const server = await preview({ ...config, preview: { host: "127.0.0.1", port: 0 } });
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const base = server.resolvedUrls.local[0] + "scripts/fixtures/pagamento-entrega.html";
const fonte = await readFile("src/lib/especialidades.ts", "utf8");
const perfis = [
  ...fonte
    .slice(fonte.indexOf("export const especialidades:"))
    .matchAll(/^  (\w+): \{/gm),
].map((m) => m[1]);
const resultados = [],
  erros = [];
let ctx, p;
const btn = (name) => p.getByRole("button", { name, exact: true });
try {
  for (const perfil of perfis)
    for (const largura of [390, 1366]) {
      await ctx?.close();
      ctx = await browser.newContext({
        viewport: { width: largura, height: 900 },
        locale: "pt-BR",
        timezoneId: "America/Sao_Paulo",
      });
      p = await ctx.newPage();
      p.setDefaultTimeout(20000);
      p.on("pageerror", (e) => erros.push(e.message));
      await p.goto(base + "?perfil=" + perfil);
      await btn("Abrir ordem de serviço").waitFor();
      const form = p.locator("form.documento-simples"),
        opcoes = form.locator(".documento-mais-opcoes > summary");
      for (const nome of [
        "Data do serviço",
        "Desconto (%)",
        "Forma de pagamento (opcional)",
      ])
        assert.equal(
          await form.getByLabel(nome, { exact: true }).isVisible(),
          false,
          `${nome} começa recolhido`,
        );
      assert.equal(
        await form.getByRole("region", { name: "Fotos do atendimento" }).isVisible(),
        false,
      );
      assert(await form.getByLabel("O serviço já está pronto para entrega", { exact: true }).isVisible());
      assert.equal(
        await form.getByLabel("O serviço já está pronto para entrega", { exact: true }).isChecked(),
        false,
      );
      const auto = await btn("Cliente sem cadastro").isVisible();
      if (auto) {
        await btn("Cliente sem cadastro").click();
        await p
          .getByLabel("Nome do cliente", { exact: true })
          .fill("Cliente QA criação simples");
        if (perfil === "retifica") {
          await p.getByLabel("Carro", { exact: true }).fill("Volkswagen Gol");
          await p.getByLabel("Motor", { exact: true }).fill("AP 1.6");
        } else {
          await btn("Novo veículo").click();
          await p
            .getByLabel("Nome / modelo do veículo", { exact: true })
            .fill("Volkswagen Gol");
          await btn("Cadastrar e selecionar").click();
        }
      } else {
        await btn("Novo cliente").click();
        await p
          .getByLabel("Nome do novo cliente", { exact: true })
          .fill("Cliente QA criação simples");
        await btn("Cadastrar e selecionar").click();
        await form
          .locator(".cadastro-rapido-campos input")
          .first()
          .fill("Equipamento QA");
        if (await p.getByLabel("Endereço completo", { exact: true }).isVisible())
          await p
            .getByLabel("Endereço completo", { exact: true })
            .fill("Rua de testes, 10");
        await btn("Cadastrar e selecionar").click();
      }
      const busca = form.getByRole("textbox", { name: /^Buscar serviço ou .*: OS$/ });
      await busca.fill("óleo");
      await p.getByRole("button", { name: /^Adicionar Troca de óleo/ }).click();
      await p
        .getByLabel("Quantidade de Troca de óleo — mão de obra", { exact: true })
        .fill("2");
      await busca.fill("alinhamento");
      await busca.press("ArrowDown");
      await busca.press("Enter");
      assert.equal(await form.locator(".os-editor-item").count(), 2);
      if (largura === 390) {
        await opcoes.click();
        await p.getByLabel("Desconto (%)", { exact: true }).fill("10");
        await p
          .getByLabel("Observações (opcional)", { exact: true })
          .fill("Observação preservada QA");
        const nota = form.getByRole("group", {
          name: "Mostrar o desconto na nota final para o cliente?",
          exact: true,
        });
        assert.equal(
          await nota
            .getByRole("button", { name: "Não", exact: true })
            .getAttribute("aria-pressed"),
          "true",
        );
        await nota.getByRole("button", { name: "Sim", exact: true }).click();
        if (perfil === "retifica") {
          const png = await p.evaluate(() => {
            const c = document.createElement("canvas");
            c.width = 80;
            c.height = 80;
            const x = c.getContext("2d");
            x.fillStyle = "#9da";
            x.fillRect(0, 0, 80, 80);
            return c.toDataURL("image/png").split(",")[1];
          });
          await p
            .getByLabel("Selecionar fotos do atendimento", { exact: true })
            .setInputFiles({
              name: "foto-qa.png",
              mimeType: "image/png",
              buffer: Buffer.from(png, "base64"),
            });
          await form.getByAltText("Foto do atendimento 1").waitFor();
          await p.getByLabel("Data do serviço", { exact: true }).fill("");
        }
        await opcoes.click();
        if (perfil === "retifica") {
          await btn("Abrir ordem de serviço").click();
          assert(
            await p.getByLabel("Data do serviço", { exact: true }).isVisible(),
            "Validação abre opções para o campo inválido",
          );
          await p.getByLabel("Data do serviço", { exact: true }).fill("2026-11-24");
          await opcoes.click();
        }
      }
      const total = largura === 390 ? 19800 : 22000;
      assert.match(
        await form
          .getByRole("region", { name: "Valores da OS", exact: true })
          .innerText(),
        largura === 390 ? /198,00/ : /220,00/,
      );
      assert(
        await p
          .locator("dialog[open]")
          .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      );
      if (
        [
          "retifica",
          "mecanica",
          "assistencia_celulares",
          "manutencao_climatizacao",
        ].includes(perfil)
      ) {
        await busca.scrollIntoViewIfNeeded();
        await p.screenshot({ path: resolve(pasta, `${perfil}-${largura}.png`) });
      }
      const inicio = performance.now();
      await btn("Abrir ordem de serviço").click();
      await form.waitFor({ state: "hidden" });
      const segundos = (performance.now() - inicio) / 1000;
      const dados = await p.evaluate(
        (auto) =>
          auto
            ? JSON.parse(localStorage.patio_os_v1).at(-1)
            : JSON.parse(localStorage["patio_servicos:demo"]).atendimentos.at(-1),
        auto,
      );
      assert.equal(auto ? dados.total_centavos : dados.valor_centavos, total);
      assert.equal(dados.mostrar_desconto_nota, largura === 390);
      if (largura === 390)
        assert.equal(
          auto ? dados.resumo_cliente : dados.dados.observacoes_cliente,
          "Observação preservada QA",
        );
      if (perfil === "retifica" && largura === 390)
        assert.equal(dados.fotos.length, 1, "Foto anexada foi salva com a OS");
      assert.equal(await p.evaluate(() => window.qaImpressaoIniciada), 0);
      assert(
        !(await p.evaluate(() => window.qaDialogos)).includes(
          "Como ficou o pagamento da OS?",
        ),
      );
      await p.goto(base + `?perfil=${perfil}&${auto ? "os" : "detalhe"}=${dados.id}`);
      await p.locator("dialog[open]").waitFor();
      const reaberta = await p.evaluate(
        (auto) =>
          auto
            ? JSON.parse(localStorage.patio_os_v1).at(-1)
            : JSON.parse(localStorage["patio_servicos:demo"]).atendimentos.at(-1),
        auto,
      );
      assert.equal(auto ? reaberta.total_centavos : reaberta.valor_centavos, total);
      resultados.push({
        perfil,
        largura,
        segundos,
        ok: true,
        modo:
          largura === 390
            ? "Extras, desconto, preferência da nota, salvar e reabrir"
            : "Criação simples sem abrir Mais opções",
      });
      console.log("PASS", perfil, largura, segundos.toFixed(3));
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
    JSON.stringify(
      {
        ok: !process.exitCode,
        resultados,
        erros,
        ambiente: "Chrome local com dados fictícios em modo demonstração",
      },
      null,
      2,
    ),
  );
}
