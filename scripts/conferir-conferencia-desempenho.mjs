import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { createServer } from "node:http";
import { build } from "./lib/vite-conferencia.mjs";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "./lib/chrome-conferencia.mjs";
const out = resolve("output/conferencia-final-20261111/controles"),
  dist = resolve(out, "build");
await mkdir(out, { recursive: true });
await build({
  configFile: false,
  envDir: false,
  logLevel: "error",
  plugins: [
    {
      name: "rpc-isolada",
      enforce: "pre",
      resolveId(id) {
        if (/(?:^|\/)lib\/rpc(?:\.ts)?$/.test(id))
          return resolve("scripts/fixtures/conferencia-desempenho-rpc.js");
      },
    },
    react(),
    tailwindcss(),
  ],
  define: {
    "import.meta.env.VITE_SUPABASE_URL": '""',
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": '""',
  },
  build: {
    outDir: dist,
    rollupOptions: { input: "scripts/fixtures/conferencia-desempenho.html" },
  },
});
const s = createServer(async (req, res) => {
  const f = resolve(dist, "." + new URL(req.url, "http://local").pathname);
  try {
    assert(f.startsWith(dist + sep));
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".woff2": "font/woff2",
      }[extname(f)] || "application/octet-stream",
    );
    res.end(await readFile(f));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((ok) => s.listen(0, "127.0.0.1", ok));
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const checks = [];
let tempos;
try {
  const ctx = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
    }),
    p = await ctx.newPage(),
    errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(
    `http://127.0.0.1:${s.address().port}/scripts/fixtures/conferencia-desempenho.html`,
  );
  await p.getByRole("heading", { name: "Conferência" }).waitFor();
  assert.equal(
    await p.evaluate(() =>
      qaChamadas.some((x) => x.nome === "consultar_produtividade"),
    ),
    false,
  );
  checks.push("Pacotes fechados não consultam agenda e produtividade");
  const input = p.getByRole("combobox", { name: "Catálogo local" });
  await input.fill("manutencao 9999");
  await p.getByRole("listbox").getByRole("option").waitFor();
  assert.equal(await p.getByRole("listbox").getByRole("option").count(), 1);
  await p.keyboard.press("Enter");
  assert.equal(await p.locator("[data-valor]").innerText(), "9999");
  checks.push("10.000 opções: pesquisa encontra última opção, Enter seleciona");
  await input.click();
  await input.fill("servico");
  assert.equal(await p.getByRole("listbox").getByRole("option").count(), 30);
  await p.keyboard.press("ArrowDown");
  await p.keyboard.press("Enter");
  assert.equal(await p.locator("[data-valor]").innerText(), "1");
  await input.click();
  await p.keyboard.press("Escape");
  assert.equal(await input.inputValue(), "Serviço de manutenção 1");
  checks.push("Setas, limite de 30, Escape e valor preservado");
  const remoto = p.getByRole("combobox", { name: "Cliente remoto" });
  await remoto.click();
  await p.getByRole("option", { name: "Ana QA" }).click();
  assert.equal(
    await p.evaluate(
      () =>
        qaChamadas.filter((x) => x.nome === "buscar_cadastros_operacao" && x.dados.p_id)
          .length,
    ),
    0,
  );
  checks.push("Selecionar cadastro já listado dispensa consulta por ID");
  await p.getByRole("button", { name: "Selecionar fora da página" }).click();
  await p.waitForFunction(() =>
    document.querySelector('input[placeholder="Cliente fora da página"]'),
  );
  assert.equal(await remoto.inputValue(), "Cliente fora da página");
  checks.push("Cadastro fora da página continua sendo recuperado por ID");
  await p.getByRole("combobox", { name: "Cliente do orçamento", exact: true }).click();
  await p.getByRole("option", { name: "Ana QA", exact: true }).click();
  await p.getByRole("combobox", { name: "Veículo do orçamento", exact: true }).click();
  await p.getByRole("option", { name: "Fiat QA", exact: true }).click();
  assert.equal(
    await p.evaluate(
      () => qaChamadas.filter((x) => ["c1", "v1"].includes(x.dados.p_id)).length,
    ),
    0,
  );
  checks.push("Orçamento: cliente e veículo já listados dispensam consulta por ID");
  await p.getByRole("button", { name: "Veículo fora da página", exact: true }).click();
  await p.waitForFunction(() =>
    document.querySelector('input[placeholder="Veículo fora da página"]'),
  );
  assert.equal(
    await p
      .getByRole("combobox", { name: "Veículo do orçamento", exact: true })
      .inputValue(),
    "Veículo fora da página",
  );
  checks.push("Orçamento recupera vínculo fora da página sem perder a seleção");
  await p.getByRole("button", { name: "Atualizar lista com veículo selecionado", exact: true }).click();
  const veiculo = p.getByRole("combobox", { name: "Veículo do orçamento", exact: true });
  assert.equal(await veiculo.inputValue(), "Veículo atualizado");
  await veiculo.click();
  assert.equal(await p.getByRole("listbox").getByRole("option").count(), 1);
  await p.keyboard.press("Escape");
  checks.push("Cadastro recuperado por ID volta à página sem duplicar e usa o nome atualizado");
  await p.locator("summary").filter({ hasText: "Pacotes de serviços" }).click();
  await p.getByRole("option", { name: "Pacote QA" }).waitFor({ state: "attached" });
  await p.getByLabel("Adicionar pacote de serviços").selectOption("p1");
  await p.waitForFunction(() => qaItens?.length === 1);
  assert.equal(await p.evaluate(() => qaItens[0].preco_unitario_centavos), 10000);
  checks.push("Abrir pacote carrega opções; itens e preços são incluídos");
  await p.getByLabel("Visualização", { exact: true }).selectOption("dia");
  await p.locator(".cal-oficina-evento").first().click();
  assert.equal(typeof (await p.evaluate(() => qaEvento)), "string");
  await p.getByLabel("Visualização", { exact: true }).selectOption("mes");
  checks.push("Calendário: mês, dia, abertura de evento");
  for (const width of [320, 390, 768, 1920]) {
    await p.setViewportSize({ width, height: 900 });
    assert(
      await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
    );
    checks.push("Sem excesso horizontal em " + width + "px");
  }
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  tempos = await p.evaluate(() => qaMedir());
  assert.deepEqual(errors, []);
  await p.screenshot({ path: resolve(out, "calendario-desktop.png") });
  await ctx.close();
} finally {
  await browser.close();
  await new Promise((ok) => s.close(ok));
  await writeFile(
    resolve(out, "resultado.json"),
    JSON.stringify(
      {
        ok: !!tempos,
        checks,
        tempos,
        metodo:
          "Chrome, CPU 4x mais lenta, mediana de 9 repetições; cálculos puros, sem latência de rede.",
      },
      null,
      2,
    ),
  );
}
console.log(JSON.stringify({ checks, tempos }));
