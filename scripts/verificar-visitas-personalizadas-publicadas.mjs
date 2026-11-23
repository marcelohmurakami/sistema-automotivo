// Interface publicada + banco real, somente nas 26 empresas fictícias autorizadas.
// Senhas e tokens permanecem em memória e não são incluídos nas evidências.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = "https://patio-gestao-peach.vercel.app",
  banco = "https://hzihxtjirttetnfdujcx.supabase.co";
const out = process.env.QA_OUT || "output/visitas-publicadas-20261109";
await mkdir(out, { recursive: true });
const cred = JSON.parse(
  await readFile("output/contas-teste/20261019/credenciais.local.json", "utf8"),
);
assert.equal(cred.projeto, "hzihxtjirttetnfdujcx");
assert.equal(cred.contas.length, 26);
const filtro = process.argv.find((x) => x.startsWith("--perfil="))?.slice(9);
const grupo = process.argv.find((x) => x.startsWith("--grupo="))?.slice(8);
assert(!grupo || ["automotivo", "servicos"].includes(grupo));
const lote =
  process.argv.find((x) => x.startsWith("--lote="))?.slice(7) || String(Date.now());
assert(/^[a-zA-Z0-9_-]+$/.test(lote));
const health = await fetch(base + "/health.json?qa=" + Date.now()).then((r) =>
  r.json(),
);
const contas = cred.contas.filter(
  (c) =>
    (!process.env.QA_PERFIS || process.env.QA_PERFIS.split(",").includes(c.especialidade)) &&
    (!filtro || c.especialidade === filtro) &&
    (!grupo ||
      (grupo === "automotivo" ? c.ramo === "automotivo" : c.ramo !== "automotivo")),
);
assert(contas.length);
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const resultados = [];
let p, ctx;
const arquivo = `${out}/${lote}${filtro ? "-" + filtro : ""}.json`;
let anteriores = [];
try {
  const anterior = await readFile(arquivo, "utf8");
  anteriores = JSON.parse(anterior).resultados;
  await writeFile(
    arquivo.replace(".json", "-anterior-" + Date.now() + ".json"),
    anterior,
  );
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const persistir = () =>
  writeFile(
    arquivo,
    JSON.stringify(
      {
        build: health.build,
        url: base,
        iniciadoEm: new Date().toISOString(),
        resultados,
      },
      null,
      2,
    ),
  );
const dia = "2026-11-18",
  amanha = "2026-11-19";
const iso = (local) => new Date(local + ":00-03:00").toISOString();
let passo = "";
try {
  for (const c of contas) {
    const perfil = c.especialidade,
      auto = c.ramo === "automotivo";
    assert(c.empresa.startsWith("ZZ [TESTE 20261019] "));
    const r = {
      perfil,
      empresa: c.empresa_id,
      ok: false,
      checks: [],
      registros: [],
      rejeicoes: [],
      erros: [],
      limpeza: [],
    };
    resultados.push(r);
    await persistir();
    const nomeEquipe = auto
        ? `qa visita ${lote} ${perfil}`
        : `QA Visita ${lote} ${perfil}`,
      recursoId = randomUUID();
    let headers,
      criouRecurso = false;
    const tabela = auto ? "agenda_atendimentos" : "agenda_servicos",
      funcao = auto ? "operar_produtividade" : "salvar_agenda_servico";
    await ctx?.close();
    ctx = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
    });
    p = await ctx.newPage();
    p.setDefaultTimeout(30000);
    p.on("pageerror", (e) => r.erros.push(e.message));
    p.on("request", (req) => {
      if (req.url().startsWith(banco + "/rest/v1/")) {
        const h = req.headers();
        if (h.authorization)
          headers = {
            authorization: h.authorization,
            apikey: h.apikey,
            "content-type": "application/json",
          };
      }
    });
    // Nunca permitir mutações de outros módulos por acidente durante esta jornada.
    await ctx.route(banco + "/rest/v1/rpc/**", (route) => {
      const req = route.request(),
        n = new URL(req.url()).pathname.split("/").at(-1);
      if (
        /^(salvar|operar|criar|baixar|estornar|cancelar|registrar|transferir|movimentar|faturar)/.test(
          n,
        ) &&
        ![
          "operar_produtividade",
          "salvar_agenda_servico",
          "salvar_recurso_agenda",
        ].includes(n)
      )
        return route.abort();
      return route.continue();
    });
    const rpc = async (n, args) => {
      assert.equal(args.p_oficina, c.empresa_id);
      const resp = await p.request.post(banco + "/rest/v1/rpc/" + n, {
        headers,
        data: args,
      });
      if (!resp.ok())
        throw Error(n + " " + resp.status() + " " + (await resp.text()).slice(0, 600));
      return resp.status() === 204 ? null : resp.json();
    };
    const ler = async (id, table = tabela) => {
      if (auto && table === tabela)
        return (
          await rpc("consultar_produtividade", { p_oficina: c.empresa_id })
        ).agenda.find((x) => x.id === id);
      const dados = await rpc("pagina_servicos", {
        p_oficina: c.empresa_id,
        p_filtros: {
          tela: "agenda",
          reserva: table === tabela ? id : "",
          inicio: "2026-11-17",
          fim: "2026-11-21",
        },
      });
      return (table === "recursos_agenda" ? dados.recursos : dados.agenda).find(
        (x) => x.id === id,
      );
    };
    const registrar = async (nome) => {
      r.checks.push(nome);
      await persistir();
      console.log("OK", perfil, nome);
    };
    const fechar = () =>
      p
        .locator("dialog[open]")
        .last()
        .getByRole("button", { name: "Fechar janela", exact: true })
        .click();
    const evento = (hora) =>
      p
        .locator(".cal-oficina-evento")
        .filter({ hasText: hora })
        .first();
    const layout = async () => {
      assert(
        await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        "Página com overflow horizontal",
      );
      for (const d of await p.locator("dialog[open]").all())
        assert(
          await d.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
          "Diálogo com overflow horizontal",
        );
    };
    async function calendario(data = dia) {
      await p.getByLabel("Data", { exact: true }).fill(data);
      if (auto) {
        await p.getByLabel("Visualização", { exact: true }).selectOption("dia");
        const s = p.getByLabel("Box ou responsável", { exact: true });
        if (await s.locator("option").filter({ hasText: nomeEquipe }).count())
          await s.selectOption(nomeEquipe);
      } else {
        await p.getByLabel("Visualização", { exact: true }).selectOption("dia");
        await p.getByLabel("Profissional / equipe", { exact: true }).selectOption(recursoId);
      }
    }
    async function visita(d) {
      await d.getByRole("checkbox", { name: "Visita ao cliente", exact: true }).check();
      await d
        .getByLabel("Ponto de partida", { exact: true })
        .fill("Rua de Teste, 100, São Paulo, SP");
      await d
        .getByLabel("Endereço da visita", { exact: true })
        .fill("Rua de Teste, 200, São Paulo, SP");
      await d.getByLabel("Ida (min)", { exact: true }).fill("20");
      await d.getByLabel("Margem de segurança (min)", { exact: true }).fill("10");
      await d
        .getByRole("checkbox", {
          name: "Reservar retorno ao ponto de partida",
          exact: true,
        })
        .check();
      await d.getByLabel("Retorno (min)", { exact: true }).fill("15");
    }
    async function duracao(d, h, m) {
      await d.getByRole("button", { name: "Personalizar", exact: true }).click();
      const campos = d.getByRole("group", {
        name: "Duração personalizada",
        exact: true,
      });
      await campos.getByLabel("Horas", { exact: true }).fill(String(h));
      await campos.getByLabel("Minutos", { exact: true }).fill(String(m));
    }
    async function novo(hora, h, m) {
      await p.getByRole("button", { name: "Novo agendamento", exact: true }).click();
      const d = p.getByRole("dialog", { name: "Novo agendamento", exact: true });
      await d
        .getByRole("combobox", { name: auto ? "Cliente" : "Atendimento", exact: true })
        .click();
      await d.locator("[role=option]").first().click();
      if (auto) {
        await d.locator("[name=identificacao]").fill("Veículo fictício QA");
        await d.locator("[name=recurso]").fill(nomeEquipe);
        await d.locator("[name=servico]").fill("QA Visita personalizada " + lote);
      } else {
        await d.locator("[name=recurso_id]").selectOption(recursoId);
        await d.locator("[name=observacoes]").fill("QA Visita personalizada " + lote);
      }
      await d.locator("[name=inicio]").fill(dia + "T" + hora);
      await visita(d);
      await duracao(d, h, m);
      return d;
    }
    async function salvar(d, rejeitar = false) {
      const wait = p.waitForResponse(
        (resp) =>
          resp.url().endsWith("/rpc/" + funcao) && resp.request().method() === "POST",
      );
      await d.getByRole("button", { name: "Salvar agendamento", exact: true }).click();
      const resp = await wait,
        args = resp.request().postDataJSON(),
        id = auto ? args.p_dados.id : args.p_id,
        body = await resp.json();
      assert.equal(args.p_oficina, c.empresa_id);
      if (rejeitar) {
        assert(!resp.ok(), "Conflito aceito indevidamente");
        assert.match(JSON.stringify(body), /conflit|horário|ocupad|reserva/i);
        r.rejeicoes.push({
          id,
          status: resp.status(),
          mensagem: body.message || body.error,
          horario: args.p_dados.inicio,
        });
        await persistir();
        await d
          .getByRole("alert")
          .filter({ hasText: /conflit|horário|ocupad|reserva/i })
          .first()
          .waitFor();
        return id;
      }
      assert(resp.ok(), "Salvar: " + resp.status() + " " + JSON.stringify(body));
      if (!r.registros.includes(id)) {
        r.registros.push(id);
        await persistir();
      }
      await d.waitFor({ state: "hidden" });
      const registro = await ler(id);
      assert(registro, "Registro ausente no banco");
      assert.equal(Date.parse(registro.inicio), Date.parse(args.p_dados.inicio));
      assert.equal(Date.parse(registro.fim), Date.parse(args.p_dados.fim));
      assert.equal(registro.visita, true);
      assert.equal(registro.deslocamento_minutos, 20);
      assert.equal(registro.logistica.retorno_minutos, 15);
      return registro;
    }
    async function editar(hora) {
      await evento(hora).click();
      if (auto)
        await p
          .getByRole("dialog", { name: "Detalhes do agendamento", exact: true })
          .getByRole("button", { name: "Editar agendamento", exact: true })
          .click();
      return p.getByRole("dialog", { name: "Editar agendamento", exact: true });
    }
    try {
      passo = "login";
      await p.goto(base + "/entrar");
      await p.getByLabel("E-mail", { exact: true }).fill(c.email);
      await p.getByLabel("Senha", { exact: true }).fill(c.senha);
      await p.getByRole("button", { name: "Entrar no sistema", exact: true }).click();
      await p.waitForURL((u) => !u.pathname.startsWith("/entrar"));
      await p.goto(base + (auto ? "/produtividade" : "/agenda"));
      await p.getByRole("button", { name: "Novo agendamento", exact: true }).waitFor();
      assert(headers, "Sessão não identificada");
      const anterior = anteriores.find((x) => x.perfil === perfil);
      for (const id of anterior?.registros || []) {
        const x = await ler(id);
        assert(x);
        assert(auto ? x.recurso === nomeEquipe : x.recurso_id === anterior.recurso);
        if (x.situacao !== "cancelado") {
          if (auto)
            await rpc("operar_produtividade", {
              p_oficina: c.empresa_id,
              p_acao: "cancelar_agenda",
              p_dados: { id, revisao: x.revisao },
            });
          else
            await rpc("salvar_agenda_servico", {
              p_oficina: c.empresa_id,
              p_id: id,
              p_revisao: x.revisao,
              p_dados: { ...x, situacao: "cancelado" },
            });
        }
      }
      if (!auto) {
        await rpc("salvar_recurso_agenda", {
          p_oficina: c.empresa_id,
          p_id: recursoId,
          p_nome: nomeEquipe,
          p_ativo: true,
        });
        criouRecurso = true;
        r.recurso = recursoId;
        await persistir();
        await p.reload();
        await p
          .getByRole("button", { name: "Novo agendamento", exact: true })
          .waitFor();
      }
      await calendario();
      passo = "criar A desktop";
      let d = await novo("09:00", 1, 45);
      assert.equal(await d.locator("[name=fim]").inputValue(), dia + "T10:45");
      await layout();
      const a = await salvar(d);
      assert.equal(Date.parse(a.fim) - Date.parse(a.inicio), 105 * 60000);
      await calendario();
      await evento("09:00").waitFor();
      assert((await evento("09:00").innerText()).includes("10:45"));
      await p.reload();
      await p.getByRole("button", { name: "Novo agendamento", exact: true }).waitFor();
      await calendario();
      await evento("09:00").waitFor();
      await registrar(
        "Desktop: criar 1h45, conferir banco, calendário e persistência após recarregar",
      );
      passo = "conflitos de criação mobile";
      await p.setViewportSize({ width: 390, height: 844 });
      await layout();
      for (const [hora, motivo] of [
        ["10:00", "atendimento"],
        ["11:10", "deslocamento"],
      ]) {
        d = await novo(hora, 0, 45);
        await layout();
        const rejeitado = await salvar(d, true);
        assert.equal(await ler(rejeitado), undefined);
        await fechar();
        await registrar(
          "Celular: bloqueio real de conflito por " +
            motivo +
            ", sem registro indevido",
        );
      }
      passo = "criar B limite livre mobile";
      d = await novo("11:30", 0, 45);
      const b = await salvar(d);
      assert.equal(Date.parse(b.fim), Date.parse(iso(dia + "T12:15")));
      await calendario();
      await evento("11:30").waitFor();
      await registrar(
        "Celular: reserva permitida no limite exato após liberação da equipe",
      );
      passo = "edição conflitante mobile";
      d = await editar("11:30");
      await d.locator("[name=inicio]").fill(dia + "T10:30");
      await duracao(d, 1, 15);
      await salvar(d, true);
      let conferido = await ler(b.id);
      assert.equal(Date.parse(conferido.inicio), Date.parse(b.inicio));
      assert.equal(Date.parse(conferido.fim), Date.parse(b.fim));
      await registrar(
        "Edição conflitante rejeitada; horários anteriores preservados no banco",
      );
      passo = "editar B meia-noite mobile";
      await d.locator("[name=inicio]").fill(dia + "T23:30");
      await duracao(d, 1, 45);
      conferido = await salvar(d);
      assert.equal(Date.parse(conferido.fim), Date.parse(iso(amanha + "T01:15")));
      await calendario();
      await evento("23:30").waitFor();
      await calendario(amanha);
      await evento("23:30").waitFor();
      await registrar(
        "Visita de 23h30 a 1h15 salva e aparece nos dois dias do calendário",
      );
      passo = "editar A duração mobile";
      await calendario();
      d = await editar("09:00");
      const campos = d.getByRole("group", {
        name: "Duração personalizada",
        exact: true,
      });
      assert.equal(await campos.getByLabel("Horas", { exact: true }).inputValue(), "1");
      assert.equal(
        await campos.getByLabel("Minutos", { exact: true }).inputValue(),
        "45",
      );
      await duracao(d, 2, 15);
      await layout();
      await p.screenshot({ path: `${out}/${lote}-${perfil}-editar-mobile.png` });
      conferido = await salvar(d);
      assert.equal(Date.parse(conferido.fim), Date.parse(iso(dia + "T11:15")));
      await p.reload();
      await p.getByRole("button", { name: "Novo agendamento", exact: true }).waitFor();
      await calendario();
      await evento("09:00").waitFor();
      assert((await evento("09:00").innerText()).includes("11:15"));
      await layout();
      await p.screenshot({ path: `${out}/${lote}-${perfil}-calendario-mobile.png` });
      await registrar(
        "Celular: edição para 2h15, valores reabertos e calendário persistido",
      );
      passo = "layout final";
      for (const width of [320, 1920]) {
        await p.setViewportSize({ width, height: width === 320 ? 844 : 1080 });
        await layout();
        await evento("09:00").waitFor();
        d = await editar("09:00");
        await d.locator(".visita-duracao").scrollIntoViewIfNeeded();
        await layout();
        await p.screenshot({ path: `${out}/${lote}-${perfil}-${width}.png` });
        await fechar();
      }
      await registrar("Layout dos formulários e calendário a 320, 390 e 1920 px");
      assert.deepEqual(r.erros, []);
      r.ok = true;
    } catch (e) {
      r.falha = { passo, mensagem: e.message };
      console.error("FAIL", perfil, passo, e.message);
      if (p && !p.isClosed()) {
        await p.screenshot({ path: `${out}/${lote}-${perfil}-falha.png` });
        await writeFile(
          `${out}/${lote}-${perfil}-falha.txt`,
          await p.locator("body").innerText(),
        );
      }
    } finally {
      // Cancela apenas as reservas recém-criadas, mantendo a evidência no histórico.
      for (const id of r.registros) {
        try {
          const x = await ler(id);
          assert(auto ? x.recurso === nomeEquipe : x.recurso_id === recursoId);
          if (x.situacao !== "cancelado") {
            if (auto)
              await rpc("operar_produtividade", {
                p_oficina: c.empresa_id,
                p_acao: "cancelar_agenda",
                p_dados: { id, revisao: x.revisao },
              });
            else
              await rpc("salvar_agenda_servico", {
                p_oficina: c.empresa_id,
                p_id: id,
                p_revisao: x.revisao,
                p_dados: { ...x, situacao: "cancelado" },
              });
          }
          assert.equal((await ler(id)).situacao, "cancelado");
          r.limpeza.push({ id, cancelado: true });
        } catch (e) {
          r.limpeza.push({ id, erro: e.message });
          r.ok = false;
        }
      }
      if (criouRecurso) {
        try {
          const recurso = await ler(recursoId, "recursos_agenda");
          assert.equal(recurso.nome, nomeEquipe);
          await rpc("salvar_recurso_agenda", {
            p_oficina: c.empresa_id,
            p_id: recursoId,
            p_nome: nomeEquipe,
            p_ativo: false,
            p_revisao: recurso.revisao,
          });
          r.recursoInativado = true;
        } catch (e) {
          r.erroLimpezaRecurso = e.message;
          r.ok = false;
        }
      }
      await persistir();
      console.log(
        r.ok ? "PASS" : "PENDENTE",
        perfil,
        r.checks.length + " verificações",
      );
    }
  }
} finally {
  await browser.close();
  await persistir();
  console.log(
    JSON.stringify({
      ok: resultados.every((r) => r.ok),
      subsistemas: resultados.length,
      verificacoes: resultados.reduce((n, r) => n + r.checks.length, 0),
      arquivo,
    }),
  );
  if (resultados.some((r) => !r.ok)) process.exitCode = 1;
}
