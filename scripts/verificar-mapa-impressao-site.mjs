import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const nativo=process.argv.includes('--nativo');
const base='https://patio-gestao-peach.vercel.app',pasta='output/mapa-impressao-20261105/site-publicado'+(nativo?'-nativo':'');
await mkdir(pasta,{recursive:true});
const manifesto=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8'));
const conta=manifesto.contas.find(c=>c.especialidade==='retifica');
assert(conta.empresa.startsWith('ZZ [TESTE 20261019] '));
const banco='https://hzihxtjirttetnfdujcx.supabase.co';
const pacote=JSON.parse(await readFile('output/mapa-impressao-20261105/pacote-publicacao.json','utf8'));
const health=await fetch(base+'/health.json?qa='+Date.now(),{cache:'no-store'}).then(r=>r.json());assert.equal(health.build,pacote.build);
const browser=await chromium.launch({headless:!nativo,ignoreDefaultArgs:nativo?["--disable-print-preview"]:[],executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const ctx=await browser.newContext({viewport:{width:1920,height:1080},locale:'pt-BR',timezoneId:'America/Sao_Paulo'});
await ctx.addInitScript(()=>{window.qaImpressaoIniciada=0;window.qaJanelas=0;window.qaImpressoes=[];const abrir=window.open.bind(window);window.open=(...args)=>{window.qaJanelas++;const j=abrir(...args);if(j){const print=j.print.bind(j);j.print=()=>{window.qaImpressaoIniciada++;return print()}}return j};const criar=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{if(b.type==='application/pdf')window.qaImpressoes.push(b);return criar(b)}});
const p=await ctx.newPage(),resultados=[],erros=[];p.setDefaultTimeout(45000);p.on('pageerror',e=>erros.push(e.message));let cabecalhos;
p.on('request',r=>{if(r.url().startsWith(banco+'/rest/v1/')){const h=r.headers();if(h.authorization)cabecalhos={authorization:h.authorization,apikey:h.apikey,'content-type':'application/json'}}});
async function rpc(nome,args){assert(cabecalhos?.authorization);assert.equal(args.p_oficina,conta.empresa_id);const r=await p.request.post(banco+'/rest/v1/rpc/'+nome,{headers:cabecalhos,data:args});assert.equal(r.status(),200,nome);return r.json()}
try{
 await p.goto(base+'/ordens-servico');await p.getByLabel('E-mail',{exact:true}).fill(conta.email);await p.getByLabel('Senha',{exact:true}).fill(conta.senha);await p.getByRole('button',{name:'Entrar no sistema',exact:true}).click();await p.getByRole('button',{name:'Nova OS',exact:true}).waitFor();
 for(const modo of (nativo?['total']:['adiar','total','parcial','prazo'])){
  await p.goto(base+'/ordens-servico?nova=1');await p.getByRole('dialog',{name:'Nova ordem de serviço',exact:true}).waitFor();
  await p.getByRole('combobox',{name:'Cliente',exact:true}).click();await p.getByRole('option',{name:'Informar cliente sem cadastrar',exact:true}).click();
  const cliente='QA 05-11 Impressão nativa '+modo+(nativo?' Chrome':'');
  await p.getByLabel('Nome do cliente',{exact:true}).fill(cliente);await p.getByLabel('Carro',{exact:true}).fill('Fiat Palio QA');await p.getByLabel('Motor',{exact:true}).fill('Fire 1.0 QA');
  await p.getByRole('button',{name:'Serviço ou peça avulsa',exact:true}).click();await p.getByLabel('Nome do serviço ou peça',{exact:true}).fill('QA Teste isolado de pagamento antes da impressão');await p.getByLabel('Preço unitário (R$)',{exact:true}).fill('150');await p.getByRole('button',{name:'Adicionar serviço',exact:true}).click();
  await p.getByLabel('Sim · salvar como pronto e imprimir',{exact:true}).check();
  const salvo=p.waitForResponse(r=>r.url().endsWith('/rpc/criar_os_pronta')&&r.request().postDataJSON()?.p_oficina===conta.empresa_id);
  await p.getByRole('button',{name:'Salvar como pronto e imprimir',exact:true}).click();const resposta=await salvo;assert.equal(resposta.status(),200);const os=await resposta.json();assert.equal(os.dados_cliente.nome,cliente);assert.equal(os.situacao,'ready');assert.equal(os.total_centavos,15000);
  await p.getByRole('dialog',{name:'Como ficou o pagamento da OS?',exact:true}).waitFor();assert.equal(await p.evaluate(()=>window.qaJanelas),0);await p.getByRole('button',{name:'Já recebi',exact:false}).waitFor();
  await p.screenshot({path:pasta+'/'+modo+'-pergunta.png'});
  if(modo!=='adiar'){
   await p.getByRole('button',{name:modo==='total'?'Já recebi':modo==='parcial'?'Recebi uma parte':'A receber',exact:false}).click();
   if(modo==='prazo'){await p.getByLabel('Receber em',{exact:true}).fill('2026-12-15');await p.getByRole('button',{name:'Salvar data combinada',exact:true}).click();}
   else{await p.getByLabel('Valor pago (R$)',{exact:true}).fill(modo==='total'?'150':'50');if(modo==='parcial')await p.getByLabel('Vencimento do restante',{exact:true}).fill('2026-12-15');await p.getByRole('button',{name:'Confirmar pagamento',exact:true}).click();}
   await p.getByRole('button',{name:'Concluir e imprimir',exact:true}).waitFor();assert.equal(await p.evaluate(()=>window.qaJanelas),0);
  }
  await p.getByRole('button',{name:modo==='adiar'?'Agora não, só imprimir':'Concluir e imprimir',exact:true}).click();await p.waitForFunction(()=>window.qaImpressaoIniciada===1);assert.equal(await p.evaluate(()=>window.qaJanelas),1);
  const popup=ctx.pages().find(x=>x!==p);await popup.locator('.folha-os').waitFor();
  if(nativo){console.log('AGUARDANDO_CONFERENCIA_JANELA_NATIVA');await new Promise(resolve=>{const timer=setInterval(async()=>{try{await readFile(pasta+'/preview-confirmado.txt');clearInterval(timer);resolve()}catch{}},1000)});}else{await popup.pdf({path:pasta+'/'+modo+'.pdf',preferCSSPageSize:true,printBackground:true});}
  const titulo=await rpc('consultar_financeiro_os',{p_oficina:conta.empresa_id,p_os:os.id});assert.equal(titulo?.baixado_centavos||0,modo==='total'?15000:modo==='parcial'?5000:0);
  if(['parcial','prazo'].includes(modo))assert.equal(titulo.vencimento,'2026-12-15');
  const atual=await rpc('consultar_ordem_servico',{p_oficina:conta.empresa_id,p_os:os.id});assert.equal(atual.situacao,'ready');assert.equal(atual.total_centavos,15000);
  resultados.push({modo,ok:true,os:os.id,numero:os.numero,total:15000,pago:titulo?.baixado_centavos||0,vencimento:titulo?.vencimento,empresa:conta.empresa});await writeFile(pasta+'/resultados.json',JSON.stringify(resultados,null,2));console.log('PASS site',modo,'OS',os.numero);
  for(const aba of ctx.pages())if(aba!==p)await aba.close();
 }
 if(!nativo){
 await p.goto(base+'/');await p.getByRole('button',{name:'Visualizar em quadro',exact:true}).click();await p.locator('.quadro').waitFor();
 for(const [width,height] of [[1920,1080],[1366,768],[390,844],[320,568]]){
 await p.setViewportSize({width,height});await p.evaluate(()=>document.fonts.ready);
 const dimensoes=await p.evaluate(()=>{const q=document.querySelector('.quadro');return{pagina:document.documentElement.scrollWidth,largura:innerWidth,quadro:q.clientWidth,conteudo:q.scrollWidth}});
 assert(dimensoes.pagina<=width+1&&dimensoes.conteudo<=dimensoes.quadro+1,JSON.stringify(dimensoes));
 assert.equal(await p.locator('.cabecalho .acesso-rapido-header').count(),0);assert.equal(await p.locator('.assistente-atalho').count(),0);
 await p.screenshot({path:pasta+'/mapa-'+width+'.png',fullPage:true});
 if(width<=390){const fab=await p.locator('.assistente-flutuante').boundingBox(),nav=await p.locator('.navegacao-inferior').boundingBox();assert(fab.y+fab.height<=nav.y);await p.getByRole('button',{name:'Abrir assistente por voz ou texto',exact:true}).click();const d=p.getByRole('dialog',{name:'Assistente',exact:true});assert(await d.evaluate(e=>e.scrollWidth<=e.clientWidth+1));await p.screenshot({path:pasta+'/assistente-'+width+'.png'});await d.getByRole('button',{name:'Fechar janela',exact:true}).click();}
 resultados.push({cenario:'Mapa publicado '+width+'x'+height,ok:true,...dimensoes});
 }
 }
 assert.deepEqual(erros,[]);
}catch(e){process.exitCode=1;console.error(e.message);await p.screenshot({path:pasta+'/falha.png',fullPage:true});await writeFile(pasta+'/falha.txt',await p.locator('body').innerText());}
finally{await browser.close();await writeFile(pasta+'/resumo.json',JSON.stringify({ok:!process.exitCode,data:new Date().toISOString(),url:base,build:health.build,resultados,erros},null,2));}
