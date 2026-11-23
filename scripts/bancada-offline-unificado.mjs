import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createServer} from 'node:http';
import {build} from './lib/vite-conferencia.mjs';
import {chromium} from './lib/chrome-conferencia.mjs';
import {especialidades} from '../src/lib/especialidades.ts';
const pasta=resolve(process.env.QA_OUTPUT || 'output/offline-unificado-20261109/execucao-navegador');
const out=resolve(pasta,'build');
await mkdir(pasta,{recursive:true});
await build({logLevel:'error',plugins:[{name:'bancada-api',enforce:'pre',resolveId(id){if(/(?:^|\/)lib\/rpc(?:\.ts)?$/.test(id))return resolve('scripts/fixtures/dados-rpc.js');if(/(?:^|\/)lib\/supabase(?:\.ts)?$/.test(id))return resolve('scripts/fixtures/dados-supabase.js');}}],build:{outDir:out,rollupOptions:{input:'scripts/fixtures/dados.html'}}});
const server=createServer(async(req,res)=>{try{
  let path=new URL(req.url,'http://local').pathname;if(path==='/'||path==='/index.html')path='/scripts/fixtures/dados.html';
  const f=resolve(out,'.'+path);if(!f.startsWith(out+sep))throw Error();
  res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.woff2':'font/woff2'})[extname(f)]||'application/octet-stream');res.end(await readFile(f));
}catch{res.statusCode=404;res.end();}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const ctx=await browser.newContext({viewport:{width:390,height:844},locale:'pt-BR'}),page=await ctx.newPage();
const resultados=[],erros=[];page.on('pageerror',e=>erros.push(e.message));
page.setDefaultTimeout(20000);
try{
  await page.goto(base+'/?tela=offline');
  await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const jpeg=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=60;const x=c.getContext('2d');x.fillStyle='#778866';x.fillRect(0,0,80,60);return c.toDataURL('image/jpeg').split(',')[1];}),'base64');
  for(const [perfil] of Object.entries(especialidades)){
    const checks=[];await ctx.setOffline(false);
    await page.goto(base+'/?tela=offline&execucao=1&perfil='+perfil);
    await page.getByRole('button',{name:'Preparar / atualizar aparelho'}).click();
    await page.getByText(/Aparelho preparado\. Cadastros e 1 OS/).waitFor();checks.push('Uma preparação baixa cadastros e execução');
    await ctx.setOffline(true);let d;
    await page.getByRole('button',{name:'Abrir execução'}).click();d=page.getByRole('dialog');
    await d.getByRole('button',{name:'Registrar início agora'}).click();
    await d.getByLabel('Serviço realizado e observações').fill('Executado sem rede '+perfil);
    await d.getByLabel('Adicionar fotos',{exact:true}).setInputFiles({name:'depois.jpg',mimeType:'image/jpeg',buffer:jpeg});
    await d.getByRole('combobox',{name:/Momento/}).selectOption('depois');
    await d.getByRole('button',{name:'Salvar no aparelho',exact:true}).click();
    await d.getByRole('button',{name:'Fechar janela',exact:true}).click();
    await page.getByText('1 atendimento(s) para enviar',{exact:true}).waitFor();checks.push('Execução, horário e foto salvos sem rede');
    await page.reload({waitUntil:'domcontentloaded'});
    await page.getByText('1 atendimento(s) para enviar',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>navigator.onLine),false);
    assert(await page.getByRole('button',{name:'Enviar pendências',exact:true}).isDisabled());
    await page.getByRole('button',{name:'Abrir execução'}).click();d=page.getByRole('dialog');
    assert.equal(await d.getByLabel('Serviço realizado e observações').inputValue(),'Executado sem rede '+perfil);
    assert.equal(await d.getByRole('combobox',{name:/Momento/}).inputValue(),'depois');
    await d.getByRole('button',{name:'Fechar janela',exact:true}).click();checks.push('Reabertura offline preserva execução e foto');
    await ctx.setOffline(false);await page.evaluate(()=>{window.fixtureFalharFoto=true;});
    await page.getByRole('button',{name:'Enviar pendências',exact:true}).click();
    await page.getByRole('status').filter({hasText:'precisa(m) de conferência'}).waitFor();
    await page.getByText('Fotos pendentes',{exact:true}).waitFor();
    await page.getByText('1 atendimento(s) para enviar',{exact:true}).waitFor();checks.push('Uma falha de foto preserva a execução e permite tentar novamente');
    await page.getByRole('button',{name:'Enviar pendências',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Tudo em dia'}).waitFor();
    await page.getByText('Nenhum envio pendente',{exact:true}).waitFor();
    const chamadas=await page.evaluate(()=>window.fixtureChamadas);
    assert.equal(chamadas.filter(c=>['salvar_ordem_servico','criar_rascunho_servico_offline'].includes(c.n)).length,0);
    assert.equal(chamadas.filter(c=>c.n==='sincronizar_execucao_offline').length,1);
    assert.equal(chamadas.find(c=>c.n==='sincronizar_execucao_offline').a.p_dados.anotacoes,'Executado sem rede '+perfil);
    assert.equal(chamadas.filter(c=>c.n.startsWith('confirmar_foto')).length,1);checks.push('Reenvio completa fotos sem duplicar OS ou execução');
    // A execução existente permanece disponível para consulta; novos documentos e seus links são cobertos em bancada-documentos-offline.
    await page.getByText('Disponível no aparelho',{exact:true}).waitFor();checks.push('Execução sincronizada permanece disponível no aparelho');
    await page.getByRole('button',{name:'Abrir execução'}).click();d=page.getByRole('dialog');
    await d.getByLabel('Serviço realizado e observações').fill('Conferência '+perfil);
    // Fechar salva as alterações locais para não perder trabalho por um clique.
    await d.getByRole('button',{name:'Fechar janela',exact:true}).click();
    await page.getByText('1 atendimento(s) para enviar',{exact:true}).waitFor();
    await page.evaluate(()=>{window.fixtureConflito=true;});
    await page.getByRole('button',{name:'Enviar pendências',exact:true}).click();
    await page.getByText('Precisa comparar alterações',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Abrir execução'}).click();d=page.getByRole('dialog');
    await d.getByRole('button',{name:'Comparar com a versão atual'}).click();
    await d.getByRole('button',{name:'Confirmar dados para novo envio'}).click();
    await d.getByRole('button',{name:'Fechar janela',exact:true}).click();
    await page.getByRole('button',{name:'Enviar pendências',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Tudo em dia'}).waitFor();checks.push('Conflito permanece salvo e pode ser conferido antes de reenviar');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));checks.push('Sem transbordamento no celular de 390 px');
    await page.screenshot({path:resolve(pasta,perfil+'-mobile.png'),fullPage:true});
    await page.setViewportSize({width:1920,height:1080});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));checks.push('Sem transbordamento no desktop de 1920 px');
    await page.screenshot({path:resolve(pasta,perfil+'-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});
    assert.deepEqual(erros,[]);checks.push('Sem erro de JavaScript');
    resultados.push({perfil,checks});console.log('PASS unificado',perfil);
    await writeFile(resolve(pasta,'resultado.json'),JSON.stringify({ok:true,api:'Simulada; IndexedDB, Service Worker e corte da rede reais no navegador',resultados},null,2));
  }
}catch(e){console.error(e.stack);await page.screenshot({path:resolve(pasta,'falha.png'),fullPage:true});await writeFile(resolve(pasta,'resultado.json'),JSON.stringify({ok:false,erro:e.message,resultados,erros},null,2));process.exitCode=1;}
finally{await browser.close();await new Promise(ok=>server.close(ok));}
