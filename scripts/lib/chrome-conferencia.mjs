import { chromium as chrome } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { instrumentarJornadas, finalizarJornadas } from "./medir-jornadas.mjs";
export const chromium = {
  launch: async (options) => {
    // O limite de encerramento também protege as bancadas sem instrumentação.
    const server = await chrome.launchServer(options),
      browser = await chrome.connect(server.wsEndpoint());
    const nomes = new Set(),
      vistos = new WeakSet();
    let timer,
      gravacao = Promise.resolve();
    const persistir = () => {
      if (!process.env.QA_COVERAGE_FILE) return Promise.resolve();
      gravacao = gravacao.then(async () => {
        await mkdir(dirname(process.env.QA_COVERAGE_FILE), { recursive: true });
        await writeFile(
          process.env.QA_COVERAGE_FILE,
          JSON.stringify(
            { geradoEm: new Date().toISOString(), componentes: [...nomes].sort() },
            null,
            2,
          ),
        );
      });
      return gravacao;
    };
    const preparar = async (ctx) => {
      if (vistos.has(ctx)) return;
      vistos.add(ctx);
      if (process.env.QA_JORNADAS_FILE) {
        ctx.on("page", instrumentarJornadas);
        ctx.pages().forEach(instrumentarJornadas);
      }
      if (!process.env.QA_COVERAGE_FILE) return;
      await ctx.exposeBinding("__qaRegistrarComponente", (_, nome) => {
        if (nomes.has(nome)) return;
        nomes.add(nome);
        if (!timer) {
          timer = setTimeout(() => {
            timer = undefined;
            void persistir();
          }, 1000);
          timer.unref();
        }
      });
    };
    const novo = browser.newContext.bind(browser);
    browser.newContext = async (o) => {
      const ctx = await novo(o);
      await preparar(ctx);
      return ctx;
    };
    const pagina = browser.newPage.bind(browser);
    browser.newPage = async (o) => {
      const p = await pagina(o);
      await preparar(p.context());
      if (process.env.QA_JORNADAS_FILE) instrumentarJornadas(p);
      return p;
    };
    const fechar = browser.close.bind(browser);
    browser.close = async (o) => {
      await finalizarJornadas();
      clearTimeout(timer);
      await persistir();
      let limite;
      const timeout = new Promise((_, reject) => {
        limite = setTimeout(
          () => reject(Error("Encerramento do Chrome de teste excedeu 15s")),
          15000,
        );
      });
      try {
        await Promise.race([
          (async () => {
            await fechar(o);
            await server.close();
          })(),
          timeout,
        ]);
      } catch (e) {
        console.warn(e.message);
        await server.kill();
      } finally {
        clearTimeout(limite);
        clearTimeout(timer);
        await persistir();
      }
    };
    return browser;
  },
};
