import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { preview, loadConfigFromFile } from 'vite';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { sessaoQa } from './sessoes-qa-concorrencia-20261116.mjs';

const root = resolve('output/picos-51-20261119');
const out = resolve(process.env.QA_OUTPUT || resolve(root, 'experimento-layout'));
await mkdir(out, { recursive: true });
await writeFile(resolve(out,'medicoes.ndjson'),'');
const env = Object.fromEntries((await readFile('.env.local', 'utf8')).split(/\r?\n/).filter(l => /^VITE_SUPABASE_/.test(l)).map(l => {
  const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
}));
const contas = JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json')).contas.filter(c => !process.env.QA_AMOSTRA || process.env.QA_AMOSTRA.split(',').includes(c.especialidade));
if (!process.env.QA_AMOSTRA) assert.equal(contas.length, 26);
const servers = {}, urls = {}, resultados = [], falhas = [], rede = [], transportes = [];
let contextoAtual = {};
const rodadas = Number(process.env.QA_RODADAS || 3);
const casosOriginais=JSON.parse(await readFile('output/revisao-integral-20261119/diagnostico-tempos.json','utf8')).comparacoes.filter(p=>p.deltaS>0&&contas.some(c=>c.especialidade===p.perfil));
if(!process.env.QA_AMOSTRA)assert.equal(casosOriginais.length,51);
const casosControle=[...casosOriginais,...contas.flatMap(c=>['desktop','celular'].map(dispositivo=>({perfil:c.especialidade,dispositivo,modulo:'Offline'})))];
const builds = {}, iniciadoEm = new Date().toISOString();
for (const fase of ['antes', 'depois']) {
  const pasta = fase === 'depois' && process.env.QA_BUILD_DEPOIS ? resolve(process.env.QA_BUILD_DEPOIS) : resolve(root, fase==='antes'?'build-depois':'build-candidato');
  builds[fase] = {pasta, indexSha256:createHash('sha256').update(await readFile(resolve(pasta,'index.html'))).digest('hex')};
  const configuration = await loadConfigFromFile({command:'serve',mode:'production'},resolve('vite.config.ts'));
  assert(configuration?.config.server?.proxy?.['^/_supabase/(rest|auth)/v1/']);
  servers[fase] = await preview({ ...configuration.config, configFile:false, build: { ...configuration.config.build, outDir: pasta }, preview: { host: '127.0.0.1', port: 0, proxy: { '^/_supabase/(rest|auth)/v1/': {
      ...configuration.config.server.proxy['^/_supabase/(rest|auth)/v1/'],
      // Ambas as versões usam o mesmo pool: isola somente a carga do layout.
      configure(proxy) {
        proxy.on('proxyReq', (request, req) => {
          request.removeHeader('cookie'); const t = performance.now();
          const trace = { ...contextoAtual, fase, rota: req.url.split('?')[0] }; transportes.push(trace);
          const socket = s => { trace.reutilizada = request.reusedSocket === true; trace.novaConexao = s.connecting;
            if (!s.connecting) { trace.tlsMs = 0; return; }
            s.once('lookup', () => trace.dnsMs = performance.now()-t);
            s.once('connect', () => trace.tcpMs = performance.now()-t);
            s.once('secureConnect', () => trace.tlsMs = performance.now()-t);
          };
          if (request.socket) socket(request.socket); else request.once('socket', socket);
          request.once('response', response => { trace.headersMs=performance.now()-t; trace.upstreamMs=Number(response.headers['x-envoy-upstream-service-time'])||null; trace.requestId=response.headers['sb-request-id']||null;
            response.once('end',()=>trace.totalMs=performance.now()-t);
          });
        });
        proxy.on('proxyRes', response => { response.headers['cache-control']='private, no-store'; response.headers['cdn-cache-control']='no-store'; delete response.headers['set-cookie']; });
      }
  } } } });
  urls[fase] = servers[fase].resolvedUrls.local[0];
}
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const guardar = () => writeFile(resolve(out, 'resultados.json'), JSON.stringify({
  metodo: 'Experimento de carga do layout: antes=correções de transporte/consulta; depois=mesmas correções e layout sob demanda. Ambas usam pool. Controle adicional: uma rodada dos 51 casos originais; três rodadas de Offline nos 26 subsistemas e dois dispositivos, esperando a consulta de acesso e a empresa identificada. Aguarda resumo/lista final, sumiço do carregamento e duas pinturas. O acréscimo inclui o custo das checagens; não é só renderização. Versões antes/depois alternados por perfil/dispositivo/rodada. Build anterior congelado em 19/11 contra build corrigido. Proxy anterior sem pool TLS; corrigido usa o agente da configuração real. Contexto novo por versão/dispositivo; pool do servidor compartilhado sem cache de respostas. CPU móvel4x; rede real. Tempo até dados e pintura. Frontends locais, Supabase publicado. Sem publicação do frontend.', rodadas,
  iniciadoEm, geradoEm: new Date().toISOString(), builds, resultados, falhas, rede, transportes,
}, null, 2));
try {
  for (let rodada=0; rodada<rodadas; rodada++) for (const [indice, c] of contas.entries()) {
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
    for (const mobile of [false, true]) for (const fase of (indice + Number(mobile) + rodada) % 2 ? ['depois', 'antes'] : ['antes', 'depois']) {
      if(!casosControle.some(p=>p.perfil===c.especialidade&&p.dispositivo===(mobile?'celular':'desktop')))continue;
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
      p.on('response', r => { if (r.url().includes('/rpc/')) rede.push({ perfil: c.especialidade, mobile, fase, rodada, nome: nomeAtual, rpc: r.url().split('/').at(-1), status: r.status() }); });
      try {
        for (const [nome, path, rpc, selector] of modulos) {
          if(rodada>0&&nome!=='Offline')continue;
          if(!casosControle.some(p=>p.perfil===c.especialidade&&p.dispositivo===(mobile?'celular':'desktop')&&p.modulo===nome))continue;
          nomeAtual = nome; contextoAtual = {perfil:c.especialidade,mobile,fase,nome,rodada};
          try {
            const t = performance.now(), inicioEpochMs=Date.now();
            const rpcEsperada = nome==='Offline'?'consultar_meu_acesso':nome==='Garantia' && !auto && fase==='depois' ? 'consultar_ocorrencias_servicos' : rpc;
            const resposta = rpcEsperada ? p.waitForResponse(r => r.url().endsWith('/rpc/' + rpcEsperada) && r.ok()) : Promise.resolve(null);
            // Attach rejection handling immediately even when navigation itself fails.
            resposta.catch(() => {});
            await p.goto(base + path); const fimGotoS=(performance.now()-t)/1000; const r = await resposta; if (r) await r.finished(); const fimRpcS=(performance.now()-t)/1000;
            if (nome === 'Relatórios' && auto) await p.getByRole('heading', { name: /Relatórios/ }).first().waitFor();
            else await p.locator(selector).first().waitFor();
            await p.evaluate(() => new Promise(requestAnimationFrame));
            const respostaEPinturaSegundos = (performance.now() - t) / 1000;
            const inicioConferencia=performance.now();
            if(nome==='Site') await p.getByRole('heading',{name:'Seu mini site no Plano Completo',exact:true}).waitFor();
            else if(nome==='Offline') await p.locator('.offline-resumo').getByText(c.empresa,{exact:true}).waitFor();
            else await p.locator(nome==='Garantia'?'.qserv-resumo':nome==='Relatórios'?(auto?'.rel-indicadores':'.rs-filtros'):selector).first().waitFor();
            await p.waitForFunction(()=>Array.from(document.querySelectorAll('[role="status"]')).every(el=>!el.checkVisibility()||!/^\s*(Carregando|Calculando|Preparando|Abrindo)/i.test(el.textContent||'')));
            await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
            const segundos = (performance.now() - t) / 1000;
            const acrescimoConferenciaS=(performance.now()-inicioConferencia)/1000;
            const diagnostico = await p.evaluate(() => ({
              excessoHorizontal: document.documentElement.scrollWidth - innerWidth,
              timeOrigin: performance.timeOrigin, agoraNavegadorMs: performance.now(),
              navegacao: performance.getEntriesByType('navigation').map(n=>({inicio:n.startTime,duracao:n.duration,unloadInicio:n.unloadEventStart,unloadFim:n.unloadEventEnd,respostaInicio:n.responseStart,respostaFim:n.responseEnd,domInterativo:n.domInteractive,domPronto:n.domContentLoadedEventEnd,loadFim:n.loadEventEnd})),
              longas: window.qaLongas,
              recursos: performance.getEntriesByType('resource').filter(x => /\/(rpc|auth\/v1|assets)\//.test(x.name)).map(x => ({ nome: new URL(x.name).pathname, inicio: x.startTime, duracao: x.duration, transferencia: x.transferSize })),
            }));
            assert(diagnostico.excessoHorizontal <= 2, 'Página excede largura da tela: ' + diagnostico.excessoHorizontal);
            assert.equal(erros.filter(e => e.nome === nome).length, 0, JSON.stringify(erros));
            resultados.push({ perfil: c.especialidade, mobile, fase, rodada, nome, segundos, inicioEpochMs, fimGotoS, fimRpcS, respostaEPinturaSegundos, acrescimoConferenciaS, ...diagnostico });
            await appendFile(resolve(out,'medicoes.ndjson'),JSON.stringify(resultados.at(-1))+'\n');
            if (rodada===0 && ['retifica', 'assistencia_celulares', 'manutencao_climatizacao', 'limpeza_geral'].includes(c.especialidade)) await p.screenshot({ path: resolve(out, `${c.especialidade}-${mobile ? 'celular' : 'desktop'}-${fase}-${nome}.png`) });
          } catch (e) {
            falhas.push({ perfil: c.especialidade, mobile, fase, rodada, nome, erro: e.message });
            await p.screenshot({ path: resolve(out, `${c.especialidade}-${mobile}-${fase}-${nome}-falha.png`) }).catch(() => {});
          }
        }
      assert.equal(erros.length,0,JSON.stringify(erros));
      } finally { await ctx.close(); }
      await guardar();
      console.log('CONFERIDO', rodada+1, c.especialidade, mobile ? 'celular' : 'desktop', fase, 'falhas acumuladas:', falhas.length);
    }
  }
} finally {
  await browser.close();
  for (const s of Object.values(servers)) await new Promise(r => s.httpServer.close(r));
  await guardar();
}
assert.deepEqual(falhas, []);
assert.equal(resultados.length,casosOriginais.length*2+rodadas*contas.length*4);
