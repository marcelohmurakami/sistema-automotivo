import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { preview, loadConfigFromFile } from 'vite';
import { chromium } from './lib/chrome-conferencia.mjs';
import { createClient } from '@supabase/supabase-js';
import { sessaoQa } from './sessoes-qa-concorrencia-20261116.mjs';
import { novoDocumentoOffline } from '../src/lib/documentoOffline.ts';

const out = resolve(process.env.QA_OUTPUT || 'output/offline-picos-20261119/preparado-final');
const rodadas = Number(process.env.QA_RODADAS || 3);
await mkdir(out, { recursive: true });
const env = Object.fromEntries((await readFile('.env.local', 'utf8')).split(/\r?\n/).filter(l => /^VITE_SUPABASE_/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const contas = JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json')).contas.filter(c => !process.env.QA_AMOSTRA || process.env.QA_AMOSTRA.split(',').includes(c.especialidade));
if (!process.env.QA_AMOSTRA) assert.equal(contas.length, 26);
const sessoes = {}, bases = [], rascunhos = [];
for (const c of contas) {
  assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
  const s = await sessaoQa(createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }), c);
  sessoes[c.especialidade] = s;
  const b = { id: s.user.id + ':' + c.empresa_id, usuario: s.user.id, oficina: c.empresa_id, nome: c.empresa, ramo: c.ramo, especialidade: c.especialidade, atualizado: Date.now(), identidade: { nome: c.empresa }, objetos: [], aux: { clientes: [], veiculos: [], vinculos: [], catalogo: [] } };
  bases.push(b);
  for (let i = 0; i < 20; i++) {
    const d = novoDocumentoOffline(b, i % 2 ? 'orcamento' : 'os');
    d.cliente.nome = 'Cliente local de teste ' + (i + 1);
    d.bem.nome = 'Bem de teste ' + c.especialidade;
    d.itens = Array.from({ length: 3 }, (_, j) => ({ id: randomUUID(), descricao: 'Serviço local ' + (j + 1), tipo: 'service', unidade: 'un', situacao: 'pending', quantidade: 1, preco_unitario_centavos: 10000 + j * 1000 }));
    rascunhos.push({ id: randomUUID(), usuario: b.usuario, oficina: b.oficina, ramo: b.ramo, cliente_id: '', veiculo_id: '', relato: '', quilometragem: null, fotos: [], atualizado: Date.now() + i, os_id: null, situacao: 'pendente', erro: '', revisao: 1, documento: d, pronto_envio: false });
  }
}
const servers = {}, contexts = {}, resultados = [], falhas = [];
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
console.log('NAVEGADOR', browser.version());
const guardar = () => writeFile(resolve(out, 'resultados.json'), JSON.stringify({ metodo: 'Frontend compilado, Service Worker real preparado antes das medições, navegador sem rede. 20 documentos locais por usuário (10 OS e 10 orçamentos, 3 itens cada), sem enviar dados de teste ao servidor. 3 rodadas alternadas; documento/página novo por medição, assets no cache do Service Worker. Desktop 1920x1080 CPU1x; celular 390x844 CPU4x. Tempo até empresa, 20 cartões e Nova OS habilitada; separadamente, abrir o editor de um documento.', resultados, falhas }, null, 2));
try {
  for (const fase of ['antes', 'depois']) {
    const configuration = await loadConfigFromFile({ command: 'serve', mode: 'production' }, resolve('vite.config.ts'));
    const pasta = resolve(fase === 'antes' ? (process.env.QA_BUILD_ANTES || 'output/picos-51-20261119/build-depois') : (process.env.QA_BUILD_DEPOIS || 'output/offline-picos-20261119/build-depois'));
    const s = await preview({ ...configuration.config, configFile: false, build: { ...configuration.config.build, outDir: pasta }, preview: { host: '127.0.0.1', port: 0 } });
    servers[fase] = s;
    for (const mobile of [false, true]) {
      const ctx = await browser.newContext({ viewport: { width: mobile ? 390 : 1920, height: mobile ? 844 : 1080 }, isMobile: mobile, hasTouch: mobile, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
      const base = s.resolvedUrls.local[0];
      contexts[fase + mobile] = { ctx, base };
      await ctx.addInitScript(({ sessoes, base }) => {
        if (location.origin !== new URL(base).origin) return;
        const perfil = new URL(location.href).searchParams.get('qa_perfil');
        if (sessoes[perfil]) localStorage.setItem('sb-hzihxtjirttetnfdujcx-auth-token', JSON.stringify(sessoes[perfil]));
      }, { sessoes, base });
      if (process.env.QA_VISIBILIDADE && fase === 'depois') await ctx.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style');
          style.textContent = '@media screen {.offline-lista > .offline-registro{content-visibility:auto;contain-intrinsic-block-size:auto 180px}} @media screen and (max-width:650px){.offline-lista > .offline-registro{contain-intrinsic-block-size:auto 300px}}';
          document.head.append(style);
        });
      });
      if (process.env.QA_DIAGNOSTICO) await ctx.addInitScript(() => {
        window.qaEtapas = []; window.qaLongas = [];
        new PerformanceObserver(l => window.qaLongas.push(...l.getEntries().map(e => ({ inicio: e.startTime, duracao: e.duration })))).observe({ type: 'longtask', buffered: true });
        const abrir = IDBFactory.prototype.open, transacao = IDBDatabase.prototype.transaction;
        IDBFactory.prototype.open = function (...args) {
          const inicio = performance.now(), q = abrir.apply(this, args);
          q.addEventListener('success', () => window.qaEtapas.push({ tipo: 'abrir banco', inicio, ms: performance.now() - inicio, banco: args[0] })); return q;
        };
        IDBDatabase.prototype.transaction = function (...args) {
          const inicio = performance.now(), t = transacao.apply(this, args);
          t.addEventListener('complete', () => window.qaEtapas.push({ tipo: 'transação', inicio, ms: performance.now() - inicio, loja: args[0], modo: args[1] })); return t;
        };
        document.addEventListener('click', e => { if (e.target.closest('button')?.textContent.trim() === 'Continuar') window.qaEtapas.push({ tipo: 'clique continuar', inicio: performance.now() }); }, true);
      });
      const p = await ctx.newPage();
      contexts[fase + mobile].page = p;
      await p.goto(base + 'health.json');
      await p.evaluate(async ({ bases, rascunhos }) => {
        const db = await new Promise((ok, no) => {
          const q = indexedDB.open('patio-atendimento-offline-v1', 2);
          q.onupgradeneeded = () => {
            q.result.createObjectStore('bases', { keyPath: 'id' });
            const s = q.result.createObjectStore('rascunhos', { keyPath: 'id' });
            s.createIndex('usuario', 'usuario'); s.createIndex('usuario-oficina', ['usuario', 'oficina']); s.createIndex('usuario-oficina-situacao', ['usuario', 'oficina', 'situacao']);
          };
          q.onsuccess = () => ok(q.result); q.onerror = no;
        });
        await new Promise((ok, no) => { const t = db.transaction(['bases', 'rascunhos'], 'readwrite'); for (const b of bases) t.objectStore('bases').put(b); for (const r of rascunhos) t.objectStore('rascunhos').put(r); t.oncomplete = ok; t.onerror = no; });
        db.close();
        await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready;
      }, { bases, rascunhos });
      await p.waitForFunction(() => !!navigator.serviceWorker.controller);
      await ctx.setOffline(true);
      console.log('PREPARADO', fase, mobile ? 'celular' : 'desktop');
    }
  }
  for (let rodada = 1; rodada <= rodadas; rodada++) for (const [i, c] of contas.entries()) for (const mobile of [false, true]) for (const fase of (i + rodada + Number(mobile)) % 2 ? ['antes', 'depois'] : ['depois', 'antes']) {
    if (process.env.QA_SO_CELULAR && !mobile) continue;
    const { ctx, base, page: p } = contexts[fase + mobile], cdp = await ctx.newCDPSession(p), erros = [];
    const registrarErro = e => erros.push(e.message);
    p.setDefaultTimeout(30000); p.on('pageerror', registrarErro);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: mobile ? 4 : 1 });
    await ctx.setOffline(false); await ctx.setOffline(true);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await cdp.send('Network.overrideNetworkState', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const trace = [];
    if (process.env.QA_TRACE) {
      cdp.on('Tracing.dataCollected', e => trace.push(...e.value));
      await cdp.send('Tracing.start', { categories: 'devtools.timeline,v8,blink.user_timing,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });
      await cdp.send('Profiler.enable'); await cdp.send('Profiler.start');
    }
    const t = performance.now();
    try {
      await p.goto(base + 'execucao-offline?qa_perfil=' + c.especialidade);
      await p.locator('.offline-resumo').getByText(c.empresa, { exact: true }).waitFor();
      await p.waitForFunction(() => document.querySelectorAll('.offline-novos .offline-registro').length === 20);
      assert(await p.getByRole('button', { name: 'Nova OS', exact: true }).isEnabled());
      await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const segundos = (performance.now() - t) / 1000;
      assert.equal(await p.evaluate(() => navigator.onLine), false);
      assert(await p.evaluate(() => fetch('/health.json?qa-corte-real').then(() => false).catch(() => true)), 'A rede precisa estar efetivamente cortada');
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
      const abrir = performance.now();
      await p.getByRole('button', { name: 'Continuar', exact: true }).first().click();
      await p.getByRole('dialog').locator('.os-editor-item').nth(2).waitFor();
      const editorSegundos = (performance.now() - abrir) / 1000;
      assert.equal(await p.getByRole('dialog').locator('.os-editor-item').count(), 3);
      const elementosEditor = await p.getByRole('dialog').evaluate(el => el.querySelectorAll('*').length);
      const camposFichaInicial = await p.getByRole('dialog').locator('.ficha-especialidade input, .ficha-especialidade select, .ficha-especialidade textarea').count();
      const diagnostico = process.env.QA_DIAGNOSTICO ? await p.evaluate(() => ({ etapas: window.qaEtapas, longas: window.qaLongas, recursos: performance.getEntriesByType('resource').map(e => ({ nome: new URL(e.name).pathname, inicio: e.startTime, ms: e.duration })), navegacao: performance.getEntriesByType('navigation').map(e => ({ inicio: e.startTime, resposta: e.responseStart, dom: e.domContentLoadedEventEnd, carga: e.loadEventEnd })) })) : undefined;
      if (process.env.QA_TRACE) {
        const id = c.especialidade + '-' + fase + '-' + rodada;
        const { profile } = await cdp.send('Profiler.stop');
        await writeFile(resolve(out, id + '.cpuprofile'), JSON.stringify(profile));
        const done = new Promise(r => cdp.once('Tracing.tracingComplete', r)); await cdp.send('Tracing.end'); await done;
        await writeFile(resolve(out, id + '.trace.json'), JSON.stringify({ traceEvents: trace }));
      }
      assert.deepEqual(erros, []);
      resultados.push({ rodada, perfil: c.especialidade, mobile, fase, segundos, editorSegundos, elementosEditor, camposFichaInicial, documentos: 20, redeCortada: true, erros, diagnostico });
      console.log('PASS', rodada, c.especialidade, mobile ? 'celular' : 'desktop', fase, segundos.toFixed(3), 'editor', editorSegundos.toFixed(3));
    } catch (e) { falhas.push({ rodada, perfil: c.especialidade, mobile, fase, erro: e.message }); console.log('FALHA', c.especialidade, fase, e.message.split('\n')[0]); await p.screenshot({ path: resolve(out, `falha-${c.especialidade}-${fase}-${mobile}-${rodada}.png`), fullPage: true }); if (process.env.QA_FAIL_FAST) throw e; }
    finally { await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); await cdp.detach(); p.off('pageerror', registrarErro); await guardar(); }
  }
} finally {
  for (const { ctx } of Object.values(contexts)) await ctx.close();
  await browser.close();
  for (const s of Object.values(servers)) await new Promise(r => s.httpServer.close(r));
  await guardar();
}
assert.deepEqual(falhas, []); assert.equal(resultados.length, contas.length * (process.env.QA_SO_CELULAR ? 2 : 4) * rodadas);
