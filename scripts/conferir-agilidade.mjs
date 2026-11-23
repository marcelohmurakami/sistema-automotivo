// Leitura nas empresas fictícias. Gravações são interceptadas e nunca chegam ao servidor.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
const out=resolve('output/agilidade-20261111'),fase=process.env.QA_FASE||'depois';
const dir=resolve(fase==='antes'?out+'/baseline':'dist'),resultados=[];
await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const u=new URL(req.url,'http://local');let f=resolve(dir,'.'+u.pathname);assert(f===dir||f.startsWith(dir+sep));let b;try{b=await readFile(f);}catch{f=resolve(dir,'index.html');b=await readFile(f);}if(f.includes(sep+'assets'+sep))res.setHeader('Cache-Control','public, max-age=31536000, immutable');res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.json':'application/json','.svg':'image/svg+xml'})[extname(f)]||'application/octet-stream');res.end(b);}catch{res.statusCode=404;res.end();}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base=process.env.QA_URL||'http://127.0.0.1:'+server.address().port;
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.filter(c=>['retifica','assistencia_celulares','manutencao_climatizacao','limpeza_geral'].includes(c.especialidade));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{for(const c of contas){
 assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
 const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:1366,height:900},locale:'pt-BR'}),p=await ctx.newPage();p.setDefaultTimeout(20000);
 const erros=[],requests=[];p.on('pageerror',e=>erros.push(e.message));p.on('request',r=>requests.push(r.url()));
 await p.goto(base+'/entrar');await p.getByLabel('E-mail',{exact:true}).fill(c.email);await p.getByLabel('Senha',{exact:true}).fill(c.senha);await p.getByRole('button',{name:'Entrar no sistema',exact:true}).click();await p.waitForURL(u=>!u.pathname.startsWith('/entrar'));await p.locator('main h1').waitFor();await p.waitForTimeout(1500);
 const cliente=p.locator('aside a[href="/clientes"]').first();requests.length=0;
 const estilosAntes=await p.evaluate(()=>[...document.styleSheets].map(s=>s.href));
 await cliente.hover();await p.waitForTimeout(900);
 assert.deepEqual(await p.evaluate(()=>[...document.styleSheets].map(s=>s.href)),estilosAntes,'Antecipação não aplica estilos de outra tela');
 const apiAoApontar=requests.filter(u=>u.includes('/rest/v1/'));
 const codigoClientes=requests.filter(u=>/\/Clientes-[^/]+\.js/.test(u));
 assert.equal(apiAoApontar.length,0,'Apontar não deve fazer consultas ou gravações');
 if(fase==='depois')assert.equal(codigoClientes.length,1,'Prepara uma única vez o código da tela');
 await cliente.click();await p.getByRole('button',{name:'Novo cliente',exact:true}).waitFor();await p.waitForTimeout(800);
 if(fase==='depois'){
  const recursos=await p.evaluate(()=>performance.getEntriesByType('resource').filter(e=>/\/Clientes-[^/]+\.js/.test(e.name)).map(e=>({tipo:e.initiatorType,bytes:e.transferSize})));
  assert(recursos.some(e=>e.tipo==='link'),'Arquivo preparado pelo navegador');
  assert(recursos.filter(e=>e.bytes>0).length<=1,'Clique reutiliza o cache HTTP: no máximo um download do módulo');
 }
 let gravações=0,erroSalvar=false,atrasar=false,confirmado=0,consultaTerminou=false;
 await p.route('**/rest/v1/rpc/salvar_cliente',async route=>{
  gravações++;const dados=route.request().postDataJSON();await new Promise(ok=>setTimeout(ok,500));confirmado=performance.now();
  if(erroSalvar)return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'22023',message:'QA: gravação recusada para conferir os campos.'})});
  atrasar=true;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...dados.p_dados,id:'00000000-0000-4000-8000-000000009999',oficina_id:dados.p_oficina,revisao:1,criado_em:new Date().toISOString(),atualizado_em:new Date().toISOString(),arquivado_em:null})});
 });
 await p.route('**/rest/v1/rpc/listar_clientes',async route=>{if(atrasar)await new Promise(ok=>setTimeout(ok,3000));const resp=await route.fetch();await route.fulfill({response:resp});consultaTerminou=true;});
 await p.getByRole('button',{name:'Novo cliente',exact:true}).click();
 const d=p.locator('dialog[open]');await d.getByLabel('Nome ou razão social (obrigatório)').fill('QA somente simulação de resposta');
 await d.getByRole('button',{name:'Cadastrar cliente',exact:true}).click();
 await p.waitForTimeout(100);assert(await d.getByRole('button',{name:'Salvando…',exact:true}).isDisabled(),'Trava enquanto aguarda confirmação');assert.equal(gravações,1);
 await d.waitFor({state:'hidden'});const confirmacaoAteFechar=Math.round(performance.now()-confirmado);
 if(fase==='depois'){assert(!consultaTerminou,'Confirmação não aguarda consulta secundária');assert(confirmacaoAteFechar<1200);}
 await p.getByText('Cliente salvo com sucesso.',{exact:true}).waitFor();
 while(!consultaTerminou)await p.waitForTimeout(100);
 atrasar=false;erroSalvar=true;await p.setViewportSize({width:390,height:844});
 await p.getByRole('button',{name:'Novo cliente',exact:true}).click();await d.getByLabel('Nome ou razão social (obrigatório)').fill('QA preservar campos');await d.getByRole('button',{name:'Cadastrar cliente',exact:true}).click();await d.getByRole('alert').filter({hasText:'QA: gravação recusada'}).waitFor();
 assert.equal(await d.getByLabel('Nome ou razão social (obrigatório)').inputValue(),'QA preservar campos');assert.equal(gravações,2);assert(await d.isVisible());
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await d.getByRole('button',{name:'Fechar janela',exact:true}).click();
 if(c.ramo==='automotivo'){
  await p.setViewportSize({width:1366,height:900});await p.goto(base+'/orcamentos');await p.locator('.abrir-proposta').first().waitFor();await p.waitForTimeout(700);requests.length=0;await p.locator('.abrir-proposta').first().click();await p.locator('dialog[open]').waitFor();await p.waitForTimeout(700);
  if(fase==='depois')assert.equal(requests.filter(u=>u.includes('/rest/v1/rpc/listar_orcamentos')).length,0,'Abrir proposta não recarrega a lista');
 }
 assert.deepEqual(erros,[]);resultados.push({perfil:c.especialidade,fase,confirmacaoAteFechar,checks:['Antecipação de código sem consultas no hover','Uma única requisição ao salvar','Bloqueio até confirmação do servidor','Campos preservados quando gravação falha','Sem estouro no celular','Sem erro JavaScript'],gravaçõesInterceptadas:gravações});console.log(JSON.stringify(resultados.at(-1)));await ctx.close();
}}finally{await browser.close();await new Promise(ok=>server.close(ok));await writeFile(resolve(out,'interacoes-'+(process.env.QA_URL?'publicado':fase)+'.json'),JSON.stringify({ok:resultados.length===4,resultados},null,2));}
