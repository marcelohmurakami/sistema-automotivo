import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build,preview} from './lib/vite-conferencia.mjs';
import {chromium} from './lib/chrome-conferencia.mjs';
const out=resolve(process.env.QA_OUTPUT||'output/revisao-integral-20261119/relogio');
await mkdir(out,{recursive:true});
const config={logLevel:'error',build:{outDir:resolve(out,'build'),rollupOptions:{input:'scripts/fixtures/relogio-componentes.html'}}};
await build(config);
const server=await preview({...config,preview:{host:'127.0.0.1',port:0}});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const resultados=[];let falha;
try{
 for(const largura of [1920,390]){
  const contexto=await browser.newContext({viewport:{width:largura,height:900}}),p=await contexto.newPage(),erros=[];
  p.on('pageerror',e=>erros.push(e.message));
  try{
   await p.clock.install({time:new Date('2026-11-19T12:00:00Z')});
   await p.goto(server.resolvedUrls.local[0]+'scripts/fixtures/relogio-componentes.html');
   await p.waitForFunction(()=>document.querySelectorAll('time').length===100);
   const ler=()=>p.evaluate(()=>({contagens:window.qa.contagens(),tempos:[...document.querySelectorAll('time')].map(x=>Number(x.dataset.instante)),agora:Date.now()}));
   const inicial=await ler();assert.equal(inicial.tempos.length,100);
   await p.clock.runFor(31000);const aposIntervalo=await ler();assert(aposIntervalo.tempos.every(t=>t>Math.max(...inicial.tempos)));
   await p.evaluate(()=>window.qa.visibilidade('hidden'));const oculta=await ler();
   await p.clock.runFor(61000);const aposOculta=await ler();
   await p.evaluate(()=>window.qa.visibilidade('visible'));await p.waitForFunction(()=>Number(document.querySelector('time').dataset.instante)>Date.now()-1000);
   const retorno=await ler();assert(retorno.tempos.every(t=>t>Math.max(...oculta.tempos)));
   await p.clock.runFor(5000);await p.evaluate(()=>window.dispatchEvent(new Event('focus')));const foco=await ler();assert(foco.tempos.every(t=>t>Math.max(...retorno.tempos)));
   await p.getByRole('button',{name:'Desmontar',exact:true}).click();await p.waitForFunction(()=>document.querySelectorAll('time').length===0);const desmontado=await ler();assert.deepEqual(desmontado.contagens,{intervalos:0,foco:0,visibilidade:0});
   await p.clock.runFor(65000);await p.getByRole('button',{name:'Montar',exact:true}).click();await p.waitForFunction(()=>document.querySelectorAll('time').length===100);const remontado=await ler();assert(remontado.tempos.every(t=>t>Math.max(...foco.tempos)));
   if(!process.env.QA_SOURCE_DIR){assert.deepEqual(inicial.contagens,{intervalos:1,foco:1,visibilidade:1});assert.deepEqual(aposOculta.tempos,oculta.tempos);assert.deepEqual(remontado.contagens,{intervalos:1,foco:1,visibilidade:1});}
   assert.deepEqual(erros,[]);
   resultados.push({largura,ok:true,componentes:100,inicial:inicial.contagens,desmontado:desmontado.contagens,remontado:remontado.contagens,atualizacoesAbaOculta:aposOculta.tempos.filter((t,i)=>t!==oculta.tempos[i]).length,verificacoes:['100 prazos ativos','atualização de 30 segundos','retorno da aba','foco','limpeza ao desmontar','remontagem com horário atual','ausência de exceções']});
   console.log('PASS relógio',largura,JSON.stringify(inicial.contagens));
  }finally{await contexto.close();}
 }
}catch(e){falha=e.stack;process.exitCode=1;console.error(falha);}
finally{await browser.close();await new Promise(ok=>server.httpServer.close(ok));await writeFile(resolve(out,'resultados.json'),JSON.stringify({ok:!falha,fonte:process.env.QA_SOURCE_DIR||'src',relogioSimulado:true,resultados,falha},null,2));}
