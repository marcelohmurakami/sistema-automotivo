import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build, preview } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright";

const antes = process.argv.includes("--antes");
const pasta = resolve("output/estilos-fichas-20261123");
await mkdir(pasta, { recursive: true });
const originais = new Map(
  antes
    ? [
        "src/components/FichaCliente.tsx",
        "src/components/FichaCliente.css",
        "src/components/ConteudoProposta.tsx",
        "src/pages/Orcamentos.tsx",
        "src/pages/Orcamentos.css",
      ].map((arquivo) => [
        resolve(arquivo).replaceAll("\\", "/"),
        execFileSync("git", ["show", `7faf2d6:${arquivo}`], {
          encoding: "utf8",
          windowsHide: true,
        }),
      ])
    : [],
);
const config = {
  configFile: false,
  envDir: false,
  logLevel: "error",
  plugins: [
    ...(antes
      ? [
          {
            name: "estilos-anteriores",
            enforce: "pre",
            load(id) {
              return originais.get(id.split("?")[0]) ?? null;
            },
          },
        ]
      : []),
    react(),
    tailwindcss(),
  ],
  define: {
    "import.meta.env.VITE_SUPABASE_URL": '""',
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": '""',
  },
  build: {
    outDir: resolve(pasta, antes ? "build-antes" : "build"),
    rollupOptions: {
      input: [
        "scripts/fixtures/mobile-oficina.html",
        "scripts/fixtures/ficha-cliente-estilos.html",
      ],
    },
  },
};
if (!process.argv.includes("--sem-build")) await build(config);
const server = await preview({
  ...config,
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const resultados = [];
const baseline = antes
  ? []
  : await readFile(resolve(pasta, "antes.json"), "utf8")
      .then(JSON.parse)
      .catch((e) => {
        if (e.code === "ENOENT") return [];
        throw e;
      });
try {
  for (const width of antes ? [390, 1440] : [360, 390, 768, 1024, 1440, 1920]) {
    for (const tema of antes ? ["escuro"] : ["escuro", "claro"]) {
      for (const tela of antes
        ? ["cliente", "orcamento"]
        : ["cliente", "orcamento", "cliente-completo", "orcamento-completo"]) {
        const page = await browser.newPage({
          viewport: { width, height: width < 600 ? 844 : 1080 },
        });
        const erros = [];
        page.on("pageerror", (e) => erros.push(e.message));
        if (tela === "cliente-completo") {
          await page.goto(
            `${url}scripts/fixtures/ficha-cliente-estilos.html?tema=${tema}`,
          );
          await page.locator(".lucro-cliente").waitFor();
        } else {
          await page.goto(
            `${url}scripts/fixtures/mobile-oficina.html?tema=${tema}&rota=${tela === "cliente" ? "/clientes" : "/orcamentos"}`,
          );
          if (tela === "orcamento-completo") {
            await page.locator(".abrir-proposta").first().waitFor();
            await page.evaluate(() => {
              const orcamentos = JSON.parse(
                localStorage.getItem("patio_orcamentos_v2"),
              );
              for (const q of orcamentos) {
                q.versao.dados_cliente.nome =
                  "Alexandre de Oliveira e Filhos — Comércio e Manutenção de Equipamentos";
                q.versao.dados_veiculo.modelo =
                  "Volkswagen Polo Comfortline 1.0 TSI automático com acessórios";
                q.versao.dados_oficina.nome =
                  "Oficina de Manutenção e Serviços Especializados";
                q.itens = Array.from({ length: 5 }, (_, i) => ({
                  ...q.itens[0],
                  id: `item-${i}`,
                  descricao:
                    "Revisão completa do sistema de alimentação, limpeza dos componentes e verificação de pressão " +
                    i,
                  quantidade: 1,
                  preco_unitario_centavos: 123456789,
                  total_item_centavos: 123456789,
                  explicacao_cliente:
                    "Inclui diagnóstico, desmontagem e verificação dos componentes antes da montagem.",
                  grupo_servico: "Revisão preventiva",
                  prioridade_servico: "urgente",
                }));
                q.versao.subtotal_centavos = 617283945;
                q.versao.desconto_centavos = 12345;
                q.versao.total_centavos = 617271600;
                q.situacao = "approved";
                q.versao.expira_em = "2026-12-15T23:59:00-03:00";
                q.versao.publicado_em = "2026-11-23T12:00:00Z";
                q.aprovacao = {
                  decisao: "approved",
                  nome_informado: "Alexandre de Oliveira e Filhos",
                  confirmado_em: "2026-11-23T12:00:00Z",
                  total_aprovado_centavos: 617271600,
                  grupos_aprovados: ["Revisão preventiva"],
                };
              }
              localStorage.setItem("patio_orcamentos_v2", JSON.stringify(orcamentos));
            });
            await page.reload();
          }
          await page
            .locator(tela === "cliente" ? ".abrir-ficha-cliente" : ".abrir-proposta")
            .first()
            .click();
        }
        await page
          .locator(
            tela.startsWith("cliente")
              ? ".ficha-cliente-indicadores"
              : ".documento-orcamento",
          )
          .first()
          .waitFor();
        const modal = page.locator("dialog[open]").last();
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => document.activeElement?.blur());
        await page.screenshot({
          path: resolve(
            pasta,
            `${antes ? "antes" : "depois"}-${tela}-${width}-${tema}.png`,
          ),
        });
        const medida = await modal.evaluate((el) => ({
          largura: el.clientWidth,
          conteudo: el.scrollWidth,
          altura: el.scrollHeight,
          texto: el.innerText,
          campos: el.querySelectorAll("input,select,textarea").length,
        }));
        if (!antes)
          assert(medida.conteudo <= medida.largura + 1, `${tela} ${width}: overflow`);
        if (!antes && tela.startsWith("cliente")) {
          const quebras = await page
            .locator(".ficha-cliente-indicadores strong")
            .evaluateAll((els) =>
              els
                .filter((el) => {
                  const range = document.createRange();
                  range.selectNodeContents(el);
                  return range.getClientRects().length > 1;
                })
                .map((el) => el.textContent),
            );
          assert.deepEqual(quebras, [], `${tela} ${width}: valor quebrado`);
        }
        assert.deepEqual(erros, []);
        resultados.push({ tela, width, tema, ...medida });
        const original = baseline.find(
          (r) => r.tela === tela && r.width === width && r.tema === tema,
        );
        if (original)
          assert.deepEqual(
            medida.texto.match(/R\$\s*[\d.]+,\d{2}/g),
            original.texto.match(/R\$\s*[\d.]+,\d{2}/g),
            "Valores da consulta alterados",
          );
        if (tela.startsWith("cliente")) {
          if (tela === "cliente-completo") {
            await page
              .locator(".ficha-cliente-filtros select")
              .selectOption("concluidos");
            assert.equal(await page.locator(".ficha-cliente-atendimento").count(), 1);
            await page.locator(".ficha-cliente-itens summary").first().click();
            await page
              .locator(".ficha-cliente-atendimento")
              .first()
              .scrollIntoViewIfNeeded();
            await page.screenshot({
              path: resolve(pasta, `depois-cliente-historico-${width}-${tema}.png`),
            });
          }
          await page
            .getByRole("button", { name: "Dados e veículos", exact: true })
            .click();
          await page.locator(".ficha-cliente-bloco").first().waitFor();
          await page.locator(".ficha-cliente-bloco").first().scrollIntoViewIfNeeded();
          await page.screenshot({
            path: resolve(
              pasta,
              `${antes ? "antes" : "depois"}-${tela}-dados-${width}-${tema}.png`,
            ),
          });
        } else {
          if (!antes) {
            const mais = page.locator(".orcamento-mais-acoes > summary");
            await mais.focus();
            await page.keyboard.press("Enter");
            assert(
              await page
                .getByRole("button", { name: "Atualizar situação", exact: true })
                .isVisible(),
            );
            await page
              .getByRole("button", {
                name: "Cliente não aprovou / desistiu",
                exact: true,
              })
              .click();
            const recusa = page.getByRole("dialog", {
              name: "Registrar recusa ou desistência",
              exact: true,
            });
            await recusa.waitFor();
            await recusa
              .getByRole("button", { name: "Fechar janela", exact: true })
              .click();
            await mais.click();
          }
          await page.locator(".item-proposta-detalhes summary").first().click();
          await page.locator(".totais-documento").scrollIntoViewIfNeeded();
          await page.screenshot({
            path: resolve(
              pasta,
              `${antes ? "antes" : "depois"}-${tela}-total-${width}-${tema}.png`,
            ),
          });
        }
        assert(
          await modal.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
          `${tela}: seção aberta extravasou`,
        );
        if (!antes && tela === "cliente") {
          await page
            .getByRole("button", { name: "Editar cadastro", exact: true })
            .click();
          await page
            .getByRole("dialog", { name: "Editar cliente", exact: true })
            .waitFor();
        }
        if (!antes && tela === "orcamento") {
          await page
            .getByRole("button", { name: "Editar orçamento", exact: true })
            .click();
          await page.locator(".editor-proposta").waitFor();
          await page
            .locator(".editor-proposta")
            .getByRole("button", { name: "Cancelar", exact: true })
            .click();
        }
        await page.close();
      }
    }
  }
  await writeFile(
    resolve(pasta, `${antes ? "antes" : "depois"}.json`),
    JSON.stringify(resultados, null, 2),
  );
  console.log(JSON.stringify({ ok: true, cenarios: resultados.length }));
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
