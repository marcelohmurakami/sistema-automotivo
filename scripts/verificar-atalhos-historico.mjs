import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from './lib/chrome-conferencia.mjs';
const base=process.env.QA_URL||'http://127.0.0.1:5190',out=process.env.QA_OUTPUT||'output/conferencia-final-20261111/historico';await mkdir(out,{recursive:true});
const m=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8'));
const familias=new Set(),contas=m.contas.filter(c=>!familias.has(c.ramo)&&familias.add(c.ramo));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[];
try{for(const c of contas){
 const ctx=await browser.newContext({locale:'pt-BR',timezoneId:'America/Sao_Paulo'}),p=await ctx.newPage(),checks=[];
 p.setDefaultTimeout(30000);const rede=[];p.on('response',r=>{if(r.url().includes('/rpc/'))rede.push({rpc:new URL(r.url()).pathname,status:r.status()});});
 try{
  await p.goto(base+'/historico');
  await p.getByLabel('E-mail',{exact:true}).fill(c.email);await p.getByLabel('Senha',{exact:true}).fill(c.senha);
  await p.getByRole('button',{name:'Entrar no sistema',exact:true}).click();await p.locator('.historico-pagina').waitFor();await p.getByLabel('Até',{exact:true}).fill('2026-11-12');
  await p.getByLabel('De',{exact:true}).fill('2026-10-01');
  let resposta=p.waitForResponse(r=>r.url().endsWith('/consultar_historico_gestao')&&r.request().postDataJSON().p_tipo==='ordem_servico');
  await p.getByRole('combobox',{name:'Módulo'}).selectOption('ordem_servico');const lista=await(await resposta).json();
  const i=lista.itens.findIndex(e=>e.origem===(c.ramo==='automotivo'?'os':'atendimento'));assert(i>=0);
  await p.locator('.historico-evento').nth(i).click();const d=p.getByRole('dialog',{name:'Detalhes da ocorrência'});await d.getByRole('link',{name:'Abrir atendimento'}).click();
  await p.locator('dialog[open]').waitFor();assert(!p.url().includes('/historico'));assert.equal(await p.getByText('Não conseguimos abrir esta tela.',{exact:true}).count(),0);
  checks.push('Atalho abre o atendimento vinculado no subsistema correto');
  await p.goto(base+'/historico');await p.locator('.historico-pagina').waitFor();await p.getByLabel('Até',{exact:true}).fill('2026-11-12');
  await p.getByLabel('De',{exact:true}).fill('2026-10-01');
  resposta=p.waitForResponse(r=>r.url().endsWith('/consultar_historico_gestao')&&r.request().postDataJSON().p_tipo==='financeiro');
  await p.getByRole('combobox',{name:'Módulo'}).selectOption('financeiro');await resposta;
  await p.locator('.historico-evento').first().click();await d.getByRole('link',{name:'Abrir conta',exact:true}).waitFor();
  const id=new URL(await d.getByRole('link',{name:'Abrir conta'}).getAttribute('href'),base).searchParams.get('titulo');
  const detalheResposta=p.waitForResponse(r=>['consultar_titulo_alerta','consultar_painel_financeiro'].some(n=>r.url().endsWith('/'+n))&&r.request().postDataJSON().p_titulo===id);
  await d.getByRole('link',{name:'Abrir conta',exact:true}).click();await p.waitForURL('**/financeiro?titulo=*');
  // Confirm the linked title is rendered, including cancelled or older accounts.
  const resp=await detalheResposta;assert(resp.ok());const dados=await resp.json();assert(JSON.stringify(dados).includes(id));
  checks.push('Atalho abre a conta financeira, preservando o vínculo');
  resultados.push({perfil:c.especialidade,ok:true,checks});console.log(c.especialidade,'OK');
 }catch(e){resultados.push({perfil:c.especialidade,ok:false,checks,erro:e.message,rede});await p.screenshot({path:out+'/'+c.especialidade+'-falha.png'});console.log(c.especialidade,e.message);}
 finally{await ctx.close();await writeFile(out+'/atalhos.json',JSON.stringify({ok:resultados.every(r=>r.ok),resultados},null,2));}
}}finally{await browser.close();}
if(resultados.some(r=>!r.ok))process.exitCode=1;
