import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createServer} from 'node:http';
import {build} from './lib/vite-conferencia.mjs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {chromium} from './lib/chrome-conferencia.mjs';
const pasta=resolve(process.env.QA_OUTPUT || 'output/pagamento-entrega-20261106'),out=resolve(pasta,'interface-build');
await mkdir(pasta,{recursive:true});
if(!process.argv.includes('--sem-build'))await build({configFile:false,envDir:false,logLevel:'error',plugins:[react(),tailwindcss()],define:{'import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':'""'},build:{outDir:out,rollupOptions:{input:'scripts/fixtures/pagamento-entrega.html'}}});
const server=createServer(async(req,res)=>{try{const f=resolve(out,'.'+new URL(req.url,'http://localhost').pathname);assert(f.startsWith(out+sep));res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(f)]||'application/octet-stream');res.end(await readFile(f));}catch{res.statusCode=404;res.end();}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const resultados=[],errors=[];let ctx,p;
async function iniciar(extra=''){
 await ctx?.close();ctx=await browser.newContext({viewport:{width:1920,height:1080},locale:'pt-BR',timezoneId:'America/Sao_Paulo'});p=await ctx.newPage();p.setDefaultTimeout(45000);p.on('pageerror',e=>errors.push(e.message));
 await p.goto(`http://127.0.0.1:${server.address().port}/scripts/fixtures/pagamento-entrega.html?${extra}`,{waitUntil:'domcontentloaded',timeout:60000});
 await p.getByRole('dialog',{name:'Nova ordem de serviço',exact:true}).waitFor();
}
async function preencher(){
 await p.getByRole('combobox',{name:'Cliente',exact:true}).click();
 await p.getByRole('option',{name:'Informar cliente sem cadastrar',exact:true}).click();
 await p.getByLabel('Nome do cliente',{exact:true}).fill('QA Pagamento antes da impressão');
 if(await p.getByLabel('Carro',{exact:true}).count()){
  await p.getByLabel('Carro',{exact:true}).fill('Fiat Palio');
  await p.getByLabel('Motor',{exact:true}).fill('Fire 1.0');
 }else{
  await p.getByRole('button',{name:'Novo veículo',exact:true}).click();
  await p.getByLabel('Nome / modelo do veículo',{exact:true}).fill('Fiat Palio QA');
  await p.getByRole('button',{name:'Cadastrar e selecionar',exact:true}).click();
 }
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
 for(const perfil of ['mecanica','retifica','autoeletrica','autocenter','borracharia','estetica','lava_rapido','troca_oleo','acessorios','funilaria'])for(const modo of ['total','parcial','prazo','adiar']){
  await iniciar('perfil='+perfil);await preencher();await salvar();await semImpressao();
  if(modo!=='adiar'){
   await p.getByRole('button',{name:modo==='total'?'Já recebi':modo==='parcial'?'Recebi uma parte':'A receber',exact:false}).click();
   if(modo==='prazo'){await p.getByLabel('Receber em',{exact:true}).fill('2026-12-15');await p.getByRole('button',{name:'Salvar data combinada',exact:true}).click();}
   else{await p.getByLabel('Valor pago (R$)',{exact:true}).fill(modo==='parcial'?'50':'150');if(modo==='parcial')await p.getByLabel('Vencimento do restante',{exact:true}).fill('2026-12-15');await p.getByRole('button',{name:'Confirmar pagamento',exact:true}).click();}
   await p.getByRole('button',{name:'Concluir e imprimir',exact:true}).waitFor();
  }
  await imprimir(modo==='adiar'?'Agora não, só imprimir':'Concluir e imprimir',perfil+'-'+modo);
  const antes=await financeiro();
  // Um novo carregamento remove o estado do React, mantendo apenas o registro financeiro persistido.
  await p.goto(`http://127.0.0.1:${server.address().port}/scripts/fixtures/pagamento-entrega.html?mapa&perfil=${perfil}`);
  await p.setViewportSize({width:modo==='parcial'||modo==='adiar'?390:1920,height:900});await p.getByRole('button',{name:'Entregar OS 1 para Entregue',exact:true}).click();
  await p.waitForFunction(()=>JSON.parse(localStorage.getItem('patio_os_v1'))[0].situacao==='delivered');
  if(modo==='adiar'){await p.getByRole('dialog',{name:'Como ficou o pagamento da OS?',exact:true}).waitFor();await p.getByRole('button',{name:'Já recebi',exact:false}).waitFor();}
  else{await p.waitForTimeout(350);assert.equal(await p.getByRole('dialog',{name:'Como ficou o pagamento da OS?',exact:true}).count(),0);assert(!(await p.evaluate(()=>window.qaDialogos)).includes('Como ficou o pagamento da OS?'),'Não deve abrir nem por um instante');}
  const depois=await financeiro();assert.deepEqual(depois.baixas,antes.baixas);assert.equal(depois.titulos.length,1);assert.equal(depois.titulos[0].pagamento_combinado??false,antes.titulos[0]?.pagamento_combinado??false);
  if(modo==='parcial'||modo==='prazo')assert.equal(depois.titulos[0].vencimento,'2026-12-15');
  assert.equal(await p.evaluate(()=>window.qaJanelas),0);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  resultados.push({cenario:perfil+' · '+modo+' · criar pronta, pagamento, impressão, recarregar e entregar pelo mapa',ok:true});
  if(perfil==='retifica')await p.screenshot({path:resolve(pasta,'entrega-'+modo+'.png')});
  if(perfil==='retifica'&&modo==='adiar'){
    await p.getByRole('button',{name:'Já recebi',exact:false}).click();
    await p.getByRole('button',{name:'Confirmar pagamento',exact:true}).click();
    await p.getByRole('dialog',{name:'Financeiro atualizado',exact:true}).waitFor();
    await p.getByRole('button',{name:'Concluir',exact:true}).click();
    assert.equal((await financeiro()).baixas.length,1);
    resultados.push({cenario:'Pagamento adiado pode ser recebido na entrega e confirma o sucesso',ok:true});
  }
  console.log('PASS',perfil,modo);
 }
 // Falha na consulta não é interpretada como quitação. O operador pode tentar de novo.
 await iniciar();await preencher();await salvar();await imprimir('Agora não, só imprimir','adiado-erro');
 await p.goto(`http://127.0.0.1:${server.address().port}/scripts/fixtures/pagamento-entrega.html?mapa`);await p.getByRole('button',{name:'Entregar OS 1 para Entregue',exact:true}).waitFor();await p.evaluate(()=>window.qaFalhaConsulta=true);await p.getByRole('button',{name:'Conferir entrega QA',exact:true}).click();await p.getByRole('button',{name:'Tentar novamente',exact:true}).waitFor();await p.evaluate(()=>window.qaFalhaConsulta=false);await p.getByRole('button',{name:'Tentar novamente',exact:true}).click();await p.getByRole('button',{name:'Já recebi',exact:false}).waitFor();assert.equal((await financeiro()).baixas.length,0);resultados.push({cenario:'Falha de consulta recuperável e sem quitação presumida',ok:true});
 // Entrega pelos detalhes da OS usa a mesma conferência.
 await iniciar();await preencher();await salvar();await p.getByRole('button',{name:'Já recebi',exact:false}).click();await p.getByRole('button',{name:'Confirmar pagamento',exact:true}).click();await p.getByRole('button',{name:'Concluir e imprimir',exact:true}).waitFor();await imprimir('Concluir e imprimir','detalhes-total');
 await p.getByRole('dialog',{name:'Avisar o cliente que está pronto?',exact:true}).getByRole('button',{name:'Fechar',exact:true}).click();
 const osdialog=p.getByRole('dialog',{name:'Ordem de serviço #1',exact:true});
 await osdialog.getByRole('button',{name:'Registrar entrega',exact:true}).click();await p.evaluate(()=>window.qaDialogos=[]);await p.getByRole('button',{name:'Confirmar alteração',exact:true}).click();await p.waitForFunction(()=>JSON.parse(localStorage.getItem('patio_os_v1'))[0].situacao==='delivered');await p.waitForTimeout(350);assert(!(await p.evaluate(()=>window.qaDialogos)).includes('Como ficou o pagamento da OS?'));assert.equal((await financeiro()).baixas.length,1);resultados.push({cenario:'Entrega pelos detalhes não pergunta de novo nem duplica recebimento',ok:true});
 assert.deepEqual(errors,[]);
}catch(e){process.exitCode=1;console.error(e.stack);if(p){await p.screenshot({path:resolve(pasta,'falha.png')});await writeFile(resolve(pasta,'falha.txt'),await p.locator('body').innerText());}}
finally{await browser.close();await new Promise(ok=>server.close(ok));await writeFile(resolve(pasta,'interface.json'),JSON.stringify({ok:!process.exitCode,resultados,errors,ambiente:'Chrome real; dados fictícios persistidos no modo demonstração'},null,2));console.log(JSON.stringify({ok:!process.exitCode,cenarios:resultados.length}));}
