import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { createServer } from "node:http";
import { chromium } from "playwright";
const root = resolve("output/os-velocidade-20261116"),
  out = resolve(root, "rede-limitada");
await mkdir(out, { recursive: true });
const pacoteAntes = JSON.parse(
    await readFile("output/orcamentos-velocidade-20261113/pacote.json", "utf8"),
  ),
  pacoteDepois = JSON.parse(await readFile(resolve(root, "pacote.json"), "utf8"));
const contas = JSON.parse(
    await readFile("output/contas-teste/20261019/credenciais.local.json", "utf8"),
  ).contas.filter((c) => ["mecanica", "retifica"].includes(c.especialidade)),
  docs = JSON.parse(
    await readFile(resolve(root, "antes-completo/resultados.json"), "utf8"),
  ).documentos;
const servidores = {};
for (const [fase, pacote] of [
  ["antes", pacoteAntes],
  ["depois", pacoteDepois],
]) {
  const dir = resolve(pacote.destino),
    s = createServer(async (req, res) => {
      try {
        const path = new URL(req.url, "http://localhost").pathname;
        const f = resolve(
          dir,
          "." + (extname(path) ? decodeURIComponent(path) : "/index.html"),
        );
        assert(f.startsWith(dir + sep));
        res.setHeader(
          "Content-Type",
          {
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
            ".json": "application/json",
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
  servidores[fase] = {
    s,
    base: "http://127.0.0.1:" + s.address().port,
    build: pacote.build,
  };
}
const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  }),
  resultados = [],
  erros = [];
try {
  for (const c of contas) {
    assert(c.empresa.startsWith("ZZ [TESTE 20261019] "));
    for (const [tela, largura] of [
      ["desktop", 1920],
      ["celular", 390],
    ])
      for (let repeticao = 1; repeticao <= 3; repeticao++)
        for (const fase of repeticao % 2 ? ["antes", "depois"] : ["depois", "antes"]) {
          const ctx = await browser.newContext({
              viewport: { width: largura, height: 900 },
              locale: "pt-BR",
              serviceWorkers: "block",
            }),
            p = await ctx.newPage();
          p.setDefaultTimeout(30000);
          p.on("pageerror", (e) => erros.push(e.message));
          const base = servidores[fase].base,
            doc = docs.find((d) => d.perfil === c.especialidade && d.tela === tela),
            btn = (name) => p.getByRole("button", { name, exact: true });
          try {
            const h = await ctx.request.get(base + "/health.json");
            assert.equal((await h.json()).build, servidores[fase].build);
            await p.goto(base + "/entrar");
            await p.getByLabel("E-mail", { exact: true }).fill(c.email);
            await p.getByLabel("Senha", { exact: true }).fill(c.senha);
            await btn("Entrar no sistema").click();
            await p
              .getByRole("textbox", { name: "Buscar veículo no mapa", exact: true })
              .waitFor();
            await p.goto(base + "/ordens-servico?os=" + doc.id);
            await p.locator("dialog[open] .os-resumo-limpo").waitFor();
            await btn("Editar OS").click();
            await btn("Salvar alterações da OS").waitFor();
            await p
              .locator("textarea[name=resumo_cliente]")
              .fill("QA rede limitada " + fase + " " + repeticao);
            await p.waitForLoadState("networkidle");
            const cdp = await ctx.newCDPSession(p);
            await cdp.send("Network.enable");
            await cdp.send("Network.emulateNetworkConditions", {
              offline: false,
              latency: 250,
              downloadThroughput: 500000,
              uploadThroughput: 125000,
            });
            let consultas = 0;
            p.on("request", (r) => {
              if (r.url().endsWith("/rpc/consultar_ordem_servico")) consultas++;
            });
            const ret = p.waitForResponse((r) =>
                r.url().endsWith("/rpc/salvar_os_com_itens"),
              ),
              inicio = performance.now();
            await btn("Salvar alterações da OS").click();
            const r = await ret;
            assert(r.ok());
            const salvo = await r.json();
            await p.waitForFunction(() => {
              const d = document.querySelector("dialog[open].dialogo-detalhes-os");
              return (
                d &&
                [...d.querySelectorAll("button")].some(
                  (b) => b.textContent.includes("Editar OS") && !b.disabled,
                )
              );
            });
            const segundos = +((performance.now() - inicio) / 1000).toFixed(3);
            assert.equal(salvo.total_centavos, doc.verificado.total);
            assert.equal(salvo.itens.length, 12);
            assert.equal(
              salvo.resumo_cliente,
              "QA rede limitada " + fase + " " + repeticao,
            );
            resultados.push({
              fase,
              perfil: c.especialidade,
              tela,
              repeticao,
              segundos,
              cliques: 1,
              consultas,
              ok: true,
            });
            console.log(
              "PASS rede limitada",
              fase,
              c.especialidade,
              tela,
              repeticao,
              segundos,
            );
          } catch (e) {
            await p.screenshot({ path: resolve(out, "falha.png") });
            throw e;
          } finally {
            await ctx.close();
          }
        }
  }
  assert.deepEqual(erros, []);
} catch (e) {
  process.exitCode = 1;
  console.error(e.stack);
} finally {
  await browser.close();
  await Promise.all(
    Object.values(servidores).map(({ s }) => new Promise((ok) => s.close(ok))),
  );
  await writeFile(
    resolve(out, "resultados.json"),
    JSON.stringify(
      {
        ok: !process.exitCode,
        metodo:
          "Builds efetivamente publicados, servidos localmente. API real do Supabase. Conexão emulada: latência de 250 ms, download 4 Mbps, upload 1 Mbps. Alternância da ordem entre as versões. Somente salvamento medido; preparação e login fora do relógio.",
        builds: { antes: pacoteAntes.build, depois: pacoteDepois.build },
        resultados,
        erros,
      },
      null,
      2,
    ),
  );
}
