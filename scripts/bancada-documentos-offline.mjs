import {iniciarJornada,concluirJornada} from "./lib/medir-jornadas.mjs";
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createServer} from 'node:http';
import {build} from './lib/vite-conferencia.mjs';
import {chromium} from './lib/chrome-conferencia.mjs';
import {especialidades} from '../src/lib/especialidades.ts';
import {criarCenarioSubsistemas,exemplosSubsistemas} from '../supabase/tests/subsistemas-fixture.mjs';
const pasta=resolve(process.env.QA_OUTPUT || 'output/offline-completo-20261110/navegador'),out=resolve(pasta,'build');
await mkdir(pasta,{recursive:true});
process.env.DB_VALIDATION_MIGRATION_LIMIT=(await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort().at(-1).slice(0,14);
process.env.DB_VALIDATION_RUNTIME=resolve('node_modules/@electric-sql/pglite/dist/index.js');
const {db,login,registros,ids}=await criarCenarioSubsistemas();
const call=async(n,args)=>Object.values((await db.query(`select public.${n}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args)).rows[0])[0];
const bases={};
for(const [perfil,e] of Object.entries(especialidades)){
 const r=registros[perfil];await login(ids[perfil]);
 const catalogo=(await db.query('select c.*,p.item_catalogo_id produto_estoque_id,p.custo_centavos from public.itens_catalogo c left join public.estoque_produtos p on p.oficina_id=c.oficina_id and p.item_catalogo_id=c.id where c.oficina_id=$1',[r.w])).rows;
 const clientes=(await db.query('select id,nome,telefone_e164 from public.clientes where oficina_id=$1',[r.w])).rows;
 bases[perfil]={usuario:ids[perfil],oficina:{id:r.w,nome:'Empresa QA '+e.nome,ramo:e.ramo,especialidade:perfil,perfil:'owner'},base:{id:ids[perfil]+':'+r.w,usuario:ids[perfil],oficina:r.w,nome:'Empresa QA '+e.nome,ramo:e.ramo,especialidade:perfil,atualizado:Date.now(),identidade:{nome:'Empresa QA '+e.nome},objetos:[],aux:{clientes,veiculos:[],vinculos:[],catalogo}}};
}
if(!process.argv.includes('--reusar-build'))await build({logLevel:'error',define:{'import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':'""'},plugins:[{name:'banco-local-http',enforce:'pre',resolveId(id){if(/(?:^|\/)lib\/rpc(?:\.ts)?$/.test(id))return resolve('scripts/fixtures/documentos-offline-rpc.js');}}],build:{outDir:out,target:'esnext',rollupOptions:{input:'scripts/fixtures/documentos-offline.html'}}});
let fila=Promise.resolve();
const serial=fn=>{const p=fila.then(fn);fila=p.catch(()=>{});return p;};
const server=createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://local');
  if(u.pathname==='/qa/base'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(bases[u.searchParams.get('perfil')]));return;}
  if(u.pathname==='/qa/rpc'){
   let body='';for await(const chunk of req){body+=chunk;if(body.length>700000)throw Error('Payload excessivo');}
   const {nome,dados,perfil}=JSON.parse(body);assert.equal(nome,'sincronizar_documento_offline');assert.equal(dados.p_oficina,registros[perfil].w);
   const resultado=await serial(async()=>{await login(ids[perfil]);return call(nome,[dados.p_oficina,dados.p_chave,dados.p_documento]);});res.setHeader('Content-Type','application/json');res.end(JSON.stringify(resultado));return;
  }
  let path=u.pathname;if(path==='/'||path==='/index.html')path='/scripts/fixtures/documentos-offline.html';
  const f=resolve(out,'.'+path);assert(f.startsWith(out+sep));res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'})[extname(f)]||'application/octet-stream');res.end(await readFile(f));
 }catch(e){res.statusCode=400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:e.message,code:e.code||'TEST_ERROR'}));}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const url='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const resultados=[];let atual;
const locais=page=>page.evaluate(async()=>{const db=await new Promise((ok,no)=>{const p=indexedDB.open('patio-atendimento-offline-v1');p.onsuccess=()=>ok(p.result);p.onerror=no;});const r=await new Promise((ok,no)=>{const p=db.transaction('rascunhos').objectStore('rascunhos').getAll();p.onsuccess=()=>ok(p.result);p.onerror=no;});db.close();return r;});
const esperarLocais=async(page,predicado)=>{const inicio=Date.now();while(!predicado(await locais(page))){if(Date.now()-inicio>30000)throw Error('Sincronização não atingiu o estado esperado');await page.waitForTimeout(100);}};
try{
 for(const [perfil,e] of Object.entries(especialidades)){
  if(process.env.QA_PERFIL&&process.env.QA_PERFIL!==perfil)continue;
  if(process.env.QA_PERFIS&&!process.env.QA_PERFIS.split(',').includes(perfil))continue;
  const checks=[],errors=[],ctx=await browser.newContext({viewport:{width:390,height:844},locale:'pt-BR'}),page=await ctx.newPage();atual=page;
  await ctx.addInitScript(()=>{window.print=()=>{window.qaImpresso=(window.qaImpresso||0)+1;};});page.on('pageerror',err=>errors.push(err.message));page.setDefaultTimeout(20000);
  await page.goto(url+'/?perfil='+perfil,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Nova OS',exact:true}).waitFor();
  await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await ctx.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Nova OS',exact:true}).waitFor();assert.equal(await page.evaluate(()=>navigator.onLine),false);checks.push('Abertura sem rede com Service Worker real');
  iniciarJornada('Offline: OS e orçamento completos, imprimir e sincronizar com perda de resposta e duas abas',perfil);
  for(const tipo of ['os','orcamento']){
   await page.getByRole('button',{name:tipo==='os'?'Nova OS':'Novo orçamento',exact:true}).click();let d=page.getByRole('dialog');
   if(tipo==='os')await d.getByRole('combobox',{name:'Cliente',exact:true}).selectOption(registros[perfil].cliente);
   else await d.getByLabel('Nome do cliente',{exact:true}).fill('Cliente novo offline '+perfil);
   await d.getByLabel(e.ramo==='automotivo'?'Veículo':e.ramo==='assistencia_tecnica'?'Equipamento':e.ramo==='limpeza'?'Local':'Local / equipamento',{exact:true}).fill(exemplosSubsistemas[perfil][0]+' '+tipo);
   await d.getByLabel('Data do serviço',{exact:true}).fill('2026-11-10');
   await d.getByRole('textbox',{name:/Buscar serviço ou (peça|material|produto):/}).fill(exemplosSubsistemas[perfil][1]);await d.getByRole('button',{name:new RegExp('^Adicionar '+exemplosSubsistemas[perfil][1])}).click();
   await d.getByRole('textbox',{name:/Buscar serviço ou (peça|material|produto):/}).fill(exemplosSubsistemas[perfil][2]);await d.getByRole('button',{name:new RegExp('^Adicionar '+exemplosSubsistemas[perfil][2])}).click();
   await d.getByRole('button',{name:/Serviço ou (peça|material|produto) avuls[oa]/}).click();const item=d.getByRole('group',{name:'Novo item avulso'});await item.getByLabel(/Nome do serviço ou/).fill('Complemento avulso QA');await item.getByLabel('Preço unitário (R$)').fill('20');await item.getByRole('button',{name:'Adicionar serviço',exact:true}).click();
   await d.getByRole('button',{name:new RegExp('^Editar Complemento avulso QA:')}).click();const editar=d.getByRole('group',{name:/Editar item:/});await editar.getByLabel('Preço unitário (R$)').fill('25');await editar.getByRole('button',{name:'Salvar item',exact:true}).click();
   await d.getByRole('spinbutton',{name:/Quantidade de Complemento/}).fill('2');await d.getByLabel('Desconto (%)',{exact:true}).fill('10');
   if(tipo==='orcamento'){await d.getByRole('button',{name:'Desconto em reais'}).click();assert.equal(await d.getByLabel('Desconto (R$)',{exact:true}).inputValue(),'20');}
   if(tipo==='os')await d.getByRole('button',{name:'Sim',exact:true}).click();
   const campoTecnico=dialogo=>dialogo.locator('.ficha-especialidade').locator('input:not([type="checkbox"]), select, textarea').first();
   await d.locator('.ficha-especialidade > summary').click();
   const campo=campoTecnico(d);await campo.waitFor({state:'visible'});
   const tag=await campo.evaluate(el=>el.tagName),tipoCampo=await campo.getAttribute('type');
   const valorTecnico=tag==='SELECT'?await campo.locator('option').evaluateAll(os=>os.find(o=>o.value)?.value):tipoCampo==='date'?'2026-11-10':tipoCampo==='number'?String(Number(await campo.getAttribute('min')||0)+1):'Conferência offline '+perfil;
   assert(valorTecnico);
   if(tag==='SELECT')await campo.selectOption(valorTecnico);else await campo.fill(valorTecnico);
   await d.locator('.ficha-especialidade > summary').click();await d.locator('.ficha-especialidade > summary').click();
   assert.equal(await campoTecnico(d).inputValue(),valorTecnico);await d.locator('.ficha-especialidade > summary').click();
   await d.locator('summary').filter({hasText:'Observações e condições'}).click();await d.getByLabel('Observações',{exact:true}).fill('Anotação preservada '+perfil);await d.getByLabel('Condições',{exact:true}).fill('Retirar após confirmação.');
   await d.getByRole('button',{name:'Continuar depois',exact:true}).click();await page.reload({waitUntil:'domcontentloaded'});const linha=page.locator('.offline-registro').filter({hasText:tipo==='os'?'OS LOCAL-':'Orçamento LOCAL-'});await linha.getByRole('button',{name:'Continuar',exact:true}).click();d=page.getByRole('dialog');
   await d.locator('.os-editor-item').last().waitFor();assert.equal(await d.locator('.os-editor-item').count(),3);assert.equal(await d.getByRole('spinbutton',{name:/Quantidade de Complemento/}).inputValue(),'2');checks.push(tipo+': catálogo, avulso, edição de preço/quantidade e desconto persistidos');
   await d.locator('.ficha-especialidade > summary').click();assert.equal(await campoTecnico(d).inputValue(),valorTecnico);await d.locator('.ficha-especialidade > summary').click();checks.push(tipo+': ficha técnica preservada ao recolher, salvar e reabrir sem rede');
   for(const width of [320,390,768,1920]){await page.setViewportSize({width,height:1000});assert(await d.evaluate(el=>el.scrollWidth<=el.clientWidth+2),'overflow modal '+perfil+' '+width);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'overflow página');}
   await page.screenshot({path:resolve(pasta,perfil+'-'+tipo+'-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(pasta,perfil+'-'+tipo+'-mobile.png'),fullPage:true});checks.push(tipo+': layout 320, 390, 768 e 1920 px');
   const nova=ctx.waitForEvent('page');await d.getByRole('button',{name:'Salvar e imprimir',exact:true}).click();const nota=await nova;await nota.getByRole('button',{name:'Baixar PDF',exact:true}).waitFor();await nota.waitForFunction(()=>window.qaImpresso===1);assert.match(await nota.locator('body').innerText(),/180,00/);assert.match(await nota.locator('body').innerText(),/LOCAL-/);
   const baixar=page.waitForEvent('download');await nota.getByRole('button',{name:'Baixar PDF',exact:true}).click();await (await baixar).saveAs(resolve(pasta,perfil+'-'+tipo+'.pdf'));await nota.close();checks.push(tipo+': impressão automática e PDF sem internet');
   await page.reload({waitUntil:'domcontentloaded'});assert((await locais(page)).filter(r=>r.pronto_envio).length=== (tipo==='os'?1:2));
  }
  let perda=0;await ctx.route('**/qa/rpc',async route=>{if(!perda++){const res=await route.fetch();assert.equal(res.status(),200);await route.abort('failed');}else await route.continue();});
  await ctx.setOffline(false);await esperarLocais(page,lista=>lista.some(r=>r.situacao==='sincronizado')&&lista.some(r=>r.pedido_documento&&r.erro));checks.push('Reconexão envia automaticamente; perda da resposta mantém a referência');
  const segunda=await ctx.newPage();await segunda.goto(url+'/?perfil='+perfil,{waitUntil:'domcontentloaded'});const tentarEnvio=async pagina=>{const botao=pagina.getByRole('button',{name:'Enviar agora',exact:true});if(!await botao.count()||!await botao.isEnabled())return;try{await botao.click({timeout:1000})}catch(e){if(await botao.count()&&await botao.isEnabled())throw e}};await Promise.all([tentarEnvio(page),tentarEnvio(segunda)]);await esperarLocais(page,lista=>lista.length===2&&lista.every(r=>r.situacao==='sincronizado'));await segunda.close();
  const documentos=await locais(page);await serial(async()=>{await login(ids[perfil]);for(const r of documentos){const auto=e.ramo==='automotivo',d=await call(auto?(r.documento.tipo==='os'?'consultar_ordem_servico':'consultar_orcamento'):'consultar_detalhes_atendimento',[registros[perfil].w,r.recibo.id]);assert.equal(d.itens.length,3);assert.equal(auto?(r.documento.tipo==='os'?d.total_centavos:d.versao.total_centavos):d.atendimento.valor_centavos,18000);assert.equal(r.recibo.total_centavos,18000);if(!auto)assert.equal(d.atendimento.dados.documento,r.documento.tipo==='os'?'ordem':'orcamento');}await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from private.documentos_offline_recebidos where oficina_id=$1',[registros[perfil].w])).rows[0].n,2);});checks.push('Duas abas e reenvio: exatamente dois documentos, com itens, tipo e total conferidos no banco');
  assert.deepEqual(errors,[]);checks.push('Sem exceções de JavaScript');resultados.push({perfil,checks});await writeFile(resolve(pasta,'resultado.json'),JSON.stringify({ok:true,ambiente:'UI real, IndexedDB/Service Worker reais, corte de rede real e banco PGlite com todas as migrações; contas fictícias',subsistemas:resultados.length,verificacoes:resultados.reduce((s,r)=>s+r.checks.length,0),resultados},null,2));concluirJornada();console.log('PASS offline completo',perfil);await ctx.close();
 }
}catch(e){console.error(e.stack);if(atual&&!atual.isClosed()){await atual.screenshot({path:resolve(pasta,'falha.png'),fullPage:true});console.error((await atual.locator('body').innerText()).slice(-3500));}await writeFile(resolve(pasta,'resultado.json'),JSON.stringify({ok:false,erro:e.message,resultados},null,2));process.exitCode=1;}
finally{await browser.close();await new Promise(ok=>server.close(ok));await db.close();}



