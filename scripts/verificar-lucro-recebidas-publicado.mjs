import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const root=resolve('output/lucro-assistencia-manutencao-20261110'),pasta=resolve(root,'publicado');await mkdir(pasta,{recursive:true});
const base=process.env.QA_BASE||'https://patio-gestao-peach.vercel.app',banco='https://hzihxtjirttetnfdujcx.supabase.co';
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas;
const docs=JSON.parse(await readFile(resolve(root,'documentos-publicados.json'),'utf8'));
const pacote=JSON.parse(await readFile(resolve(root,'pacote-publicacao.json'),'utf8'));
assert.equal((await fetch(base+'/health.json?qa='+Date.now()).then(r=>r.json())).build,pacote.build);
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[],errors=[];let ctx,page,perfil;
try{
 assert.equal(docs.length,26);
 for(const c of contas){
  perfil=c.especialidade;assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));const doc=docs.find(x=>x.especialidade===perfil);assert.equal(doc.empresa_id,c.empresa_id);
  await ctx?.close();ctx=await browser.newContext({viewport:{width:1920,height:1080},locale:'pt-BR',timezoneId:'America/Sao_Paulo'});await ctx.addInitScript(()=>localStorage.setItem('patio_tema','escuro'));
  page=await ctx.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push({perfil,erro:e.message}));
  const url=c.ramo==='automotivo'?'/ordens-servico?os='+doc.id:'/atendimentos?atendimento='+doc.id;
  await page.goto(base+'/entrar');await page.getByLabel('E-mail',{exact:true}).fill(c.email);await page.getByLabel('Senha',{exact:true}).fill(c.senha);await page.getByRole('button',{name:'Entrar no sistema',exact:true}).click();await page.waitForURL(u=>!u.pathname.startsWith('/entrar'));await page.goto(base+url);
  const consulta=page.waitForResponse(r=>r.url()===banco+'/rest/v1/rpc/consultar_lucro_documento');
  await page.getByRole('button',{name:'Lucro e custos',exact:true}).click();const res=await consulta;assert.equal(res.status(),200);const d=await res.json();assert.equal(d.id,doc.id);assert.equal(d.margem,d.receita-d.custo);assert.equal(d.aberto,Math.max(0,d.receita-d.pago));
  const panel=page.getByRole('region',{name:'Lucro e custos da OS'});await panel.waitFor();
  const moeda=v=>(v/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}).replace(/\s/g,'');
  for(const [rotulo,v] of [['Valor final da OS',d.receita],['Descontos e abatimentos',-d.desconto],['Já recebido (descontados os estornos)',d.pago],['Total dos custos',d.custo],['Lucro: valor final menos custos',d.margem]])assert.equal((await panel.locator('dl > div').filter({has:page.getByText(rotulo,{exact:true})}).locator('dd').innerText()).replace(/\s/g,''),moeda(v||0));
  for(const width of [1920,390,320]){await page.setViewportSize({width,height:1080});assert(await page.getByRole('dialog').filter({has:panel}).evaluate(e=>e.scrollWidth<=e.clientWidth+1));await panel.getByRole('heading',{name:'Lucro e custos',exact:true}).scrollIntoViewIfNeeded();if(['retifica','assistencia_celulares','manutencao_climatizacao','limpeza_residencial'].includes(perfil))await page.screenshot({path:resolve(pasta,perfil+'-'+width+'.png')});}
  if(d.itens.some(i=>i.origem!=='cliente')){await panel.getByRole('button',{name:'Ajustar custo',exact:true}).first().click();await panel.getByLabel('Custo direto por unidade (R$)').waitFor();}
  await panel.getByRole('button',{name:'Conferir / adicionar outros custos',exact:true}).click();await page.getByLabel('Tempo produtivo do serviço (minutos)',{exact:false}).waitFor();
  resultados.push({perfil,id:doc.id,numero:doc.numero,situacao:doc.situacao,receita:d.receita,desconto:d.desconto,pago:d.pago,custo:d.custo,lucro:d.margem,larguras:[1920,390,320],gravacoes:false,ok:true});await writeFile(resolve(pasta,'parcial.json'),JSON.stringify({build:pacote.build,resultados},null,2));console.log('PASS publicado',perfil);
 }
 assert.deepEqual(errors,[]);
}catch(e){process.exitCode=1;console.error(perfil,e.stack);await page?.screenshot({path:resolve(pasta,'falha.png')});await writeFile(resolve(pasta,'falha.txt'),await page.locator('body').innerText());}
finally{await browser.close();await writeFile(resolve(pasta,'resultado.json'),JSON.stringify({ok:!process.exitCode,build:pacote.build,errors,resultados},null,2));}
