// Conferência somente de leitura: não confirma formulários nem envia mensagens.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from './lib/chrome-conferencia.mjs';
const out=resolve(process.env.QA_OUTPUT||'output/conferencia-final-20261111/detalhes');
await mkdir(out,{recursive:true});
const base=process.env.QA_URL||'http://127.0.0.1:5190';
const familias=new Set();
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.filter(c=>!familias.has(c.ramo)&&familias.add(c.ramo));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[],componentes=new Set();
try{for(const c of contas){
 assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
 const ctx=await browser.newContext({locale:'pt-BR',viewport:{width:1366,height:900},serviceWorkers:'block'}),p=await ctx.newPage();p.setDefaultTimeout(25000);
 const erros=[],pendentes=new Set();let ultima=Date.now();
 p.on('pageerror',e=>erros.push(e.message));
 p.on('request',r=>{if(r.url().includes('/rest/v1/'))pendentes.add(r)});
 const fim=r=>{pendentes.delete(r);ultima=Date.now()};p.on('requestfinished',fim);p.on('requestfailed',fim);p.on('framenavigated',f=>{if(f===p.mainFrame())pendentes.clear()});
 const pronto=async()=>{const t=Date.now();await p.waitForTimeout(150);while(Date.now()-t<25000&&(pendentes.size||Date.now()-ultima<150))await p.waitForTimeout(100);assert.equal(pendentes.size,0);assert.deepEqual(erros,[]);assert.equal(await p.getByText('Não conseguimos abrir esta tela.',{exact:true}).count(),0);for(const n of await p.evaluate(()=>[...(globalThis.__qaComponentes||[])]))componentes.add(n)};
 const conferir=async(nome,fn)=>{try{await fn();await pronto();for(const width of [1366,390]){await p.setViewportSize({width,height:900});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Página transborda');for(const d of await p.locator('dialog[open]').all())assert(await d.evaluate(e=>e.scrollWidth<=e.clientWidth+2),'Diálogo transborda')}resultados.push({perfil:c.especialidade,nome,ok:true})}catch(e){resultados.push({perfil:c.especialidade,nome,ok:false,erro:e.message});await p.screenshot({path:resolve(out,c.especialidade+'-'+resultados.length+'-falha.png')}).catch(()=>{})}await writeFile(resolve(out,'resultados.json'),JSON.stringify({ok:resultados.every(r=>r.ok),componentesExecutados:[...componentes],resultados},null,2))};
 const ir=async(rota)=>{await p.goto(base+rota,{waitUntil:'domcontentloaded'});await p.locator('main').waitFor();await pronto()};
 const fechar=async()=>{while(await p.locator('dialog[open]').count()){const d=p.locator('dialog[open]').last(),elemento=await d.elementHandle();await d.getByRole('button',{name:'Fechar janela',exact:true}).click();await elemento.waitForElementState('hidden')}};
 try{
 await p.goto(base+'/entrar');await p.getByLabel('E-mail',{exact:true}).fill(c.email);await p.getByLabel('Senha',{exact:true}).fill(c.senha);await p.getByRole('button',{name:'Entrar no sistema',exact:true}).click();await p.waitForURL(u=>!u.pathname.startsWith('/entrar'));await pronto();
 for(const aba of c.ramo==='automotivo'?['financeiro','oficina','producao','estoque','qualidade']:['financeiro','operacao','qualidade','contas','equipe','estoque'])await conferir('Relatório '+aba,()=>ir('/relatorios?aba='+aba+'&inicio=2026-10-01&fim=2026-11-12'));
 await conferir('OS: todas as seções secundárias',async()=>{await ir(c.ramo==='automotivo'?'/ordens-servico':'/atendimentos');await p.locator(c.ramo==='automotivo'?'.linha-ordem-servico':'.servico-linha-abrir').first().click();await p.locator('dialog[open]').waitFor();await pronto();const d=p.locator('dialog[open]').last();
  for(const nav of ['.os-abas','.atendimento-abas']){const nomes=await d.locator(nav+' button').allTextContents();for(const nome of nomes){await d.getByRole('button',{name:nome.trim(),exact:true}).click();await pronto()}}
  const sel=d.locator('.os-mais-secoes select,select[aria-label="Mais opções do atendimento"]');if(await sel.count()){for(const valor of await sel.locator('option').evaluateAll(es=>es.filter(e=>e.value&&!e.disabled).map(e=>e.value))){await sel.selectOption(valor);await pronto()}}
 });await fechar();
 await conferir('Cliente: cadastro e ficha',async()=>{await ir('/clientes');await p.locator('.abrir-ficha-cliente').first().click();await pronto();const d=p.locator('dialog[open]').last();const editar=d.getByRole('button',{name:/Editar cadastro/});if(await editar.count()){await editar.click();await pronto()}});await fechar();
 await conferir('Funcionário: ficha e opcionais',async()=>{await ir('/funcionarios');await p.locator('.funcionario-abrir').first().click();await pronto();const d=p.locator('dialog[open]').last();for(const summary of await d.locator('summary').all()){await summary.click();await pronto()}});await fechar();
 for(const rota of ['/ajuda','/dados-seguranca','/historico-importado'])await conferir(rota,()=>ir(rota));
 }catch(e){resultados.push({perfil:c.especialidade,nome:'acesso',ok:false,erro:e.message})}finally{await ctx.close()}
 console.log('PASSOS',c.especialidade,resultados.filter(r=>r.perfil===c.especialidade).length);
}}finally{await browser.close();await writeFile(resolve(out,'resultados.json'),JSON.stringify({ok:resultados.every(r=>r.ok),componentesExecutados:[...componentes],resultados},null,2))}
assert(resultados.every(r=>r.ok),'Conferir falhas em resultados.json');
