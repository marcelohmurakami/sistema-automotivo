import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build, preview } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright";

const pasta = resolve(process.env.QA_OUTPUT || "output/pagamento-na-entrega-20261124");
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
const pergunta = () =>
  p.getByRole("dialog", { name: "Como ficou o pagamento da OS?", exact: true });
const financeiro = () =>
  p.evaluate(() =>
    JSON.parse(
      localStorage.getItem("patio_financeiro_v1") || '{"titulos":[],"baixas":[]}',
    ),
  );
async function iniciar(width, extra = "") {
  await ctx?.close();
  ctx = await browser.newContext({
    viewport: { width, height: 900 },
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  });
  p = await ctx.newPage();
  p.setDefaultTimeout(15000);
  p.on("pageerror", (e) => erros.push(e.message));
  await p.goto(base + "?" + extra);
  await p.locator("dialog[open]").first().waitFor();
}
async function preencher() {
  await p.getByRole("combobox", { name: "Cliente", exact: true }).click();
  await p
    .getByRole("option", { name: "Informar cliente sem cadastrar", exact: true })
    .click();
  await p
    .getByLabel("Nome do cliente", { exact: true })
    .fill("QA Pagamento somente na entrega");
  if (await p.getByLabel("Carro", { exact: true }).count()) {
    await p.getByLabel("Carro", { exact: true }).fill("Fiat Palio");
    await p.getByLabel("Motor", { exact: true }).fill("Fire 1.0");
  } else {
    await p.getByRole("button", { name: "Novo veículo", exact: true }).click();
    await p
      .getByLabel("Nome / modelo do veículo", { exact: true })
      .fill("Fiat Palio QA");
    await p
      .getByRole("button", { name: "Cadastrar e selecionar", exact: true })
      .click();
  }
  await p.getByRole("button", { name: "Item avulso", exact: true }).click();
  await p.getByLabel("Nome do serviço ou peça", { exact: true }).fill("Revisão QA");
  await p.getByLabel("Preço unitário (R$)", { exact: true }).fill("150");
  await p.getByRole("button", { name: "Adicionar serviço", exact: true }).click();
}
async function marcarPronta() {
  if (
    !(await p
      .getByLabel("Sim · salvar como pronto e imprimir", { exact: true })
      .isVisible())
  )
    await p.locator(".documento-mais-opcoes > summary").click();
  await p.getByLabel("Sim · salvar como pronto e imprimir", { exact: true }).check();
}
async function salvar(pronta = true, numero = 1, imprime = true) {
  if (pronta) await marcarPronta();
  await p
    .getByRole("button", {
      name: pronta ? "Salvar como pronto e imprimir" : "Abrir ordem de serviço",
      exact: true,
    })
    .click();
  await p
    .getByRole("dialog", { name: `Ordem de serviço #${numero}`, exact: true })
    .waitFor();
  if (pronta && imprime) {
    await p.waitForFunction((n) => window.qaImpressaoIniciada === n, numero);
    const nota = await p.evaluate(() => window.qaImpressoes.at(-1));
    assert(nota.texto.includes("QA Pagamento somente na entrega"));
    assert(nota.texto.includes("150,00"));
  }
  assert.equal(await pergunta().count(), 0);
  assert(
    !(await p.evaluate(() => window.qaDialogos)).includes(
      "Como ficou o pagamento da OS?",
    ),
  );
  assert.equal((await financeiro()).baixas.length, 0);
}
async function mapa() {
  await p.goto(base + "?mapa");
  await p
    .getByRole("button", { name: "Entregar OS 1 para Entregue", exact: true })
    .waitFor();
}
async function entregar() {
  await p
    .getByRole("button", { name: "Entregar OS 1 para Entregue", exact: true })
    .click();
  await p.waitForFunction(
    () => JSON.parse(localStorage.patio_os_v1)[0].situacao === "delivered",
  );
  await pergunta().getByRole("button", { name: "Já recebi", exact: false }).waitFor();
}
function passou(cenario) {
  resultados.push({ cenario, ok: true });
  console.log("PASS", cenario);
}
try {
  if (!process.argv.includes("--servicos") && !process.argv.includes("--extras"))
    for (const width of [390, 1366])
      for (const perfil of ["retifica", "mecanica"])
        for (const modo of ["total", "parcial", "prazo", "adiar"]) {
          await iniciar(width, "perfil=" + perfil);
          await preencher();
          await salvar();
          await mapa();
          await entregar();
          assert.equal((await financeiro()).baixas.length, 0);
          assert.equal(
            await p.evaluate(() => window.qaImpressaoIniciada),
            0,
            "Entregar não imprime novamente",
          );
          assert(
            await p.evaluate(() =>
              [...document.querySelectorAll("dialog[open]")].every(
                (d) => d.scrollWidth <= d.clientWidth + 1,
              ),
            ),
          );
          if (modo === "adiar")
            await pergunta()
              .getByRole("button", { name: "Agora não", exact: true })
              .click();
          else {
            await pergunta()
              .getByRole("button", {
                name:
                  modo === "total"
                    ? "Já recebi"
                    : modo === "parcial"
                      ? "Recebi uma parte"
                      : "A receber",
                exact: false,
              })
              .click();
            if (modo === "prazo") {
              await p.getByLabel("Receber em", { exact: true }).fill("2026-12-24");
              await p
                .getByRole("button", { name: "Salvar data combinada", exact: true })
                .click();
            } else {
              await p
                .getByLabel("Valor pago (R$)", { exact: true })
                .fill(modo === "total" ? "150" : "50");
              if (modo === "parcial")
                await p
                  .getByLabel("Vencimento do restante", { exact: true })
                  .fill("2026-12-24");
              await p
                .getByRole("button", { name: "Confirmar pagamento", exact: true })
                .click();
            }
            await p
              .getByRole("dialog", { name: "Financeiro atualizado", exact: true })
              .getByRole("button", { name: "Concluir", exact: true })
              .click();
          }
          const f = await financeiro();
          assert.equal(
            f.baixas.reduce((s, b) => s + b.valor_centavos, 0),
            modo === "total" ? 15000 : modo === "parcial" ? 5000 : 0,
          );
          assert.equal(f.titulos.length, 1);
          if (["parcial", "prazo"].includes(modo))
            assert.equal(f.titulos[0].vencimento, "2026-12-24");
          await p.reload();
          await p
            .getByRole("button", { name: "Conferir entrega QA", exact: true })
            .click();
          if (modo === "adiar")
            await pergunta()
              .getByRole("button", { name: "Já recebi", exact: false })
              .waitFor();
          else {
            await p
              .getByText("Conferindo o pagamento já registrado…", { exact: true })
              .waitFor({ state: "hidden" });
            assert.equal(await pergunta().count(), 0);
          }
          assert.deepEqual((await financeiro()).baixas, f.baixas);
          if (perfil === "retifica" && modo === "adiar")
            await p.screenshot({ path: resolve(pasta, `entrega-${width}.png`) });
          passou(
            `${perfil} ${width}px: pronta imprime sem pagamento; entrega ${modo}; reabertura sem duplicação`,
          );
        }
  if (!process.argv.includes("--servicos")) {
    for (const width of [390, 1366]) {
      await iniciar(width);
      await preencher();
      await salvar(false);
      assert.equal(await p.evaluate(() => window.qaJanelas), 0);
      await p
        .getByRole("dialog", { name: "Ordem de serviço #1", exact: true })
        .getByRole("button", { name: "Fechar janela", exact: true })
        .click();
      await p.getByRole("link", { name: "Mapa QA", exact: true }).click();
      for (const etapa of ["Em execução", "Conferência"]) {
        await p
          .getByRole("button", { name: `Avançar OS 1 para ${etapa}`, exact: true })
          .click();
      }
      await p
        .getByRole("button", { name: "Concluir serviço da OS 1", exact: true })
        .click();
      await p
        .getByRole("button", { name: "Entregar OS 1 para Entregue", exact: true })
        .waitFor();
      assert.equal(await pergunta().count(), 0);
      assert.equal((await financeiro()).baixas.length, 0);
      await p
        .getByRole("dialog", { name: "Avisar o cliente que está pronto?", exact: true })
        .getByRole("button", { name: "Fechar janela", exact: true })
        .click();
      await entregar();
      passou(`${width}px: transições de etapas só perguntam na entrega`);

      await iniciar(width);
      await preencher();
      await salvar();
      const id = await p.evaluate(() => JSON.parse(localStorage.patio_os_v1)[0].id);
      await p.goto(base + "?os=" + id);
      await p
        .getByRole("dialog", { name: "Ordem de serviço #1", exact: true })
        .getByRole("button", { name: "Registrar entrega", exact: true })
        .click();
      await p.getByRole("button", { name: "Confirmar alteração", exact: true }).click();
      await pergunta().getByRole("button", { name: "Já recebi", exact: false }).click();
      await p.evaluate(() => {
        window.qaFalhaPagamento = true;
      });
      await p.getByRole("button", { name: "Confirmar pagamento", exact: true }).click();
      await p
        .getByRole("dialog", { name: "Registrar recebimento", exact: true })
        .getByRole("alert")
        .waitFor();
      assert.equal((await financeiro()).baixas.length, 0);
      await p.evaluate(() => {
        window.qaFalhaPagamento = false;
      });
      await p.getByRole("button", { name: "Confirmar pagamento", exact: true }).click();
      await p
        .getByRole("dialog", { name: "Financeiro atualizado", exact: true })
        .waitFor();
      assert.equal((await financeiro()).baixas.length, 1);
      passou(`${width}px: entrega nos detalhes e recuperação de erro sem duplicação`);
    }
    for (const permissao of ["staff", "semFinanceiro"]) {
      await iniciar(1366, permissao);
      await preencher();
      await salvar();
      passou(`Impressão direta preservada: ${permissao}`);
    }
    await iniciar(1366, "bloqueado");
    await preencher();
    await salvar(true, 1, false);
    await p
      .getByText(
        "OS salva como pronta. Não foi possível abrir a impressão; use Imprimir nota da OS ou Visualizar / PDF.",
        { exact: true },
      )
      .waitFor();
    assert.equal(await p.evaluate(() => window.qaImpressaoIniciada), 0);
    passou("Popup bloqueado preserva OS e oferece reimpressão sem abrir pagamento");
    await iniciar(1366);
    await preencher();
    await p.evaluate(() => {
      window.qaFalhaSalvar = true;
    });
    await marcarPronta();
    await p
      .getByRole("button", { name: "Salvar como pronto e imprimir", exact: true })
      .click();
    await p
      .getByRole("dialog", { name: "Nova ordem de serviço", exact: true })
      .getByRole("alert")
      .waitFor();
    assert.equal(await p.evaluate(() => window.qaImpressaoIniciada), 0);
    assert.equal(await pergunta().count(), 0);
    await p.evaluate(() => {
      window.qaFalhaSalvar = false;
    });
    await salvar();
    passou(
      "Falha ao salvar fecha janela reservada; nova tentativa imprime sem pagamento",
    );
  }
  if (!process.argv.includes("--extras"))
    for (const width of [390, 1366])
      for (const perfil of [
        "assistencia_celulares",
        "manutencao_climatizacao",
        "limpeza_residencial",
      ]) {
        await iniciar(width, "perfil=" + perfil);
        const assistencia = perfil.startsWith("assistencia"),
          objeto = assistencia
            ? "equipamento"
            : perfil.startsWith("manutencao")
              ? "local / equipamento"
              : "local";
        await p.getByRole("button", { name: "Novo cliente", exact: true }).click();
        await p
          .getByLabel("Nome do novo cliente", { exact: true })
          .fill("QA Pagamento somente na entrega");
        await p
          .getByRole("button", { name: "Cadastrar e selecionar", exact: true })
          .click();
        await p.getByLabel(`Nome do ${objeto}`, { exact: true }).fill("Atendimento QA");
        if (!assistencia)
          await p
            .getByLabel("Endereço completo", { exact: true })
            .fill("Rua de testes, 10");
        await p
          .getByRole("button", { name: "Cadastrar e selecionar", exact: true })
          .click();
        await p.getByRole("button", { name: "Item avulso", exact: true }).click();
        await p.getByLabel(/^Nome do serviço ou /).fill("Revisão QA");
        await p.getByLabel("Preço unitário (R$)", { exact: true }).fill("150");
        await p.getByRole("button", { name: "Adicionar serviço", exact: true }).click();
        await marcarPronta();
        await p
          .getByRole("button", { name: "Salvar como pronto e imprimir", exact: true })
          .click();
        await p.waitForFunction(() => window.qaImpressaoIniciada === 1);
        const nota = await p.evaluate(() => window.qaImpressoes[0]);
        assert(nota.texto.includes("QA Pagamento somente na entrega"));
        assert(nota.texto.includes("150,00"));
        assert.equal(await pergunta().count(), 0);
        assert.equal((await financeiro()).baixas.length, 0);
        const id = await p.evaluate(
          () =>
            JSON.parse(localStorage.getItem("patio_servicos:demo")).atendimentos.find(
              (a) => a.situacao === "concluido",
            ).id,
        );
        await p.goto(base + "?perfil=" + perfil + "&detalhe=" + id);
        if (assistencia) {
          await p
            .getByRole("button", { name: "Registrar retirada", exact: true })
            .click();
          await p
            .getByRole("button", { name: "Confirmar retirada", exact: true })
            .click();
        } else {
          await p
            .getByRole("button", {
              name: "Registrar conferência / aceite",
              exact: true,
            })
            .click();
          await p
            .getByLabel("Quem conferiu o serviço?", { exact: true })
            .fill("Cliente QA");
          await p
            .getByRole("button", { name: "Salvar conferência", exact: true })
            .click();
        }
        await pergunta()
          .getByRole("button", { name: "Já recebi", exact: false })
          .click();
        await p
          .getByRole("button", { name: "Confirmar pagamento", exact: true })
          .click();
        await p
          .getByRole("dialog", { name: "Financeiro atualizado", exact: true })
          .waitFor();
        assert.equal((await financeiro()).baixas.length, 1);
        assert.equal((await financeiro()).baixas[0].valor_centavos, 15000);
        passou(
          `${perfil} ${width}px: imprime ao concluir; pagamento somente na entrega ou aceite`,
        );
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
  await new Promise((ok) => server.httpServer.close(ok));
  await writeFile(
    resolve(
      pasta,
      process.argv.includes("--servicos")
        ? "resultado-servicos.json"
        : process.argv.includes("--extras")
          ? "resultado-extras.json"
          : "resultado.json",
    ),
    JSON.stringify(
      {
        ok: !process.exitCode,
        resultados,
        erros,
        ambiente: "Demonstração isolada; nenhuma alteração em clientes reais",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ ok: !process.exitCode, cenarios: resultados.length }));
}
