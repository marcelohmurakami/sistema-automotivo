import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build,preview} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {chromium} from 'playwright';
const out=resolve('output/financeiro-velocidade-20261117/formulario-isolado');await mkdir(out,{recursive:true});
const dist=resolve(out,'build');
await build({configFile:false,envDir:false,logLevel:'error',plugins:[react(),tailwindcss()],define:{'import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':'""'},build:{outDir:dist,rollupOptions:{input:'scripts/fixtures/financeiro-agil.html'}}});
const server=await preview({configFile:false,build:{outDir:dist},preview:{host:'127.0.0.1',port:0}}),base='http://127.0.0.1:'+server.httpServer.address().port;
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[],erros=[];
try{
 for(const width of [1920,390]){
  const p=await browser.newPage({viewport:{width,height:844}});p.on('pageerror',e=>erros.push(e.message));await p.goto(base+'/scripts/fixtures/financeiro-agil.html');await p.locator('[name=valor]').waitFor();
  const ok=(nome,valor)=>{assert(valor,nome);resultados.push({width,nome,ok:true})};
  ok('Forma combinada e caixa já selecionados',await p.locator('[name=forma]').inputValue()==='dinheiro'&&await p.locator('[name=conta]').inputValue()==='caixa');
  await p.evaluate(()=>window.qaContas({especial:'Conta exclusiva'}));await p.waitForFunction(()=>document.querySelector('[name=conta]').value==='especial');await p.locator('[name=forma]').selectOption('pix');ok('Conta exclusiva preservada na troca de forma',await p.locator('[name=conta]').inputValue()==='especial');
  await p.evaluate(()=>window.qaContas({}));await p.getByText('Ative ou cadastre uma conta',{exact:false}).waitFor();ok('Sem conta ativa não confirma',await p.getByRole('button',{name:'Confirmar registro'}).isDisabled());
  await p.evaluate(()=>window.qaContas({caixa:'Dinheiro',banco:'Banco'}));await p.waitForFunction(()=>document.querySelector('[name=conta]').value==='caixa');ok('Carregamento posterior seleciona conta válida',await p.locator('[name=conta]').inputValue()==='caixa');
  await p.locator('[name=forma]').selectOption('credito');await p.locator('[name=taxa]').fill('2');await p.locator('[name=forma]').selectOption('pix');ok('Taxa de cartão não permanece no Pix',await p.locator('[name=taxa]').inputValue()==='0');
  for(const valor of ['0','100.01','-1']){await p.locator('[name=valor]').fill(valor);ok('Bloqueia valor '+valor,await p.getByRole('button',{name:'Confirmar registro'}).isDisabled())}
  await p.locator('[name=valor]').fill('40');await p.locator('[name=forma]').selectOption('credito');await p.locator('[name=taxa]').fill('40');ok('Bloqueia taxa que consome todo recebimento',await p.getByRole('button',{name:'Confirmar registro'}).isDisabled());
  await p.locator('[name=taxa]').fill('2');ok('Mostra líquido e restante',/38,00/.test(await p.locator('.fin-baixa-previa').innerText())&&/60,00/.test(await p.locator('.fin-baixa-previa').innerText()));
  await p.getByRole('button',{name:'Confirmar registro'}).click();const enviado=await p.evaluate(()=>window.qaEnviados.at(-1));ok('FormData envia valor, taxa, forma e conta corretos',enviado.valor==='40'&&enviado.taxa==='2'&&enviado.forma==='credito'&&enviado.conta==='banco');
  await p.evaluate(()=>window.qaTitulo({natureza:'pagar',forma_prevista:'dinheiro'}));await p.waitForFunction(()=>document.querySelector('[name=forma]').value==='dinheiro');ok('Despesa sem taxa de recebimento',await p.locator('[name=taxa]').count()===0);
  ok('Sem rolagem horizontal',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.close();
 }
 assert.deepEqual(erros,[]);console.log('PASS',resultados.length);
}catch(e){erros.push(e.stack);process.exitCode=1;console.error(e.stack)}finally{await browser.close();await new Promise(r=>server.httpServer.close(r));await writeFile(resolve(out,'resultados.json'),JSON.stringify({resultados,erros},null,2))}
