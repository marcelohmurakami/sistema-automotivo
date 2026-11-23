import { chromium } from './lib/chrome-conferencia.mjs';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }), r = [];
try {
  const ctx = await browser.newContext(); await ctx.setOffline(true);
  const p = await ctx.newPage();
  r.push({ etapa: 'pagina nova, contexto previamente offline', online: await p.evaluate(() => navigator.onLine) });
  const cdp = await ctx.newCDPSession(p);
  r.push({ etapa: 'sessao CDP anexada', online: await p.evaluate(() => navigator.onLine) });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  r.push({ etapa: 'CPU 4x', online: await p.evaluate(() => navigator.onLine) });
  await ctx.setOffline(false); await ctx.setOffline(true);
  r.push({ etapa: 'contexto offline reaplicado', online: await p.evaluate(() => navigator.onLine) });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  r.push({ etapa: 'rede offline na sessao CDP', online: await p.evaluate(() => navigator.onLine) });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); await cdp.detach(); await ctx.close();
} finally { await browser.close(); await writeFile('output/offline-picos-20261119/diagnostico-rede-bancada.json', JSON.stringify(r, null, 2)); }
console.log(JSON.stringify(r));
