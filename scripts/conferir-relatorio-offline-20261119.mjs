import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { chromium } from './lib/chrome-conferencia.mjs';
const root = resolve('output/offline-picos-20261119'), file = resolve(root, 'relatorio.html');
const resumo = JSON.parse(await readFile(resolve(root, 'resumo.json')));
assert.equal(resumo.comparacoes.length, 104);
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }), resultados = [], erros = [];
try {
  for (const width of [1920, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1080 }, isMobile: width === 390, hasTouch: width === 390 });
    const page = await ctx.newPage(); page.on('pageerror', e => erros.push(e.message));
    await page.goto(pathToFileURL(file).href);
    assert.equal(await page.locator('.case').count(), 52);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
    await page.screenshot({ path: resolve(root, `relatorio-${width}-inicio.png`) });
    await page.locator('#casos').scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(root, `relatorio-${width}-casos.png`) });
    await page.locator('#cenario').selectOption('preparado'); assert.equal(await page.locator('.case').count(), 52);
    await page.locator('#dispositivo').selectOption('celular'); assert.equal(await page.locator('.case').count(), 26);
    await page.locator('#busca').fill('borracharia'); assert.equal(await page.locator('.case').count(), 1);
    await page.locator('#busca').fill('sem-correspondencia-inexistente'); assert.equal(await page.locator('.case').count(), 0);
    const links = await page.locator('a[href]').evaluateAll(as => as.map(a => a.href));
    for (const link of links) if (link.startsWith('file:')) { const u = new URL(link); u.hash = ''; assert(fileURLToPath(u).startsWith(root)); await access(fileURLToPath(u)); }
    resultados.push({ width, ok: true, linksConferidos: links.length, filtrosConferidos: true, semOverflow: true });
    await ctx.close();
  }
  assert.deepEqual(erros, []);
} finally { await browser.close(); await writeFile(resolve(root, 'conferencia-relatorio.json'), JSON.stringify({ resultados, erros }, null, 2)); }
console.log('Relatório verificado em 1920 e 390 px, filtros e links.');
