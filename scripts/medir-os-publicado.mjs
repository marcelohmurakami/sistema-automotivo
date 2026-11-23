// Somente empresas fictícias ZZ. Os pagamentos deste roteiro são lançamentos de QA.
// Não usa provedor financeiro, não envia mensagens e não imprime em impressora física.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
const base = process.env.QA_URL || "https://patio-gestao-peach.vercel.app",
  fase = process.env.QA_FASE || "antes",
  out = resolve(process.env.QA_OUTPUT || `output/os-velocidade-20261116/${fase}`);
await mkdir(out, { recursive: true });
const health = await fetch(base + "/health.json?qa=" + Date.now()).then((r) =>
  r.json(),
);
if (process.env.QA_EXPECTED_BUILD)
  assert.equal(health.build, process.env.QA_EXPECTED_BUILD);
const contas = JSON.parse(
  await readFile("output/contas-teste/20261019/credenciais.local.json", "utf8"),
).contas.filter(
  (c) =>
    c.ramo === "automotivo" &&
    (!process.env.QA_PERFIS ||
      process.env.QA_PERFIS.split(",").includes(c.especialidade)),
);
const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  }),
  resultados = [],
  documentos = [],
  erros = [],
  extras = [];
const banco = "https://hzihxtjirttetnfdujcx.supabase.co";
const gravar = () =>
  writeFile(
    resolve(out, "resultados.json"),
    JSON.stringify(
      {
        fase,
        build: health.build,
        geradoEm: new Date().toISOString(),
        ok: !process.exitCode,
        resultados,
        documentos,
        extras,
        erros,
      },
      null,
      2,
    ),
  );
try {
  for (const [perfilIndice, c] of contas.entries()) {
    assert(c.empresa.startsWith("ZZ [TESTE 20261019] "));
    const ctx = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
      serviceWorkers: "block",
    });
    await ctx.addInitScript(() => {
      window.qaPrints = [];
      window.qaDialogs = [];
      const show = HTMLDialogElement.prototype.showModal;
      HTMLDialogElement.prototype.showModal = function () {
        window.qaDialogs.push(this.getAttribute("aria-label"));
        return show.call(this);
      };
      const open = window.open.bind(window);
      window.open = (...args) => {
        const w = open(...args);
        if (w) {
          const print = w.print.bind(w);
          w.print = () => {
            window.qaPrints.push(w.document.body.innerText);
            return print();
          };
        }
        return w;
      };
    });
    const p = await ctx.newPage();
    p.setDefaultTimeout(25000);
    let headers,
      requests = [],
      medindo = false,
      tela,
      contagem;
    p.on("pageerror", (e) => erros.push({ perfil: c.especialidade, erro: e.message }));
    p.on("request", (r) => {
      if (r.url().startsWith(banco + "/rest/v1/")) {
        const h = r.headers();
        if (h.authorization)
          headers = {
            authorization: h.authorization,
            apikey: h.apikey,
            "content-type": "application/json",
          };
        if (medindo)
          requests.push({
            request: r,
            nome: new URL(r.url()).pathname.split("/").pop(),
            inicio: performance.now(),
          });
      }
    });
    p.on("requestfinished", (r) => {
      const a = requests.find((x) => x.request === r);
      if (a) a.segundos = (performance.now() - a.inicio) / 1000;
    });
    const rpc = async (nome, args) => {
      assert.equal(args.p_oficina, c.empresa_id);
      const r = await p.request.post(banco + "/rest/v1/rpc/" + nome, {
        headers,
        data: args,
      });
      assert(r.ok(), nome + " " + r.status() + " " + (await r.text()));
      return r.json();
    };
    const cadastro = (tipo, cliente = null) =>
      rpc("buscar_cadastros_operacao", {
        p_oficina: c.empresa_id,
        p_tipo: tipo,
        p_busca: "",
        p_cliente: cliente,
        p_id: null,
        p_tipo_item: tipo === "catalogo" ? "service" : null,
      });
    const medir = async (nome, fn) => {
      requests = [];
      contagem = { cliques: 0, campos: 0 };
      medindo = true;
      const ini = performance.now();
      try {
        await fn();
        resultados.push({
          perfil: c.especialidade,
          tela,
          nome,
          ...contagem,
          segundos: +((performance.now() - ini) / 1000).toFixed(3),
          requisicoes: requests.map(({ nome, segundos }) => ({
            nome,
            segundos: segundos ? +segundos.toFixed(3) : null,
          })),
          ok: true,
        });
        await gravar();
      } catch (e) {
        resultados.push({
          perfil: c.especialidade,
          tela,
          nome,
          ok: false,
          erro: e.message,
        });
        throw e;
      } finally {
        medindo = false;
      }
    };
    const click = async (l) => {
        if (medindo) contagem.cliques++;
        await l.click();
      },
      fill = async (l, v) => {
        if (medindo) contagem.campos++;
        await l.fill(v);
      };
    const btn = (name) =>
      name === "Nova OS"
        ? p.locator(".titulo-pagina").getByRole("button", { name, exact: true })
        : p.getByRole("button", { name, exact: true });
    const consultaPronta = async () => {
      await p.locator("dialog[open] .os-resumo-limpo").waitFor();
      await p.waitForFunction(() => {
        const d = document.querySelector("dialog[open].dialogo-detalhes-os");
        return (
          d &&
          [...d.querySelectorAll("button")].some(
            (b) => b.textContent.includes("Editar OS") && !b.disabled,
          )
        );
      });
    };
    const item = async (nome, preco = "100", custo) => {
      await click(btn("Serviço ou peça avulsa"));
      const g = p.getByRole("group", { name: "Novo item avulso" });
      await fill(g.getByLabel("Nome do serviço ou peça", { exact: true }), nome);
      await fill(g.getByLabel("Preço unitário (R$)", { exact: true }), preco);
      if (custo) {
        await click(g.locator("summary").filter({ hasText: "Custos e margem" }));
        await fill(
          g.getByLabel("Custo direto por unidade (R$)", { exact: true }),
          custo,
        );
      }
      await click(g.getByRole("button", { name: "Adicionar serviço", exact: true }));
    };
    const fecharConsulta = async (n) =>
      click(
        p
          .getByRole("dialog", { name: "Ordem de serviço #" + n, exact: true })
          .getByRole("button", { name: "Fechar janela", exact: true }),
      );
    const layout = async () => {
      assert(
        await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      );
      assert(
        await p
          .locator("dialog[open]")
          .evaluateAll((ds) => ds.every((d) => d.scrollWidth <= d.clientWidth + 1)),
      );
    };
    try {
      await p.goto(base + "/entrar");
      await p.getByLabel("E-mail", { exact: true }).fill(c.email);
      await p.getByLabel("Senha", { exact: true }).fill(c.senha);
      await btn("Entrar no sistema").click();
      await p
        .getByRole("textbox", { name: "Buscar veículo no mapa", exact: true })
        .waitFor();
      for (const [indice, largura] of [1920, 390].entries()) {
        tela = largura === 1920 ? "desktop" : "celular";
        await p.setViewportSize({
          width: largura,
          height: largura === 1920 ? 1080 : 844,
        });
        const token = "QAOS" + randomUUID().slice(0, 8),
          nome = token + " " + fase,
          completo = process.env.QA_COMPLETO === "1",
          pronta = process.env.QA_PRONTO === "1",
          rapida = process.env.QA_RAPIDO === "1";
        let os;
        await medir("Abrir lista de OS", async () => {
          await p.goto(base + "/ordens-servico");
          await btn("Nova OS").waitFor();
          await p.locator(".paginacao-clientes").waitFor();
          await p
            .getByText("Carregando ordens…", { exact: true })
            .waitFor({ state: "hidden" });
        });
        const catalogo =
          completo || rapida
            ? (await cadastro("catalogo")).find((i) => i.preco_padrao_centavos > 0)
            : null;
        let cliente, veiculo;
        if (rapida) {
          cliente = (await cadastro("clientes"))[0];
          assert(cliente && catalogo);
          if (c.especialidade !== "retifica")
            veiculo = await rpc("cadastrar_veiculo_orcamento", {
              p_oficina: c.empresa_id,
              p_cliente: cliente.id,
              p_modelo: token + " Carro cadastrado",
              p_placa: null,
            });
        }
        const salvar = async (texto, rpcNome) => {
          const ret = p.waitForResponse(
            (r) =>
              r.url().endsWith("/rpc/" + rpcNome) && r.request().method() === "POST",
          );
          await click(btn(texto));
          const r = await ret;
          assert(r.ok(), await r.text());
          os = await r.json();
          if (!pronta) await consultaPronta();
          else
            await p
              .getByRole("dialog", {
                name: "Como ficou o pagamento da OS?",
                exact: true,
              })
              .getByRole("button", { name: "Já recebi", exact: false })
              .waitFor();
        };
        await medir(
          pronta
            ? "Criar OS pronta até abrir pagamento"
            : completo
              ? "Criar OS completa com 12 itens"
              : rapida
                ? "Criar OS com cliente e serviço cadastrados"
                : "Criar OS simples",
          async () => {
            await click(btn("Nova OS"));
            if (rapida) {
              await fill(
                p.getByRole("combobox", { name: "Cliente", exact: true }),
                cliente.nome,
              );
              await click(
                p.getByRole("option").filter({ hasText: cliente.nome }).first(),
              );
            } else {
              await click(
                p.getByRole("option", {
                  name: "Informar cliente sem cadastrar",
                  exact: true,
                }),
              );
              await fill(p.getByLabel("Nome do cliente", { exact: true }), nome);
            }
            if (c.especialidade === "retifica") {
              await fill(p.getByLabel("Carro", { exact: true }), "Volkswagen Gol QA");
              await fill(p.getByLabel("Motor", { exact: true }), "AP 1.6");
            } else if (rapida) {
              await fill(
                p.getByRole("combobox", { name: "Veículo", exact: true }),
                token,
              );
              await click(p.getByRole("option").filter({ hasText: token }).first());
            } else {
              await click(btn("Novo veículo"));
              await fill(
                p.getByLabel("Nome / modelo do veículo", { exact: true }),
                token + " Volkswagen Gol",
              );
              await click(btn("Cadastrar e selecionar"));
              await p
                .getByText("Veículo cadastrado e selecionado.", { exact: true })
                .waitFor();
            }
            if (!rapida)
              await item("QA revisão " + token, "100", completo ? "30" : undefined);
            if (completo || rapida) {
              await fill(
                p.getByLabel("Buscar serviço ou peça: OS", { exact: true }),
                catalogo.descricao,
              );
              await click(
                p
                  .locator(".os-editor-catalogo button")
                  .filter({ hasText: catalogo.descricao })
                  .first(),
              );
            }
            if (completo) {
              for (let n = 1; n <= 10; n++)
                await item("QA item " + n + " " + token, String(10 + n));
              await fill(p.getByLabel("Desconto (%)", { exact: true }), "10");
              await fill(
                p.getByLabel("Observações (opcional)", { exact: true }),
                "QA OS completa " + token,
              );
              await click(
                p
                  .locator("summary")
                  .filter({ hasText: "Informações adicionais do atendimento" }),
              );
              await click(
                p
                  .locator("summary")
                  .filter({ hasText: "Entrada, diagnóstico e garantia" }),
              );
              await fill(
                p.getByLabel("Diagnóstico técnico (opcional)", { exact: true }),
                "Diagnóstico fictício " + token,
              );
              await fill(
                p.getByLabel("Observações internas (opcional)", { exact: true }),
                "Conferência interna QA",
              );
              await fill(
                p.getByLabel("Condições da garantia (opcional)", { exact: true }),
                "Garantia conforme o serviço realizado.",
              );
            }
            if (pronta) {
              await fill(p.getByLabel("Desconto (%)", { exact: true }), "10");
              await click(
                p.getByLabel("Sim · salvar como pronto e imprimir", { exact: true }),
              );
              await p.evaluate(() => {
                window.qaPrints = [];
                window.qaDialogs = [];
              });
            }
            await salvar(
              pronta ? "Salvar como pronto e imprimir" : "Abrir ordem de serviço",
              pronta ? "criar_os_pronta" : "salvar_os_com_itens",
            );
          },
        );
        documentos.push({
          perfil: c.especialidade,
          tela,
          id: os.id,
          numero: os.numero,
        });
        await gravar();
        const ler = () =>
          rpc("consultar_ordem_servico", { p_oficina: c.empresa_id, p_os: os.id });
        const atual = await ler();
        const esperado = pronta
          ? 9000
          : completo
            ? Math.round((25500 + catalogo.preco_padrao_centavos) * 0.9)
            : rapida
              ? catalogo.preco_padrao_centavos
              : 10000;
        assert.equal(atual.total_centavos, esperado);
        assert.equal(atual.itens.length, completo ? 12 : 1);
        assert.equal(atual.situacao, pronta ? "ready" : "open");
        if (completo) {
          assert.equal(atual.itens[0].custo_unitario_previsto_centavos, 3000);
          assert.equal(atual.diagnostico, "Diagnóstico fictício " + token);
          assert.equal(atual.observacoes_internas, "Conferência interna QA");
        }
        if (rapida) assert.equal(atual.cliente_id, cliente.id);
        if (pronta) {
          const modo = ["adiar", "total", "parcial", "prazo"][
            (perfilIndice * 2 + indice) % 4
          ];
          assert.equal(await p.evaluate(() => window.qaPrints.length), 0);
          await layout();
          await p.screenshot({
            path: resolve(out, c.especialidade + "-" + tela + "-pagamento.png"),
          });
          await medir("Pagamento e impressão: " + modo, async () => {
            if (modo !== "adiar") {
              await click(
                p
                  .getByRole("dialog", {
                    name: "Como ficou o pagamento da OS?",
                    exact: true,
                  })
                  .getByRole("button", {
                    name:
                      modo === "total"
                        ? "Já recebi"
                        : modo === "parcial"
                          ? "Recebi uma parte"
                          : "A receber",
                    exact: false,
                  }),
              );
              if (modo === "prazo") {
                await fill(p.getByLabel("Receber em", { exact: true }), "2026-12-15");
                await click(btn("Salvar data combinada"));
              } else {
                if (modo === "parcial") {
                  await fill(p.getByLabel("Valor pago (R$)", { exact: true }), "30");
                  await fill(
                    p.getByLabel("Vencimento do restante", { exact: true }),
                    "2026-12-15",
                  );
                }
                await click(btn("Confirmar pagamento"));
              }
              await btn("Concluir e imprimir").waitFor();
            }
            assert.equal(await p.evaluate(() => window.qaPrints.length), 0);
            await click(
              btn(modo === "adiar" ? "Agora não, só imprimir" : "Concluir e imprimir"),
            );
            await p.waitForFunction(() => window.qaPrints.length === 1);
          });
          const impresso = await p.evaluate(() => window.qaPrints[0]);
          assert(impresso.includes(nome));
          assert(impresso.includes("QA revisão " + token));
          assert(/100,00/.test(impresso));
          assert(!/90,00/.test(impresso), "Desconto oculto na nota");
          await writeFile(
            resolve(out, c.especialidade + "-" + tela + "-nota.txt"),
            impresso,
          );
          const aviso = p.getByRole("dialog", {
            name: "Avisar o cliente que está pronto?",
            exact: true,
          });
          await aviso.getByRole("button", { name: "Fechar", exact: true }).click();
          for (const tab of ctx.pages()) if (tab !== p) await tab.close();
          const fin = await rpc("consultar_financeiro_os", {
            p_oficina: c.empresa_id,
            p_os: os.id,
          });
          assert.equal(
            fin?.baixado_centavos || 0,
            modo === "total" ? 9000 : modo === "parcial" ? 3000 : 0,
          );
          if (["parcial", "prazo"].includes(modo))
            assert.equal(fin.vencimento, "2026-12-15");
          assert.equal((await ler()).situacao, "ready");
          documentos.at(-1).verificado = {
            itens: 1,
            total: 9000,
            pago: fin?.baixado_centavos || 0,
            modo,
            impressao: true,
          };
          await gravar();
          console.log("PASS pronta", fase, c.especialidade, tela, modo);
          continue;
        }
        if (completo || rapida) {
          await p.reload();
          await consultaPronta();
          assert(
            (await p.locator(".os-servicos-resumo-total").innerText()).includes(
              (esperado / 100).toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }),
            ),
          );
          await layout();
          documentos.at(-1).verificado = {
            itens: atual.itens.length,
            total: esperado,
            reaberta: true,
          };
          await gravar();
          console.log("PASS criação", fase, c.especialidade, tela);
          continue;
        }
        await fecharConsulta(os.numero);
        const busca = p.getByLabel("Buscar ordens de serviço", { exact: true }),
          abrir = () =>
            p.getByRole("button", {
              name: new RegExp("^Abrir OS #" + os.numero + " de "),
            });
        await medir("Buscar OS pelo cliente", async () => {
          const ret = p.waitForResponse(
            (r) =>
              r.url().endsWith("/rpc/listar_ordens_servico_gestao") &&
              r.request().postDataJSON()?.p_busca === token,
          );
          await fill(busca, token);
          assert((await ret).ok());
          await abrir().waitFor();
        });
        await medir("Consultar OS encontrada", async () => {
          await click(abrir());
          await consultaPronta();
        });
        await layout();
        await p.screenshot({
          path: resolve(out, c.especialidade + "-" + tela + "-consulta.png"),
        });
        await medir("Abrir edição na consulta", async () => {
          await click(btn("Editar OS"));
          await btn("Salvar alterações da OS").waitFor();
        });
        await medir("Alterar quantidade, desconto e observação", async () => {
          await fill(p.locator(".os-editor-item input[type=number]").first(), "2");
          await click(btn("Desconto em porcentagem"));
          await fill(p.getByLabel("Desconto (%)", { exact: true }), "10");
          await fill(
            p.getByLabel("Observações (opcional)", { exact: true }),
            "QA alterada " + token,
          );
          await salvar("Salvar alterações da OS", "salvar_os_com_itens");
        });
        const editada = await ler();
        assert.equal(editada.total_centavos, 18000);
        assert.equal(editada.itens[0].quantidade, 2);
        assert.equal(editada.resumo_cliente, "QA alterada " + token);
        await fecharConsulta(os.numero);
        await medir("Buscar OS pelo número", async () => {
          const ret = p.waitForResponse(
            (r) =>
              r.url().endsWith("/rpc/listar_ordens_servico_gestao") &&
              r.request().postDataJSON()?.p_busca === String(os.numero),
          );
          await fill(busca, String(os.numero));
          assert((await ret).ok());
          await abrir().waitFor();
        });
        await medir("Abrir edição pela lista", async () => {
          await click(btn("Editar OS #" + os.numero));
          await btn("Salvar alterações da OS").waitFor();
        });
        await medir("Completar OS com 12 itens e custos", async () => {
          for (let n = 1; n < 12; n++)
            await item(
              "QA extra " + n + " " + token,
              String(10 + n),
              n === 1 ? "30" : undefined,
            );
          await click(btn("Desconto em porcentagem"));
          await fill(p.getByLabel("Desconto (%)", { exact: true }), "10");
          await salvar("Salvar alterações da OS", "salvar_os_com_itens");
        });
        const ampliada = await ler();
        assert.equal(ampliada.total_centavos, 33840);
        assert.equal(ampliada.itens.length, 12);
        assert.equal(ampliada.itens[1].custo_unitario_previsto_centavos, 3000);
        assert.equal(ampliada.resumo_cliente, "QA alterada " + token);
        await medir("Consultar todos os serviços da OS", async () => {
          await click(
            p.getByRole("button", { name: "Ver todos os 12 itens", exact: false }),
          );
          await btn("Incluir, editar ou remover serviços").waitFor();
          assert.equal(await p.locator("dialog[open] .os-item").count(), 12);
        });
        await p.reload();
        await consultaPronta();
        assert(
          (await p.locator(".os-servicos-resumo-total").innerText()).includes("338,40"),
        );
        await layout();
        documentos.at(-1).verificado = {
          itens: 12,
          total: 33840,
          reaberta: true,
          revisao: ampliada.revisao,
        };
        if (fase.startsWith("depois")) {
          await fecharConsulta(os.numero);
          const ret = p.waitForResponse(
            (r) =>
              r.url().endsWith("/rpc/listar_ordens_servico_gestao") &&
              r.request().postDataJSON()?.p_busca === String(os.numero),
          );
          await busca.fill("#000" + os.numero);
          await busca.press("Enter");
          assert((await ret).ok());
          await abrir().waitFor();
          await btn("Limpar busca de ordens de serviço").click();
          assert.equal(await busca.inputValue(), "");
          extras.push({
            perfil: c.especialidade,
            tela,
            buscaNumeroCopiado: true,
            limpar: true,
          });
        }
        await gravar();
        console.log("PASS", fase, c.especialidade, tela);
      }
    } catch (e) {
      process.exitCode = 1;
      console.error(c.especialidade, e.stack);
      await p.screenshot({ path: resolve(out, c.especialidade + "-falha.png") });
      await writeFile(
        resolve(out, c.especialidade + "-falha.txt"),
        await p.locator("body").innerText(),
      );
      throw e;
    } finally {
      await ctx.close();
    }
  }
} catch {
  process.exitCode = 1;
} finally {
  await browser.close();
  if (erros.length) process.exitCode = 1;
  await gravar();
  console.log(
    JSON.stringify({
      ok: !process.exitCode,
      medicoes: resultados.length,
      documentos: documentos.length,
    }),
  );
}
