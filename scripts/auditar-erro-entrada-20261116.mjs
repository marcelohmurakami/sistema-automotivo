import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const out=process.env.QA_OUTPUT||'output/regressao-assistencia-manutencao-limpeza-20261116/login';await mkdir(out,{recursive:true});
const base=process.env.QA_URL||'http://127.0.0.1:5198';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[];
try{for(const width of [320,390,1920])for(const [caso,status,code,texto] of [
 ['servidor',500,'unexpected_failure','O acesso está temporariamente indisponível. Aguarde um pouco e tente novamente.'],
 ['credenciais',400,'invalid_credentials','Não foi possível entrar. Confira seu e-mail e senha.'],
 ['limite',429,'over_request_rate_limit','Muitas tentativas de acesso. Aguarde um pouco e tente novamente.'],
 ['confirmacao',400,'email_not_confirmed','Confirme seu e-mail pelo link recebido antes de entrar.'],
 ['rede',0,'','Não foi possível conectar agora. Verifique a conexão e tente novamente.'],
 ]){
 const ctx=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});const p=await ctx.newPage();p.setDefaultTimeout(30000);
 // Respostas controladas. Nenhuma tentativa é enviada ao serviço de autenticação.
 await ctx.route('https://hzihxtjirttetnfdujcx.supabase.co/auth/v1/token**',route=>status?route.fulfill({status,headers:{'x-supabase-api-version':'2024-01-01'},contentType:'application/json',body:JSON.stringify({code,error_code:code,message:'PRIVATE_DIAGNOSTIC_NOT_FOR_USER'})}):route.abort('internetdisconnected'));
 await p.goto(base+'/entrar',{waitUntil:'domcontentloaded'});await p.getByLabel('E-mail',{exact:true}).fill('qa-login@example.invalid');await p.getByLabel('Senha',{exact:true}).fill('dummy-qa-password');await p.getByRole('button',{name:'Entrar no sistema',exact:true}).click();
 await p.getByRole('alert').filter({hasText:texto}).waitFor();assert.equal(await p.getByLabel('E-mail',{exact:true}).inputValue(),'qa-login@example.invalid');assert(await p.getByRole('button',{name:'Entrar no sistema',exact:true}).isEnabled());assert(!(await p.locator('body').innerText()).includes('PRIVATE_DIAGNOSTIC'));
 assert(await p.evaluate(w=>innerWidth===w&&document.documentElement.scrollWidth<=w+2,width));await p.screenshot({path:`${out}/${caso}-${width}.png`});resultados.push({caso,width,ok:true,texto});console.log('PASS',caso,width);await ctx.close();
 }}finally{await browser.close();await writeFile(out+'/resultados.json',JSON.stringify({url:base,ok:resultados.length===15,resultados},null,2))}
