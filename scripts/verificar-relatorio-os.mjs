import assert from "node:assert/strict";
import { readFile, writeFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { chromium } from "playwright";
const root = resolve("output/os-velocidade-20261116"),
  arquivo = resolve(root, "relatorio.html"),
  url = pathToFileURL(arquivo),
  html = await readFile(arquivo, "utf8"),
  links = [];
for (const [, v] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
  const u = new URL(v, url);
  if (u.protocol === "file:") {
    await access(fileURLToPath(u));
    links.push(v);
  }
}
const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  }),
  erros = [],
  resultados = [];
try {
  for (const largura of [1920, 390]) {
    const page = await browser.newPage({ viewport: { width: largura, height: 1080 } });
    page.on("pageerror", (e) => erros.push(e.message));
    await page.goto(url.href);
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    );
    await page.screenshot({ path: resolve(root, "relatorio-" + largura + ".png") });
    await page
      .locator("details")
      .evaluateAll((ds) => ds.forEach((d) => (d.open = true)));
    await page
      .locator("img")
      .evaluateAll((imgs) => imgs.forEach((i) => (i.loading = "eager")));
    await page.waitForFunction(() =>
      [...document.images].every((i) => i.complete && i.naturalWidth > 0),
    );
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    );
    resultados.push({
      largura,
      semOverflow: true,
      imagens: await page.locator("img").count(),
      ok: true,
    });
    await page.close();
  }
  assert.deepEqual(erros, []);
} finally {
  await browser.close();
}
await writeFile(
  resolve(root, "conferencia-relatorio.json"),
  JSON.stringify({ ok: true, links: links.length, resultados, erros }, null, 2),
);
console.log(
  JSON.stringify({ ok: true, links: links.length, telas: resultados.length }),
);
