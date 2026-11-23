import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
const root = resolve("output/os-velocidade-20261116"),
  fase = process.env.QA_FASE || "antes",
  out = resolve(process.env.QA_OUTPUT || resolve(root, fase + "-consulta")),
  base = "https://patio-gestao-peach.vercel.app";
await mkdir(out, { recursive: true });
const health = await fetch(base + "/health.json?qa=" + Date.now()).then((r) =>
  r.json(),
);
assert.equal(health.build, process.env.QA_EXPECTED_BUILD);
const docs = JSON.parse(
    await readFile(process.env.QA_OS_FONTE || resolve(root, "antes-completo/resultados.json"), "utf8"),
  ).documentos,
  contas = JSON.parse(
    await readFile("output/contas-teste/20261019/credenciais.local.json", "utf8"),
  ).contas.filter((c) => c.ramo === "automotivo");
const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  }),
  resultados = [],
  erros = [];
try {
  for (const c of contas) {
    assert(c.empresa.startsWith("ZZ [TESTE 20261019] "));
    const ctx = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        locale: "pt-BR",
        serviceWorkers: "block",
      }),
      p = await ctx.newPage();
    p.setDefaultTimeout(25000);
    p.on("pageerror", (e) => erros.push(e.message));
    const btn = (name) => p.getByRole("button", { name, exact: true });
    try {
      await p.goto(base + "/entrar");
      await p.getByLabel("E-mail", { exact: true }).fill(c.email);
      await p.getByLabel("Senha", { exact: true }).fill(c.senha);
      await btn("Entrar no sistema").click();
      await p
        .getByRole("textbox", { name: "Buscar veículo no mapa", exact: true })
        .waitFor();
      for (const [tela, largura] of [
        ["desktop", 1920],
        ["celular", 390],
      ]) {
        await p.setViewportSize({
          width: largura,
          height: tela === "desktop" ? 1080 : 844,
        });
        const doc = docs.find((x) => x.perfil === c.especialidade && x.tela === tela);
        assert(doc?.verificado);
        let os,
          fin,
          cliques = 0;
        const medir = async (nome, fn) => {
          cliques = 0;
          const ini = performance.now();
          await fn();
          const dialog = p.locator("dialog[open]");
          assert(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1));
          assert.equal(await dialog.locator("[role=alert]").count(), 0);
          resultados.push({
            perfil: c.especialidade,
            tela,
            nome,
            segundos: +((performance.now() - ini) / 1000).toFixed(3),
            cliques,
            campos: 0,
            ok: true,
          });
        };
        const clique = async (l) => {
            cliques++;
            await l.click();
          },
          secao = async (v) => {
            cliques++;
            await p.getByLabel("Mais seções da OS", { exact: true }).selectOption(v);
          };
        await medir("Abrir OS por link direto", async () => {
          const ret = p.waitForResponse((r) =>
            r.url().endsWith("/rpc/consultar_ordem_servico"),
          );
          await p.goto(base + "/ordens-servico?os=" + doc.id);
          const r = await ret;
          assert(r.ok());
          os = await r.json();
          await p.locator("dialog[open] .os-resumo-limpo").waitFor();
          assert.equal(os.total_centavos, doc.verificado.total);
        });
        await medir("Consultar aba Serviços", async () => {
          await clique(btn("Serviços"));
          await btn("Incluir, editar ou remover serviços").waitFor();
          assert.equal(await p.locator("dialog[open] .os-item").count(), 12);
        });
        await medir("Consultar aba Fotos", async () => {
          await clique(btn("Fotos"));
          await p
            .getByRole("heading", { name: "Adicionar foto", exact: true })
            .waitFor();
          await p.locator("dialog[open] input[type=file]").waitFor();
        });
        await medir("Consultar lucro e custos", async () => {
          const ret = p.waitForResponse((r) =>
            r.url().endsWith("/rpc/consultar_lucro_documento"),
          );
          await clique(btn("Lucro e custos"));
          const r = await ret;
          assert(r.ok());
          const d = await r.json();
          assert.equal(d.receita, doc.verificado.total);
          assert.equal(d.itens.length, 12);
          await p
            .getByRole("region", { name: "Lucro e custos da OS", exact: true })
            .waitFor();
        });
        await p.screenshot({
          path: resolve(out, c.especialidade + "-" + tela + "-lucro.png"),
        });
        await medir("Consultar dados do atendimento", async () => {
          await secao("detalhes");
          await p
            .getByRole("heading", { name: "Andamento do serviço", exact: true })
            .waitFor();
          assert(
            (await p.locator("dialog[open] .os-conteudo-aba").innerText()).includes(
              os.diagnostico,
            ),
          );
        });
        await medir("Consultar histórico da OS", async () => {
          await secao("historico");
          await p
            .getByRole("heading", { name: "Histórico do atendimento", exact: true })
            .waitFor();
          assert((await p.locator("dialog[open] .os-historico li").count()) > 0);
        });
        await medir("Consultar pagamento da OS", async () => {
          const ret = p.waitForResponse((r) =>
            r.url().endsWith("/rpc/consultar_financeiro_os"),
          );
          await secao("pagamento");
          const r = await ret;
          assert(r.ok());
          fin = await r.json();
          await p
            .getByText("Consultando pagamentos…", { exact: true })
            .waitFor({ state: "hidden" });
          await p.locator("dialog[open] .pagamento-integrado").waitFor();
          assert.equal(fin?.baixado_centavos || 0, 0);
        });
        console.log("PASS consulta", fase, c.especialidade, tela);
      }
    } catch (e) {
      await p.screenshot({ path: resolve(out, c.especialidade + "-falha.png") });
      await writeFile(
        resolve(out, c.especialidade + "-falha.txt"),
        await p.locator("body").innerText(),
      );
      throw e;
    } finally {
      await ctx.close();
    }
  }
  assert.deepEqual(erros, []);
} catch (e) {
  process.exitCode = 1;
  console.error(e.stack);
} finally {
  await browser.close();
  await writeFile(
    resolve(out, "resultados.json"),
    JSON.stringify(
      { ok: !process.exitCode, build: health.build, fase, resultados, erros },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ ok: !process.exitCode, medicoes: resultados.length }));
}
