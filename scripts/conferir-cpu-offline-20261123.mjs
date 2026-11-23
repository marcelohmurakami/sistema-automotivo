import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { chromium } from './lib/chrome-conferencia.mjs';
const server = createServer((req, res) => {
  if (req.url === '/sw.js') {
    res.setHeader('Content-Type', 'application/javascript');
    res.end("self.addEventListener('install',e=>e.waitUntil(caches.open('qa').then(c=>c.add('/documento')).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.mode==='navigate')e.respondWith(caches.open('qa').then(c=>c.match('/documento')))});");
  } else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta charset="utf-8"><title>Calibração</title><p>Controle da bancada</p>'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const resultados = [];
try {
  for (const modo of ['frio', 'preparado']) for (let rodada = 1; rodada <= 3; rodada++) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    const p = await ctx.newPage(), cdp = await ctx.newCDPSession(p);
    if (modo === 'preparado') {
      await p.goto(base + '/preparacao');
      await p.evaluate(async () => { await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; });
      await p.waitForFunction(() => !!navigator.serviceWorker.controller);
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    if (modo === 'preparado') {
      await ctx.setOffline(true);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await cdp.send('Network.overrideNetworkState', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    }
    await p.goto(base + '/documento');
    await p.evaluate(() => { window.qaCalibrar = n => { const inicio = performance.now(); let total = 0; for (let i = 0; i < n; i++) total += Math.sqrt(i + 1) * Math.sin(i + 1); return { ms: performance.now() - inicio, total }; }; });
    await p.evaluate(() => window.qaCalibrar(100000));
    const depoisNavegacao = await p.evaluate(() => window.qaCalibrar(4000000));
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const normal = await p.evaluate(() => window.qaCalibrar(4000000));
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const reforcado = await p.evaluate(() => window.qaCalibrar(4000000));
    resultados.push({ modo, rodada, depoisNavegacao, normal, reforcado, razaoAntes: depoisNavegacao.ms / normal.ms, razaoDepois: reforcado.ms / normal.ms, online: await p.evaluate(() => navigator.onLine) });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); await cdp.detach(); await ctx.close();
  }
} finally {
  await writeFile('output/offline-picos-20261119/calibracao-cpu.json', JSON.stringify({ navegador: browser.version(), metodo: 'Controle independente após as medições. Mesmo cálculo e contexto; CPU4x configurada antes de navegar, depois CPU1x e CPU4x reaplicadas após navegar. Não é tempo do aplicativo.', resultados }, null, 2));
  await browser.close(); await new Promise(r => server.close(r));
}
console.log(JSON.stringify(resultados.map(({ modo, rodada, razaoAntes, razaoDepois }) => ({ modo, rodada, razaoAntes, razaoDepois })), null, 2));
