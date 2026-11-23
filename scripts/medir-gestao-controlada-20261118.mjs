import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build,preview} from './lib/vite-conferencia.mjs';
import react from '@vitejs/plugin-react';import tailwindcss from '@tailwindcss/vite';import {chromium} from 'playwright';
const fase=process.env.QA_FASE||'depois',pasta=resolve('output/gestao-operacao-velocidade-20261118/controlado-'+fase);await mkdir(pasta,{recursive:true});
const config={configFile:false,envDir:false,logLevel:'error',plugins:[{name:'rpc-gestao-ficticio',enforce:'pre',resolveId(id){if(/(?:^|\/)lib\/rpc(?:\.ts)?$/.test(id))return resolve('scripts/fixtures/gestao-tempos-rpc.js')}},react(),tailwindcss()],define:{'import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':'""'},build:{outDir:resolve(pasta,'build'),rollupOptions:{input:'scripts/fixtures/gestao-tempos.html'}}};
await build(config);const server=await preview({...config,preview:{host:'127.0.0.1',port:0}}),url=server.resolvedUrls.local[0];
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[],falhas=[];
try{for(const mobile of [false,true])for(let rodada=0;rodada<3;rodada++)for(const modulo of ['contatos','agenda','qualidade']){
 const ctx=await browser.newContext({viewport:{width:mobile?390:1920,height:mobile?844:1080},locale:'pt-BR',timezoneId:'America/Sao_Paulo'}),p=await ctx.newPage();p.setDefaultTimeout(15000);if(mobile)await(await ctx.newCDPSession(p)).send('Emulation.setCPUThrottlingRate',{rate:4});const erros=[];p.on('pageerror',e=>erros.push(e.message));
 try{await p.goto(url+'scripts/fixtures/gestao-tempos.html?modulo='+modulo);let t,inicioFluxo,cliques=0;
  if(modulo==='contatos'){
   await p.getByRole('button',{name:'Registrar contato',exact:true}).waitFor();inicioFluxo=performance.now();await p.getByRole('button',{name:'Registrar contato',exact:true}).click();cliques++;await p.getByLabel('O que ficou combinado?',{exact:true}).fill('Cliente virá amanhã');t=performance.now();
   await p.getByRole('button',{name:'Salvar acompanhamento',exact:true}).click();cliques++;await p.getByRole('dialog').waitFor({state:'hidden'});await p.getByText('Contatado',{exact:true}).waitFor();
  }else if(modulo==='agenda'){
   await p.getByRole('button',{name:'Novo agendamento',exact:true}).waitFor();inicioFluxo=performance.now();await p.getByRole('button',{name:'Novo agendamento',exact:true}).click();cliques++;const d=p.getByRole('dialog');await d.getByRole('combobox',{name:'Cliente',exact:true}).click();await d.getByRole('option').first().click();cliques+=2;
   await d.locator('[name=identificacao]').fill('Bem QA');await d.locator('[name=recurso]').fill('Equipe QA');await d.locator('[name=servico]').fill('Serviço QA velocidade');const dia=await p.evaluate(()=>new Date().toLocaleDateString('sv-SE'));await d.locator('[name=inicio]').fill(dia+'T09:00');await d.locator('[name=fim]').fill(dia+'T10:37');t=performance.now();
   await d.getByRole('button',{name:'Salvar agendamento',exact:true}).click();cliques++;await d.waitFor({state:'hidden'});await p.getByText('Serviço QA velocidade',{exact:true}).first().waitFor();
  }else{
   await p.getByRole('heading',{name:/Qualidade|Garantia/}).first().waitFor();const busca=p.getByPlaceholder('Cliente, número ou descrição',{exact:true});await busca.waitFor();await p.waitForTimeout(80);inicioFluxo=t=performance.now();await busca.pressSequentially('clienteqa',{delay:40});await p.waitForTimeout(320);
  }
  const segundos=(performance.now()-t)/1000,segundosFluxo=(performance.now()-inicioFluxo)/1000,consulta=await p.evaluate(()=>window.qaChamadas.filter(x=>x.nome==='listar_acompanhamentos_qualidade').length),gravacoes=await p.evaluate(()=>window.qaChamadas.filter(x=>['operar_produtividade','acompanhar_oportunidade'].includes(x.nome)).length);
  if(modulo!=='qualidade'){assert.equal(gravacoes,1);await p.waitForFunction(()=>window.qaAlertas>=2)}
  assert.deepEqual(erros,[]);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));resultados.push({fase,modulo,mobile,rodada,segundos,segundosFluxo,cliques,gravacoes,consultasBusca:consulta,ok:true});console.log('PASS',fase,modulo,mobile,segundos.toFixed(3));
 }catch(e){falhas.push({modulo,mobile,rodada,erro:e.message,erros});await p.screenshot({path:resolve(pasta,`${modulo}-${mobile}-${rodada}-falha.png`)});await writeFile(resolve(pasta,`${modulo}-${mobile}-${rodada}-falha.txt`),await p.locator('body').innerText());throw e}finally{await ctx.close()}
}}finally{await browser.close();await new Promise(r=>server.httpServer.close(r));await writeFile(resolve(pasta,'resultado.json'),JSON.stringify({fase,ambiente:'Componentes reais; transporte fictício com gravação 100 ms, leitura 100 ms e sininho 1.800 ms. Não representa latência do servidor publicado.',resultados,falhas},null,2))}
