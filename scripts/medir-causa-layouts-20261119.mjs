import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const out = resolve('output/abertura-inicial-lembretes-20261118/causa-layouts'), resultados = [], seguranca = [], erros = [];
await mkdir(out, { recursive: true });
const config = { configFile: false, envDir: false, logLevel: 'error', plugins: [react()], define: { 'import.meta.env.VITE_SUPABASE_URL': '""', 'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': '""' }, build: { outDir: resolve(out, 'build'), rollupOptions: { input: 'scripts/fixtures/abertura-layouts.html' } } };
await build(config);
const server = await preview({ ...config, preview: { host: '127.0.0.1', port: 0 } });
const base = server.resolvedUrls.local[0] + 'scripts/fixtures/abertura-layouts.html';
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  for (const fase of ['antes', 'depois']) for (const width of [1920, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } }), p = await ctx.newPage();
    p.on('pageerror', e => erros.push(e.message));
    if (width === 390) await (await ctx.newCDPSession(p)).send('Emulation.setCPUThrottlingRate', { rate: 4 });
    for (const codigo of [0, 120, 450]) for (let rodada = 0; rodada < 3; rodada++) {
      await p.goto(base + '?fase=' + fase + '&codigo=' + codigo);
      await p.getByText('Carregando seu ambiente de trabalho…', { exact: true }).waitFor();
      assert.equal(await p.evaluate(() => window.qa.consultas), 0);
      await p.evaluate(() => window.qa.liberar());
      await p.getByText('Dados carregados', { exact: true }).waitFor();
      const q = await p.evaluate(() => window.qa), t = Object.fromEntries(q.eventos.map(e => [e.nome, e.ms]));
      assert.equal(q.consultas, 1);
      resultados.push({ fase, width, codigo, rodada, msInicioConsulta: t.consulta - t.acesso_aprovado, msDepoisDoCodigo: t.consulta - t.fim_modulo, msCompleto: t.dados - t.acesso_aprovado, eventos: q.eventos });
    }
    for (const [nome, dados] of [['sessao', { usuario: null, oficina: null }], ['empresa', { oficina: null }], ['negado', { erro: 'Acesso revogado.' }], ['mfa', { segundoFatorExigido: true }]]) {
      await p.goto(base + '?fase=' + fase + '&codigo=450');
      await p.getByText('Carregando seu ambiente de trabalho…', { exact: true }).waitFor();
      await p.evaluate(() => window.qa.liberar());
      await p.waitForFunction(() => window.qa.eventos.some(x => x.nome === 'inicio_modulo'));
      await p.evaluate(d => window.qa.alterar(d), dados);
      await p.waitForTimeout(600);
      assert.equal(await p.evaluate(() => window.qa.consultas), 0, nome + ' não pode consultar após bloqueio');
      assert.equal(await p.getByText('Dados carregados', { exact: true }).count(), 0);
      seguranca.push({ fase, width, nome, ok: true });
    }
    await ctx.close(); console.log('PASS layouts e acesso', fase, width);
  }
} finally {
  await browser.close(); server.httpServer.closeAllConnections(); await new Promise(r => server.httpServer.close(r));
  await writeFile(resolve(out, 'resultados.json'), JSON.stringify({ metodo: 'Reproduz Suspense externo e interno aos layouts. Guardião real ExigirSessao; página e rede controladas. Código 0/120/450 ms, dados 100 ms.', resultados, seguranca, erros }, null, 2));
}
assert.equal(resultados.length, 36); assert.equal(seguranca.length, 16); assert.deepEqual(erros, []);
