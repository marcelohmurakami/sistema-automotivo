import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createServer} from 'node:http';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {chromium} from 'playwright';
const pasta=resolve(process.env.QA_OUTPUT || 'output/pagamento-os-pronta-20261105'),out=resolve(pasta,'interface-build');
await mkdir(pasta,{recursive:true});
if(!process.argv.includes('--sem-build'))await build({configFile:false,envDir:false,logLevel:'error',plugins:[react(),tailwindcss()],define:{'import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':'""'},build:{outDir:out,rollupOptions:{input:'scripts/fixtures/pagamento-os-pronta.html'}}});
const server=createServer(async(req,res)=>{try{const f=resolve(out,'.'+new URL(req.url,'http://localhost').pathname);assert(f.startsWith(out+sep));res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(f)]||'application/octet-stream');res.end(await readFile(f));}catch{res.statusCode=404;res.end();}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const resultados=[],errors=[];let ctx,p;
async function iniciar(extra=''){
 await ctx?.close();ctx=await browser.newContext({viewport:{width:1920,height:1080},locale:'pt-BR',timezoneId:'America/Sao_Paulo'});p=await ctx.newPage();p.setDefaultTimeout(45000);p.on('pageerror',e=>errors.push(e.message));
 await p.goto(`http://127.0.0.1:${server.address().port}/scripts/fixtures/pagamento-os-pronta.html?${extra}`,{waitUntil:'domcontentloaded',timeout:60000});
 await p.getByRole('dialog',{name:'Nova ordem de serviço',exact:true}).waitFor();
}
async function preencher(){
 await p.getByRole('combobox',{name:'Cliente',exact:true}).click();
 await p.getByRole('option',{name:'Informar cliente sem cadastrar',exact:true}).click();
 await p.getByLabel('Nome do cliente',{exact:true}).fill('QA Pagamento antes da impressão');
 await p.getByLabel('Carro',{exact:true}).fill('Fiat Palio');
 await p.getByLabel('Motor',{exact:true}).fill('Fire 1.0');
 await p.getByRole('button',{name:'Serviço ou peça avulsa',exact:true}).click();
 await p.getByLabel('Nome do serviço ou peça',{exact:true}).fill('QA Serviço de teste');
 await p.getByLabel('Preço unitário (R$)',{exact:true}).fill('150');
 await p.getByRole('button',{name:'Adicionar serviço',exact:true}).click();
}
async function salvar(pronto=true){
 if(pronto)await p.getByLabel('Sim · salvar como pronto e imprimir',{exact:true}).check();
 await p.getByRole('button',{name:pronto?'Salvar como pronto e imprimir':'Abrir ordem de serviço',exact:true}).click();
 if(pronto)await p.getByRole('dialog',{name:'Como ficou o pagamento da OS?',exact:true}).waitFor();
}
const financeiro=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('patio_financeiro_v1')||'{"titulos":[],"baixas":[]}'));
async function semImpressao(){assert.equal(await p.evaluate(()=>window.qaJanelas),0);assert.equal(await p.evaluate(()=>window.qaImpressoes.length),0)}
async function imprimir(botao,nome){await p.getByRole('button',{name:botao,exact:true}).click();await p.waitForFunction(()=>window.qaImpressoes.length===1);assert.equal(await p.evaluate(()=>window.qaJanelas),1);const nota=await p.evaluate(()=>window.qaImpressoes[0]);await writeFile(resolve(pasta,nome+'.html'),nota.html);assert(nota.texto.includes('QA Pagamento antes da impressão'));if(nome.startsWith('desconto-'))assert(nota.texto.includes('131,25'),'A nota precisa refletir o novo total após o desconto');}
try{
 await iniciar();await preencher();await salvar();await semImpressao();
 await p.screenshot({path:resolve(pasta,'pagamento-desktop.png')});
 await imprimir('Agora não, só imprimir','adiado');assert.equal((await financeiro()).baixas.length,0);
 resultados.push({cenario:'Criar pronta pergunta antes da impressão; adiar não registra pagamento',ok:true});
 for(const modo of ['total','parcial','prazo']){
  await iniciar();await preencher();await salvar();await semImpressao();
  await p.getByRole('button',{name:modo==='total'?'Já recebi':modo==='parcial'?'Recebi uma parte':'A receber',exact:false}).click();
  await p.setViewportSize({width:390,height:844});
  assert(await p.evaluate(()=>[...document.querySelectorAll('dialog[open]')].every(d=>d.scrollWidth<=d.clientWidth+2)));
  await p.screenshot({path:resolve(pasta,`formulario-${modo}-390.png`)});
  if(modo==='prazo'){
   await p.getByLabel('Receber em',{exact:true}).fill('2026-12-15');
   await p.getByRole('button',{name:'Salvar data combinada',exact:true}).click();
  }else{
   await p.getByLabel('Valor pago (R$)',{exact:true}).fill(modo==='parcial'?'50':'150');
   if(modo==='parcial')await p.getByLabel('Vencimento do restante',{exact:true}).fill('2026-12-15');
   await p.getByRole('button',{name:'Confirmar pagamento',exact:true}).click();
  }
  await p.getByRole('button',{name:'Concluir e imprimir',exact:true}).waitFor();await semImpressao();
  await imprimir('Concluir e imprimir',modo);
  const f=await financeiro();assert.equal(f.baixas.reduce((s,b)=>s+b.valor_centavos,0),modo==='total'?15000:modo==='parcial'?5000:0);
  if(modo!=='total')assert.equal(f.titulos.at(-1).vencimento,'2026-12-15');
  assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('patio_os_v1')).at(-1).situacao),'ready');
  resultados.push({cenario:modo+' registra somente valor informado, preserva pronta e imprime',ok:true});
 }
 for(const tema of ['claro','escuro'])for(const largura of [320,390,768,1920]){
  await iniciar('tema='+tema);await p.setViewportSize({width:largura,height:900});await preencher();await salvar();
  await p.evaluate(()=>document.fonts.ready);
  assert(await p.evaluate(()=>[...document.querySelectorAll('dialog[open]')].every(d=>d.scrollWidth<=d.clientWidth+2)));
  assert.equal(await p.getByRole('dialog',{name:'Avisar o cliente que está pronto?',exact:true}).count(),0);
  await p.screenshot({path:resolve(pasta,`pagamento-${tema}-${largura}.png`)});
  resultados.push({cenario:`Layout ${tema} ${largura}px e WhatsApp aguarda`,ok:true});
 }
 await iniciar();await preencher();await salvar();await p.getByRole('button',{name:'Já recebi',exact:false}).click();
 await p.getByRole('dialog',{name:'Registrar recebimento',exact:true}).getByRole('button',{name:'Fechar janela',exact:true}).click();
 await p.getByRole('dialog',{name:'Como ficou o pagamento da OS?',exact:true}).waitFor();await semImpressao();
 await p.getByRole('dialog',{name:'Como ficou o pagamento da OS?',exact:true}).getByRole('button',{name:'Fechar janela',exact:true}).click();
 await p.waitForFunction(()=>window.qaImpressoes.length===1);assert.equal((await financeiro()).baixas.length,0);
 resultados.push({cenario:'Cancelar pagamento volta à pergunta; fechar pergunta imprime sem cobrança',ok:true});
 await iniciar('bloqueado');await preencher();await salvar();await p.getByRole('button',{name:'Agora não, só imprimir',exact:true}).click();
 await p.getByRole('dialog',{name:'Avisar o cliente que está pronto?',exact:true}).getByRole('button',{name:'Fechar',exact:true}).click();
 await p.getByText('OS salva como pronta. Não foi possível abrir a impressão; use Imprimir nota da OS ou Visualizar / PDF.',{exact:true}).waitFor();
 assert.equal(await p.evaluate(()=>window.qaImpressoes.length),0);assert.equal((await financeiro()).baixas.length,0);
 resultados.push({cenario:'Popup bloqueado mantém OS salva e orienta a reimprimir',ok:true});
 await iniciar();await preencher();await p.evaluate(()=>window.qaFalhaSalvar=true);await p.getByLabel('Sim · salvar como pronto e imprimir',{exact:true}).check();await p.getByRole('button',{name:'Salvar como pronto e imprimir',exact:true}).click();
 await p.getByRole('dialog',{name:'Nova ordem de serviço',exact:true}).getByRole('alert').waitFor();await semImpressao();assert.equal(await p.getByRole('dialog',{name:'Como ficou o pagamento da OS?',exact:true}).count(),0);
 await p.evaluate(()=>window.qaFalhaSalvar=false);await p.getByRole('button',{name:'Salvar como pronto e imprimir',exact:true}).click();await p.getByRole('dialog',{name:'Como ficou o pagamento da OS?',exact:true}).waitFor();
 resultados.push({cenario:'Falha ao salvar não imprime; nova tentativa abre pagamento',ok:true});
 await p.getByRole('button',{name:'Já recebi',exact:false}).click();await p.evaluate(()=>window.qaFalhaPagamento=true);await p.getByRole('button',{name:'Confirmar pagamento',exact:true}).click();
 await p.getByRole('dialog',{name:'Registrar recebimento',exact:true}).getByRole('alert').waitFor();await semImpressao();assert.equal((await financeiro()).baixas.length,0);
 await p.evaluate(()=>window.qaFalhaPagamento=false);await p.getByRole('button',{name:'Confirmar pagamento',exact:true}).click();await p.getByRole('button',{name:'Concluir e imprimir',exact:true}).waitFor();assert.equal((await financeiro()).baixas.length,1);
 resultados.push({cenario:'Falha no pagamento permanece no formulário e retenta sem duplicação',ok:true});
 for(const restricao of ['semFinanceiro','staff']){
  await iniciar(restricao);await preencher();await p.getByLabel('Sim · salvar como pronto e imprimir',{exact:true}).check();await p.getByRole('button',{name:'Salvar como pronto e imprimir',exact:true}).click();await p.waitForFunction(()=>window.qaImpressoes.length===1);
  assert.equal(await p.getByRole('dialog',{name:'Como ficou o pagamento da OS?',exact:true}).count(),0);assert.equal((await financeiro()).baixas.length,0);
  resultados.push({cenario:'Sem acesso financeiro mantém impressão direta: '+restricao,ok:true});
 }
 await iniciar();await preencher();await salvar(false);await p.getByRole('dialog',{name:'Ordem de serviço #1',exact:true}).waitFor();await semImpressao();assert.equal(await p.getByRole('dialog',{name:'Como ficou o pagamento da OS?',exact:true}).count(),0);assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('patio_os_v1'))[0].situacao),'open');
 resultados.push({cenario:'OS ainda em atendimento não pergunta pagamento nem abre impressão automaticamente',ok:true});
 for(const mostrar of [false,true]){
  await iniciar();await preencher();
  const nota=p.getByRole('group',{name:'Mostrar o desconto na nota final para o cliente?',exact:true});
  assert.equal(await nota.getByRole('button',{name:'Não',exact:true}).getAttribute('aria-pressed'),'true');
  await p.getByLabel('Desconto (%)',{exact:true}).fill('10');
  if(mostrar)await nota.getByRole('button',{name:'Sim',exact:true}).click();
  await salvar();await p.getByRole('button',{name:'Já recebi',exact:false}).click();
  assert.equal(await p.getByLabel('Valor pago (R$)',{exact:true}).inputValue(),'135.00');
  await p.getByRole('button',{name:'Confirmar pagamento',exact:true}).click();
  await imprimir('Concluir e imprimir','preferencia-'+mostrar);
  const texto=await p.evaluate(()=>window.qaImpressoes[0].texto);
  assert.equal(texto.includes('Desconto'),mostrar); assert.equal(texto.includes('135,00'),mostrar);
  assert(texto.includes('150,00'));
  const o=await p.evaluate(()=>JSON.parse(localStorage.getItem('patio_os_v1')).at(-1));
  assert.equal(o.total_centavos,13500);assert.equal(o.mostrar_desconto_nota,mostrar);
  assert.equal((await financeiro()).baixas.at(-1).valor_centavos,13500);
  resultados.push({cenario:'Criar, pagar e imprimir com desconto na nota = '+mostrar,ok:true});
 }
 for(const mostrar of [false,true]){
  await iniciar();await preencher();await salvar();await p.getByRole('button',{name:'Já recebi',exact:false}).click();
  await p.getByLabel('Desconto (%)',{exact:true}).fill('10');
  const nota=p.getByRole('group',{name:'Mostrar o desconto na nota final para o cliente?',exact:true});
  assert.equal(await nota.getByRole('button',{name:'Não',exact:true}).getAttribute('aria-pressed'),'true');
  if(mostrar)await nota.getByRole('button',{name:'Sim',exact:true}).click();
  await p.getByRole('button',{name:'Confirmar pagamento',exact:true}).click();
  await imprimir('Concluir e imprimir','preferencia-pagamento-'+mostrar);
  const texto=await p.evaluate(()=>window.qaImpressoes[0].texto);
  assert.equal(texto.includes('Desconto'),mostrar);assert.equal(texto.includes('135,00'),mostrar);
  assert.equal((await financeiro()).baixas.at(-1).valor_centavos,13500);
  resultados.push({cenario:'Desconto no pagamento imprime conforme escolha = '+mostrar,ok:true});
 }
 for(const modo of ['percentual','valor','parcial','falha']){
  await iniciar();await preencher();await salvar();
  await p.getByRole('button',{name:modo==='parcial'?'Recebi uma parte':'Já recebi',exact:false}).click();
  if(modo==='valor'){
   await p.getByRole('button',{name:'Desconto em reais',exact:true}).click();await p.getByLabel('Desconto (R$)',{exact:true}).fill('18.75');
  }else await p.getByLabel('Desconto (%)',{exact:true}).fill('12.5');
  await p.getByRole('group',{name:'Mostrar o desconto na nota final para o cliente?',exact:true}).getByRole('button',{name:'Sim',exact:true}).click();
  assert((await p.locator('.recebimento-desconto-total').innerText()).includes('131,25'));
  if(modo==='parcial'){
   assert.equal(await p.getByLabel('Valor pago (R$)',{exact:true}).inputValue(),'');
   await p.getByLabel('Valor pago (R$)',{exact:true}).fill('50');await p.getByLabel('Vencimento do restante',{exact:true}).fill('2026-12-15');
  }else assert.equal(await p.getByLabel('Valor pago (R$)',{exact:true}).inputValue(),'131.25');
  if(modo==='percentual'){
   await p.getByRole('button',{name:'Desconto em reais',exact:true}).click();assert.equal(await p.getByLabel('Desconto (R$)',{exact:true}).inputValue(),'18.75');
   await p.getByRole('button',{name:'Desconto em porcentagem',exact:true}).click();assert.equal(await p.getByLabel('Valor pago (R$)',{exact:true}).inputValue(),'131.25');
   for(const tema of ['claro','escuro'])for(const width of [320,390,768,1920]){
    await p.setViewportSize({width,height:900});await p.evaluate(t=>document.documentElement.dataset.tema=t,tema);
    assert(await p.evaluate(()=>[...document.querySelectorAll('dialog[open]')].every(d=>d.scrollWidth<=d.clientWidth+2)));
    await p.screenshot({path:resolve(pasta,`desconto-${tema}-${width}.png`)});
    resultados.push({cenario:`Desconto e saldo sem transbordamento: ${tema} ${width}px`,ok:true});
   }
  }
  if(modo==='falha')await p.evaluate(()=>window.qaFalhaPagamento=true);
  await p.getByRole('button',{name:'Confirmar pagamento',exact:true}).click();
  if(modo==='falha'){
   await p.getByRole('dialog',{name:'Registrar recebimento',exact:true}).getByRole('alert').waitFor();
   assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('patio_os_v1')).at(-1).total_centavos),15000);
   assert.equal((await financeiro()).baixas.length,0);await p.evaluate(()=>window.qaFalhaPagamento=false);
   await p.getByRole('button',{name:'Confirmar pagamento',exact:true}).click();
  }
  await p.getByRole('button',{name:'Concluir e imprimir',exact:true}).waitFor();
  const f=await financeiro();assert.equal(f.titulos.at(-1).valor_centavos,13125);assert.equal(f.baixas.length,1);assert.equal(f.baixas[0].desconto_centavos,1875);
  assert.equal(f.baixas[0].valor_centavos,modo==='parcial'?5000:13125);
  assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('patio_os_v1')).at(-1).total_centavos),13125);
  await imprimir('Concluir e imprimir','desconto-'+modo);
  resultados.push({cenario:`Desconto ${modo}: preço da OS, recebimento real e impressão`,ok:true});
 }
 await iniciar();await preencher();await salvar();await p.getByRole('button',{name:'Já recebi',exact:false}).click();
 await p.getByLabel('Desconto (%)',{exact:true}).fill('101');assert.equal(await p.getByLabel('Desconto (%)',{exact:true}).evaluate(e=>e.validity.valid),false);
 await p.getByLabel('Desconto (%)',{exact:true}).fill('100');assert.equal(await p.getByLabel('Valor pago (R$)',{exact:true}).evaluate(e=>e.validity.valid),false);
 await p.getByLabel('Desconto (%)',{exact:true}).fill('10');
 await p.getByRole('combobox',{name:'Forma',exact:true}).selectOption('credito');await p.getByLabel('Taxa da maquininha (R$)',{exact:true}).fill('2');
 await p.getByRole('combobox',{name:'Forma',exact:true}).selectOption('pix');assert.equal(await p.getByLabel('Taxa da maquininha (R$)',{exact:true}).count(),0);
 await p.getByRole('dialog',{name:'Registrar recebimento',exact:true}).getByRole('button',{name:'Fechar janela',exact:true}).click();
 await p.getByRole('button',{name:'Já recebi',exact:false}).click();assert.equal(await p.getByLabel('Desconto (%)',{exact:true}).inputValue(),'0');
 assert.equal(await p.getByLabel('Valor pago (R$)',{exact:true}).inputValue(),'150.00');
 assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('patio_os_v1')).at(-1).total_centavos),15000);
 resultados.push({cenario:'Desconto inválido bloqueado; taxa só no cartão; cancelar não altera OS e reabrir zera desconto',ok:true});
 assert.deepEqual(errors,[]);
}catch(e){process.exitCode=1;console.error(e);if(p){await p.screenshot({path:resolve(pasta,'falha.png'),fullPage:true});await writeFile(resolve(pasta,'falha.txt'),await p.locator('body').innerText());}}
finally{await browser.close();await new Promise(ok=>server.close(ok));await writeFile(resolve(pasta,'interface.json'),JSON.stringify({ok:!process.exitCode,resultados,errors,ambiente:'Chrome real; aplicação e pagamentos em modo demonstração isolado'},null,2));console.log(JSON.stringify({ok:!process.exitCode,cenarios:resultados.length}));}
