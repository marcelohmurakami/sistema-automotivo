import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { sessaoQa } from './sessoes-qa-concorrencia-20261116.mjs';

const root = resolve('output/abertura-inicial-lembretes-20261118');
const out = resolve(process.env.QA_OUTPUT || resolve(root, process.env.QA_AMOSTRA ? 'amostra-pareada' : 'comparacao-26'));
await mkdir(out, { recursive: true });
const env = Object.fromEntries((await readFile('.env.local', 'utf8')).split(/\r?\n/).filter(l => /^VITE_SUPABASE_/.test(l)).map(l => {
  const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
}));
const contas = JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json')).contas.filter(c => !process.env.QA_AMOSTRA || process.env.QA_AMOSTRA.split(',').includes(c.especialidade));
if (!process.env.QA_AMOSTRA) assert.equal(contas.length, 26);
const servers = {}, urls = {}, resultados = [], falhas = [], rede = [];
const builds = {}, iniciadoEm = new Date().toISOString();
for (const fase of ['antes', 'depois']) {
  const pasta = fase === 'depois' && process.env.QA_BUILD_DEPOIS ? resolve(process.env.QA_BUILD_DEPOIS) : resolve(root, 'build-' + fase);
  builds[fase] = {pasta, indexSha256:createHash('sha256').update(await readFile(resolve(pasta,'index.html'))).digest('hex')};
  servers[fase] = await preview({ build: { outDir: pasta }, preview: { host: '127.0.0.1', port: 0 } });
  urls[fase] = servers[fase].resolvedUrls.local[0];
}
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const guardar = () => writeFile(resolve(out, 'resultados.json'), JSON.stringify({
  metodo: 'Antes/depois alternados por perfil e dispositivo; build local de produção, dados QA no Supabase. Abertura direta, contexto novo por versão e dispositivo. CPU móvel 4x; rede real sem limitação artificial. Tempo até dados e pintura. Sem publicação do frontend.',
  iniciadoEm, geradoEm: new Date().toISOString(), builds, resultados, falhas, rede,
}, null, 2));
try {
  for (const [indice, c] of contas.entries()) {
    assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
    const cli = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const session = await sessaoQa(cli, c), auto = c.ramo === 'automotivo';
    const modulos = [
      ['Laudos', 'laudos', 'listar_laudos', '.laudos-lista'],
      ['Agenda', auto ? 'produtividade' : 'agenda', auto ? 'consultar_produtividade' : 'pagina_servicos', '.cal-oficina'],
      ...(auto ? [['Contatos', 'oportunidades', 'consultar_oportunidades', '.contatos-lista']] : []),
      ['Relatórios', 'relatorios', auto ? 'consultar_relatorio_financeiro' : 'consultar_relatorios_servicos', auto ? '.relatorios-pagina, .relatorios-real' : '.relatorios-servicos'],
      ['Garantia', 'garantias', auto ? 'consultar_qualidade' : 'consultar_relatorios_servicos', '.qserv'],
      ['Histórico', 'historico', 'consultar_historico_gestao', '.historico-lista'],
      ['Site', 'meu-site', 'administrar_site', '.meu-site'],
      ['Offline', 'execucao-offline', null, '.offline-resumo'],
    ];
    for (const mobile of [false, true]) for (const fase of (indice + Number(mobile)) % 2 ? ['depois', 'antes'] : ['antes', 'depois']) {
      const base = urls[fase], ctx = await browser.newContext({ viewport: { width: mobile ? 390 : 1920, height: mobile ? 844 : 1080 }, isMobile: mobile, hasTouch: mobile, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' });
      await ctx.addInitScript(({ session, base }) => {
        if (location.origin === new URL(base).origin) localStorage.setItem('sb-hzihxtjirttetnfdujcx-auth-token', JSON.stringify(session));
        window.qaLongas = [];
        new PerformanceObserver(l => window.qaLongas.push(...l.getEntries().map(x => ({ inicio: x.startTime, duracao: x.duration })))).observe({ type: 'longtask', buffered: true });
      }, { session, base });
      const p = await ctx.newPage(); p.setDefaultTimeout(25000);
      if (mobile) await (await ctx.newCDPSession(p)).send('Emulation.setCPUThrottlingRate', { rate: 4 });
      let nomeAtual = ''; const erros = [];
      p.on('pageerror', e => erros.push({ nome: nomeAtual, erro: e.message }));
      p.on('response', r => { if (r.url().includes('/rpc/')) rede.push({ perfil: c.especialidade, mobile, fase, nome: nomeAtual, rpc: r.url().split('/').at(-1), status: r.status() }); });
      try {
        for (const [nome, path, rpc, selector] of modulos) {
          nomeAtual = nome;
          try {
            const t = performance.now();
            const resposta = rpc ? p.waitForResponse(r => r.url().endsWith('/rpc/' + rpc) && r.ok()) : Promise.resolve(null);
            // Attach rejection handling immediately even when navigation itself fails.
            resposta.catch(() => {});
            await p.goto(base + path); const r = await resposta; if (r) await r.finished();
            if (nome === 'Relatórios' && auto) await p.getByRole('heading', { name: /Relatórios/ }).first().waitFor();
            else await p.locator(selector).first().waitFor();
            await p.evaluate(() => new Promise(requestAnimationFrame));
            const segundos = (performance.now() - t) / 1000;
            const diagnostico = await p.evaluate(() => ({
              excessoHorizontal: document.documentElement.scrollWidth - innerWidth,
              longas: window.qaLongas,
              recursos: performance.getEntriesByType('resource').filter(x => /\/(rpc|auth\/v1|assets)\//.test(x.name)).map(x => ({ nome: new URL(x.name).pathname, inicio: x.startTime, duracao: x.duration, transferencia: x.transferSize })),
            }));
            assert(diagnostico.excessoHorizontal <= 2, 'Página excede largura da tela: ' + diagnostico.excessoHorizontal);
            assert.equal(erros.filter(e => e.nome === nome).length, 0, JSON.stringify(erros));
            resultados.push({ perfil: c.especialidade, mobile, fase, nome, segundos, ...diagnostico });
            if (['retifica', 'assistencia_celulares', 'manutencao_climatizacao', 'limpeza_geral'].includes(c.especialidade)) await p.screenshot({ path: resolve(out, `${c.especialidade}-${mobile ? 'celular' : 'desktop'}-${fase}-${nome}.png`) });
          } catch (e) {
            falhas.push({ perfil: c.especialidade, mobile, fase, nome, erro: e.message });
            await p.screenshot({ path: resolve(out, `${c.especialidade}-${mobile}-${fase}-${nome}-falha.png`) }).catch(() => {});
          }
          await guardar();
        }
      } finally { await ctx.close(); }
      console.log('CONFERIDO', c.especialidade, mobile ? 'celular' : 'desktop', fase, 'falhas acumuladas:', falhas.length);
    }
  }
} finally {
  await browser.close();
  for (const s of Object.values(servers)) await new Promise(r => s.httpServer.close(r));
  await guardar();
}
assert.deepEqual(falhas, []);
assert.equal(resultados.length, contas.reduce((n, c) => n + (c.ramo === 'automotivo' ? 8 : 7) * 4, 0));
