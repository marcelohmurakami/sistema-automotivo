import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {build} from 'vite';import react from '@vitejs/plugin-react';import tailwindcss from '@tailwindcss/vite';import {chromium} from 'playwright';
const pasta=resolve(process.env.QA_OUTPUT||'output/lucro-assistencia-manutencao-20261110'),out=resolve(pasta,'ui-recebidas');await mkdir(pasta,{recursive:true});
if(!process.argv.includes('--reusar-build'))await build({configFile:false,envDir:false,logLevel:'error',plugins:[{name:'lucro-recebidas-rpc',enforce:'pre',resolveId(id){if(/(?:^|\/)lib\/rpc(?:\.ts)?$/.test(id))return resolve('scripts/fixtures/lucro-recebidas-rpc.js');}},react(),tailwindcss()],define:{'import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':'""'},build:{outDir:out,rollupOptions:{input:'scripts/fixtures/lucro-recebidas.html'}}});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[],errors=[];let ok=false,erro='';let page;
try{
 const ctx=await browser.newContext({locale:'pt-BR',timezoneId:'America/Sao_Paulo'});await ctx.route('**/*',async r=>{const url=new URL(r.request().url());if(url.origin!=='http://lucro.test')return r.abort();const f=resolve(out,'.'+decodeURIComponent(url.pathname));if(!f.startsWith(out+sep))return r.abort();try{await r.fulfill({status:200,contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.woff2':'font/woff2'}[extname(f)]||'application/octet-stream',body:await readFile(f)});}catch{await r.fulfill({status:404,body:''});}});
 page=await ctx.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 const ir=async(perfil='assistencia_celulares',extra='',width=390)=>{await page.setViewportSize({width,height:900});await page.goto(`http://lucro.test/scripts/fixtures/lucro-recebidas.html?perfil=${perfil}${extra}`);await page.getByRole('navigation',{name:'Detalhes do atendimento'}).waitFor();};
 const abrir=async()=>{await page.getByRole('button',{name:'Lucro e custos',exact:true}).click();await page.getByRole('region',{name:'Lucro e custos da OS'}).waitFor();};
 const valor=async(v)=>{await page.waitForFunction(v=>document.querySelector('.lucro-destaque strong')?.textContent.replace(/\s/g,'')===v,v.replace(/\s/g,''));};
 const layout=async(nome)=>{const d=await page.getByRole('dialog').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth,doc:document.documentElement.scrollWidth,width:innerWidth}));assert(d.scroll<=d.client+1,nome+JSON.stringify(d));assert(d.doc<=d.width+1,nome);assert.deepEqual(errors,[]);resultados.push(nome);};
 await ir();const perfis=await page.evaluate(()=>window.fixturePerfis);
 for(const perfil of perfis){
  await ir(perfil);await abrir();await valor('R$ 100,00');await layout(perfil+' OS recebida, lucro móvel');
  await page.getByRole('button',{name:'Ajustar custo',exact:true}).click();await page.getByLabel('Custo direto por unidade (R$)').fill('40');await page.getByRole('button',{name:'Salvar custo nesta OS'}).click();await valor('R$ 80,00');
  await page.getByRole('navigation').getByRole('button',{name:/Serviços e/}).click();await page.getByLabel('Preço unitário (R$)').fill('120');await page.getByRole('button',{name:'Desconto em reais',exact:true}).click();await page.getByLabel('Desconto (R$)',{exact:true}).fill('30');await page.getByRole('button',{name:'Salvar itens e valores',exact:true}).click();
  await page.waitForFunction(()=>window.fixtureChamadas.some(x=>x.n==='salvar_itens_atendimento_nota'));
  await abrir();await valor('R$ 110,00');assert.equal((await page.evaluate(()=>window.fixtureChamadas.filter(x=>x.n==='consultar_lucro_documento'))).length>=3,true);resultados.push(perfil+' custo, preço e desconto atualizam lucro sem reabrir');
  for(const width of [320,768,1920]){await page.setViewportSize({width,height:900});await layout(perfil+' lucro '+width);}
  if(['assistencia_celulares','manutencao_climatizacao'].includes(perfil))await page.screenshot({path:resolve(pasta,perfil+'-lucro.png')});
 }
 for(const estado of ['aprovado','em_execucao','aguardando','concluido']){await ir('assistencia_celulares','&estado='+estado);await abrir();await valor('R$ 100,00');resultados.push('visível na etapa '+estado);}
 for(const extra of ['&documento=orcamento','&estado=cancelado','&papel=staff','&sem-financeiro=1']){await ir('assistencia_celulares',extra);assert.equal(await page.getByRole('button',{name:'Lucro e custos',exact:true}).count(),0);assert(!(await page.evaluate(()=>window.fixtureChamadas)).some(x=>x.n==='consultar_lucro_documento'));resultados.push('restrição '+extra);}
 for(const tema of ['claro','escuro']){await ir('assistencia_celulares','&tema='+tema,390);await abrir();await page.getByRole('button',{name:'Conferir / adicionar outros custos',exact:true}).click();await page.getByLabel('Tempo produtivo do serviço (minutos)',{exact:false}).waitFor();await page.getByRole('button',{name:'Adicionar custo que faltou',exact:true}).click();await page.getByRole('dialog',{name:'Adicionar custo do serviço'}).waitFor();assert.deepEqual(errors,[]);resultados.push('outros custos '+tema);}
 ok=true;console.log('PASS interface',resultados.length);
}catch(e){erro=e.stack;console.error('FAIL',erro);process.exitCode=1;await page?.screenshot({path:resolve(pasta,'falha-ui.png')});await writeFile(resolve(pasta,'falha-ui.txt'),await page.locator('body').innerText());await writeFile(resolve(pasta,'falha-dados.json'),JSON.stringify(await page.evaluate(()=>({invalidos:[...document.querySelectorAll('input:invalid')].map(e=>({html:e.outerHTML,valor:e.value,mensagem:e.validationMessage})),chamadas:window.fixtureChamadas})),null,2));}
finally{await writeFile(resolve(pasta,'interface-recebidas.json'),JSON.stringify({ok,erro,errors,resultados},null,2));await browser.close();}
