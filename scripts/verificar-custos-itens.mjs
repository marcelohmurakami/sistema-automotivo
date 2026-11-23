import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {build} from './lib/vite-conferencia.mjs';import react from '@vitejs/plugin-react';import tailwindcss from '@tailwindcss/vite';import {chromium} from './lib/chrome-conferencia.mjs';
const pasta=resolve(process.env.QA_OUTPUT || 'output/custos-itens-20261103'),out=resolve(pasta,'ui-build');await mkdir(pasta,{recursive:true});
if(!process.argv.includes('--reusar-build'))await build({configFile:false,envDir:false,logLevel:'error',plugins:[{name:'custos-rpc-qa',enforce:'pre',resolveId(id){if(/(?:^|\/)lib\/rpc(?:\.ts)?$/.test(id))return resolve('scripts/fixtures/custos-itens-rpc.js');}},react(),tailwindcss()],define:{'import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':'""'},build:{outDir:out,rollupOptions:{input:'scripts/fixtures/custos-itens.html'}}});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_BROWSER?{executablePath:process.env.PLAYWRIGHT_BROWSER}:{})});
const resultados=[];let sucesso=false,erro='';
try{
 const ctx=await browser.newContext({locale:'pt-BR',timezoneId:'America/Sao_Paulo'});await ctx.route('**/*',async r=>{const url=new URL(r.request().url());if(url.origin!=='http://custos.test')return r.abort();const f=resolve(out,'.'+decodeURIComponent(url.pathname));if(!f.startsWith(out+sep))return r.abort();try{await r.fulfill({status:200,contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.woff2':'font/woff2'}[extname(f)]||'application/octet-stream',body:await readFile(f)});}catch{await r.fulfill({status:404,body:''});}});
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const ir=async(tela,perfil='mecanica',width=1440,tema='escuro',papel='owner',conferencia='dados-nulos')=>{await page.setViewportSize({width,height:1080});await page.goto(`http://custos.test/scripts/fixtures/custos-itens.html?tela=${tela}&perfil=${perfil}&tema=${tema}&papel=${papel}&conferencia=${conferencia}`);await page.locator('.estrutura-sistema').waitFor();};
 const layout=async(nome)=>{const d=await page.evaluate(()=>{const root=document.querySelector('dialog[open]')||document.documentElement,b=root.getBoundingClientRect();return {largura:innerWidth,documento:document.documentElement.scrollWidth,fora:[...root.querySelectorAll('*')].filter(e=>e.checkVisibility({checkVisibilityCSS:true})).filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.left<b.left-2||r.right>b.right+2);}).map(e=>e.tagName+'.'+e.className)};});assert(d.documento<=d.largura+1,nome+' overflow');assert.deepEqual(d.fora,[],nome);assert.deepEqual(errors,[]);resultados.push(nome);};
 await ir('os');await page.getByText('Lucro estimado',{exact:true}).waitFor();const perfis=await page.evaluate(()=>window.fixturePerfis);
 for(const conferencia of ['nula','dados-nulos','vazia','conferida']){
  await ir('os','mecanica',390,'escuro','owner',conferencia);
  await page.getByRole('region',{name:'Lucro e custos da OS'}).waitFor();
  assert.equal(await page.locator('.lucro-destaque strong').innerText(),conferencia==='conferida'?'R$ 115,00':'R$ 100,00');
  assert.equal(await page.locator('.lucro-valores dt').filter({hasText:/^Comissões$/}).count(),conferencia==='conferida'?0:1);
  await page.getByRole('button',{name:'Conferir / adicionar outros custos',exact:true}).click();
  const conferir=page.getByRole('dialog',{name:'OS #123',exact:true});await conferir.waitFor();
  assert.equal(await conferir.getByLabel('Tempo produtivo do serviço (minutos)',{exact:false}).inputValue(),conferencia==='conferida'?'30':'0');
  await conferir.getByRole('button',{name:'Adicionar custo que faltou',exact:true}).click();
  await page.getByRole('dialog',{name:'Adicionar custo do serviço',exact:true}).waitFor();
  assert.deepEqual(errors,[]);resultados.push('Conferência '+conferencia+': lucro, fontes e formulários de custos');
 }
 for(const perfil of perfis){
  await ir('os',perfil,390);await page.getByText('Lucro estimado',{exact:true}).waitFor();await layout(perfil+' lucro móvel');
  await page.getByRole('button',{name:'Ajustar custo',exact:true}).click();await page.getByLabel('Custo direto por unidade (R$)').fill('40');
  await page.getByRole('button',{name:'Salvar custo nesta OS'}).click();await page.getByText('Custo ajustado nesta OS',{exact:false}).waitFor();assert.equal(await page.locator('.lucro-destaque strong').innerText(),'R$ 100,00'.replace('100','80'));
  const grav=await page.evaluate(()=>window.fixtureChamadas.find(x=>x.n==='salvar_custo_item_documento'));assert.equal(grav.args.p_custo,4000);resultados.push(perfil+' ajuste e atualização de margem');
  await ir('cliente',perfil,390);await page.getByText('Lucro médio estimado',{exact:true}).waitFor();await layout(perfil+' ficha móvel');
 }
 await ir('editor');await page.getByRole('button',{name:'Serviço ou peça avulsa'}).click();const opc=page.locator('details.custo-item-opcional');assert.equal(await opc.getAttribute('open'),null);
 await page.getByLabel('Nome do serviço ou peça').fill('Serviço QA');await page.getByLabel('Preço unitário (R$)').fill('100');await opc.locator('summary').click();await page.getByLabel('Custo direto por unidade (R$)').fill('35');await page.getByRole('button',{name:'Adicionar serviço',exact:true}).click();assert.equal((await page.evaluate(()=>window.fixtureItens))[0].custo_unitario_previsto_centavos,3500);resultados.push('custo opcional e persistência no editor');
 await ir('catalogo');await page.getByRole('button',{name:'Editar',exact:true}).click();assert.equal(await page.locator('details.ficha-servico-custeio').getAttribute('open'),null);await page.locator('details.ficha-servico-custeio summary').click();await page.getByLabel('Custo direto por unidade',{exact:true}).fill('42');await page.getByLabel('Preço de venda (R$)').fill('120');await page.getByRole('button',{name:'Salvar cadastro',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal((await page.evaluate(()=>window.fixtureChamadas.find(x=>x.n==='salvar_servico_detalhado'))).args.p_dados.custo_centavos,4200);resultados.push('custo e margem no catálogo');
 await ir('os');await page.getByRole('button',{name:'Ajustar custo',exact:true}).click();await page.getByLabel('Custo direto por unidade (R$)').fill('45');await page.evaluate(()=>window.fixtureErro=true);await page.getByRole('button',{name:'Salvar custo nesta OS'}).click();await page.getByRole('alert').waitFor();assert.equal(await page.getByLabel('Custo direto por unidade (R$)').inputValue(),'45');resultados.push('falha de gravação preserva valor');
 for(const width of [320,390,768,1920])for(const tema of ['claro','escuro'])for(const tela of ['os','cliente','editor']){
  await ir(tela,'assistencia_celulares',width,tema);if(tela==='os'){await page.getByText('Lucro estimado',{exact:true}).waitFor();await page.getByRole('button',{name:'Ajustar custo'}).click();}else if(tela==='cliente')await page.getByText('Lucro médio estimado',{exact:true}).waitFor();else{await page.getByRole('button',{name:'Serviço ou peça avulsa'}).click();await page.locator('details.custo-item-opcional summary').click();}
  await layout(`${tela} ${width} ${tema}`);if((width===390||width===1920)&&tela==='os')await page.screenshot({path:resolve(pasta,`lucro-${width}-${tema}.png`)});
 }
 await ir('os','mecanica',390,'escuro','staff');assert.equal(await page.locator('.lucro-servico').count(),0);assert(!(await page.evaluate(()=>window.fixtureChamadas)).some(x=>x.n==='consultar_lucro_documento'));resultados.push('lucro oculto para funcionário');
 sucesso=true;console.log('PASS UI',resultados.length);
}catch(e){erro=e.message;console.error('FAIL UI',erro);process.exitCode=1;}finally{await writeFile(resolve(pasta,'interface.json'),JSON.stringify({ok:sucesso,sucesso,erro,resultados},null,2));await browser.close();}
