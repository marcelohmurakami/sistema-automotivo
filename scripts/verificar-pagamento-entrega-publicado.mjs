import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';

const base = process.env.QA_BASE || 'https://patio-gestao-peach.vercel.app';
const pasta = process.env.QA_OUTPUT || 'output/pagamento-entrega-20261106/publicado';
await mkdir(pasta, { recursive: true });
const conta = JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json', 'utf8')).contas.find(c => c.especialidade === (process.env.QA_PERFIL || 'retifica'));
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
async function rpc(nome, args) { assert.equal(args.p_oficina, conta.empresa_id); const r = await p.request.post(banco + '/rest/v1/rpc/' + nome, { headers, data: args }); assert(r.ok(),nome+' '+r.status()+' '+await r.text()); return r.status()===204?null:r.json(); }
p.setDefaultTimeout(30000);
p.on('pageerror', e => erros.push(e.message));
try {
  await p.goto(base + '/ordens-servico',{waitUntil:'domcontentloaded'});
  await p.getByLabel('E-mail', { exact: true }).fill(conta.email);
  await p.getByLabel('Senha', { exact: true }).fill(conta.senha);
  await p.getByRole('button', { name: 'Entrar no sistema', exact: true }).click();
  await p.getByRole('button', { name: 'Nova OS', exact: true }).waitFor();
  const produto=randomUUID(),descricao='QA Peça ciclo '+produto.slice(0,8);
  await rpc('salvar_produto_estoque',{p_oficina:conta.empresa_id,p_id:produto,p_revisao:null,p_dados:{descricao,unidade:'un',preco_padrao_centavos:3000,custo_centavos:1000,minimo:0}});
  await rpc('movimentar_estoque',{p_oficina:conta.empresa_id,p_produto:produto,p_tipo:'entrada',p_quantidade:10,p_motivo:'Carga fictícia para regressão integrada',p_documento:'QA',p_chave:randomUUID(),p_revisao:1});
  const lerEstoque=async()=>(await rpc('listar_estoque',{p_oficina:conta.empresa_id,p_busca:descricao,p_filtro:'',p_pagina:0})).itens.find(i=>i.id===produto);
  assert.equal((await lerEstoque()).saldo,10);
  for (const [indice, modo] of ['adiar', 'total', 'parcial', 'prazo'].entries()) {
    const i = indice + 1;
    await p.goto(base + '/ordens-servico',{waitUntil:'domcontentloaded'});
    await p.setViewportSize({ width: i % 2 ? 1920 : 390, height: i % 2 ? 1080 : 844 });
    await p.getByRole('button', { name: 'Nova OS', exact: true }).click();
    await p.getByRole('combobox', { name: 'Cliente', exact: true }).click();
    await p.getByRole('option', { name: 'Informar cliente sem cadastrar', exact: true }).click();
    await p.getByLabel('Nome do cliente', { exact: true }).fill('QA Entrega sem repetir pagamento ' + i + ' ' + Date.now());
    if(conta.especialidade==='retifica'){
      await p.getByLabel('Carro', { exact: true }).fill('Fiat Palio QA');
      await p.getByLabel('Motor', { exact: true }).fill('Fire');
    }else{
      await p.getByRole('button',{name:'Novo veículo',exact:true}).click();
      await p.getByLabel('Nome / modelo do veículo',{exact:true}).fill('Fiat Palio QA '+Date.now());
      await p.getByRole('button',{name:'Cadastrar e selecionar',exact:true}).click();
      await p.getByText('Veículo cadastrado e selecionado.',{exact:true}).waitFor();
    }
    await p.getByRole('button', { name: 'Serviço ou peça avulsa', exact: true }).click();
    await p.getByLabel('Nome do serviço ou peça', { exact: true }).fill('QA Pagamento e retirada ');
    await p.getByLabel('Preço unitário (R$)', { exact: true }).fill('120');
    const servico=p.getByRole('group',{name:'Novo item avulso'});await servico.locator('summary').filter({hasText:'Custos e margem'}).click();await servico.getByLabel('Custo direto por unidade (R$)',{exact:true}).fill('20');
    await p.getByRole('button', { name: 'Adicionar serviço', exact: true }).click();
    await p.getByRole('textbox',{name:/Buscar serviço ou peça:/}).fill(descricao);await p.locator('.os-editor-catalogo button').filter({hasText:descricao}).first().click();
    await p.getByLabel('Sim · salvar como pronto e imprimir', { exact: true }).check();
    await p.evaluate(() => { window.qaDialogs = []; });
    let recuperacao;
    if(process.env.QA_PERDER_RESPOSTA==='1'&&i===1){
      let confirmada,chave;
      const interceptar=async route=>{
        chave=route.request().postDataJSON().p_chave;
        const resposta=await route.fetch();assert.equal(resposta.status(),200,await resposta.text());confirmada=await resposta.json();
        await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({code:'XX000',message:'Falha simulada depois de gravar'})});
      };
      await p.route('**/rpc/criar_os_pronta',interceptar,{times:1});
      const falha=p.waitForResponse(r=>r.url().endsWith('/rpc/criar_os_pronta')&&r.status()===500);
      await p.getByRole('button',{name:'Salvar como pronto e imprimir',exact:true}).click();await falha;
      await p.getByRole('alert').waitFor();assert.equal(await p.getByRole('dialog',{name:'Como ficou o pagamento da OS?',exact:true}).count(),0);
      assert.equal((await rpc('consultar_ordem_servico',{p_oficina:conta.empresa_id,p_os:confirmada.id})).situacao,'ready');
      assert.equal((await lerEstoque()).saldo,10);
      recuperacao={id:confirmada.id,chave,erroSimuladoAposGravacao:true,formularioPreservado:true};
    }
    const response = p.waitForResponse(r => r.url().endsWith('/rpc/criar_os_pronta') && r.request().postDataJSON()?.p_oficina === conta.empresa_id);
    await p.getByRole('button', { name: 'Salvar como pronto e imprimir', exact: true }).click();
    const r = await response; assert.equal(r.status(), 200, 'criar_os_pronta: '+await r.text()); const os = await r.json();
    if(recuperacao){assert.equal(os.id,recuperacao.id);assert.equal(r.request().postDataJSON().p_chave,recuperacao.chave);recuperacao.mesmaOsAposReenvio=true;}
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
    resultados.push({ tentativa: i, modo, numero: os.numero, id: os.id, ...estado, ...(recuperacao?{recuperacao}:{}) });
    await p.screenshot({ path: pasta + '/tentativa-' + i + '.png' });
    assert.equal(estado.emFrente, true, 'Pagamento está atrás de outra janela: ' + JSON.stringify(estado));
    assert.equal(estado.impressao, 0);
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
      assert.equal(await p.evaluate(() => window.qaPrint), 0);
    }
    await p.getByRole('button', { name: modo === 'adiar' ? 'Agora não, só imprimir' : 'Concluir e imprimir', exact: true }).click({ timeout: 5000 });
    await p.waitForFunction(n => window.qaPrint === n, 1);
    await p.getByRole('dialog', { name: 'Avisar o cliente que está pronto?', exact: true }).getByRole('button', { name: 'Fechar', exact: true }).click();
    for (const tab of ctx.pages()) if (tab !== p) await tab.close();
    await p.getByRole('dialog', { name: 'Ordem de serviço #' + os.numero, exact: true }).getByRole('button', { name: 'Fechar janela', exact: true }).click();
    const titulo = await rpc('consultar_financeiro_os', { p_oficina: conta.empresa_id, p_os: os.id });
    assert.equal(titulo?.baixado_centavos || 0, modo === 'total' ? 15000 : modo === 'parcial' ? 5000 : 0);
    if (['parcial', 'prazo'].includes(modo)) assert.equal(titulo.vencimento, '2026-12-15');
    const atual = await rpc('consultar_ordem_servico', { p_oficina: conta.empresa_id, p_os: os.id });
    assert.equal(atual.situacao, 'ready');
    assert.equal(atual.itens.find(i=>i.tipo==='part').produto_estoque_id,produto);
    assert.equal((await lerEstoque()).saldo,11-i,'Pronta ainda não consome estoque');
    if (['total', 'parcial'].includes(modo)) {
      const historico = await rpc('historico_financeiro', { p_oficina: conta.empresa_id, p_titulo: titulo.id });
      const taxa = historico.reduce((s, b) => s + b.taxa_centavos, 0);
      assert.equal(taxa, modo === 'parcial' ? 300 : 0);
      resultados.at(-1).taxa = taxa;
    }
    resultados.at(-1).pago = titulo?.baixado_centavos || 0;
    resultados.at(-1).imprimiuAposEscolha = true;

    const historicoAntes = titulo ? await rpc('historico_financeiro', {p_oficina:conta.empresa_id,p_titulo:titulo.id}) : [];
    await p.goto(base + '/', {waitUntil:'domcontentloaded'});
    await p.getByRole('textbox',{name:'Buscar veículo no mapa',exact:true}).fill(String(os.numero));
    const entrega = p.getByRole('button',{name:'Entregar OS '+os.numero+' para Entregue',exact:true});
    await entrega.waitFor();
    await p.screenshot({path:pasta+'/antes-entrega-'+modo+'.png'});
    await writeFile(pasta+'/parcial.json',JSON.stringify({resultados,os:os.id,modo},null,2));
    await p.evaluate(()=>window.qaDialogs=[]);
    const consultaPagamento=p.waitForResponse(r=>r.url().endsWith('/rpc/consultar_financeiro_os')&&r.request().postDataJSON()?.p_os===os.id).catch(e=>e);
    await entrega.click({timeout:15000});
    const respostaPagamento=await consultaPagamento;if(respostaPagamento instanceof Error)throw respostaPagamento;
    assert.equal(respostaPagamento.status(),200);
    if(modo==='adiar'){
      await p.getByRole('dialog',{name:'Como ficou o pagamento da OS?',exact:true}).waitFor();
      await p.getByRole('button',{name:'Já recebi',exact:false}).waitFor();
      await p.screenshot({path:pasta+'/entrega-'+modo+'.png'});
      await p.getByRole('button',{name:'Agora não',exact:true}).click();
    }else{
      await p.waitForTimeout(700);
      assert(!(await p.evaluate(()=>window.qaDialogs)).includes('Como ficou o pagamento da OS?'),'Não deve abrir nem por um instante na entrega');
      await p.screenshot({path:pasta+'/entrega-'+modo+'.png'});
    }
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Sem overflow horizontal');
    const entregue = await rpc('consultar_ordem_servico',{p_oficina:conta.empresa_id,p_os:os.id});
    assert.equal(entregue.situacao,'delivered');
    assert(!(await p.evaluate(()=>window.qaDialogs)).includes('Conferir peças para entregar'),'Peça cadastrada não exige selecionar novamente');
    assert.equal((await lerEstoque()).saldo,10-i,'Entrega consome uma unidade');
    const movimentos=await rpc('consultar_movimentacoes_estoque',{p_oficina:conta.empresa_id,p_produto:produto,p_pagina:0});
    assert.equal(movimentos.filter(m=>m.ordem_servico_id===os.id&&m.tipo==='consumo_os').length,1);
    const lucro=await rpc('consultar_lucro_documento',{p_oficina:conta.empresa_id,p_documento:os.id});
    assert.equal(lucro.receita,15000);assert.equal(lucro.custo,modo==='parcial'?3300:3000);assert.equal(lucro.margem,modo==='parcial'?11700:12000);
    resultados.at(-1).estoqueLucro={produto,saldo:10-i,consumos:1,receita:lucro.receita,custo:lucro.custo,margem:lucro.margem};
    const tituloDepois = await rpc('consultar_financeiro_os',{p_oficina:conta.empresa_id,p_os:os.id});
    assert.equal(tituloDepois.baixado_centavos,titulo?.baixado_centavos||0);
    assert.equal(tituloDepois.pagamento_combinado??false,titulo?.pagamento_combinado??false);
    if(['parcial','prazo'].includes(modo))assert.equal(tituloDepois.vencimento,'2026-12-15');
    const historicoDepois=await rpc('historico_financeiro',{p_oficina:conta.empresa_id,p_titulo:tituloDepois.id});
    assert.deepEqual(historicoDepois,historicoAntes,'Nenhum recebimento duplicado');
    resultados.at(-1).entrega={situacao:entregue.situacao,perguntouPagamento:modo==='adiar',baixado:tituloDepois.baixado_centavos,vencimento:tituloDepois.vencimento,historicoPreservado:true};
    console.log('PASS pagamento e entrega',modo,os.numero);
  }
  assert.deepEqual(erros, []);
} catch (e) {
  process.exitCode = 1; console.error(e.stack); await writeFile(pasta+'/falha.txt',await p.locator('body').innerText());
  await p.screenshot({ path: pasta + '/falha.png' });
} finally {
  await writeFile(pasta + '/resumo.json', JSON.stringify({ ok: !process.exitCode, build: health.build, resultados, erros }, null, 2));
  await browser.close();
}
