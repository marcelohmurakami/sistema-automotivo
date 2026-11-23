import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
const base = process.env.QA_BASE || 'https://patio-gestao-peach.vercel.app';
const fase = process.env.QA_FASE || 'antes';
const pasta = 'output/relatorios-clareza-20261109/' + fase;
await mkdir(pasta, { recursive: true });
const m = JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json', 'utf8'));
assert.equal(m.contas.length, 26);
assert.equal(m.projeto, 'hzihxtjirttetnfdujcx');
const completos = process.env.QA_TODOS === '1';
const ramos = new Set();
const contas = m.contas.filter(c => completos || (!ramos.has(c.ramo) && ramos.add(c.ramo)));
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const resultados = [];
try {
  for (const c of contas) {
    assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    const page = await ctx.newPage();
    const erros = [], checks = [];
    page.setDefaultTimeout(45000);
    page.on('pageerror', e => erros.push(e.message));
    await page.route('**/rest/v1/rpc/**', async route => {
      const nome = route.request().url().split('/').at(-1);
      if (/^(salvar|baixar|estornar|cancelar|registrar|transferir|movimentar|faturar|criar|operar|excluir|remover|atualizar)_/.test(nome)) {
        erros.push('Mutação inesperada: ' + nome); return route.abort();
      }
      return route.continue();
    });
    try {
      await page.goto(base + '/relatorios');
      await page.getByLabel('E-mail', { exact: true }).fill(c.email);
      await page.getByLabel('Senha', { exact: true }).fill(c.senha);
      await page.getByRole('button', { name: 'Entrar no sistema', exact: true }).click();
      await page.waitForURL('**/relatorios');
      const root = page.locator('.rel-pagina, .relatorios-servicos');
      await root.waitFor();
      if (fase !== 'antes') {
        await page.getByRole('combobox', { name: 'Período dos relatórios', exact: true }).selectOption('personalizado');
        await page.getByLabel('De', { exact: true }).fill('2026-10-01');
        await page.getByLabel('Até', { exact: true }).fill('2026-10-30');
        await page.getByRole('button', { name: 'Aplicar período', exact: true }).click();
        await page.waitForURL(u => u.searchParams.get('inicio') === '2026-10-01' && u.searchParams.get('fim') === '2026-10-30');
        await page.getByRole('button', { name: 'Alterar datas', exact: true }).click();
        await page.getByLabel('De', { exact: true }).fill('2026-11-15');
        await page.getByRole('button', { name: 'Aplicar período', exact: true }).click();
        await page.getByText('Escolha datas válidas, em ordem, com no máximo 367 dias.').waitFor();
        assert.equal(new URL(page.url()).searchParams.get('inicio'), '2026-10-01');
        await page.getByLabel('De', { exact: true }).fill('2026-10-01');
        await page.getByRole('button', { name: 'Aplicar período', exact: true }).click();
        checks.push({ caso: 'Período customizado aplicado; datas invertidas não alteram os resultados' });
        const secoes = page.locator('.rr-secoes button');
        await secoes.first().waitFor();
        for (let j = 0; j < await secoes.count(); j++) {
          await secoes.nth(j).click();
          await page.waitForFunction(() => ![...document.querySelectorAll('.rel-pagina [role=status], .relatorios-servicos [role=status]')].some(x => x.getClientRects().length));
          assert.equal(await root.getByRole('alert').count(), 0);
          checks.push({ caso: 'Seção ' + await secoes.nth(j).textContent() });
        }
        await page.getByRole('button', { name: 'Resumo', exact: true }).click();
        await page.reload();
        await root.waitFor();
        assert.equal(new URL(page.url()).searchParams.get('inicio'), '2026-10-01');
        await page.getByText('01/10/2026', { exact: false }).first().waitFor();
        checks.push({ caso: 'Período e seção preservados após recarregar' });
      }
      const tabs = c.ramo === 'automotivo' ? page.locator('.rel-abas button') : page.locator('.rs-abas button');
      const names = await tabs.allTextContents();
      for (let i = 0; i < names.length; i++) {
        await tabs.nth(i).click();
        await page.waitForFunction(() => {
          const root = document.querySelector('.rel-pagina, .relatorios-servicos');
          return root && ![...root.querySelectorAll('[role=status]')].some(x => x.getClientRects().length);
        });
        await page.waitForTimeout(300);
        assert.equal(await root.getByRole('alert').count(), 0, 'Erro na aba ' + names[i]);
        const medida = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
        assert(medida.scroll <= medida.width + 2, 'Overflow desktop: ' + JSON.stringify(medida));
        checks.push({ aba: names[i].trim(), largura: 1920, ...medida });
        if (i === 0) await page.screenshot({ path: pasta + '/' + c.especialidade + '-1920.png' });
        await page.setViewportSize({ width: 390, height: 844 });
        await root.scrollIntoViewIfNeeded();
        const mobile = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
        assert(mobile.scroll <= mobile.width + 2, 'Overflow mobile: ' + JSON.stringify(mobile));
        checks.push({ aba: names[i].trim(), largura: 390, ...mobile });
        if (fase !== 'antes') {
          const menu = page.getByLabel('Escolher relatório', { exact: true });
          assert(await menu.isVisible());
          assert.equal(await tabs.nth(i).isVisible(), false);
          const opcao = await menu.locator('option:checked').textContent();
          assert.equal(opcao, names[i].trim());
          // Navegação real pelo seletor móvel, incluindo retorno à aba corrente.
          if (i === 0) {
            const options = await menu.locator('option').evaluateAll(es => es.map(e => e.value));
            await menu.selectOption(options[1]);
            await page.waitForURL(u => u.searchParams.get('aba') === options[1]);
            await menu.selectOption(options[0]);
            await page.waitForURL(u => u.searchParams.get('aba') === options[0]);
            await page.waitForFunction(() => ![...document.querySelectorAll('.rel-pagina [role=status], .relatorios-servicos [role=status]')].some(x => x.getClientRects().length));
            checks.push({caso:'Troca de relatório pelo seletor no celular'});
          }
          const detalhes = root.locator('.rr-detalhes > summary, .gestao-secao > summary');
          for (let k = 0; k < Math.min(3, await detalhes.count()); k++) {
            const summary = detalhes.nth(k);
            if (!(await summary.isVisible())) continue;
            await summary.click();
            const m = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2);
            assert(m, 'Detalhe com rolagem horizontal: ' + names[i]);
            await summary.click();
          }
          checks.push({ caso: 'Detalhes e tabelas abrem no celular: ' + names[i] });
          for (const width of [320, 768, 1366]) {
            await page.setViewportSize({ width, height: 900 });
            const tamanho = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
            assert(tamanho.scroll <= width + 2, 'Overflow ' + width + ': ' + names[i]);
            checks.push({ aba: names[i].trim(), largura: width, ...tamanho });
          }
          await page.setViewportSize({ width: 390, height: 844 });
        }
        if (i === 0) { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: pasta + '/' + c.especialidade + '-390.png', fullPage: false }); }
        await page.setViewportSize({ width: 1920, height: 1080 });
      }
      assert.equal(erros.length, 0, erros.join('\n'));
      resultados.push({ perfil: c.especialidade, ramo: c.ramo, ok: true, checks });
      console.log('PASS', c.especialidade, checks.length);
    } catch (e) {
      resultados.push({ perfil: c.especialidade, ramo: c.ramo, ok: false, checks, erro: e.message, erros });
      await page.screenshot({ path: pasta + '/falha-' + c.especialidade + '.png' });
      console.error('FAIL', c.especialidade, e.message); process.exitCode = 1;
    } finally { await ctx.close(); }
    await writeFile(pasta + '/interface.json', JSON.stringify({ ok: false, em_andamento: true, resultados }, null, 2));
  }
} finally { await browser.close(); }
await writeFile(pasta + '/interface.json', JSON.stringify({ base, fase, data: new Date().toISOString(), ok: !process.exitCode, resultados }, null, 2));
