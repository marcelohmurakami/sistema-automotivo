import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const pasta=process.env.QA_OUTPUT||'output/estoque-simplificado-20261105/site-publicado';await mkdir(pasta,{recursive:true});
const base=process.env.QA_BASE||'https://patio-gestao-peach.vercel.app';
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas;
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const resultados=[],erros=[],falhas=[];let page;
try{
 for(const ramo of ['automotivo','assistencia_tecnica','manutencao_campo','limpeza']){
  const conta=contas.find(c=>c.ramo===ramo&&(ramo!=='assistencia_tecnica'||c.especialidade==='assistencia_celulares'));assert(conta?.empresa.startsWith('ZZ [TESTE 20261019] '),'Conta fictícia '+ramo);
  const ctx=await browser.newContext({viewport:{width:1920,height:1080},locale:'pt-BR',timezoneId:'America/Sao_Paulo'});page=await ctx.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>erros.push(e.message));
  // Read-only verification: reject financial, catalog and stock mutations even on the test account.
  await ctx.route('**/rest/v1/rpc/**',async r=>{const nome=new URL(r.request().url()).pathname.split('/').at(-1);if(/^(salvar|movimentar|arquivar|estornar|configurar|registrar|transferir|preparar_etiqueta)/.test(nome)){falhas.push('Mutação inesperada '+nome);return r.abort();}return r.continue();});
  await page.goto(base+'/estoque');await page.getByLabel('E-mail',{exact:true}).fill(conta.email);await page.getByLabel('Senha',{exact:true}).fill(conta.senha);await page.getByRole('button',{name:'Entrar no sistema',exact:true}).click();await page.locator('.estoque-titulo').waitFor();await page.locator('.linha-estoque').first().waitFor();
  const layout=async(nome)=>{const v=await page.evaluate(()=>{const root=[...document.querySelectorAll('dialog[open]')].at(-1)||document.querySelector('.painel-lista-estoque');return{documento:document.documentElement.scrollWidth,largura:innerWidth,painel:root.scrollWidth<=root.clientWidth+1,overlap:[...root.querySelectorAll('.linha-estoque-acoes')].some(e=>{const c=[...e.children].map(x=>x.getBoundingClientRect());return c.length>1&&c[0].right>c[1].left+1;})};});assert(v.documento<=v.largura+1,nome+' documento');assert(v.painel,nome+' painel');assert(!v.overlap,nome+' ações');resultados.push(nome);};
  for(const width of [1920,1366,390,320]){
   await page.setViewportSize({width,height:width>600?1080:844});await layout(ramo+' lista '+width);await page.screenshot({path:pasta+'/'+ramo+'-'+width+'.png'});
   await page.locator('.linha-estoque').first().getByRole('button',{name:/Mais opções de/}).click();await page.getByRole('dialog',{name:'Detalhes do item',exact:true}).waitFor();await layout(ramo+' detalhes '+width);await page.screenshot({path:pasta+'/'+ramo+'-detalhes-'+width+'.png'});await page.getByRole('dialog',{name:'Detalhes do item',exact:true}).getByRole('button',{name:'Fechar janela',exact:true}).click();
  }
  await page.getByRole('button',{name:'Mais opções',exact:true}).click();
  const menu=page.getByRole('dialog',{name:'Mais opções do estoque',exact:true});await menu.waitFor();assert.doesNotMatch(await menu.innerText(),/veículos?|oficina/i);await layout(ramo+' menu sem termos automotivos');await page.screenshot({path:pasta+'/'+ramo+'-menu.png'});
  await menu.getByRole('button',{name:'Locais de estoque e transferências',exact:true}).click();
  const locais=page.getByRole('dialog',{name:'Locais de estoque',exact:true});await locais.waitFor();await locais.getByLabel('Buscar local de estoque').waitFor();await layout(ramo+' locais de estoque');
  await locais.getByRole('button',{name:'+ Novo local',exact:true}).click();
  const novoLocal=page.getByRole('dialog',{name:'Novo local de estoque',exact:true});await novoLocal.waitFor();assert.doesNotMatch(await novoLocal.innerText(),/veículos?|oficina/i);await novoLocal.getByRole('combobox',{name:/^Tipo/}).selectOption({label:'Estoque móvel'});assert.equal(await novoLocal.getByRole('combobox',{name:/^Tipo/}).inputValue(),'veiculo');await layout(ramo+' cadastro de estoque móvel');await page.screenshot({path:pasta+'/'+ramo+'-novo-local.png'});
  await novoLocal.getByRole('button',{name:'Fechar janela',exact:true}).click();await locais.getByRole('button',{name:'Fechar janela',exact:true}).click();
  const mov=page.locator('.linha-estoque').getByRole('button',{name:/^Movimentar/}).first();
  if(await mov.count()){await mov.click();await page.locator('dialog[open]').last().waitFor();await layout(ramo+' movimentação móvel');await page.locator('dialog[open]').last().getByRole('button',{name:'Fechar janela',exact:true}).click();}
  await page.locator('.estoque-titulo-acoes .botao-primario').click();await page.locator('input[name="descricao"]').waitFor();assert.equal(await page.locator('dialog[open] details[open]').count(),0);await layout(ramo+' novo item móvel');await page.locator('dialog[open]').last().getByRole('button',{name:'Fechar janela',exact:true}).click();
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/rpc/listar_estoque')),page.getByLabel('Exibir',{exact:true}).selectOption('zerado')]);await layout(ramo+' filtro zerado');
  assert(!await page.getByText('Não conseguimos abrir esta tela.',{exact:true}).count());console.log('PASS site',ramo);await ctx.close();
 }
 assert.deepEqual(erros,[]);assert.deepEqual(falhas,[]);
}catch(e){console.error(e.stack);process.exitCode=1;if(page&&!page.isClosed()){await page.screenshot({path:pasta+'/falha.png'});await writeFile(pasta+'/falha.txt',await page.locator('body').innerText());}}
finally{await writeFile(pasta+'/resultado.json',JSON.stringify({ok:!process.exitCode,resultados,erros,falhas,semGravar:true},null,2));await browser.close();}
