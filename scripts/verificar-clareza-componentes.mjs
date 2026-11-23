import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build, preview } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright";

const pasta = resolve("output/clareza-componentes-20261123");
await mkdir(pasta, { recursive: true });
const base = process.env.QA_CLAREZA_BASE || "9eed40e";
const preservar = new Set([
  "src/components/RoteiroVisitas.tsx",
  "src/components/agenda/CalendarioAgenda.tsx",
  "src/components/agenda/CalendarioOficina.tsx",
  "src/components/agenda/DetalheAgendamentoOficina.tsx",
  "src/lib/calendarioAgenda.ts",
  "src/pages/Produtividade.tsx",
  "src/services/produtividade.ts",
]);
const arquivos = execFileSync("git", ["diff", "--name-only", base, "--", "src"], {
  encoding: "utf8",
  windowsHide: true,
})
  .trim()
  .split(/\r?\n/)
  .filter(
    (f) =>
      f.endsWith(".tsx") && !preservar.has(f) && !f.endsWith("/AjudaContextual.tsx"),
  );
const anteriores = new Map(
  arquivos.map((f) => [
    resolve(f).replaceAll("\\", "/"),
    execFileSync("git", ["show", `${base}:${f}`], {
      encoding: "utf8",
      windowsHide: true,
    }),
  ]),
);
const config = (versao) => ({
  configFile: false,
  envDir: false,
  logLevel: "error",
  plugins: [
    ...(versao === "antes"
      ? [
          {
            name: "versao-anterior-clareza",
            enforce: "pre",
            load(id) {
              return anteriores.get(id.split("?")[0]) ?? null;
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
    outDir: resolve(pasta, "build-" + versao),
    rollupOptions: { input: "scripts/fixtures/mobile-oficina.html" },
  },
});
if (!process.argv.includes("--sem-build"))
  for (const versao of process.argv.includes("--rebuild-depois")
    ? ["depois"]
    : ["antes", "depois"])
    await build(config(versao));
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const apenas = process.argv.find((a) => a.startsWith("--apenas="))?.slice(9);
const resultados = apenas
    ? JSON.parse(
        await readFile(resolve(pasta, "navegador.json"), "utf8"),
      ).resultados.filter((r) => r.nome !== apenas)
    : process.argv.includes("--somente-depois")
      ? JSON.parse(
          await readFile(resolve(pasta, "navegador.json"), "utf8"),
        ).resultados.filter((r) => r.versao === "antes")
      : [],
  erros = [];
const cenarios = [
  ["mapa", "/", ".quadro"],
  ["ordens", "/ordens-servico", ".registro-os"],
  ["orcamentos", "/orcamentos", ".linha-proposta"],
  ["estoque", "/estoque", ".linha-estoque"],
  ["clientes", "/clientes", ".linha-cliente"],
  ["servicos", "/catalogo", ".catalogo-card"],
  ["financeiro", "/financeiro", ".fin-cartoes"],
  ["contas-mensais", "/financeiro?aba=recorrencias", ".mensal-linha"],
  ["comissoes", "/financeiro?aba=comissoes", ".os-painel h2"],
  ["fornecedores", "/fornecedores", "h1"],
  ["funcionarios", "/funcionarios", "h1"],
  ["compras", "/compras", "h1"],
  ["qualidade", "/qualidade", ".qserv"],
  ["relatorios", "/relatorios", ".rel-conteudo"],
  ["configuracoes", "/configuracoes", ".configuracoes-area"],
  ["equipe", "/equipe", ".equipe-pagina"],
  ["localizacao", "/localizacao", "h1"],
  ["laudos", "/laudos", "h1"],
  ["historico", "/historico", "h1"],
  ["seguranca", "/dados-seguranca", "h1"],
  ["site", "/meu-site", "h1"],
  [
    "detalhe-os",
    "/ordens-servico",
    ".registro-os",
    async (p) => {
      await p.locator(".linha-ordem-servico").first().click();
      await p.locator(".os-cabecalho-resumo").waitFor();
    },
  ],
  [
    "nova-os",
    "/ordens-servico",
    ".registro-os",
    async (p) => {
      await p.getByRole("button", { name: "Nova OS", exact: true }).click();
      await p.getByRole("combobox", { name: "Cliente", exact: true }).waitFor();
    },
  ],
  [
    "ficha-cliente",
    "/clientes",
    ".linha-cliente",
    async (p) => {
      await p.locator(".abrir-ficha-cliente").first().click();
      await p.locator(".ficha-cliente-indicadores").first().waitFor();
    },
  ],
  [
    "ficha-servico",
    "/catalogo",
    ".catalogo-card",
    async (p) => {
      await p.locator(".catalogo-abrir-ficha").first().click();
      await p
        .getByRole("button", { name: "Editar serviço e custos", exact: true })
        .waitFor();
    },
  ],
  [
    "alertas",
    "/",
    ".quadro",
    async (p) => {
      await p.locator(".sininho-alertas").click();
      await p.locator(".dialogo-alertas[open]").waitFor();
    },
  ],
  [
    "analise-estoque",
    "/relatorios",
    ".rel-conteudo",
    async (p) => {
      await p
        .getByLabel("Escolher relatório")
        .isVisible()
        .then(async (visivel) => {
          if (visivel) await p.getByLabel("Escolher relatório").selectOption("estoque");
          else
            await p.getByRole("tab", { name: "Estoque e peças", exact: true }).click();
        });
      await p.locator(".gestao-secao").first().waitFor();
      await p.locator(".gestao-secao > summary").first().click();
    },
  ],
];
try {
  for (const versao of process.argv.includes("--somente-depois")
    ? ["depois"]
    : ["antes", "depois"]) {
    const server = await preview({
      ...config(versao),
      preview: { port: 0, host: "127.0.0.1" },
    });
    try {
      for (const [width, tema] of [
        [390, "escuro"],
        [1440, "claro"],
      ]) {
        const ctx = await browser.newContext({
          viewport: { width, height: 900 },
          locale: "pt-BR",
          timezoneId: "America/Sao_Paulo",
          hasTouch: width < 760,
        });
        const p = await ctx.newPage();
        await p.clock.setFixedTime(new Date("2026-11-23T15:00:00-03:00"));
        p.setDefaultTimeout(20000);
        p.on("pageerror", (e) => erros.push(`${versao} ${width}: ${e.message}`));
        try {
          for (const [nome, rota, seletor, preparar] of cenarios) {
            if (apenas && nome !== apenas) continue;
            await p.goto(
              server.resolvedUrls.local[0] +
                "scripts/fixtures/mobile-oficina.html?" +
                new URLSearchParams({ rota, tema }),
              { waitUntil: "domcontentloaded" },
            );
            await p.locator(seletor).first().waitFor();
            if (preparar) await preparar(p);
            await p.waitForFunction(
              () =>
                ![...document.querySelectorAll("#conteudo p")].some(
                  (el) =>
                    el.checkVisibility() &&
                    /^(Carregando|Consultando|Buscando|Atualizando|Preparando|Calculando|Apurando).*…$/.test(
                      el.textContent.trim(),
                    ),
                ),
            );
            await p.evaluate(() => document.fonts.ready);
            const raiz = (await p.locator("dialog[open]").count())
              ? p.locator("dialog[open]").last()
              : p.locator("#conteudo");
            assert(
              await p.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth + 1,
              ),
              `${nome}: página extravasou`,
            );
            assert(
              await raiz.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
              `${nome}: conteúdo extravasou`,
            );
            assert.equal(
              await p
                .getByText("Não conseguimos abrir esta tela.", { exact: true })
                .count(),
              0,
            );
            const dados = await raiz.evaluate((e) => ({
              palavras: e.innerText.trim().split(/\s+/).filter(Boolean).length,
              altura: e.scrollHeight,
              campos: [...e.querySelectorAll("input,select,textarea")].map((n) => [
                n.tagName,
                n.name,
                n.type,
                n.required,
              ]),
              acoes: [...e.querySelectorAll("button,a")].map(
                (n) =>
                  n.getAttribute("aria-label") ||
                  n.textContent.trim().replace(/\s+/g, " "),
              ),
              valores: [...e.querySelectorAll("strong,dd")]
                .map((n) => n.textContent.trim())
                .filter((s) => /R\$\s*[\d.]+,\d{2}/.test(s)),
            }));
            if (versao === "depois") {
              const antes = resultados.find(
                (r) => r.versao === "antes" && r.nome === nome && r.width === width,
              );
              assert.deepEqual(dados.campos, antes.campos, `${nome}: campos alterados`);
              // Eventos com a mesma data usam IDs aleatórios como desempate na fixture.
              assert.deepEqual(
                [...dados.acoes].sort(),
                [...antes.acoes].sort(),
                `${nome}: ações alteradas`,
              );
              assert.deepEqual(
                dados.valores,
                antes.valores,
                `${nome}: valores alterados`,
              );
              for (const ajuda of await raiz.locator(".ajuda-contextual").all()) {
                if (!(await ajuda.isVisible())) continue;
                const resumo = ajuda.locator(":scope > summary");
                assert.equal(await ajuda.getAttribute("open"), null);
                await resumo.focus();
                await p.keyboard.press("Enter");
                assert(await ajuda.evaluate((e) => e.open));
                assert(await ajuda.locator(".ajuda-contextual-conteudo").isVisible());
                await p.keyboard.press("Enter");
                assert(!(await ajuda.evaluate((e) => e.open)));
              }
            }
            resultados.push({ versao, nome, width, tema, ...dados });
            if (
              width === 390 &&
              [
                "financeiro",
                "equipe",
                "alertas",
                "nova-os",
                "ficha-cliente",
                "ficha-servico",
                "mapa",
                "analise-estoque",
              ].includes(nome)
            )
              await p.evaluate(
                () =>
                  document.activeElement instanceof HTMLElement &&
                  document.activeElement.blur(),
              );
            if (
              width === 390 &&
              [
                "financeiro",
                "equipe",
                "alertas",
                "nova-os",
                "ficha-cliente",
                "ficha-servico",
                "mapa",
                "analise-estoque",
              ].includes(nome)
            )
              await p.screenshot({
                path: resolve(pasta, `${versao}-${nome}.png`),
                fullPage: false,
              });
            console.log(
              "OK",
              versao,
              width,
              nome,
              dados.palavras + " palavras",
              dados.altura + " px",
            );
          }
        } catch (e) {
          await p.screenshot({ path: resolve(pasta, "falha.png"), fullPage: true });
          await writeFile(
            resolve(pasta, "falha.txt"),
            await p.locator("body").innerText(),
          );
          throw e;
        } finally {
          await ctx.close();
        }
      }
    } finally {
      await new Promise((ok) => server.httpServer.close(ok));
    }
  }
  assert.deepEqual(erros, []);
} catch (e) {
  process.exitCode = 1;
  console.error(e.stack);
  erros.push(e.message);
} finally {
  await browser.close();
  await writeFile(
    resolve(pasta, "navegador.json"),
    JSON.stringify(
      {
        ok: !process.exitCode,
        base,
        versoes:
          "Mesmos dados fictícios e componentes; antes usa o código do commit base. Depois usa o workspace.",
        resultados,
        erros,
      },
      null,
      2,
    ),
  );
}
