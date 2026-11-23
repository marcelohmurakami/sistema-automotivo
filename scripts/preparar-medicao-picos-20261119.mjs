import {readFile,writeFile} from 'node:fs/promises';
let s=await readFile('scripts/medir-abertura-pareada-20261119.mjs','utf8');
s=s.replace("resolve('output/abertura-inicial-lembretes-20261118')","resolve('output/picos-51-20261119')");
s=s.replace("process.env.QA_AMOSTRA ? 'amostra-pareada' : 'comparacao-26'","process.env.QA_AMOSTRA ? 'amostra' : 'comparacao-26'");
s=s.replace("const servers = {}, urls = {}, resultados = [], falhas = [], rede = [];", "const servers = {}, urls = {}, resultados = [], falhas = [], rede = [], transportes = [];\nlet contextoAtual = {};\nconst rodadas = Number(process.env.QA_RODADAS || 3);");
s=s.replace("servers[fase] = await preview({ build: { outDir: pasta }, preview: { host: '127.0.0.1', port: 0 } });", `servers[fase] = await preview({ build: { outDir: pasta }, preview: { host: '127.0.0.1', port: 0, proxy: { '^/_supabase/(rest|auth)/v1/': {
      ...(fase === 'antes' ? { agent: false } : {}),
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
  } } } });`);
s=s.replace("metodo: 'Antes/depois alternados por perfil e dispositivo; build local de produção, dados QA no Supabase. Abertura direta, contexto novo por versão e dispositivo. CPU móvel 4x; rede real sem limitação artificial. Tempo até dados e pintura. Sem publicação do frontend.'", "metodo: 'Três rodadas planejadas (ou QA_RODADAS), antes/depois alternados por perfil/dispositivo/rodada. Build anterior congelado em 19/11 contra build corrigido. Proxy anterior sem pool TLS; corrigido usa o agente da configuração real. Contexto novo por versão/dispositivo; pool do servidor compartilhado sem cache de respostas. CPU móvel4x; rede real. Tempo até dados e pintura. Frontends locais, Supabase publicado. Sem publicação do frontend.', rodadas");
s=s.replace('builds, resultados, falhas, rede,','builds, resultados, falhas, rede, transportes,');
s=s.replace('for (const [indice, c] of contas.entries()) {','for (let rodada=0; rodada<rodadas; rodada++) for (const [indice, c] of contas.entries()) {');
s=s.replace('(indice + Number(mobile)) % 2','(indice + Number(mobile) + rodada) % 2');
s=s.replace("nomeAtual = nome;", "nomeAtual = nome; contextoAtual = {perfil:c.especialidade,mobile,fase,nome,rodada};");
s=s.replace('const resposta = rpc ?', "const rpcEsperada = nome==='Garantia' && !auto && fase==='depois' ? 'consultar_ocorrencias_servicos' : rpc;\n            const resposta = rpcEsperada ?");
s=s.replace("endsWith('/rpc/' + rpc)", "endsWith('/rpc/' + rpcEsperada)");
s=s.replaceAll('{ perfil: c.especialidade, mobile, fase, nome,', '{ perfil: c.especialidade, mobile, fase, rodada, nome,');
s=s.replace('resultados.push({ perfil: c.especialidade, mobile, fase, nome, segundos', 'resultados.push({ perfil: c.especialidade, mobile, fase, rodada, nome, segundos');
s=s.replace("fase, nome: nomeAtual, rpc:","fase, rodada, nome: nomeAtual, rpc:");
s=s.replace("if (['retifica',", "if (rodada===0 && ['retifica',");
s=s.replace("console.log('CONFERIDO', c.especialidade", "console.log('CONFERIDO', rodada+1, c.especialidade");
s=s.replace('contas.reduce((n, c) => n + (c.ramo', 'rodadas * contas.reduce((n, c) => n + (c.ramo');
await writeFile('scripts/medir-picos-51-20261119.mjs',s);
