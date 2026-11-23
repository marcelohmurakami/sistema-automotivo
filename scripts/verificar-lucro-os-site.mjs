import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const pasta=process.env.QA_OUTPUT || 'output/correcao-lucro-os-20261105/antes';await mkdir(pasta,{recursive:true});
const base=process.env.QA_BASE || 'https://patio-gestao-peach.vercel.app';
const conta=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.find(c=>c.especialidade==='retifica');assert(conta.empresa.startsWith('ZZ [TESTE 20261019] '));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),ctx=await browser.newContext({viewport:{width:1920,height:1080},locale:'pt-BR',timezoneId:'America/Sao_Paulo'}),p=await ctx.newPage();
const erros=[],consoleErros=[],respostas=[],resultados=[];p.setDefaultTimeout(20000);p.on('pageerror',e=>erros.push(e.stack));p.on('console',m=>{if(m.type()==='error')consoleErros.push(m.text())});
p.on('response',async r=>{if(r.url().endsWith('/rpc/consultar_lucro_documento'))respostas.push({status:r.status(),dados:await r.json()})});
try{
 await p.goto(base+'/ordens-servico');await p.getByLabel('E-mail',{exact:true}).fill(conta.email);await p.getByLabel('Senha',{exact:true}).fill(conta.senha);await p.getByRole('button',{name:'Entrar no sistema',exact:true}).click();await p.getByRole('button',{name:'Nova OS',exact:true}).waitFor();
 for(const [id,total,pago] of [['a82bc74d-e28b-4058-88d7-b4908838aec1',13125,13125],['4a82879b-87fd-45fe-8c1d-164226786ee2',13500,5000]]){
  await p.goto(base+'/ordens-servico?os='+id);
  await p.getByRole('button',{name:'Lucro e custos',exact:true}).click();
  const lucro=p.getByRole('region',{name:'Lucro e custos da OS',exact:true});await lucro.waitFor();
  const dados=respostas.find(x=>x.dados?.id===id)?.dados;assert(dados);assert.equal(dados.receita,total);assert.equal(dados.pago,pago);assert.equal(dados.aberto,total-pago);assert.equal(dados.conferencia?.dados,null);
  for(const width of [1920,390,320]){
   await p.setViewportSize({width,height:width===1920?1080:844});
   assert(await p.getByRole('dialog').filter({has:lucro}).evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   await lucro.getByRole('heading',{name:'Lucro e custos',exact:true}).scrollIntoViewIfNeeded();await p.screenshot({path:pasta+'/'+id+'-'+width+'.png'});
  }
  await lucro.getByRole('button',{name:'Ajustar custo',exact:true}).first().click();
  await lucro.getByLabel('Custo direto por unidade (R$)',{exact:true}).waitFor();
  await lucro.getByRole('button',{name:'Conferir / adicionar outros custos',exact:true}).click();
  await p.getByLabel('Tempo produtivo do serviço (minutos)',{exact:false}).waitFor();
  await p.getByRole('button',{name:'Adicionar custo que faltou',exact:true}).click();
  await p.getByRole('dialog',{name:'Adicionar custo do serviço',exact:true}).waitFor();
  resultados.push({id,total,pago,saldo:total-pago,larguras:[1920,390,320],semConferencia:true,edicaoDisponivel:true,semGravar:true});console.log('PASS lucro OS',id);
 }
 assert.deepEqual(erros,[]);assert(!consoleErros.some(e=>/TypeError|ReferenceError/.test(e)));
}catch(e){process.exitCode=1;console.error(e.message);await p.screenshot({path:pasta+'/falha.png'});await writeFile(pasta+'/falha.txt',await p.locator('body').innerText());}
finally{await writeFile(pasta+'/resultado.json',JSON.stringify({ok:!process.exitCode,erros,consoleErros,respostas,resultados},null,2));await browser.close();}
