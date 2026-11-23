import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='output/correcao-inicio-20261111';
await mkdir(out,{recursive:true});
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.filter(c=>process.env.QA_PERFIS==='todos'||(process.env.QA_PERFIS||'mecanica,retifica,assistencia_celulares,manutencao_climatizacao,limpeza_geral').split(',').includes(c.especialidade));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const resultados=[];
try{for(const base of (process.env.QA_URLS||'http://localhost:5173,https://patio-gestao-peach.vercel.app').split(',')){for(const conta of contas){
 assert(conta.empresa.startsWith('ZZ [TESTE 20261019] '));
 const ctx=await browser.newContext({viewport:{width:1440,height:900},locale:'pt-BR'}),page=await ctx.newPage();
 const erros=[];page.on('pageerror',e=>erros.push(e.stack));page.on('console',m=>{if(m.type()==='error')erros.push(m.text());});
 const falhas=[];page.on('requestfailed',r=>falhas.push({path:new URL(r.url()).pathname,erro:r.failure()?.errorText}));
 let erro='';try{await page.goto(base+'/entrar');await page.getByLabel('E-mail',{exact:true}).fill(conta.email);await page.getByLabel('Senha',{exact:true}).fill(conta.senha);await page.getByRole('button',{name:'Entrar no sistema',exact:true}).click();await page.waitForURL(u=>!u.pathname.startsWith('/entrar'),{timeout:30000});await page.waitForTimeout(2500);}catch(e){erro=e.message;}
 const tela=await page.locator('body').innerText();
 const r={base,perfil:conta.especialidade,ok:!erro&&!tela.includes('Não conseguimos abrir esta tela.'),erro,erros,falhas,tela:tela.slice(0,1500)};resultados.push(r);
 await page.screenshot({path:`${out}/${base.includes('localhost')?'local':'publicado'}-${conta.especialidade}.png`});
 console.log(JSON.stringify({base,perfil:r.perfil,ok:r.ok,erro:r.erro,erros:r.erros,falhas:r.falhas}));await ctx.close();await writeFile(`${out}/${process.env.QA_RESULTADO||'diagnostico'}.json`,JSON.stringify(resultados,null,2));
}}}finally{await browser.close();}
