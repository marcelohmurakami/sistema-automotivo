import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Agent as AgenteHttps } from "node:https";
import { Agent as AgenteHttp } from "node:http";
import { telas } from "./src/lib/modulosNavegacao.ts";
let pastaBuild = "";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const origem = env.VITE_SUPABASE_URL?.replace(/\/$/, "");
  const rotas = JSON.parse(readFileSync(resolve("vercel.json"), "utf8")).rewrites as {
    source: string;
    destination: string;
  }[];
  // Só ativa se a hospedagem encaminhar AMBAS as APIs ao mesmo projeto do build.
  // Outro projeto sem rotas compatíveis continua usando a conexão direta.
  const caminhoProxy =
    origem &&
    ["rest", "auth"].every((api) =>
      rotas.some(
        (r) =>
          r.source === `/_supabase/${api}/v1/:path*` &&
          r.destination === `${origem}/${api}/v1/:path*`,
      ),
    )
      ? "/_supabase"
      : "";
  // Sem agente, o proxy fecha a conexão e repete TCP/TLS a cada consulta.
  // O pool reutiliza somente o transporte; sessão e resposta não são armazenadas.
  const agenteProxy = caminhoProxy
    ? new (origem!.startsWith("https:") ? AgenteHttps : AgenteHttp)({
        keepAlive: true,
        maxSockets: 32,
        maxFreeSockets: 8,
        timeout: 30_000,
      })
    : undefined;
  return {
    define: {
      "import.meta.env.VITE_SUPABASE_PROXY_PATH": JSON.stringify(caminhoProxy),
    },
    // O servidor usado pela aplicação não compartilha o cache com bancadas Vite.
    cacheDir: "node_modules/.vite-app",
    build: { manifest: true },
    optimizeDeps: {
      // Não percorra os HTMLs de relatórios, builds antigos e fixtures de teste.
      entries: ["index.html"],
      include: ["react", "react-dom", "react-dom/client"],
    },
    server: {
      proxy: caminhoProxy
        ? {
            "^/_supabase/(rest|auth)/v1/": {
              target: origem,
              agent: agenteProxy,
              changeOrigin: true,
              rewrite: (path) => path.slice(caminhoProxy.length),
              configure(proxy) {
                proxy.on("proxyReq", (request) => request.removeHeader("cookie"));
                proxy.on("proxyRes", (response) => {
                  response.headers["cache-control"] = "private, no-store";
                  response.headers["cdn-cache-control"] = "no-store";
                  delete response.headers["set-cookie"];
                });
              },
            },
          }
        : undefined,
      // Evidências e PDFs da bancada não devem recarregar uma ficha em preenchimento.
      watch: { ignored: ["**/output/**", "**/backups/**"] },
      fs: {
        // Preserva os bloqueios do Vite e protege credenciais/artefatos de teste.
        deny: [
          ".env",
          ".env.*",
          "*.{crt,pem,key,p12,pfx,cer,der}",
          ".npmrc",
          ".yarnrc.yml",
          "**/.git/**",
          "**/*.local",
          "**/output/**",
          "**/backups/**",
          "**/docs/validacao-real/**",
        ],
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "patio-conexoes-proxy",
        configureServer(server) {
          server.httpServer?.once("close", () => agenteProxy?.destroy());
        },
        configurePreviewServer(server) {
          server.httpServer.once("close", () => agenteProxy?.destroy());
        },
      },
      {
        name: "patio-offline",
        apply: "build",
        configResolved(config) {
          pastaBuild = resolve(config.root, config.build.outDir);
        },
        closeBundle() {
          // Forneça os arquivos finais para prefetch sem importar/executar os componentes.
          const entrada = resolve(pastaBuild, "index.html");
          const manifesto = resolve(pastaBuild, ".vite/manifest.json");
          if (existsSync(entrada) && existsSync(manifesto)) {
            type Entrada = { file: string; css?: string[]; imports?: string[] };
            const mapa = JSON.parse(readFileSync(manifesto, "utf8")) as Record<
              string,
              Entrada
            >;
            const preparacao: Record<string, string[]> = {};
            for (const chave of Object.values(telas).filter((k) => mapa[k])) {
              const vistos = new Set<string>(),
                arquivos = new Set<string>();
              const incluir = (id: string) => {
                if (vistos.has(id)) return;
                vistos.add(id);
                const item = mapa[id];
                if (!item) return;
                arquivos.add("/" + item.file);
                item.css?.forEach((p) => arquivos.add("/" + p));
                item.imports?.forEach(incluir);
              };
              incluir(chave);
              preparacao[chave] = [...arquivos];
            }
            const dados = JSON.stringify(preparacao).replaceAll("<", "\\u003c");
            writeFileSync(
              entrada,
              readFileSync(entrada, "utf8").replace(
                "</head>",
                `<script id="patio-preparacao" type="application/json">${dados}</script></head>`,
              ),
            );
          }
          // O Rolldown pode ajustar hashes após generateBundle. Use os nomes finais.
          const assets = readdirSync(resolve(pastaBuild, "assets"), {
            recursive: true,
          })
            .map(String)
            .filter((p) => /\.(js|css|woff2?)$/.test(p))
            .map((p) => "assets/" + p.replaceAll("\\", "/"))
            .sort();
          const version = ["offline-v5", ...assets]
            .join("|")
            .split("")
            .reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 0);
          const files = [
            "/index.html",
            "/manifest.webmanifest",
            "/icone-patio.svg",
            ...assets.map((p) => "/" + p),
          ];
          writeFileSync(
            resolve(pastaBuild, "sw.js"),
            `const CACHE='patio-static-${version}';const FILES=${JSON.stringify(files)};
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);let proximo=0;
  // Arquivos com hash são imutáveis. Reutilize a versão já baixada; o HTML sempre vem da rede.
  // Três downloads de baixa prioridade evitam disputar todas as conexões com a tela e a API.
  await Promise.all(Array.from({length:3},async()=>{
    while(proximo<FILES.length){
      const url=FILES[proximo++],imutavel=url.startsWith('/assets/');
      const req=new Request(url,{cache:imutavel?'default':'reload',priority:'low'});
      const anterior=imutavel?await caches.match(req,{ignoreVary:true}):null;
      const resposta=anterior||await fetch(req);
      if(!resposta.ok)throw Error('Falha ao preparar o aplicativo sem internet.');
      await cache.put(req,resposta);
    }
  }));
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('patio-static-')&&k!==CACHE).slice(0,-1).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const req=event.request,u=new URL(req.url);if(req.method!=='GET'||u.origin!==self.location.origin)return;if(req.mode==='navigate'){event.respondWith(fetch(req,{signal:AbortSignal.timeout(5000)}).then(r=>r.ok?r:Promise.reject()).catch(()=>caches.open(CACHE).then(c=>c.match('/index.html'))));return;}if((FILES.includes(u.pathname)||u.pathname.startsWith('/assets/'))&&!u.search)event.respondWith(caches.open(CACHE).then(c=>c.match(req,{ignoreVary:true})).then(r=>r||caches.match(req,{ignoreVary:true})).then(r=>r||fetch(req)));});`,
          );
          writeFileSync(
            resolve(pastaBuild, "health.json"),
            JSON.stringify({
              status: "ok",
              build: String(version),
              geradoEm: new Date().toISOString(),
            }),
          );
        },
      },
    ],
  };
});
