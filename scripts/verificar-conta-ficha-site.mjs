import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const base='https://patio-gestao-peach.vercel.app',pasta='output/conta-cliente-ficha-20261105';
const m=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8'));
const banco=JSON.parse(await readFile(pasta+'/publicado-banco.json','utf8'));assert(banco.ok);
const pacote=JSON.parse(await readFile(pasta+'/pacote-publicacao.json','utf8'));
const health=await fetch(base+'/health.json?qa='+Date.now(),{cache:'no-store'}).then(r=>r.json());assert.equal(health.build,pacote.build);
await mkdir(pasta+'/site-publicado',{recursive:true});
const b=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[];
try{for(const conta of m.contas){
 assert(conta.empresa.startsWith('ZZ [TESTE 20261019] '));
 const esperado=banco.resultados.find(x=>x.perfil===conta.especialidade);
 const ctx=await b.newContext({viewport:{width:1920,height:1080},locale:'pt-BR',timezoneId:'America/Sao_Paulo',acceptDownloads:true}),p=await ctx.newPage(),checks=[],erros=[];p.setDefaultTimeout(35000);p.on('pageerror',e=>erros.push(e.message));
 try{
  await p.goto(base+'/clientes?cliente='+esperado.cliente);await p.getByLabel('E-mail',{exact:true}).fill(conta.email);await p.getByLabel('Senha',{exact:true}).fill(conta.senha);await p.getByRole('button',{name:'Entrar no sistema',exact:true}).click();
  await p.getByRole('button',{name:'Gerar conta em PDF',exact:true}).waitFor();checks.push('Ficha do cliente com atalho de PDF');
  await p.getByRole('button',{name:'Gerar conta em PDF',exact:true}).click();await p.locator('.conta-ficha').waitFor();
  if(esperado.ordens.length){
   const o=esperado.ordens.at(-1);await p.getByLabel('Incluir OS '+o.numero,{exact:true}).waitFor();await p.getByRole('button',{name:'Desmarcar todas',exact:true}).click();assert(await p.getByRole('button',{name:'Baixar conta em PDF',exact:true}).isDisabled());checks.push('Sem seleção não gera conta');
   await p.getByLabel('Incluir OS '+o.numero,{exact:true}).check();const total=(o.aberto_centavos/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});assert((await p.locator('.conta-ficha-rodape strong').innerText()).includes(total));checks.push('Seleção de uma OS com saldo correto');
   const retorno=p.waitForResponse(r=>r.url().includes('/rpc/consultar_conta_financeira_cliente')&&r.request().postDataJSON()?.p_ids?.length===1);
   const download=p.waitForEvent('download');await p.getByRole('button',{name:'Baixar conta em PDF',exact:true}).click();const resposta=await retorno;assert.equal(resposta.status(),200);assert.deepEqual(resposta.request().postDataJSON().p_ids,[o.id]);
   const pdf=await download,arquivo=pasta+'/site-publicado/conta-'+conta.especialidade+'.pdf';await pdf.saveAs(arquivo);assert((await readFile(arquivo)).subarray(0,4).equals(Buffer.from('%PDF')));await p.getByRole('status').filter({hasText:'PDF baixado'}).waitFor();checks.push('Saldo reconferido e PDF baixado pelo botão');
  }else{await p.getByText('Este cliente não tem cobranças de OS em aberto.',{exact:true}).waitFor();assert(await p.getByRole('button',{name:'Baixar conta em PDF'}).isDisabled());checks.push('Sem cobranças não inventa saldo');}
  for(const w of[1920,390]){await p.setViewportSize({width:w,height:w===390?844:1080});await p.evaluate(()=>document.fonts.ready);assert(await p.evaluate(()=>[...document.querySelectorAll('dialog[open]')].every(d=>d.scrollWidth<=d.clientWidth+2)),'Rolagem horizontal '+w);checks.push('Layout sem rolagem horizontal '+w+'px');if(['mecanica','assistencia_celulares','manutencao_climatizacao','limpeza_geral'].includes(conta.especialidade))await p.screenshot({path:pasta+'/site-publicado/'+conta.especialidade+'-'+w+'.png',fullPage:true});}
  assert.deepEqual(erros,[]);checks.push('Sem erros JavaScript');resultados.push({perfil:conta.especialidade,ok:true,numero:esperado.ordens.at(-1)?.numero,aberto_centavos:esperado.ordens.at(-1)?.aberto_centavos,checks});console.log('PASS site',conta.especialidade,checks.length);
 }catch(e){resultados.push({perfil:conta.especialidade,ok:false,checks,erro:e.message,erros});await p.screenshot({path:pasta+'/site-publicado/falha-'+conta.especialidade+'.png',fullPage:true});await writeFile(pasta+'/site-publicado/falha.txt',await p.locator('body').innerText());console.error('FALHA',conta.especialidade,e.message);process.exitCode=1;break;}finally{await ctx.close();}
}}finally{await b.close();}
const resumo={ok:!process.exitCode&&resultados.length===26,data:new Date().toISOString(),url:base,build:health.build,empresas:resultados.length,verificacoes:resultados.reduce((n,r)=>n+r.checks.length,0),modo:'Chrome no site publicado, consultas e PDFs reais nas empresas fictícias; sem alterar OS ou pagamentos',resultados};await writeFile(pasta+'/publicado-ui.json',JSON.stringify(resumo,null,2));console.log(JSON.stringify({ok:resumo.ok,empresas:resumo.empresas,verificacoes:resumo.verificacoes}));
