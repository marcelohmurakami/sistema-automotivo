import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { build, preview } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright";
const fase = process.env.QA_FASE || "antes",
  out = resolve(process.env.QA_OUTPUT || `output/os-velocidade-20261116/${fase}-controlado`);
await mkdir(out, { recursive: true });
const baseline = {
  name: "baseline-os",
  enforce: "pre",
  async load(id) {
    if (
      fase === "antes" &&
      /\/src\/(pages\/OrdensServico\.tsx|components\/ordens-servico\/ResumoOS\.(tsx|css)|services\/ordensServico\.ts|lib\/atualizarIntegracoes\.ts)$/.test(
        id,
      )
    )
      return readFile(
        resolve(
          "output/os-velocidade-20261116/antes",
          id.includes("/services/") ? "ordensServico-service.ts" : basename(id),
        ),
        "utf8",
      );
  },
};
const config = {
  configFile: false,
  envDir: false,
  logLevel: "error",
  plugins: [baseline, react(), tailwindcss()],
  define: {
    "import.meta.env.VITE_SUPABASE_URL": '""',
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": '""',
  },
  build: {
    outDir: resolve(out, "build"),
    rollupOptions: { input: "scripts/fixtures/os-velocidade.html" },
  },
};
await build(config);
const server = await preview({ ...config, preview: { host: "127.0.0.1", port: 0 } }),
  browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  }),
  resultados = [],
  erros = [];
let p;
try {
  for (const n of [12, 100])
    for (const largura of [1920, 390])
      for (let repeticao = 1; repeticao <= 3; repeticao++) {
        const ctx = await browser.newContext({
          viewport: { width: largura, height: 900 },
          locale: "pt-BR",
        });
        p = await ctx.newPage();
        p.setDefaultTimeout(45000);
        p.on("pageerror", (e) => erros.push(e.message));
        const cdp = await ctx.newCDPSession(p);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        const medir = async (nome, fn) => {
          const start = performance.now();
          await fn();
          resultados.push({
            fase,
            n,
            largura,
            repeticao,
            nome,
            segundos: +((performance.now() - start) / 1000).toFixed(3),
            ok: true,
          });
        };
        try {
          await p.goto(
            server.resolvedUrls.local[0] +
              "scripts/fixtures/os-velocidade.html?n=" +
              n +
              "&lento",
          );
          await p.getByRole("button", { name: /^Editar OS #/ }).waitFor();
          await medir("Abrir edição com " + n + " itens", async () => {
            await p.getByRole("button", { name: /^Editar OS #/ }).click();
            await p
              .getByRole("button", { name: "Salvar alterações da OS", exact: true })
              .waitFor();
          });
          await medir("Digitar observação (20 caracteres)", () =>
            p
              .getByLabel("Observações (opcional)", { exact: true })
              .pressSequentially("Revisão com garantia"),
          );
          await medir("Modificar quantidade e desconto", async () => {
            await p.locator(".os-editor-item input[type=number]").first().fill("2");
            await p
              .getByRole("button", { name: "Desconto em porcentagem", exact: true })
              .click();
            await p.getByLabel("Desconto (%)", { exact: true }).fill("10");
          });
          await medir("Salvar até liberar consulta (lista lenta 2 s)", async () => {
            await p
              .getByRole("button", { name: "Salvar alterações da OS", exact: true })
              .click();
            await p.waitForFunction(() => {
              const d = document.querySelector("dialog[open].dialogo-detalhes-os");
              return (
                d &&
                [...d.querySelectorAll("button")].some(
                  (b) => b.textContent.includes("Editar OS") && !b.disabled,
                )
              );
            });
          });
          const salvo = await p.evaluate(
            () => JSON.parse(localStorage.getItem("patio_os_v1"))[0],
          );
          assert.equal(salvo.itens.length, n);
          assert.equal(salvo.resumo_cliente, "Revisão com garantia");
          assert.equal(salvo.total_centavos, (n + 1) * 9000);
          assert(
            await p.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
          );
          console.log("PASS", fase, n, largura, repeticao);
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
  await server.httpServer.close();
  await writeFile(
    resolve(out, "resultados.json"),
    JSON.stringify(
      {
        fase,
        ok: !process.exitCode,
        metodo:
          "Chrome CPU 4x; 12/100 itens; revalidação da lista artificialmente lenta (2 s); três repetições. Dados locais.",
        resultados,
        erros,
      },
      null,
      2,
    ),
  );
}
