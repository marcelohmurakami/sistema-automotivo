// Somente leitura nas empresas fictícias: abre formulários sem salvar.
import assert from 'node:assert/strict';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {resolve} from 'node:path';import {chromium} from 'playwright';
const out=resolve(process.env.QA_OUTPUT||'output/processos-agilidade-20261112/atalhos-publicados'),base=process.env.QA_URL||'https://patio-gestao-peach.vercel.app',resultados=[];await mkdir(out,{recursive:true});
const health=await fetch(base+'/health.json',{cache:'no-store'}).then(r=>r.json());if(process.env.QA_EXPECTED_BUILD)assert.equal(health.build,process.env.QA_EXPECTED_BUILD);
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.filter(c=>!process.env.QA_PERFIS||process.env.QA_PERFIS.split(',').includes(c.especialidade));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const salvar=()=>writeFile(resolve(out,'resultados.json'),JSON.stringify({build:health.build,ok:resultados.every(r=>r.ok),ambiente:'Site conectado; somente leitura nas empresas ZZ; formulários abertos sem gravar',resultados},null,2));
try{for(const c of contas){assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));const ctx=await browser.newContext({viewport:{width:1366,height:900},locale:'pt-BR',serviceWorkers:'block'}),p=await ctx.newPage();p.setDefaultTimeout(30000);const erros=[];p.on('pageerror',e=>erros.push(e.message));
 try{
  await p.goto(base+'/entrar');await p.getByLabel('E-mail',{exact:true}).fill(c.email);await p.getByLabel('Senha',{exact:true}).fill(c.senha);await p.getByRole('button',{name:'Entrar no sistema',exact:true}).click();await p.waitForURL(u=>!u.pathname.startsWith('/entrar'));
  for(const documento of ['os','orcamento']){
   await p.setViewportSize({width:documento==='os'?1366:390,height:900});await p.goto(base+'/clientes');await p.locator('.abrir-ficha-cliente').first().click();const ficha=p.locator('.ficha-cliente');await ficha.locator('h3').waitFor();const nome=await ficha.locator('h3').first().innerText();
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));assert(await p.locator('dialog[open]').last().evaluate(e=>e.scrollWidth<=e.clientWidth+2));
   if(documento==='orcamento'&&['retifica','assistencia_celulares','manutencao_climatizacao','limpeza_geral'].includes(c.especialidade))await p.screenshot({path:resolve(out,c.especialidade+'-ficha.png')});
   const acao=ficha.locator('.ficha-cliente-acoes a').filter({hasText:documento==='orcamento'?'Novo orçamento':/Nova OS|Ordem de reparo|Visita técnica|Serviço de limpeza/});const href=await acao.getAttribute('href'),id=new URL(href,base).searchParams.get('cliente');assert(id);await acao.click();const d=p.locator('dialog[open]').last(),selecao=d.getByRole('combobox',{name:'Cliente',exact:true});await selecao.waitFor();await p.waitForFunction(nome=>{const e=document.querySelector('dialog[open] [role="combobox"]');return e?.value===nome},nome);assert.equal(await selecao.inputValue(),nome);assert.equal(new URL(p.url()).searchParams.get('cliente'),id);
   for(const width of [1366,390]){await p.setViewportSize({width,height:900});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));assert(await d.evaluate(e=>e.scrollWidth<=e.clientWidth+2));}
   if(['retifica','assistencia_celulares','manutencao_climatizacao','limpeza_geral'].includes(c.especialidade))await p.screenshot({path:resolve(out,c.especialidade+'-'+documento+'.png')});
   await d.getByRole('button',{name:'Fechar janela',exact:true}).click();assert.deepEqual(erros,[]);resultados.push({perfil:c.especialidade,documento,ok:true,clientePreenchido:true,larguras:[1366,390]});await salvar();
  }
 }catch(e){resultados.push({perfil:c.especialidade,ok:false,erro:e.message});await p.screenshot({path:resolve(out,c.especialidade+'-falha.png')}).catch(()=>{});console.log('FAIL',c.especialidade,e.message.slice(0,300));}
 await ctx.close();await salvar();console.log('DONE',c.especialidade);
}}finally{await browser.close();await salvar()}
assert(resultados.every(r=>r.ok));assert.equal((await fetch(base+'/health.json',{cache:'no-store'}).then(r=>r.json())).build,health.build);
