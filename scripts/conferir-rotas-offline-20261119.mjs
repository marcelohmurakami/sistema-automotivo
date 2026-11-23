import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {preview,loadConfigFromFile} from 'vite';
import {chromium} from './lib/chrome-conferencia.mjs';
import {createClient} from '@supabase/supabase-js';
import {sessaoQa} from './sessoes-qa-concorrencia-20261116.mjs';
const out=resolve('output/offline-picos-20261119/rotas');await mkdir(out,{recursive:true});
const env=Object.fromEntries((await readFile('.env.local','utf8')).split(/\r?\n/).filter(l=>/^VITE_SUPABASE_/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json')).contas;
const configuration=await loadConfigFromFile({command:'serve',mode:'production'},resolve('vite.config.ts'));
const server=await preview({...configuration.config,configFile:false,build:{...configuration.config.build,outDir:resolve('output/offline-picos-20261119/build-depois')},preview:{host:'127.0.0.1',port:0}});
const base=server.resolvedUrls.local[0],browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[],falhas=[];
const guardar=()=>writeFile(resolve(out,'resultado.json'),JSON.stringify({ok:falhas.length===0,metodo:'UI compilada local, Supabase publicado e contas fictícias; navegação SPA offline → sistema → offline, histórico e rota antiga; não grava registros.',resultados,falhas},null,2));
try{
 for(const c of contas){
  assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
  const session=await sessaoQa(createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),c);
  for(const mobile of [false,true]){
   const ctx=await browser.newContext({viewport:{width:mobile?390:1920,height:mobile?844:1080},isMobile:mobile,hasTouch:mobile,locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
   await ctx.addInitScript(({session,base})=>{if(location.origin===new URL(base).origin)localStorage.setItem('sb-hzihxtjirttetnfdujcx-auth-token',JSON.stringify(session))},{session,base});
   const p=await ctx.newPage(),errors=[],checks=[];p.setDefaultTimeout(30000);p.on('pageerror',e=>errors.push(e.message));
   try{
    await p.goto(base+'execucao-offline');await p.locator('.offline-resumo').getByText(c.empresa,{exact:true}).waitFor();
    const origem=await p.evaluate(()=>performance.timeOrigin);
    await p.getByRole('link',{name:'← Voltar ao sistema',exact:true}).click();
    await p.locator('input[aria-label="Encontrar no menu"]').first().waitFor({state:'attached'});
    assert(!await p.getByRole('heading',{name:'Trabalhar sem internet',exact:true}).isVisible());checks.push('Voltar carrega o sistema mantendo sessão e empresa');
    if(mobile)await p.getByRole('button',{name:'Abrir menu',exact:true}).click();
    await p.locator('input[aria-label="Encontrar no menu"]:visible').fill('sem internet');
    await p.locator('a[href="/execucao-offline"]:visible').first().click();
    await p.locator('.offline-resumo').getByText(c.empresa,{exact:true}).waitFor();
    assert.equal(await p.evaluate(()=>performance.timeOrigin),origem);checks.push('Menu reabre offline sem recarregar página ou sessão');
    await p.goBack();await p.locator('input[aria-label="Encontrar no menu"]').first().waitFor({state:'attached'});
    await p.goForward();await p.getByRole('heading',{name:'Trabalhar sem internet',exact:true}).waitFor();checks.push('Voltar e avançar do navegador preservados');
    await p.goto(base+'rascunhos');await p.waitForURL('**/execucao-offline');await p.locator('.offline-resumo').getByText(c.empresa,{exact:true}).waitFor();checks.push('Rota antiga redireciona corretamente');
    assert.deepEqual(errors,[]);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));checks.push('Sem erro JavaScript ou excesso horizontal');
    resultados.push({perfil:c.especialidade,mobile,checks});console.log('PASS',c.especialidade,mobile?'celular':'desktop');
   }catch(e){falhas.push({perfil:c.especialidade,mobile,erro:e.message,errors});await p.screenshot({path:resolve(out,`falha-${c.especialidade}-${mobile}.png`)}).catch(()=>{});console.log('FALHA',c.especialidade,mobile,e.message.split('\n')[0])}
   finally{await ctx.close();await guardar()}
  }
 }
}finally{await browser.close();await new Promise(r=>server.httpServer.close(r));await guardar()}
assert.deepEqual(falhas,[]);assert.equal(resultados.length,52);
