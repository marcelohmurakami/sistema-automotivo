import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const raiz='output/desconto-pagamento-20261105',pasta=raiz+'/site-publicado',base='https://patio-gestao-peach.vercel.app';await mkdir(pasta,{recursive:true});
const pacote=JSON.parse(await readFile(raiz+'/pacote-publicacao.json','utf8'));
assert.equal((await fetch(base+'/health.json?qa='+Date.now()).then(r=>r.json())).build,pacote.build);
const conta=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.find(c=>c.especialidade==='retifica');assert(conta.empresa.startsWith('ZZ [TESTE 20261019] '));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),ctx=await browser.newContext({viewport:{width:1920,height:1080},locale:'pt-BR',timezoneId:'America/Sao_Paulo'});
await ctx.addInitScript(()=>{window.qaPrint=0;window.qaNotas=[];const open=window.open.bind(window);window.open=(...args)=>{const w=open(...args);if(w)w.print=()=>{window.qaPrint++;window.qaNotas.push(w.document.body.innerText)};return w}});
const p=await ctx.newPage(),resultados=[],erros=[];p.setDefaultTimeout(30000);p.on('pageerror',e=>erros.push(e.message));
let headers;const banco='https://hzihxtjirttetnfdujcx.supabase.co';
p.on('request',r=>{if(r.url().startsWith(banco+'/rest/v1/')){const h=r.headers();if(h.authorization)headers={authorization:h.authorization,apikey:h.apikey,'content-type':'application/json'}}});
async function rpc(nome,args){assert.equal(args.p_oficina,conta.empresa_id);const r=await p.request.post(banco+'/rest/v1/rpc/'+nome,{headers,data:args});assert.equal(r.status(),200,nome);return r.json()}
try{
 await p.goto(base+'/ordens-servico');await p.getByLabel('E-mail',{exact:true}).fill(conta.email);await p.getByLabel('Senha',{exact:true}).fill(conta.senha);await p.getByRole('button',{name:'Entrar no sistema',exact:true}).click();await p.getByRole('button',{name:'Nova OS',exact:true}).waitFor();
 for(const modo of ['percentual','parcial']){
  await p.goto(base+'/ordens-servico?nova=1');
  await p.getByRole('combobox',{name:'Cliente',exact:true}).click();await p.getByRole('option',{name:'Informar cliente sem cadastrar',exact:true}).click();
  await p.getByLabel('Nome do cliente',{exact:true}).fill('QA Desconto no pagamento '+modo+' '+Date.now());await p.getByLabel('Carro',{exact:true}).fill('Fiat Palio QA');await p.getByLabel('Motor',{exact:true}).fill('Fire');
  await p.getByRole('button',{name:'Serviço ou peça avulsa',exact:true}).click();await p.getByLabel('Nome do serviço ou peça',{exact:true}).fill('QA Desconto no recebimento');await p.getByLabel('Preço unitário (R$)',{exact:true}).fill('150');await p.getByRole('button',{name:'Adicionar serviço',exact:true}).click();
  await p.getByLabel('Sim · salvar como pronto e imprimir',{exact:true}).check();
  const salvar=p.waitForResponse(r=>r.url().endsWith('/rpc/criar_os_pronta')&&r.request().postDataJSON()?.p_oficina===conta.empresa_id);
  await p.getByRole('button',{name:'Salvar como pronto e imprimir',exact:true}).click();const resp=await salvar;assert.equal(resp.status(),200);const os=await resp.json();
  await p.getByRole('button',{name:modo==='parcial'?'Recebi uma parte':'Já recebi',exact:false}).click();
  if(modo==='parcial'){
   await p.getByRole('button',{name:'Desconto em reais',exact:true}).click();await p.getByLabel('Desconto (R$)',{exact:true}).fill('15');await p.getByLabel('Valor pago (R$)',{exact:true}).fill('50');await p.getByLabel('Vencimento do restante',{exact:true}).fill('2026-12-15');
  }else{await p.getByLabel('Desconto (%)',{exact:true}).fill('12.5');assert.equal(await p.getByLabel('Valor pago (R$)',{exact:true}).inputValue(),'131.25')}
  for(const width of [1920,390,320]){await p.setViewportSize({width,height:width===1920?1080:844});const d=p.getByRole('dialog',{name:'Registrar recebimento',exact:true});assert(await d.evaluate(e=>e.scrollWidth<=e.clientWidth+1));await p.screenshot({path:pasta+'/'+modo+'-'+width+'.png'});}
  assert.equal(await p.evaluate(()=>window.qaPrint),0);
  await p.getByRole('button',{name:'Confirmar pagamento',exact:true}).click();await p.getByRole('button',{name:'Concluir e imprimir',exact:true}).waitFor();
  await p.getByRole('button',{name:'Concluir e imprimir',exact:true}).click();await p.waitForFunction(()=>window.qaPrint===1);
  const nota=await p.evaluate(()=>window.qaNotas[0]);assert(nota.includes(modo==='parcial'?'135,00':'131,25'));
  const t=await rpc('consultar_financeiro_os',{p_oficina:conta.empresa_id,p_os:os.id});const atual=await rpc('consultar_ordem_servico',{p_oficina:conta.empresa_id,p_os:os.id});const h=await rpc('historico_financeiro',{p_oficina:conta.empresa_id,p_titulo:t.id});
  assert.equal(t.valor_centavos,modo==='parcial'?13500:13125);assert.equal(atual.total_centavos,t.valor_centavos);assert.equal(atual.situacao,'ready');assert.equal(t.baixado_centavos,modo==='parcial'?5000:13125);assert.equal(t.aberto_centavos,modo==='parcial'?8500:0);assert.equal(h.length,1);assert.equal(h[0].desconto_centavos,modo==='parcial'?1500:1875);assert.equal(h[0].taxa_centavos,0);
  resultados.push({modo,os:os.id,numero:os.numero,desconto:atual.desconto_centavos,total:atual.total_centavos,pago:t.baixado_centavos,saldo:t.aberto_centavos,impressao:true,larguras:[1920,390,320]});console.log('PASS desconto publicado',modo,os.numero);
  for(const tab of ctx.pages())if(tab!==p)await tab.close();await p.setViewportSize({width:1920,height:1080});
 }
 assert.deepEqual(erros,[]);
}catch(e){process.exitCode=1;console.error(e.message);await p.screenshot({path:pasta+'/falha.png'});await writeFile(pasta+'/falha.txt',await p.locator('body').innerText());}
finally{await browser.close();await writeFile(pasta+'/resumo.json',JSON.stringify({ok:!process.exitCode,build:pacote.build,resultados,erros},null,2));}
