import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build, preview } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright";

const pasta = resolve(
  process.env.QA_OUTPUT || "output/pronto-pagamento-entrega-20261124",
);
await mkdir(pasta, { recursive: true });
const config = {
  configFile: false,
  envDir: false,
  logLevel: "error",
  plugins: [react(), tailwindcss()],
  define: {
    "import.meta.env.VITE_SUPABASE_URL": '""',
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": '""',
  },
  build: {
    outDir: resolve(pasta, "build"),
    rollupOptions: { input: "scripts/fixtures/pagamento-entrega.html" },
  },
};
if (!process.argv.includes("--sem-build")) await build(config);
const server = await preview({ ...config, preview: { host: "127.0.0.1", port: 0 } });
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const base = server.resolvedUrls.local[0] + "scripts/fixtures/pagamento-entrega.html";
const resultados = [],
  erros = [];
let ctx, p;
const pergunta = () =>
  p.getByRole("dialog", { name: "Como ficou o pagamento da OS?", exact: true });
const financeiro = () =>
  p.evaluate(() =>
    JSON.parse(
      localStorage.getItem("patio_financeiro_v1") || '{"titulos":[],"baixas":[]}',
    ),
  );
async function iniciar(width, extra = "") {
  await ctx?.close();
  ctx = await browser.newContext({
    viewport: { width, height: 900 },
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  });
  p = await ctx.newPage();
  p.setDefaultTimeout(15000);
  p.on("pageerror", (e) => erros.push(e.message));
  await p.goto(base + "?" + extra);
  await p.locator("dialog[open]").first().waitFor();
}

const btn = (name) => p.getByRole("button", { name, exact: true });
async function conferirSaldoNaEntrega(modo) {
  if (modo === "total") {
    await p
      .getByText("Conferindo o pagamento já registrado…", { exact: true })
      .waitFor({ state: "hidden" });
    await pergunta().waitFor({ state: "hidden" });
    return;
  }
  await pergunta().getByRole("button", { name: "Já recebi", exact: false }).waitFor();
  assert.match(
    await pergunta().locator(".pagamento-registro-saldo strong").innerText(),
    modo === "parcial" ? /100,00/ : /150,00/,
  );
  assert(await pergunta().evaluate((d) => d.scrollWidth <= d.clientWidth + 1));
  if (["parcial", "prazo"].includes(modo)) {
    await pergunta().getByText("Combinado para 24/12/2026", { exact: true }).waitFor();
    await pergunta().getByRole("button", { name: "A receber", exact: false }).click();
    assert.equal(
      await p.getByLabel("Receber em", { exact: true }).inputValue(),
      "2026-12-24",
    );
    await p
      .getByRole("dialog", { name: "Combinar pagamento", exact: true })
      .getByRole("button", { name: "Fechar janela", exact: true })
      .click();
  }
}
async function manterPendente(modo) {
  await pergunta()
    .getByRole("button", {
      name: ["parcial", "prazo"].includes(modo)
        ? "Manter pagamento para 24/12/2026"
        : "Agora não",
      exact: true,
    })
    .click();
}
const entrega = () =>
  p.getByRole("dialog", {
    name: /^(O serviço já foi entregue ao cliente|O cliente já conferiu e aceitou o serviço)\?$/,
  });
const os = (auto) =>
  p.evaluate(
    (auto) =>
      auto
        ? JSON.parse(localStorage.patio_os_v1).at(-1)
        : JSON.parse(localStorage["patio_servicos:demo"]).atendimentos.at(-1),
    auto,
  );
async function preencher(perfil, valor = "150") {
  await btn("Abrir ordem de serviço").waitFor();
  const form = p.locator("form.documento-simples");
  const auto = await btn("Cliente sem cadastro").isVisible();
  if (auto) {
    await btn("Cliente sem cadastro").click();
    await p
      .getByLabel("Nome do cliente", { exact: true })
      .fill("Cliente QA pagamento e entrega");
    if (perfil === "retifica") {
      await p.getByLabel("Carro", { exact: true }).fill("Fiat Palio");
      await p.getByLabel("Motor", { exact: true }).fill("Fire 1.0");
    } else {
      await btn("Novo veículo").click();
      await p
        .getByLabel("Nome / modelo do veículo", { exact: true })
        .fill("Fiat Palio QA");
      await btn("Cadastrar e selecionar").click();
    }
  } else {
    await btn("Novo cliente").click();
    await p
      .getByLabel("Nome do novo cliente", { exact: true })
      .fill("Cliente QA pagamento e entrega");
    await btn("Cadastrar e selecionar").click();
    await form.locator(".cadastro-rapido-campos input").first().fill("Equipamento QA");
    if (await p.getByLabel("Endereço completo", { exact: true }).isVisible())
      await p
        .getByLabel("Endereço completo", { exact: true })
        .fill("Rua de testes, 10");
    await btn("Cadastrar e selecionar").click();
  }
  await btn("Item avulso").click();
  await p.getByLabel(/^Nome do serviço ou /).fill("Revisão QA");
  await p.getByLabel("Preço unitário (R$)", { exact: true }).fill(valor);
  await btn("Adicionar serviço").click();
  const check = p.getByLabel("O serviço já está pronto para entrega", { exact: true });
  assert(await check.isVisible());
  assert.equal(await check.isChecked(), false);
  assert.equal(await form.locator(".documento-mais-opcoes").getAttribute("open"), null);
  await check.check();
  assert.equal(await form.locator(".documento-mais-opcoes").getAttribute("open"), null);
  return auto;
}
async function pagar(modo, falha = false) {
  await pergunta().getByRole("button", { name: "Já recebi", exact: false }).waitFor();
  assert.equal(await p.evaluate(() => window.qaImpressaoIniciada), 0);
  assert.equal(
    await p.evaluate(() => window.qaJanelas),
    0,
    "Nenhuma janela antes da confirmação de entrega",
  );
  if (modo === "adiar") {
    await pergunta().getByRole("button", { name: "Agora não", exact: true }).click();
    return;
  }
  await pergunta()
    .getByRole("button", {
      name:
        modo === "total"
          ? "Já recebi"
          : modo === "parcial"
            ? "Recebi uma parte"
            : "A receber",
      exact: false,
    })
    .click();
  if (modo === "prazo") {
    await p.getByLabel("Receber em", { exact: true }).fill("2026-12-24");
    await btn("Salvar data combinada").click();
  } else {
    await p
      .getByLabel("Valor pago (R$)", { exact: true })
      .fill(modo === "parcial" ? "50" : "150");
    if (modo === "parcial")
      await p.getByLabel("Vencimento do restante", { exact: true }).fill("2026-12-24");
    if (falha)
      await p.evaluate(() => {
        window.qaFalhaPagamento = true;
      });
    await btn("Confirmar pagamento").click();
    if (falha) {
      await p
        .getByRole("dialog", { name: "Registrar recebimento", exact: true })
        .getByRole("alert")
        .waitFor();
      assert.equal((await financeiro()).baixas.length, 0);
      assert.equal(await entrega().count(), 0);
      await p.evaluate(() => {
        window.qaFalhaPagamento = false;
      });
      await btn("Confirmar pagamento").click();
    }
  }
  await entrega().waitFor();
}
function passou(cenario) {
  resultados.push({ cenario, ok: true });
  console.log("PASS", cenario);
}
const fonte = await readFile("src/lib/especialidades.ts", "utf8");
const perfis = [
  ...fonte
    .slice(fonte.indexOf("export const especialidades:"))
    .matchAll(/^  (\w+): \{/gm),
].map((m) => m[1]);
try {
  for (const [indice, perfil] of (process.argv.includes("--extras")
    ? []
    : perfis
  ).entries())
    for (const width of [390, 1366]) {
      if (
        process.argv.includes("--servicos") &&
        !["assistencia_", "manutencao_", "limpeza_"].some((prefixo) =>
          perfil.startsWith(prefixo),
        )
      )
        continue;
      await iniciar(width, "perfil=" + perfil);
      const auto = await preencher(perfil);
      const modo = ["total", "parcial", "prazo", "adiar"][indice % 4];
      if (
        ["retifica", "assistencia_celulares", "manutencao_climatizacao"].includes(
          perfil,
        )
      ) {
        await p
          .getByLabel("O serviço já está pronto para entrega", { exact: true })
          .scrollIntoViewIfNeeded();
        await p.screenshot({ path: resolve(pasta, perfil + "-" + width + ".png") });
      }
      await btn("Salvar e informar pagamento").click();
      await pagar(modo);
      const antes = await os(auto);
      assert.equal(antes.situacao, auto ? "ready" : "concluido");
      assert(await entrega().evaluate((d) => d.scrollWidth <= d.clientWidth + 1));
      const entregue = width === 1366 && !process.argv.includes("--entrega-pendente");
      await entrega()
        .getByRole("button", {
          name: entregue ? /^Sim, já foi (entregue|aceito)$/ : "Não, deixar aguardando",
          exact: !entregue,
        })
        .click();
      await p.waitForFunction(() => window.qaImpressaoIniciada === 1);
      await entrega().waitFor({ state: "hidden" });
      const salvo = await os(auto),
        f = await financeiro();
      assert.equal(
        f.baixas.reduce((s, b) => s + b.valor_centavos, 0),
        modo === "total" ? 15000 : modo === "parcial" ? 5000 : 0,
      );
      if (auto) assert.equal(salvo.situacao, entregue ? "delivered" : "ready");
      else if (perfil.startsWith("assistencia_"))
        assert.equal(salvo.ficha_especialidade.etapa === "Entregue", entregue);
      else
        assert.equal(
          salvo.ficha_especialidade.campos.situacao_aceite === "Aceito",
          entregue,
        );
      assert.equal(
        (await p.evaluate(() => window.qaDialogos)).filter(
          (t) => t === "Como ficou o pagamento da OS?",
        ).length,
        1,
      );
      if (auto) {
        await p.goto(base + "?perfil=" + perfil + "&mapa");
        if (!entregue) {
          await btn("Entregar OS 1 para Entregue").click();
          await p.waitForFunction(
            () => JSON.parse(localStorage.patio_os_v1).at(-1).situacao === "delivered",
          );
          await conferirSaldoNaEntrega(modo);
          if (modo !== "total") await manterPendente(modo);
          assert.deepEqual((await financeiro()).baixas, f.baixas);
        } else assert.equal(await btn("Entregar OS 1 para Entregue").count(), 0);
      }
      await p.goto(
        base + "?perfil=" + perfil + "&" + (auto ? "os" : "detalhe") + "=" + salvo.id,
      );
      await p.locator("dialog[open]").first().waitFor();
      if (!auto && !entregue) {
        if (perfil.startsWith("assistencia_")) {
          await btn("Registrar retirada").click();
          await btn("Confirmar retirada").click();
        } else {
          await btn("Registrar conferência / aceite").click();
          await p
            .getByLabel("Quem conferiu o serviço?", { exact: true })
            .fill("Cliente QA");
          await btn("Salvar conferência").click();
        }
        await conferirSaldoNaEntrega(modo);
        if (modo !== "total") await manterPendente(modo);
        assert.deepEqual((await financeiro()).baixas, f.baixas);
      }
      await p
        .getByRole("button", { name: "Fechar janela", exact: true })
        .last()
        .click();
      await btn("Conferir entrega QA").click();
      await conferirSaldoNaEntrega(modo);
      assert.deepEqual((await financeiro()).baixas, f.baixas);
      if (modo !== "total") {
        await pergunta()
          .getByRole("button", { name: "Já recebi", exact: false })
          .click();
        assert.equal(
          Number(await p.getByLabel("Valor pago (R$)", { exact: true }).inputValue()),
          modo === "parcial" ? 100 : 150,
        );
        await btn("Confirmar pagamento").click();
        await p
          .getByRole("dialog", { name: "Financeiro atualizado", exact: true })
          .getByRole("button", { name: "Concluir", exact: true })
          .click();
        const quitado = await financeiro();
        assert.equal(
          quitado.baixas.reduce((s, b) => s + b.valor_centavos, 0),
          15000,
        );
        assert.equal(quitado.baixas.length, modo === "parcial" ? 2 : 1);
        await btn("Conferir entrega QA").click();
        await conferirSaldoNaEntrega("total");
        assert.deepEqual((await financeiro()).baixas, quitado.baixas);
      }
      passou(
        perfil +
          " " +
          width +
          "px: " +
          modo +
          "; " +
          (entregue ? "entrega confirmada" : "aguarda entrega") +
          "; impressão e reabertura sem duplicação",
      );
    }
  for (const caso of process.argv.includes("--servicos")
    ? []
    : [
        "falha-pagamento",
        "falha-entrega",
        "bloqueado",
        "staff",
        "semFinanceiro",
        "falha-criacao",
        "sem-marcar",
        "peca-sem-origem",
        "valor-zero",
      ]) {
    const casosSelecionados = process.argv
      .find((a) => a.startsWith("--casos="))
      ?.slice(8)
      .split(",");
    if (casosSelecionados && !casosSelecionados.includes(caso)) continue;
    await iniciar(390, "perfil=retifica&" + caso);
    await preencher("retifica", caso === "valor-zero" ? "0" : "150");
    if (caso === "peca-sem-origem") {
      await btn("Item avulso").click();
      await p.getByLabel("Nome do serviço ou peça", { exact: true }).fill("Peça QA");
      await p
        .getByRole("group", { name: "Novo item avulso", exact: true })
        .getByRole("combobox", { name: /^Tipo/ })
        .selectOption("part");
      await p.getByLabel("Preço unitário (R$)", { exact: true }).fill("0");
      await btn("Adicionar peça").click();
    }
    if (caso === "sem-marcar")
      await p
        .getByLabel("O serviço já está pronto para entrega", { exact: true })
        .uncheck();
    if (caso === "falha-criacao")
      await p.evaluate(() => {
        window.qaFalhaSalvar = true;
      });
    await btn(
      caso === "sem-marcar" ? "Abrir ordem de serviço" : "Salvar e informar pagamento",
    ).click();
    if (caso === "falha-criacao") {
      await p
        .getByRole("dialog", { name: "Nova ordem de serviço", exact: true })
        .getByRole("alert")
        .waitFor();
      assert.equal(await pergunta().count(), 0);
      assert.equal(await p.evaluate(() => window.qaJanelas), 0);
      await p.evaluate(() => {
        window.qaFalhaSalvar = false;
      });
      await btn("Salvar e informar pagamento").click();
    }
    if (caso === "sem-marcar") {
      await p
        .getByRole("dialog", { name: "Ordem de serviço #1", exact: true })
        .waitFor();
      assert.equal((await os(true)).situacao, "open");
      assert.equal(await pergunta().count(), 0);
      assert.equal(await p.evaluate(() => window.qaJanelas), 0);
      await btn("Fechar janela").click();
      await p.getByRole("link", { name: "Mapa QA", exact: true }).click();
      for (const etapa of ["Em execução", "Conferência"])
        await btn("Avançar OS 1 para " + etapa).click();
      await btn("Concluir serviço da OS 1").click();
      await btn("Entregar OS 1 para Entregue").waitFor();
      assert.equal(await pergunta().count(), 0);
      await p
        .getByRole("dialog", { name: "Avisar o cliente que está pronto?", exact: true })
        .getByRole("button", { name: "Fechar janela", exact: true })
        .click();
      await btn("Entregar OS 1 para Entregue").click();
      await pergunta().waitFor();
      passou(caso + ": criação normal e pagamento na entrega");
      continue;
    }
    if (["staff", "semFinanceiro"].includes(caso)) {
      await entrega().waitFor();
      assert.equal(await pergunta().count(), 0);
    } else if (caso === "valor-zero") {
      await pergunta()
        .getByText("Não há valor a registrar.", { exact: true })
        .waitFor();
      await pergunta().getByRole("button", { name: "Fechar", exact: true }).click();
    } else await pagar("total", caso === "falha-pagamento");
    if (caso === "falha-entrega")
      await p.evaluate(() => {
        window.qaFalhaSalvar = true;
      });
    await entrega()
      .getByRole("button", { name: "Sim, já foi entregue", exact: true })
      .click();
    if (caso === "falha-entrega") {
      await entrega().getByRole("alert").waitFor();
      assert.equal((await os(true)).situacao, "ready");
      assert.equal((await financeiro()).baixas.length, 1);
      await p.evaluate(() => {
        window.qaFalhaSalvar = false;
      });
      await entrega()
        .getByRole("button", { name: "Sim, já foi entregue", exact: true })
        .click();
    }
    if (caso === "peca-sem-origem") {
      await p
        .getByRole("dialog", { name: "Conferir peças para entregar", exact: true })
        .waitFor();
      assert.equal((await os(true)).situacao, "ready");
      assert.equal((await financeiro()).baixas.length, 1);
      await p.getByLabel("Trazida pelo cliente", { exact: true }).check();
      await btn("Salvar e concluir entrega").click();
    }
    if (caso === "bloqueado") {
      await p
        .getByRole("dialog", { name: "OS salva", exact: true })
        .getByRole("alert")
        .waitFor();
      assert.equal((await os(true)).situacao, "delivered");
      assert.equal((await financeiro()).baixas.length, 1);
      await btn("Tentar imprimir novamente").click();
      assert.equal((await financeiro()).baixas.length, 1);
    } else await p.waitForFunction(() => window.qaImpressaoIniciada === 1);
    assert.equal((await os(true)).situacao, "delivered");
    passou(caso + ": dados preservados, sem duplicação");
  }
  assert.deepEqual(erros, []);
} catch (e) {
  process.exitCode = 1;
  console.error(e.stack);
  if (p) {
    await p.screenshot({ path: resolve(pasta, "falha.png") });
    await writeFile(resolve(pasta, "falha.txt"), await p.locator("body").innerText());
  }
} finally {
  await browser.close();
  await server.httpServer.close();
  await writeFile(
    resolve(
      pasta,
      process.argv.includes("--extras") ? "resultado-extras.json" : "resultado.json",
    ),
    JSON.stringify(
      {
        ok: !process.exitCode,
        resultados,
        erros,
        ambiente:
          "Demonstração isolada em Chrome local; nenhuma alteração em clientes reais",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ ok: !process.exitCode, cenarios: resultados.length }));
}
