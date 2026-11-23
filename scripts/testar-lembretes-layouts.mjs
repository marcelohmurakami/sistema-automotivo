import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {preview} from 'vite';
import {chromium} from 'playwright';
import {especialidades} from '../src/lib/especialidades.ts';
const out=resolve('output/lembretes-financeiros-20261117'),resultados=[],falhas=[];await mkdir(out,{recursive:true});
const server=await preview({build:{outDir:resolve(out,'build-final')},preview:{host:'127.0.0.1',port:0}}),base=server.resolvedUrls.local[0];
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{for(const [perfil,e] of Object.entries(especialidades))for(const mobile of [false,true]){
 const ctx=await browser.newContext({viewport:{width:mobile?390:1920,height:mobile?844:1080},isMobile:mobile,hasTouch:mobile,locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'}),p=await ctx.newPage(),erros=[];
 p.setDefaultTimeout(20000);p.on('pageerror',e=>erros.push(e.message));
 try{
  await ctx.addInitScript(({perfil,ramo})=>{
   sessionStorage.setItem('patio_demo','sim');sessionStorage.setItem('patio_plano_demo','complete');sessionStorage.setItem('patio_ramo_demo',ramo);localStorage.setItem('patio_tema','escuro');
   const office=ramo==='automotivo'?'demonstracao':'demo-'+ramo;localStorage.setItem('patio_especialidade:'+office,perfil);
   if(!localStorage.getItem('qaInicializado')){
    localStorage.setItem('patio_lembretes:'+office+':demo',JSON.stringify({preferencias:{mostrar_entrada:true,frequencia:'todos',horario:'00:00',conferido_em:null,adiado_ate:null},adiamentos:[]}));
    const titulo={id:crypto.randomUUID(),natureza:'receber',descricao:'QA lembrete layout',categoria:'outras_receitas',valor_centavos:19990,competencia:'2026-11-01',vencimento:'2020-01-01',pessoa:'Cliente fictício',observacoes:'',ordem_servico_id:null,automatico:false,custos_revisados:false,cancelado_em:null,revisao:1,baixado_centavos:0,aberto_centavos:19990};
    localStorage.setItem('patio_financeiro_v1',JSON.stringify({titulos:[titulo],baixas:[]}));localStorage.setItem('qaInicializado','1');
   }
  },{perfil,ramo:e.ramo});
  await p.goto(base);await p.locator('.lembrete-faixa').waitFor();
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Página inicial sem scroll horizontal');
  await p.locator('.lembrete-faixa').getByRole('button',{name:/Conferir contas/}).click();await p.locator('dialog[open] .lembrete-item').filter({hasText:'QA lembrete layout'}).waitFor();
  assert(await p.evaluate(()=>[...document.querySelectorAll('dialog[open]')].every(d=>d.scrollWidth<=d.clientWidth+1)),'Modal sem scroll horizontal');
  if(['retifica','assistencia_celulares','manutencao_climatizacao','limpeza_geral'].includes(perfil))await p.screenshot({path:resolve(out,'layout-'+perfil+(mobile?'-celular':'-desktop')+'.png')});
  await p.locator('dialog[open] .lembrete-item').filter({hasText:'QA lembrete layout'}).getByRole('link',{name:'Registrar agora',exact:true}).click();await p.locator('.fin-form-baixa').waitFor();assert.equal(Number(await p.locator('.fin-form-baixa [name=valor]').inputValue()),199.9);
  assert.deepEqual(erros,[]);resultados.push({perfil,mobile,checks:4,ok:true});console.log('PASS LAYOUT',perfil,mobile?'celular':'desktop');
 }catch(e){falhas.push({perfil,mobile,erro:e.message,erros});await p.screenshot({path:resolve(out,'layout-falha-'+perfil+(mobile?'-celular':'-desktop')+'.png')});console.error('FAIL LAYOUT',perfil,mobile,e.message);}
 finally{await ctx.close();await writeFile(resolve(out,'layouts.json'),JSON.stringify({metodo:'Build completo local em modo demonstração, telas reais dos 26 subsistemas e seus layouts, desktop 1920x1080 e celular 390x844.',resultados,falhas},null,2));}
 if(falhas.length)break;
}}finally{await browser.close();await new Promise(r=>server.httpServer.close(r))}
assert.equal(falhas.length,0);
