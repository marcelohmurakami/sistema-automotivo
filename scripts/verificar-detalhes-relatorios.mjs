import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {resumirServicos} from '../src/lib/relatoriosServicos.ts';
const base=process.env.QA_BASE||'http://127.0.0.1:5194';
const pasta='output/relatorios-clareza-20261109/detalhes';
await mkdir(pasta,{recursive:true});
const m=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8'));
const vistos=new Set();const contas=m.contas.filter(c=>!vistos.has(c.ramo)&&vistos.add(c.ramo));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const resultados=[];
const moeda=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100).replaceAll('\u00a0',' ');
try {for(const c of contas){
 assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
 const ctx=await browser.newContext({viewport:{width:1920,height:1080},locale:'pt-BR',timezoneId:'America/Sao_Paulo',acceptDownloads:true});
 const page=await ctx.newPage();page.setDefaultTimeout(45000);const erros=[],checks=[],respostas=[],tarefas=[];
 page.on('pageerror',e=>erros.push(e.message));
 page.on('response',r=>{
  if(/\/rpc\/consultar_relatorio(s_servicos|_financeiro)$/.test(r.url())&&r.ok()){
   const p=r.request().postDataJSON();
   if(p.p_inicio==='2026-10-01'&&p.p_fim==='2026-10-30')tarefas.push(r.json().then(data=>respostas.push(data)));
  }
 });
 try{
  await page.goto(base+'/entrar');await page.getByLabel('E-mail',{exact:true}).fill(c.email);await page.getByLabel('Senha',{exact:true}).fill(c.senha);await page.getByRole('button',{name:'Entrar no sistema',exact:true}).click();await page.waitForURL(u=>!u.pathname.startsWith('/entrar'));
  await page.goto(base+'/relatorios?aba=financeiro&inicio=2026-10-01&fim=2026-10-30');
  await page.locator('.gv-resumo').first().waitFor();await Promise.all(tarefas);
  assert(respostas.length,'Consulta do período não observada');const r=respostas.at(-1);
  const esperado=c.ramo==='automotivo'?[r.resumo.receitas,r.resumo.pecas+r.resumo.despesas+r.resumo.taxas,r.resumo.receitas-r.resumo.pecas-r.resumo.despesas-r.resumo.taxas]:(()=>{const s=resumirServicos(r,'2026-10-01','2026-10-30');return [s.receita,s.custo,s.margem,s.ticket]})();
  const cards=page.locator(c.ramo==='automotivo'?'.rel-indicadores .rel-indicador > strong':'.rs-indicadores .rs-indicador > strong');
  for(let i=0;i<esperado.length;i++)assert.equal((await cards.nth(i).innerText()).replaceAll('\u00a0',' '),moeda(esperado[i]));
  checks.push('Valores exibidos preservam a resposta financeira e o custeio do período');
  const ponto=page.locator('.gv-painel svg [role=button]').first();
  await ponto.focus();await ponto.press('Enter');await page.getByRole('tooltip').waitFor();checks.push('Gráfico responde ao teclado e exibe valores');
  await page.getByRole('button',{name:/Fechar detalhes de/}).click();
  await ponto.hover();await page.getByRole('tooltip').waitFor();checks.push('Gráfico exibe valores ao passar o mouse');
  await page.mouse.move(1,1);
  if(c.ramo==='automotivo'){
   const p=page.waitForEvent('download');await page.getByRole('button',{name:'Baixar planilha',exact:true}).click();const d=await p;await d.saveAs(pasta+'/'+c.especialidade+'-relatorio.csv');checks.push('Planilha financeira baixada pelo botão');
  }
  const nav=c.ramo==='automotivo'?page.getByRole('tab',{name:'Análises',exact:true}):page.getByRole('button',{name:'Análises',exact:true});await nav.click();
  const reg=page.getByRole('region',{name:'Análises gerenciais'});await reg.waitFor();
  for(const tipo of ['clientes','dados','tempos','recursos','contratos','primeira_visita','equipamentos','comparacao','filiais']){
   await reg.getByRole('combobox').first().selectOption(tipo);
   await page.waitForFunction(()=>{const b=[...document.querySelectorAll('.an-pagina button')].find(b=>b.textContent.includes('Baixar página'));return b&&!b.disabled&&!document.querySelector('.an-pagina [role=status]')});
   assert.equal(await reg.getByRole('alert').count(),0);
   checks.push('Análise disponível: '+tipo);
  }
  const dl=page.waitForEvent('download');await reg.getByRole('button',{name:'Baixar página',exact:true}).click();await (await dl).saveAs(pasta+'/'+c.especialidade+'-filiais.csv');checks.push('Exportação da análise funciona');
  await page.goto(base+'/relatorios?aba=financeiro&inicio=2026-10-01&fim=2026-10-30');await page.locator('.gv-resumo').first().waitFor();
  await page.evaluate(()=>{localStorage.setItem('patio_tema','escuro');dispatchEvent(new Event('storage'));});
  for(const width of [1920,390]){await page.setViewportSize({width,height:width===1920?1080:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:pasta+'/'+c.especialidade+'-escuro-'+width+'.png'});}
  checks.push('Tema escuro em desktop e celular');
  await page.goto(base+'/garantias?aba=retornos');await page.getByText(c.ramo==='automotivo'?'Garantias e retrabalhos':'Garantias e retrabalhos',{exact:true}).first().waitFor();
  if(c.ramo!=='automotivo') {assert.equal(await page.getByRole('combobox',{name:'Escolher relatório',exact:true}).inputValue(),'qualidade');checks.push('Retornos preservam a aba de qualidade no módulo de garantias');}
  assert.equal(erros.length,0,erros.join('\n'));resultados.push({perfil:c.especialidade,ok:true,checks});console.log('PASS detalhes',c.especialidade,checks.length);
 }catch(e){resultados.push({perfil:c.especialidade,ok:false,checks,erro:e.message,erros});await page.screenshot({path:pasta+'/falha-'+c.especialidade+'.png'});console.error('FAIL',c.especialidade,e.message);process.exitCode=1;}finally{await ctx.close();}
 await writeFile(pasta+'/interface.json',JSON.stringify({ok:false,em_andamento:true,resultados},null,2));
}}finally{await browser.close();}
await writeFile(pasta+'/interface.json',JSON.stringify({ok:!process.exitCode,resultados},null,2));
