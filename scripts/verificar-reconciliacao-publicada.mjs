// Navegador de teste isolado; apenas login, consulta e download do relatório.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const base='https://patio-gestao-peach.vercel.app';
const pasta='output/auditoria-numeros-20261102';
const m=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8'));
const health=await fetch(base+'/health.json?qa='+Date.now(),{cache:'no-store'}).then(r=>r.json());
assert.equal(health.build,JSON.parse(await readFile(pasta+'/pacote-publicacao.json','utf8')).build);
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const resultados=[];await mkdir(pasta+'/site-publicado',{recursive:true});
try{
 for(const conta of m.contas){
  assert(conta.empresa.startsWith('ZZ [TESTE 20261019] '));
  const ctx=await browser.newContext({viewport:{width:1920,height:1080},locale:'pt-BR',timezoneId:'America/Sao_Paulo',acceptDownloads:true});
  const page=await ctx.newPage();page.setDefaultTimeout(35000);
  const erros=[],checks=[], respostas=[];page.on('response',async r=>{if(/\/rpc\/consultar_relatorios_(gestao|servicos)$/.test(new URL(r.url()).pathname)&&r.ok()){try{respostas.push(await r.json())}catch{}}});page.on('pageerror',e=>erros.push(e.message));
  try{
   await page.goto(base+'/relatorios',{waitUntil:'domcontentloaded'});
   await page.getByLabel('E-mail',{exact:true}).fill(conta.email);
   await page.getByLabel('Senha',{exact:true}).fill(conta.senha);
   await page.getByRole('button',{name:'Entrar no sistema',exact:true}).click();
   await page.waitForURL('**/relatorios');
   await page.waitForFunction(()=>!document.querySelector('[role="status"]')?.textContent.includes('Carregando'));
   for(let i=0;!respostas.length&&i<100;i++)await page.waitForTimeout(100);
   assert(respostas.length,'Relatório operacional não foi carregado');assert(respostas.at(-1).custeios,'Site não recebeu a apuração corrigida');checks.push('Relatório operacional recebe custeio unificado');
   if(conta.ramo!=='automotivo'){
     const dados=respostas.at(-1), total=Object.values(dados.custeios).reduce((s,x)=>s+x.custo,0), moeda=(total/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}).replaceAll('\u00a0',' ');
     const card=page.locator('.rs-indicador').filter({hasText:'Custos dos atendimentos'});await card.waitFor();assert((await card.innerText()).replaceAll('\u00a0',' ').includes(moeda));checks.push('Custo exibido corresponde à soma do custeio das OS');
   }
   const aba=conta.ramo==='automotivo'?page.getByRole('tab',{name:'Análises',exact:true}):page.getByRole('button',{name:'Análises',exact:true});
   await aba.click();
   const regio=page.getByRole('region',{name:'Análises gerenciais'});
   await regio.waitFor();
   const dates=page.locator('input[type=date]');
   await dates.nth(0).fill('2026-10-01');await dates.nth(1).fill('2026-11-02');
   if(conta.ramo==='automotivo')await page.getByRole('button',{name:'Aplicar',exact:true}).click();
   const select=regio.getByRole('combobox').first();
   for(const tipo of ['clientes','dados','tempos','recursos','contratos','primeira_visita','equipamentos','comparacao','filiais']){
    await select.selectOption(tipo);
    await regio.getByRole('button',{name:'Baixar página',exact:true}).waitFor();
    await page.waitForFunction(()=>{const r=document.querySelector('.an-pagina');const b=[...r.querySelectorAll('button')].find(x=>x.textContent.includes('Baixar página'));return !!b&&!b.disabled&&!r.querySelector('[role=alert]')&&!r.querySelector('[role=status]')});
    assert.equal(await regio.getByRole('alert').count(),0);
    const medida=await page.evaluate(()=>({largura:document.documentElement.clientWidth,conteudo:document.documentElement.scrollWidth}));assert(medida.conteudo<=medida.largura+2,'Rolagem horizontal no desktop');
    checks.push('Consulta visual '+tipo+' em 1920 px');
   }
   const downloadPromise=page.waitForEvent('download');await regio.getByRole('button',{name:'Baixar página',exact:true}).click();const download=await downloadPromise;
   assert(download.suggestedFilename().includes('filiais'));await download.saveAs(pasta+'/site-publicado/'+conta.especialidade+'-filiais.csv');checks.push('Exportação CSV pelo botão');
   await select.selectOption('clientes');await page.waitForFunction(()=>{const b=[...document.querySelectorAll('.an-pagina button')].find(x=>x.textContent.includes('Baixar página'));return b&&!b.disabled});
   if(['mecanica','assistencia_celulares','manutencao_climatizacao','limpeza_geral'].includes(conta.especialidade))await page.screenshot({path:pasta+'/site-publicado/'+conta.especialidade+'-1920.png',fullPage:true});
   await page.setViewportSize({width:390,height:844});
   await regio.getByRole('heading',{name:'Análises para decidir'}).scrollIntoViewIfNeeded();
   const mobile=await page.evaluate(()=>({largura:document.documentElement.clientWidth,conteudo:document.documentElement.scrollWidth}));assert(mobile.conteudo<=mobile.largura+2,'Rolagem horizontal no celular');checks.push('Layout em 390 px');
   if(['mecanica','assistencia_celulares','manutencao_climatizacao','limpeza_geral'].includes(conta.especialidade))await page.screenshot({path:pasta+'/site-publicado/'+conta.especialidade+'-390.png',fullPage:true});
   assert.equal(erros.length,0,erros.join('\n'));checks.push('Sem exceções JavaScript');
   resultados.push({perfil:conta.especialidade,ok:true,checks});console.log('PASS site',conta.especialidade,checks.length);
  }catch(e){await page.screenshot({path:pasta+'/site-publicado/falha-'+conta.especialidade+'.png',fullPage:true});resultados.push({perfil:conta.especialidade,ok:false,checks,erro:e.message,erros});process.exitCode=1;console.error('FALHA site',conta.especialidade,e.message);break}
  finally{await ctx.close()}
  await writeFile(pasta+'/publicado-ui.json',JSON.stringify({ok:false,em_andamento:true,resultados},null,2));
 }
}finally{await browser.close()}
const resumo={data:new Date().toISOString(),build:health.build,url:base,ok:!process.exitCode&&resultados.length===26,subsetores:resultados.length,verificacoes:resultados.reduce((s,r)=>s+r.checks.length,0),resultados};
await writeFile(pasta+'/publicado-ui.json',JSON.stringify(resumo,null,2));console.log(JSON.stringify({ok:resumo.ok,subsetores:resumo.subsetores,verificacoes:resumo.verificacoes}));
