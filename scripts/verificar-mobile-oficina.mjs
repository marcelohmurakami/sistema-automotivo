import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build, preview } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright";
const pasta = resolve("output/mobile-oficina-20261123");
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
    rollupOptions: { input: "scripts/fixtures/mobile-oficina.html" },
  },
};
if (!process.argv.includes("--sem-build")) await build(config);
const server = await preview({ ...config, preview: { port: 0, host: "127.0.0.1" } });
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "pt-BR",
  timezoneId: "America/Sao_Paulo",
  hasTouch: true,
});
await ctx.addInitScript(() => {
  window.qaShares = [];
  Object.defineProperty(navigator, "canShare", {
    configurable: true,
    value: () => true,
  });
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: async (d) => {
      window.qaShares.push({
        names: d.files.map((f) => f.name),
        sizes: d.files.map((f) => f.size),
        text: d.text,
      });
    },
  });
});
const p = await ctx.newPage(),
  resultados = [],
  erros = [];
p.setDefaultTimeout(15000);
p.on("pageerror", (e) => erros.push(e.message));
const pass = (cenario, dados = {}) => {
  resultados.push({ cenario, ok: true, ...dados });
  console.log("PASS", cenario);
};
const url = (rota = "/", tema = "escuro") =>
  server.resolvedUrls.local[0] +
  "scripts/fixtures/mobile-oficina.html?" +
  new URLSearchParams({ rota, tema });
async function abrir(rota, tema) {
  await p.goto(url(rota, tema), { waitUntil: "domcontentloaded" });
}
async function largura() {
  assert(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    "Página com overflow",
  );
  for (const d of await p.locator("dialog[open]").all())
    assert(
      await d.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      "Modal com overflow",
    );
}
try {
  for (const tema of ["claro", "escuro"])
    for (const width of [320, 390, 768, 1920]) {
      await p.setViewportSize({ width, height: width >= 768 ? 1080 : 844 });
      await abrir("/", tema);
      await p.locator(".quadro").waitFor();
      assert.equal(await p.locator(".cartao-veiculo").count(), 5);
      assert.equal(await p.locator(".mapa-etapa-cartao").count(), 5);
      assert(
        await p
          .locator(".mapa-etapa-cartao.execucao")
          .evaluate(
            (e) =>
              getComputedStyle(e).color ===
              getComputedStyle(e.closest(".cartao-veiculo")).color,
          ),
        "Etapa deve manter contraste do texto, mesmo com CSS global",
      );
      assert.equal(
        await p
          .getByRole("button", { name: "Visualizar em quadro", exact: true })
          .getAttribute("aria-pressed"),
        "true",
      );
      await largura();
      if (width === 390)
        await p.screenshot({
          path: resolve(pasta, `mapa-${tema}.png`),
          fullPage: true,
        });
      pass(`Mapa padrão e etapas ${tema} ${width}`);
      for (const [rota, seletor] of [
        ["/ordens-servico", ".registro-os"],
        ["/orcamentos", ".linha-proposta"],
        ["/estoque", ".linha-estoque"],
        ["/clientes", ".linha-cliente"],
        ["/catalogo", ".catalogo-card"],
      ]) {
        await abrir(rota, tema);
        await p.locator(seletor).first().waitFor();
        await largura();
        if (width < 760) {
          assert.equal(
            await p
              .locator(seletor)
              .first()
              .evaluate((e) => getComputedStyle(e).borderRadius),
            "16px",
          );
        }
        if (width === 390)
          await p.screenshot({
            path: resolve(pasta, `${rota.slice(1)}-${tema}.png`),
            fullPage: true,
          });
        pass(`Lista ${rota} ${tema} ${width}`);
      }
      await abrir("/ordens-servico", tema);
      await p.locator(".linha-ordem-servico").first().click();
      await p.locator(".os-cabecalho-resumo").waitFor();
      await largura();
      for (const tab of ["Serviços", "Fotos", "Lucro e custos", "Resumo"]) {
        await p.getByRole("button", { name: tab, exact: true }).click();
        await largura();
      }
      if (width === 390)
        await p.screenshot({
          path: resolve(pasta, `detalhe-os-${tema}.png`),
          fullPage: true,
        });
      pass(`Detalhes e abas OS ${tema} ${width}`);
    }
  await p.setViewportSize({ width: 390, height: 844 });
  await abrir("/ordens-servico");
  await p.locator(".linha-ordem-servico").first().click();
  await p
    .getByRole("button", { name: "Compartilhar no WhatsApp", exact: true })
    .click();
  let share = p.getByRole("dialog", { name: /Compartilhar OS/ });
  await share.getByRole("button", { name: "Compartilhar PDF", exact: true }).waitFor();
  await share.getByLabel("WhatsApp do cliente").fill("123");
  await share.getByRole("button", { name: "Compartilhar PDF", exact: true }).click();
  await share.getByRole("alert").waitFor();
  assert.equal(await p.evaluate(() => qaShares.length), 0);
  await share.getByLabel("WhatsApp do cliente").fill("11999991234");
  assert(
    (
      await share
        .getByRole("link", { name: "Abrir conversa", exact: true })
        .getAttribute("href")
    ).startsWith("https://wa.me/5511999991234?"),
  );
  await share.getByRole("button", { name: "Compartilhar PDF", exact: true }).click();
  assert(await p.evaluate(() => qaShares[0]?.sizes[0] > 1000));
  await largura();
  pass("WhatsApp valida número e compartilha PDF real sem envio externo");
  await p.screenshot({ path: resolve(pasta, "whatsapp-mobile.png") });
  await p.evaluate(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        throw new DOMException("Cancelado", "AbortError");
      },
    });
  });
  await share.getByRole("button", { name: "Compartilhar PDF", exact: true }).click();
  assert.equal(await share.getByRole("alert").count(), 0);
  assert(
    await share
      .getByRole("button", { name: "Compartilhar PDF", exact: true })
      .isEnabled(),
  );
  pass("Cancelar compartilhamento nativo permite tentar novamente, sem erro falso");
  const registrada = await p.evaluate(() => {
    const ordens = JSON.parse(localStorage.patio_os_v1);
    const ordem = ordens.find((o) => o.numero === 904);
    ordem.cliente_id = "qa-cliente-compartilhamento";
    localStorage.setItem(
      "patio_clientes_demo_v1",
      JSON.stringify([
        {
          id: ordem.cliente_id,
          nome: ordem.dados_cliente.nome,
          telefone_e164: "+5511988884321",
          tipo: "pessoa_fisica",
          revisao: 1,
          arquivado_em: null,
        },
      ]),
    );
    localStorage.setItem("patio_os_v1", JSON.stringify(ordens));
    return ordem.id;
  });
  await abrir("/ordens-servico?os=" + registrada);
  await p.evaluate(() => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => false,
    });
    window.qaOpened = [];
    window.open = (url) => {
      window.qaOpened.push(url);
      return null;
    };
  });
  await p
    .getByRole("button", { name: "Compartilhar no WhatsApp", exact: true })
    .click();
  share = p.getByRole("dialog", { name: /Compartilhar OS/ });
  await share
    .getByRole("button", { name: "Baixar PDF e abrir WhatsApp", exact: true })
    .waitFor();
  assert.equal(
    await share.getByLabel("WhatsApp do cliente").inputValue(),
    "+5511988884321",
  );
  const download = p.waitForEvent("download");
  await share
    .getByRole("button", { name: "Baixar PDF e abrir WhatsApp", exact: true })
    .click();
  assert.equal((await download).suggestedFilename(), "OS-904.pdf");
  assert(
    (await p.evaluate(() => window.qaOpened[0])).startsWith(
      "https://wa.me/5511988884321?",
    ),
  );
  pass(
    "Alternativa baixa PDF e abre o número atualizado do cadastro, sem envio externo",
  );
  await abrir("/ordens-servico");
  await p.getByRole("button", { name: "Nova OS", exact: true }).click();
  await p.getByRole("combobox", { name: "Cliente", exact: true }).click();
  await p
    .getByRole("option", { name: "Informar cliente sem cadastrar", exact: true })
    .click();
  await p
    .getByLabel("Nome do cliente", { exact: true })
    .fill("QA Foto capturada mobile");
  await p.getByLabel("Carro", { exact: true }).fill("Fiat Palio");
  await p.getByLabel("Motor", { exact: true }).fill("Fire");
  const adicionaisFotos = p.locator(".os-informacoes-adicionais");
  assert.equal(await adicionaisFotos.evaluate((e) => e.open), false);
  assert.equal(await p.locator(".fotos-criacao-os").isVisible(), false);
  await adicionaisFotos.locator(":scope > summary").click();
  const imagem = {
    name: "foto-qa.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      await p.evaluate(() => {
        const c = document.createElement("canvas");
        c.width = 200;
        c.height = 100;
        const x = c.getContext("2d");
        x.fillStyle = "#369";
        x.fillRect(0, 0, 200, 100);
        return c.toDataURL().split(",")[1];
      }),
      "base64",
    ),
  };
  await p
    .getByLabel("Tirar foto do atendimento", { exact: true })
    .setInputFiles(imagem);
  await p.getByRole("img", { name: "Foto do atendimento 1", exact: true }).waitFor();
  await adicionaisFotos.locator(":scope > summary").click();
  assert.equal(await p.locator(".fotos-criacao-os").isVisible(), false);
  await adicionaisFotos.locator(":scope > summary").click();
  assert(
    await p
      .getByRole("img", { name: "Foto do atendimento 1", exact: true })
      .isVisible(),
  );
  await adicionaisFotos.locator(":scope > summary").click();
  await p.getByRole("button", { name: "Abrir ordem de serviço", exact: true }).click();
  await p.locator(".os-cabecalho-resumo").waitFor();
  await p.getByRole("button", { name: "Fotos", exact: true }).click();
  await p
    .getByRole("img", { name: "Foto registrada na criação da OS", exact: true })
    .waitFor();
  const criada = await p.evaluate(() =>
    JSON.parse(localStorage.patio_os_v1).find(
      (x) => x.dados_cliente.nome === "QA Foto capturada mobile",
    ),
  );
  assert.equal(criada.fotos.length, 1);
  await abrir("/ordens-servico?os=" + criada.id);
  await p.getByRole("button", { name: "Fotos", exact: true }).click();
  await p
    .getByRole("img", { name: "Foto registrada na criação da OS", exact: true })
    .waitFor();
  pass(
    "Fotos começam recolhidas; selecionar, recolher, salvar e reabrir preserva imagem",
  );
  await p.getByRole("button", { name: "Editar OS", exact: true }).click();
  await p
    .getByText("Informações adicionais do atendimento (opcional)", { exact: true })
    .click();
  await p
    .getByText("Relato do cliente e preenchimento por voz ou foto (opcional)", {
      exact: true,
    })
    .click();
  await p.getByText("Preencher por voz ou foto", { exact: true }).click();
  await p
    .getByLabel("Foto para leitura assistida", { exact: true })
    .setInputFiles(imagem);
  await p
    .getByText("Esta foto também será anexada à OS ao salvar.", { exact: true })
    .waitFor();
  await p.getByRole("button", { name: "Salvar alterações da OS", exact: true }).click();
  await p.locator(".os-cabecalho-resumo").waitFor();
  await p.getByRole("button", { name: "Fotos", exact: true }).click();
  await p
    .getByRole("img", {
      name: "Foto da leitura assistida na criação da OS",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await p.evaluate(
      (id) =>
        JSON.parse(localStorage.patio_os_v1).find((o) => o.id === id).fotos.length,
      criada.id,
    ),
    2,
  );
  pass(
    "Foto da leitura assistida também aparece nos detalhes, sem substituir a anterior",
  );
  for (const width of [390, 1920]) {
    await p.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
    await abrir("/financeiro?aba=recorrencias");
    await p
      .getByRole("button", {
        name: "Registrar pagamento de Aluguel mensal neste mês",
        exact: true,
      })
      .click();
    const modal = p.getByRole("dialog", { name: "Registrar pagamento", exact: true });
    await modal.waitFor();
    await largura();
    assert(
      await modal
        .getByRole("button", { name: "Confirmar registro", exact: true })
        .isEnabled(),
    );
    pass(`Conta mensal fixa abre pagamento direto ${width}`);
  }
  await p
    .getByRole("dialog", { name: "Registrar pagamento", exact: true })
    .getByRole("button", { name: "Confirmar registro", exact: true })
    .click();
  await p
    .getByRole("dialog", { name: "Registrar pagamento", exact: true })
    .waitFor({ state: "hidden" });
  const baixas = await p.evaluate(
    () => JSON.parse(localStorage.patio_financeiro_v1).baixas,
  );
  assert.equal(baixas.length, 1);
  assert.equal(baixas[0].valor_centavos, 150000);
  await abrir("/financeiro?aba=recorrencias");
  await p
    .getByRole("button", {
      name: "Registrar pagamento de Aluguel mensal neste mês",
      exact: true,
    })
    .click();
  await p
    .getByText("Esta conta já foi quitada, cancelada ou não está mais disponível.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await p.getByRole("dialog", { name: "Registrar pagamento", exact: true }).count(),
    0,
  );
  pass("Pagamento fixa grava valor correto e impede nova baixa de conta quitada");
  await abrir("/financeiro?aba=recorrencias");
  await p
    .getByRole("button", {
      name: "Registrar pagamento de Água mensal neste mês",
      exact: true,
    })
    .click();
  await p.getByRole("dialog", { name: "Informar valor do mês", exact: true }).waitFor();
  await p.getByLabel("Valor deste mês", { exact: true }).fill("87.45");
  await p
    .getByRole("button", { name: "Salvar valor e registrar", exact: true })
    .click();
  await p.getByRole("dialog", { name: "Registrar pagamento", exact: true }).waitFor();
  await p.getByRole("button", { name: "Confirmar registro", exact: true }).click();
  await p
    .getByRole("dialog", { name: "Registrar pagamento", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(
    await p.evaluate(
      () => JSON.parse(localStorage.patio_financeiro_v1).baixas.at(-1).valor_centavos,
    ),
    8745,
  );
  pass("Conta variável informa valor e abre confirmação, sem pagamento automático");
  assert.deepEqual(erros, []);
} catch (e) {
  process.exitCode = 1;
  console.error(e.stack);
  console.log(
    JSON.stringify(
      await p.evaluate(() =>
        [...document.querySelectorAll("dialog[open],dialog[open] *")]
          .filter((e) => e.clientWidth && e.scrollWidth > e.clientWidth + 1)
          .map((e) => ({
            tag: e.tagName,
            cl: e.className,
            w: e.clientWidth,
            sw: e.scrollWidth,
            text: e.textContent.slice(0, 90),
          })),
      ),
    ),
  );
  await p.screenshot({ path: resolve(pasta, "falha.png"), fullPage: true });
  await writeFile(resolve(pasta, "falha.txt"), await p.locator("body").innerText());
} finally {
  await writeFile(
    resolve(pasta, "resultados.json"),
    JSON.stringify(
      {
        ok: !process.exitCode,
        resultados,
        erros,
        metodo:
          "Componentes reais em Chromium, dados fictícios em modo demonstração; seleção de câmera emulada por arquivo, compartilhamento nativo interceptado sem envio.",
      },
      null,
      2,
    ),
  );
  await browser.close();
  await new Promise((ok) => server.httpServer.close(ok));
  console.log(
    JSON.stringify({ ok: !process.exitCode, cenarios: resultados.length, erros }),
  );
}
