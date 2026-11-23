import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {tituloEvento} from '../src/lib/historico.ts';
const base=process.env.QA_BASE||'http://127.0.0.1:5194';
const fase=process.env.QA_FASE||'local';
const out='output/historico-detalhado-20261109/'+fase;
await mkdir(out,{recursive:true});
const m=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8'));
assert.equal(m.projeto,'hzihxtjirttetnfdujcx');
const ramos=new Set(); const contas=m.contas.filter(c=>process.env.QA_PERFIL?c.especialidade===process.env.QA_PERFIL:process.env.QA_TODOS==='1'||(!ramos.has(c.ramo)&&ramos.add(c.ramo)));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const resultados=[];
try{
for(const c of contas){
 assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
 const ctx=await browser.newContext({viewport:{width:1920,height:1080},locale:'pt-BR',timezoneId:'America/Sao_Paulo'});
 const page=await ctx.newPage();page.setDefaultTimeout(30000);
 const checks=[],erros=[],detalhes=new Map(),paginas=new Map();let lista,detalhe;
 page.on('pageerror',e=>erros.push(e.message));
 page.on('response',async r=>{if(r.url().endsWith('/consultar_historico_gestao')&&r.ok()) {lista=await r.json().catch(()=>null);const p=r.request().postDataJSON();paginas.set(JSON.stringify([p.p_tipo||'',p.p_busca||'',p.p_pagina||0]),lista);}if(r.url().endsWith('/consultar_evento_historico')&&r.ok()) {detalhe=await r.json().catch(()=>null);if(detalhe)detalhes.set(detalhe.origem+detalhe.id,detalhe);}});
 await page.route('**/rest/v1/rpc/**',async route=>{
  const fn=route.request().url().split('/').at(-1);
  if(/^(salvar|baixar|estornar|registrar|excluir|remover|criar|cancelar|atualizar)_/.test(fn)){erros.push('Mutação inesperada '+fn);return route.abort();}return route.continue();
 });
 try{
  await page.goto(base+'/historico');
  await page.getByLabel('E-mail',{exact:true}).fill(c.email);await page.getByLabel('Senha',{exact:true}).fill(c.senha);
  await page.getByRole('button',{name:'Entrar no sistema',exact:true}).click();await page.waitForURL('**/historico');
  await page.locator('.historico-pagina').waitFor(); checks.push('Histórico acessível no ramo');
  const carregou=async()=>{await page.waitForFunction(()=>!document.querySelector('.historico-lista [role=status]'));await page.locator('.historico-evento').first().waitFor();};
  await page.getByLabel('De',{exact:true}).fill('2026-10-01');await page.getByLabel('Até',{exact:true}).fill('2026-11-09');await carregou();
  const semOverflow=async(alvo='body')=>{
   const r=await page.locator(alvo).evaluate(e=>({scroll:e.scrollWidth,client:e.clientWidth}));assert(r.scroll<=r.client+2,JSON.stringify({alvo,...r}));
  };
  await semOverflow();checks.push('Desktop sem rolagem horizontal');
  await page.screenshot({path:out+'/'+c.especialidade+'-lista.png'});
  const dialog=page.getByRole('dialog',{name:'Detalhes da ocorrência'});
  async function abrir(index=0){
   const esperado=lista.itens[index]; detalhe=detalhes.get(esperado.origem+esperado.id); await page.locator('.historico-evento').nth(index).click();await dialog.waitFor();
   await page.waitForFunction(()=>{const e=document.querySelector('.historico-dialogo');return e&&!e.querySelector('[role=status]')});
   assert.equal(await dialog.locator('[role=alert]').count(),0);assert(detalhe);await semOverflow('.historico-dialogo');
  }
  await abrir();checks.push('Clique abre detalhe real do banco');
  if(detalhe.contexto_atual.campos){await dialog.getByText('Dados atuais; podem ter mudado após a ocorrência.',{exact:true}).waitFor();await dialog.getByRole('link',{name:'Abrir conta',exact:true}).waitFor();checks.push('Conta financeira: contexto atual e atalho');}
  assert(await dialog.locator('h3').first().textContent());checks.push('Ocorrência, data e responsável visíveis');
  await page.screenshot({path:out+'/'+c.especialidade+'-detalhe.png'});
  await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);checks.push('Escape fecha o detalhe');
  await page.locator('.historico-evento').first().focus();await page.keyboard.press('Enter');await dialog.waitFor();checks.push('Abertura pelo teclado');await page.keyboard.press('Escape');
  for(const modulo of ['ordem_servico','estoque']){
   const resp=page.waitForResponse(r=>r.url().endsWith('/consultar_historico_gestao')&&r.request().postDataJSON()?.p_tipo===modulo);
   await page.getByRole('combobox',{name:'Módulo',exact:true}).selectOption(modulo);const resposta=await resp;assert(resposta.ok());lista=await resposta.json();await carregou();
   await page.locator('.historico-evento strong').first().getByText(tituloEvento(lista.itens[0].descricao),{exact:true}).waitFor();
   assert(lista.itens.every(e=>e.tipo===modulo));checks.push('Filtro '+modulo);
   const index=lista.itens.findIndex(e=>e.origem===(modulo==='estoque'?'estoque':c.ramo==='automotivo'?'os':'atendimento'));
   assert(index>=0,'Fonte de ocorrência esperada na página');await abrir(index);
   if(modulo==='estoque'){
    assert('quantidade'in detalhe.detalhes);await dialog.getByText('Saldo após a movimentação',{exact:true}).waitFor();checks.push('Quantidade, saldo, custo e motivo do estoque');
   }else{
    assert.equal(detalhe.origem,c.ramo==='automotivo'?'os':'atendimento');checks.push('Fonte correta do atendimento');
    const link=dialog.getByRole('link',{name:'Abrir atendimento'});await link.waitFor();assert((await link.getAttribute('href')).includes(detalhe.entidade));checks.push('Atalho para o atendimento certo');
   }
   for(const width of [390,320,768,1366]){
    await page.setViewportSize({width,height:844});await semOverflow('.historico-dialogo');
    assert(await dialog.getByRole('button',{name:'Fechar janela'}).isVisible());checks.push('Detalhe responsivo '+width+' '+modulo);
    if(width===390)await page.screenshot({path:out+'/'+c.especialidade+'-'+modulo+'-mobile.png'});
   }
   await page.keyboard.press('Escape');await semOverflow();await page.setViewportSize({width:1920,height:1080});
  }
  // Filtering and paging stay on the list; returning from details preserves them.
  await page.getByRole('combobox',{name:'Módulo',exact:true}).selectOption('');await carregou();
  const busca=page.getByRole('textbox',{name:'Buscar ocorrência'});
  const empty=page.waitForResponse(r=>r.url().endsWith('/consultar_historico_gestao')&&r.request().postDataJSON()?.p_busca==='QA_SEM_OCORRENCIA_928475');
  await busca.fill('QA_SEM_OCORRENCIA_928475');assert((await empty).ok());await page.getByText('Nenhuma ocorrência neste período e filtro.',{exact:true}).waitFor();checks.push('Busca sem resultados clara');
  await busca.fill('');await carregou();lista=paginas.get(JSON.stringify(['','',0]));assert(lista?.itens.length);
  if(lista.total>30){
   const antes=await page.locator('.historico-evento').first().innerText();
   const paginou=page.waitForResponse(r=>r.url().endsWith('/consultar_historico_gestao')&&r.request().postDataJSON()?.p_pagina===1);
   await page.getByRole('button',{name:'Próxima',exact:true}).click();const pag=await paginou;assert(pag.ok());lista=await pag.json();await carregou();
   assert.notEqual(await page.locator('.historico-evento').first().innerText(),antes);checks.push('Paginação sem repetir a primeira página');
   await abrir();await page.keyboard.press('Escape');await page.getByText(/Página 2/).waitFor();checks.push('Fecha mantendo página e filtros');
  }
  await page.setViewportSize({width:390,height:844});await semOverflow();checks.push('Lista no celular sem transbordar');
  await page.screenshot({path:out+'/'+c.especialidade+'-lista-mobile.png'});
  await page.getByRole('button',{name:'Alternar tema claro e escuro',exact:true}).click();
  await page.locator('.historico-evento').first().click();await dialog.waitFor();
  await page.waitForFunction(()=>!document.querySelector('.historico-dialogo [role=status]'));
  assert.equal(await dialog.locator('[role=alert]').count(),0);await semOverflow('.historico-dialogo');checks.push('Detalhe no tema escuro e celular');
  await page.screenshot({path:out+'/'+c.especialidade+'-escuro-mobile.png'});await page.keyboard.press('Escape');
  assert.deepEqual(erros,[]);checks.push('Sem erros de JavaScript nem gravações de teste');
  resultados.push({perfil:c.especialidade,ok:true,checks});console.log(c.especialidade,checks.length);
 }catch(e){resultados.push({perfil:c.especialidade,ok:false,erro:e.message,checks,erros});await page.screenshot({path:out+'/'+c.especialidade+'-falha.png'}).catch(()=>{});console.log('FALHA',c.especialidade,e.message);}
 finally{await ctx.close();await writeFile(out+'/interface.json',JSON.stringify({ok:resultados.every(r=>r.ok),base,resultados},null,2));}
}
}finally{await browser.close();}
if(resultados.some(r=>!r.ok))process.exitCode=1;
