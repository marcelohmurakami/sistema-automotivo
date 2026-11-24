import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { build, preview } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright";

const antes = process.argv.includes("--antes");
const pasta = resolve("output/os-desktop-20261124");
await mkdir(pasta, { recursive: true });
const css = resolve("src/components/ordens-servico/ResumoOS.css").replaceAll("\\", "/");
const config = {
  configFile: false,
  envDir: false,
  logLevel: "error",
  plugins: [
    ...(antes
      ? [
          {
            name: "layout-anterior-os",
            enforce: "pre",
            load(id) {
              return id === css
                ? execFileSync(
                    "git",
                    ["show", "4fda04f:src/components/ordens-servico/ResumoOS.css"],
                    { encoding: "utf8", windowsHide: true },
                  )
                : null;
            },
          },
        ]
      : []),
    react(),
    tailwindcss(),
  ],
  define: {
    "import.meta.env.VITE_SUPABASE_URL": '""',
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": '""',
  },
  build: {
    outDir: resolve(pasta, antes ? "build-antes" : "build"),
    rollupOptions: { input: "scripts/fixtures/mobile-oficina.html" },
  },
};
if (!process.argv.includes("--sem-build")) await build(config);
const server = await preview({ ...config, preview: { host: "127.0.0.1", port: 0 } });
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const resultados = [];
const baseline = antes
  ? []
  : await readFile(resolve(pasta, "antes.json"), "utf8")
      .then((s) => JSON.parse(s).resultados)
      .catch((e) => {
        if (e.code === "ENOENT") return [];
        throw e;
      });
try {
  for (const [width, height] of [
    [390, 844],
    [768, 1024],
    [1024, 768],
    [1366, 768],
    [1920, 1080],
  ]) {
    for (const tema of antes ? ["escuro"] : ["escuro", "claro"]) {
      for (const longo of antes ? [false] : [false, true]) {
        const page = await browser.newPage({
          viewport: { width, height },
          locale: "pt-BR",
          timezoneId: "America/Sao_Paulo",
        });
        const erros = [];
        page.on("pageerror", (e) => erros.push(e.message));
        const url =
          server.resolvedUrls.local[0] + "scripts/fixtures/mobile-oficina.html?";
        await page.goto(url + new URLSearchParams({ rota: "/ordens-servico", tema }));
        await page.locator(".linha-ordem-servico").first().waitFor();
        const id = await page.evaluate((longo) => {
          const ordens = JSON.parse(localStorage.patio_os_v1);
          const o = ordens.find((o) => o.situacao === "open");
          o.dados_cliente.nome = longo
            ? "Transportes São João e Filhos — Atendimento da unidade de manutenção e serviços especializados"
            : "Jean";
          o.dados_veiculo.modelo = "Volkswagen Fox";
          o.dados_veiculo.motor = "EA 111 Power 1.6";
          if (longo) {
            o.itens = Array.from({ length: 8 }, (_, i) => ({
              ...o.itens[0],
              id: crypto.randomUUID(),
              descricao:
                "Serviço de revisão completa e substituição dos componentes do sistema de alimentação " +
                i,
              preco_unitario_centavos: 123456789,
            }));
            o.total_centavos = 8 * 123456789;
          }
          localStorage.patio_os_v1 = JSON.stringify(ordens);
          return o.id;
        }, longo);
        await page.goto(
          url + new URLSearchParams({ rota: "/ordens-servico?os=" + id, tema }),
        );
        const modal = page.locator(".dialogo-detalhes-os[open]");
        await page.locator(".os-servicos-resumo-total").waitFor();
        if (!longo) {
          await page.getByRole("button", { name: "Editar OS", exact: true }).click();
          await page
            .getByRole("button", { name: "Salvar alterações da OS", exact: true })
            .click();
          await modal.waitFor();
          await modal.locator('[role="status"]').waitFor();
        }
        await page.evaluate(() => document.fonts.ready);
        await modal.evaluate((el) => (el.scrollTop = 0));
        await page.evaluate(() => document.activeElement?.blur());
        const medidas = await modal.evaluate((el) => {
          const head = el.querySelector(".os-cabecalho-resumo"),
            tabs = el.querySelector(".os-abas-simples"),
            total = el.querySelector(".os-servicos-resumo-total");
          const controls = [...tabs.querySelectorAll("button,select")].map(
            (n) => n.getBoundingClientRect().top,
          );
          return {
            largura: el.clientWidth,
            conteudo: el.scrollWidth,
            cabecalho: head.getBoundingClientRect().height,
            abas: tabs.getBoundingClientRect().height,
            linhasAbas: new Set(controls.map((n) => Math.round(n))).size,
            totalVisivel:
              total.getBoundingClientRect().bottom <= el.getBoundingClientRect().bottom,
            acoes: [...head.querySelectorAll("button,a")]
              .map((n) => n.getAttribute("aria-label") || n.textContent.trim())
              .sort(),
            valores: [
              ...el.querySelectorAll(
                ".os-servicos-resumo-lista li > span,.os-servicos-resumo-total > strong",
              ),
            ].map((n) => n.textContent.trim()),
          };
        });
        assert(medidas.conteudo <= medidas.largura + 1, `${width}: rolagem horizontal`);
        if (!antes && width > 900)
          assert.equal(medidas.linhasAbas, 1, `${width}: abas em mais de uma linha`);
        const original = baseline.find(
          (r) => r.width === width && r.tema === tema && r.longo === longo,
        );
        if (original) {
          assert.deepEqual(medidas.acoes, original.acoes);
          assert.deepEqual(medidas.valores, original.valores);
        }
        await page.screenshot({
          path: resolve(
            pasta,
            `${antes ? "antes" : "depois"}-${width}-${tema}${longo ? "-completa" : ""}.png`,
          ),
        });
        if (!antes) {
          for (const tab of ["Serviços", "Fotos", "Lucro e custos", "Resumo"]) {
            await page.getByRole("button", { name: tab, exact: true }).click();
            assert(await modal.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
          }
          for (const sec of ["detalhes", "historico", "pagamento"]) {
            await page
              .getByLabel("Mais seções da OS", { exact: true })
              .selectOption(sec);
            assert(await modal.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
          }
          await page.getByRole("button", { name: "Resumo", exact: true }).click();
          await page.locator(".ferramentas-atendimento > summary").click();
          await page
            .getByRole("button", { name: "Atualizar OS", exact: true })
            .waitFor();
          await page
            .getByRole("button", { name: "Compartilhar no WhatsApp", exact: true })
            .click();
          const share = page.getByRole("dialog", { name: /Compartilhar OS/ });
          await share.waitFor();
          await share
            .getByRole("button", { name: "Fechar janela", exact: true })
            .click();
          assert(await modal.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
        }
        assert.deepEqual(erros, []);
        resultados.push({ width, height, tema, longo, ...medidas });
        await page.close();
      }
    }
  }
  await writeFile(
    resolve(pasta, antes ? "antes.json" : "depois.json"),
    JSON.stringify({ ok: true, resultados }, null, 2),
  );
  console.log(JSON.stringify({ ok: true, cenarios: resultados.length }));
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
