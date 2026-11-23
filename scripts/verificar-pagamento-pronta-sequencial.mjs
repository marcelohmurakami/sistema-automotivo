import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.QA_BASE || 'https://patio-gestao-peach.vercel.app';
const pasta = process.env.QA_OUTPUT || 'output/pagamento-pronta-20261105/antes';
await mkdir(pasta, { recursive: true });
const conta = JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json', 'utf8')).contas.find(c => c.especialidade === 'retifica');
assert(conta.empresa.startsWith('ZZ [TESTE 20261019] '));
const health = await fetch(base + '/health.json?qa=' + Date.now()).then(r => r.json());
if (process.env.QA_EXPECTED_BUILD) assert.equal(health.build, process.env.QA_EXPECTED_BUILD);
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
await ctx.addInitScript(() => {
  window.qaDialogs = []; window.qaPrint = 0;
  const show = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function () { window.qaDialogs.push(this.getAttribute('aria-label')); return show.call(this); };
  const open = window.open.bind(window);
  window.open = (...args) => { const w = open(...args); if(w) { const print = w.print.bind(w); w.print = () => { window.qaPrint++; return print(); }; } return w; };
});
const p = await ctx.newPage(), resultados = [], erros = [];
let headers;
const banco = 'https://hzihxtjirttetnfdujcx.supabase.co';
p.on('request', r => { if (r.url().startsWith(banco + '/rest/v1/')) { const h = r.headers(); if (h.authorization) headers = { authorization: h.authorization, apikey: h.apikey, 'content-type': 'application/json' }; } });
async function rpc(nome, args) { assert.equal(args.p_oficina, conta.empresa_id); const r = await p.request.post(banco + '/rest/v1/rpc/' + nome, { headers, data: args }); assert.equal(r.status(), 200); return r.json(); }
p.setDefaultTimeout(30000);
p.on('pageerror', e => erros.push(e.message));
try {
  await p.goto(base + '/ordens-servico');
  await p.getByLabel('E-mail', { exact: true }).fill(conta.email);
  await p.getByLabel('Senha', { exact: true }).fill(conta.senha);
  await p.getByRole('button', { name: 'Entrar no sistema', exact: true }).click();
  await p.getByRole('button', { name: 'Nova OS', exact: true }).waitFor();
  for (const [indice, modo] of ['adiar', 'total', 'parcial', 'prazo'].entries()) {
    const i = indice + 1;
    await p.setViewportSize({ width: i % 2 ? 1920 : 390, height: i % 2 ? 1080 : 844 });
    await p.getByRole('button', { name: 'Nova OS', exact: true }).click();
    await p.getByRole('combobox', { name: 'Cliente', exact: true }).click();
    await p.getByRole('option', { name: 'Informar cliente sem cadastrar', exact: true }).click();
    await p.getByLabel('Nome do cliente', { exact: true }).fill('QA Pagamento sequencial ' + i + ' ' + Date.now());
    await p.getByLabel('Carro', { exact: true }).fill('Fiat Palio QA');
    await p.getByLabel('Motor', { exact: true }).fill('Fire');
    await p.getByRole('button', { name: 'Serviço ou peça avulsa', exact: true }).click();
    await p.getByLabel('Nome do serviço ou peça', { exact: true }).fill('QA Pergunta antes da impressão');
    await p.getByLabel('Preço unitário (R$)', { exact: true }).fill('150');
    await p.getByRole('button', { name: 'Adicionar serviço', exact: true }).click();
    await p.getByLabel('Sim · salvar como pronto e imprimir', { exact: true }).check();
    await p.evaluate(() => { window.qaDialogs = []; });
    const response = p.waitForResponse(r => r.url().endsWith('/rpc/criar_os_pronta') && r.request().postDataJSON()?.p_oficina === conta.empresa_id);
    await p.getByRole('button', { name: 'Salvar como pronto e imprimir', exact: true }).click();
    const r = await response; assert.equal(r.status(), 200); const os = await r.json();
    const pagamento = p.getByRole('dialog', { name: 'Como ficou o pagamento da OS?', exact: true });
    await pagamento.waitFor();
    await pagamento.getByRole('button', { name: 'Já recebi', exact: false }).waitFor();
    assert(await pagamento.evaluate(d => d.scrollWidth <= d.clientWidth + 1));
    assert.equal(await p.getByRole('dialog', { name: 'Ordem de serviço #' + os.numero, exact: true }).count(), 0);
    const estado = await p.evaluate(() => {
      const d = [...document.querySelectorAll('dialog[open]')].find(x => x.getAttribute('aria-label') === 'Como ficou o pagamento da OS?');
      const b = d.getBoundingClientRect();
      return { sequencia: window.qaDialogs, emFrente: d.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)), impressao: window.qaPrint };
    });
    resultados.push({ tentativa: i, modo, numero: os.numero, id: os.id, ...estado });
    await p.screenshot({ path: pasta + '/tentativa-' + i + '.png' });
    assert.equal(estado.emFrente, true, 'Pagamento está atrás de outra janela: ' + JSON.stringify(estado));
    assert.equal(estado.impressao, i - 1);
    if (modo !== 'adiar') {
      await pagamento.getByRole('button', { name: modo === 'total' ? 'Já recebi' : modo === 'parcial' ? 'Recebi uma parte' : 'A receber', exact: false }).click();
      if (modo === 'prazo') {
        await p.getByLabel('Receber em', { exact: true }).fill('2026-12-15');
        await p.getByRole('button', { name: 'Salvar data combinada', exact: true }).click();
      } else {
        const taxa = p.getByLabel('Taxa da maquininha (R$)', { exact: true });
        assert.equal(await taxa.count(), 0);
        await p.getByRole('combobox', { name: 'Forma', exact: true }).selectOption(modo === 'total' ? 'credito' : 'debito');
        await taxa.fill('3');
        await p.screenshot({ path: pasta + '/taxa-' + modo + '.png' });
        if (modo === 'total') {
          for (const forma of ['pix', 'dinheiro', 'boleto', 'transferencia', 'outro']) {
            await p.getByRole('combobox', { name: 'Forma', exact: true }).selectOption(forma);
            assert.equal(await taxa.count(), 0, forma);
          }
          await p.getByRole('combobox', { name: 'Forma', exact: true }).selectOption('pix');
          await p.screenshot({ path: pasta + '/pix-sem-taxa.png' });
        }
        await p.getByLabel('Valor pago (R$)', { exact: true }).fill(modo === 'total' ? '150' : '50');
        if (modo === 'parcial') await p.getByLabel('Vencimento do restante', { exact: true }).fill('2026-12-15');
        await p.getByRole('button', { name: 'Confirmar pagamento', exact: true }).click();
      }
      await p.getByRole('button', { name: 'Concluir e imprimir', exact: true }).waitFor();
      assert.equal(await p.evaluate(() => window.qaPrint), i - 1);
    }
    await p.getByRole('button', { name: modo === 'adiar' ? 'Agora não, só imprimir' : 'Concluir e imprimir', exact: true }).click({ timeout: 5000 });
    await p.waitForFunction(n => window.qaPrint === n, i);
    await p.getByRole('dialog', { name: 'Avisar o cliente que está pronto?', exact: true }).getByRole('button', { name: 'Fechar', exact: true }).click();
    for (const tab of ctx.pages()) if (tab !== p) await tab.close();
    await p.getByRole('dialog', { name: 'Ordem de serviço #' + os.numero, exact: true }).getByRole('button', { name: 'Fechar janela', exact: true }).click();
    const titulo = await rpc('consultar_financeiro_os', { p_oficina: conta.empresa_id, p_os: os.id });
    assert.equal(titulo?.baixado_centavos || 0, modo === 'total' ? 15000 : modo === 'parcial' ? 5000 : 0);
    if (['parcial', 'prazo'].includes(modo)) assert.equal(titulo.vencimento, '2026-12-15');
    const atual = await rpc('consultar_ordem_servico', { p_oficina: conta.empresa_id, p_os: os.id });
    assert.equal(atual.situacao, 'ready');
    if (['total', 'parcial'].includes(modo)) {
      const historico = await rpc('historico_financeiro', { p_oficina: conta.empresa_id, p_titulo: titulo.id });
      const taxa = historico.reduce((s, b) => s + b.taxa_centavos, 0);
      assert.equal(taxa, modo === 'parcial' ? 300 : 0);
      resultados.at(-1).taxa = taxa;
    }
    resultados.at(-1).pago = titulo?.baixado_centavos || 0;
    resultados.at(-1).imprimiuAposEscolha = true;
    console.log('PASS OS pronta sequencial', i, os.numero);
  }
  assert.deepEqual(erros, []);
} catch (e) {
  process.exitCode = 1; console.error(e.message);
  await p.screenshot({ path: pasta + '/falha.png' });
} finally {
  await writeFile(pasta + '/resumo.json', JSON.stringify({ ok: !process.exitCode, build: health.build, resultados, erros }, null, 2));
  await browser.close();
}
