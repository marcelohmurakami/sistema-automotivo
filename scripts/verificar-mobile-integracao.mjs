import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { preview } from "vite";
import { chromium } from "playwright";
const pasta = resolve("output/mobile-oficina-20261123/integracao");
await mkdir(pasta, { recursive: true });
const conta = JSON.parse(
  await readFile("output/contas-teste/20261019/credenciais.local.json", "utf8"),
).contas.find((c) => c.especialidade === "retifica");
assert(conta?.empresa.startsWith("ZZ [TESTE 20261019] "));
assert.notEqual(conta.empresa_id, "e898f8dc-5e29-50d5-a746-7929f8cef4ab");
const server = await preview({
  logLevel: "error",
  preview: { port: 0, host: "127.0.0.1" },
});
const base = server.resolvedUrls.local[0].replace(/\/$/, "");
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    hasTouch: true,
    serviceWorkers: "block",
  }),
  p = await ctx.newPage();
p.setDefaultTimeout(45000);
const resultados = [],
  erros = [],
  criados = [];
let headers, os;
const banco = "https://hzihxtjirttetnfdujcx.supabase.co";
p.on("request", (r) => {
  if (r.url().includes("/rest/v1/")) {
    const h = r.headers();
    if (h.authorization)
      headers = {
        authorization: h.authorization,
        apikey: h.apikey,
        "content-type": "application/json",
      };
  }
});
p.on("pageerror", (e) => erros.push(e.message));
async function rpc(n, args) {
  assert.equal(args.p_oficina, conta.empresa_id);
  const r = await p.request.post(banco + "/rest/v1/rpc/" + n, { headers, data: args });
  assert(r.ok(), n + ": " + r.status() + " " + (await r.text()));
  return r.status() === 204 ? null : r.json();
}
const pass = (cenario, dados = {}) => {
  resultados.push({ cenario, ok: true, ...dados });
  console.log("PASS", cenario);
};
try {
  await p.goto(base + "/entrar", { waitUntil: "domcontentloaded" });
  await p.getByLabel("E-mail", { exact: true }).fill(conta.email);
  await p.getByLabel("Senha", { exact: true }).fill(conta.senha);
  await p.getByRole("button", { name: "Entrar no sistema", exact: true }).click();
  await p
    .getByRole("textbox", { name: "Buscar veículo no mapa", exact: true })
    .waitFor();
  pass("Login da empresa fictícia e mapa real no celular");
  await p.goto(base + "/ordens-servico", { waitUntil: "domcontentloaded" });
  await p.getByRole("button", { name: "Nova OS", exact: true }).click();
  await p.getByRole("combobox", { name: "Cliente", exact: true }).click();
  await p
    .getByRole("option", { name: "Informar cliente sem cadastrar", exact: true })
    .click();
  await p
    .getByLabel("Nome do cliente", { exact: true })
    .fill("QA MOBILE FOTO " + Date.now());
  await p.getByLabel("Carro", { exact: true }).fill("Veículo fictício QA");
  await p.getByLabel("Motor", { exact: true }).fill("Motor QA");
  const imagem = {
    name: "teste-mobile.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      await p.evaluate(() => {
        const c = document.createElement("canvas");
        c.width = 240;
        c.height = 120;
        const x = c.getContext("2d");
        x.fillStyle = "#369";
        x.fillRect(0, 0, 240, 120);
        return c.toDataURL().split(",")[1];
      }),
      "base64",
    ),
  };
  await p
    .getByLabel("Tirar foto do atendimento", { exact: true })
    .setInputFiles(imagem);
  await p.getByRole("img", { name: "Foto do atendimento 1", exact: true }).waitFor();
  const upload = "**/storage/v1/object/workshop-files/**";
  await p.route(upload, (r) =>
    r.request().method() === "POST" ? r.abort("internetdisconnected") : r.continue(),
  );
  const resposta = p.waitForResponse(
    (r) =>
      r.url().includes("/rpc/salvar_os_com_itens") &&
      r.request().postDataJSON()?.p_oficina === conta.empresa_id,
  );
  await p.getByRole("button", { name: "Abrir ordem de serviço", exact: true }).click();
  const res = await resposta;
  assert(res.ok());
  os = await res.json();
  await p
    .getByRole("button", { name: "Tentar enviar fotos novamente", exact: true })
    .waitFor();
  assert.equal(
    (await rpc("consultar_ordem_servico", { p_oficina: conta.empresa_id, p_os: os.id }))
      .fotos.length,
    0,
  );
  pass("Falha de rede não perde foto nem duplica a OS", {
    os: os.id,
    numero: os.numero,
  });
  await p.unroute(upload);
  await p.goto(base + "/ordens-servico?os=" + os.id, { waitUntil: "domcontentloaded" });
  await p
    .getByRole("button", { name: "Tentar enviar fotos novamente", exact: true })
    .click();
  await p
    .getByRole("button", { name: "Tentar enviar fotos novamente", exact: true })
    .waitFor({ state: "hidden" });
  await p.getByRole("button", { name: "Fotos", exact: true }).click();
  await p
    .getByRole("img", { name: "Foto registrada na criação da OS", exact: true })
    .waitFor();
  await p.waitForFunction(() =>
    [...document.images].some(
      (i) =>
        i.alt === "Foto registrada na criação da OS" &&
        i.complete &&
        i.naturalWidth > 0,
    ),
  );
  let atual = await rpc("consultar_ordem_servico", {
    p_oficina: conta.empresa_id,
    p_os: os.id,
  });
  assert.equal(atual.fotos.length, 1);
  await p.screenshot({ path: resolve(pasta, "foto-persistida-mobile.png") });
  pass("Reabertura recupera fila e envia uma única imagem ao Storage privado");
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.getByRole("button", { name: "Fotos", exact: true }).click();
  await p
    .getByRole("img", { name: "Foto registrada na criação da OS", exact: true })
    .waitFor();
  assert.equal(
    (await rpc("consultar_ordem_servico", { p_oficina: conta.empresa_id, p_os: os.id }))
      .fotos.length,
    1,
  );
  pass("Foto confirmada permanece após segunda reabertura");
  const hoje = await p.evaluate(() =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
      new Date(),
    ),
  );
  for (const variavel of [false, true]) {
    const r = {
      id: randomUUID(),
      descricao: "QA MOBILE " + (variavel ? "variável " : "fixa ") + Date.now(),
      natureza: "pagar",
      categoria: "outras_despesas",
      valor_centavos: variavel ? 0 : 199,
      valor_variavel: variavel,
      dia: Number(hoje.slice(-2)),
      inicio: hoje,
      fim: null,
      ativa: true,
      revisao: 0,
    };
    await rpc("salvar_conta_recorrente", {
      p_oficina: conta.empresa_id,
      p_id: r.id,
      p_dados: r,
      p_revisao: 0,
    });
    criados.push(r);
    await p.goto(base + "/financeiro?aba=recorrencias", {
      waitUntil: "domcontentloaded",
    });
    await p
      .getByRole("button", {
        name: `Registrar pagamento de ${r.descricao} neste mês`,
        exact: true,
      })
      .click();
    if (variavel) {
      await p
        .getByRole("dialog", { name: "Informar valor do mês", exact: true })
        .waitFor();
      await p.getByLabel("Valor deste mês", { exact: true }).fill("2.13");
      await p
        .getByRole("button", { name: "Salvar valor e registrar", exact: true })
        .click();
    }
    const d = p.getByRole("dialog", { name: "Registrar pagamento", exact: true });
    await d.waitFor();
    assert(await d.evaluate((e) => e.scrollWidth <= e.clientWidth + 1));
    await d.getByRole("button", { name: "Confirmar registro", exact: true }).click();
    await d.waitFor({ state: "hidden" });
    const titulos = await p.request.get(
      banco +
        "/rest/v1/titulos_financeiros?select=id,valor_centavos&oficina_id=eq." +
        conta.empresa_id +
        "&recorrencia_id=eq." +
        r.id,
      { headers },
    );
    assert(titulos.ok());
    const lista = await titulos.json();
    assert.equal(lista.length, 1);
    const t = await rpc("consultar_titulo_alerta", {
      p_oficina: conta.empresa_id,
      p_titulo: lista[0].id,
    });
    assert.equal(t.aberto_centavos, 0);
    assert.equal(t.baixado_centavos, variavel ? 213 : 199);
    pass(
      "Pagamento " +
        (variavel ? "variável" : "fixo") +
        " real da empresa fictícia confere centavos e saldo",
      { titulo: t.id, valor: t.baixado_centavos },
    );
    const regras = await rpc("consultar_contas_recorrentes", {
      p_oficina: conta.empresa_id,
    });
    const atualRegra = regras.find((x) => x.id === r.id);
    await rpc("salvar_conta_recorrente", {
      p_oficina: conta.empresa_id,
      p_id: r.id,
      p_revisao: atualRegra.revisao,
      p_dados: { ...atualRegra, ativa: false },
    });
  }
  atual = await rpc("consultar_ordem_servico", {
    p_oficina: conta.empresa_id,
    p_os: os.id,
  });
  await rpc("excluir_ordem_servico", {
    p_oficina: conta.empresa_id,
    p_os: os.id,
    p_revisao: atual.revisao,
    p_motivo: "Encerramento de OS fictícia da validação mobile de 23/11/2026.",
  });
  pass("OS de teste encerrada e recorrências de teste pausadas");
  assert.deepEqual(erros, []);
} catch (e) {
  process.exitCode = 1;
  console.error(e.stack);
  await p.screenshot({ path: resolve(pasta, "falha.png"), fullPage: true });
  await writeFile(resolve(pasta, "falha.txt"), await p.locator("body").innerText());
} finally {
  await writeFile(
    resolve(pasta, "resultados.json"),
    JSON.stringify(
      {
        ok: !process.exitCode,
        empresa: conta.empresa,
        os: os?.id,
        recorrencias: criados.map((r) => r.id),
        resultados,
        erros,
        metodo:
          "Frontend local com Supabase conectado, somente empresa fictícia. Upload privado real e pagamentos fictícios confirmados pelos fluxos da interface.",
      },
      null,
      2,
    ),
  );
  await browser.close();
  await new Promise((ok) => server.httpServer.close(ok));
}
