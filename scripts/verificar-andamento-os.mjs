import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build, preview } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright";

const pasta = resolve("output/andamento-os-20261124");
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
const resultados = [],
  erros = [];
let ctx, p;
const botao = (name) => p.getByRole("button", { name, exact: true });
const os = () => p.evaluate(() => JSON.parse(localStorage.patio_os_v1)[0]);
const barra = () => p.getByRole("region", { name: "Andamento da OS", exact: true });
function passou(cenario) {
  resultados.push({ cenario, ok: true });
  console.log("PASS", cenario);
}
async function visivel(nome) {
  const box = await botao(nome).boundingBox();
  assert(
    box &&
      box.y >= 0 &&
      box.x >= 0 &&
      box.height >= 43 &&
      box.y + box.height <= p.viewportSize().height &&
      box.x + box.width <= p.viewportSize().width + 1,
    `Ação visível sem rolar: ${nome}`,
  );
  assert(
    await p
      .getByRole("dialog", { name: "Ordem de serviço #1", exact: true })
      .evaluate((d) => d.scrollWidth <= d.clientWidth + 1),
    "Sem rolagem horizontal",
  );
}
async function abrir(width, tema = "escuro", perfil = "retifica") {
  await ctx?.close();
  ctx = await browser.newContext({
    viewport: { width, height: 900 },
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  });
  p = await ctx.newPage();
  p.setDefaultTimeout(12000);
  p.on("pageerror", (e) => erros.push(e.message));
  await p.goto(`${base}?perfil=${perfil}&tema=${tema}`);
  await p.getByRole("combobox", { name: "Cliente", exact: true }).click();
  await p
    .getByRole("option", { name: "Informar cliente sem cadastrar", exact: true })
    .click();
  await p.getByLabel("Nome do cliente", { exact: true }).fill("Cliente QA — andamento");
  if (perfil === "retifica") {
    await p.getByLabel("Carro", { exact: true }).fill("Fiat Palio");
    await p.getByLabel("Motor", { exact: true }).fill("Fire 1.0");
  } else {
    await botao("Novo veículo").click();
    await p.getByLabel("Nome / modelo do veículo", { exact: true }).fill("Veículo QA");
    await botao("Cadastrar e selecionar").click();
  }
  await botao("Serviço ou peça avulsa").click();
  await p
    .getByLabel("Nome do serviço ou peça", { exact: true })
    .fill("Revisão de teste");
  await p.getByLabel("Preço unitário (R$)", { exact: true }).fill("150");
  await botao("Adicionar serviço").click();
  await botao("Abrir ordem de serviço").click();
  await botao("Iniciar serviço").waitFor();
}
try {
  for (const width of [390, 1366]) {
    await abrir(width);
    await visivel("Iniciar serviço");
    await visivel("Pausar serviço");
    await p.screenshot({ path: resolve(pasta, `inicio-${width}.png`) });
    await botao("Dados do atendimento").click();
    await p
      .getByText("Diagnóstico não registrado neste campo", { exact: true })
      .scrollIntoViewIfNeeded();
    await visivel("Iniciar serviço");
    await visivel("Pausar serviço");
    await p.screenshot({ path: resolve(pasta, `rolagem-${width}.png`) });
    passou(`${width}px: avançar e pausar no primeiro quadro e fixos durante a rolagem`);

    await botao("Pausar serviço").click();
    await p
      .getByRole("combobox", { name: "Motivo da pausa", exact: true })
      .selectOption("parts");
    await p
      .getByLabel("Detalhes (opcional)", { exact: true })
      .fill("Aguardando a peça do fornecedor");
    await botao("Confirmar pausa").click();
    await botao("Retomar serviço").waitFor();
    assert.equal((await os()).paradas.filter((x) => !x.encerrado_em).length, 1);
    assert.equal((await os()).situacao, "open");
    assert.equal(await botao("Iniciar serviço").count(), 0);
    const id = (await os()).id;
    await p.goto(base + "?os=" + id);
    await botao("Retomar serviço").waitFor();
    await p.getByText("Ver motivo da pausa", { exact: true }).click();
    assert((await barra().innerText()).includes("Aguardando a peça do fornecedor"));
    await p.screenshot({ path: resolve(pasta, `pausada-${width}.png`) });
    await botao("Retomar serviço").click();
    await botao("Iniciar serviço").waitFor();
    assert((await os()).paradas.every((x) => x.encerrado_em));
    passou(`${width}px: pausa persiste ao reabrir; motivo e retomada no cabeçalho`);

    await botao("Iniciar serviço").click();
    await botao("Conferir serviço").waitFor();
    assert.equal((await os()).situacao, "in_progress");
    await botao("Conferir serviço").click();
    await botao("Concluir serviço").waitFor();
    assert.equal((await os()).situacao, "quality_check");
    await botao("Concluir serviço").click();
    const aviso = p.getByRole("dialog", {
      name: "Avisar o cliente que está pronto?",
      exact: true,
    });
    await aviso.getByRole("button", { name: "Fechar janela", exact: true }).click();
    await botao("Registrar entrega").waitFor();
    assert.equal((await os()).situacao, "ready");
    assert((await os()).itens.every((i) => i.situacao === "done"));
    assert.equal(await botao("Pausar serviço").count(), 0);
    assert.equal(
      await p
        .getByRole("dialog", { name: "Como ficou o pagamento da OS?", exact: true })
        .count(),
      0,
    );
    passou(
      `${width}px: iniciar, conferir e concluir em um clique por etapa, sem pagamento antecipado`,
    );

    await botao("Registrar entrega").click();
    await botao("Confirmar alteração").click();
    await p
      .getByRole("dialog", { name: "Como ficou o pagamento da OS?", exact: true })
      .waitFor();
    assert.equal((await os()).situacao, "delivered");
    await botao("Agora não").click();
    assert.equal(await barra().count(), 0);
    assert.equal(await botao("Pausar serviço").count(), 0);
    passou(
      `${width}px: entrega mantém confirmação e abre pagamento; OS encerrada sem ações de execução`,
    );
  }
  for (const width of [360, 768]) {
    await abrir(width, "claro", "mecanica");
    await visivel("Iniciar serviço");
    await visivel("Pausar serviço");
    await p.screenshot({ path: resolve(pasta, `claro-${width}.png`) });
    passou(`${width}px: cabeçalho claro, mecânica, ações legíveis e sem estouro`);
  }
  await abrir(390);
  await botao("Pausar serviço").click();
  await p.evaluate(() => {
    window.qaFalhaSalvar = true;
  });
  await botao("Confirmar pausa").click();
  await p
    .getByRole("dialog", { name: "Pausar serviço", exact: true })
    .getByRole("alert")
    .waitFor();
  assert.equal((await os()).paradas.length, 0);
  await p.evaluate(() => {
    window.qaFalhaSalvar = false;
  });
  await botao("Confirmar pausa").click();
  await botao("Retomar serviço").waitFor();
  assert.equal((await os()).paradas.length, 1);
  passou("Falha ao pausar mantém formulário e permite nova tentativa sem duplicação");
  await botao("Retomar serviço").click();
  await botao("Iniciar serviço").waitFor();
  await p.evaluate(() => {
    const lista = JSON.parse(localStorage.patio_os_v1);
    lista[0].revisao++;
    localStorage.patio_os_v1 = JSON.stringify(lista);
  });
  await botao("Iniciar serviço").click();
  await p.getByRole("alert").waitFor();
  assert.equal((await os()).situacao, "open");
  await botao("Iniciar serviço").click();
  await botao("Conferir serviço").waitFor();
  assert.equal((await os()).situacao, "in_progress");
  passou("Revisão alterada é recusada, atualizada e permite tentar novamente");
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
  await new Promise((ok) => server.httpServer.close(ok));
  await writeFile(
    resolve(pasta, "resultados.json"),
    JSON.stringify(
      {
        ok: !process.exitCode,
        resultados,
        erros,
        ambiente: "Demonstração local, sem alterar registros reais",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ ok: !process.exitCode, cenarios: resultados.length }));
}
