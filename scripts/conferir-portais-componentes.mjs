// Somente leitura: sites e clientes fictícios já existentes. Não aprova propostas ou envia pedidos.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from './lib/chrome-conferencia.mjs';
const base=process.env.QA_URL||'http://127.0.0.1:5190',out=resolve(process.env.QA_OUTPUT||'output/conferencia-final-20261111/portais');await mkdir(out,{recursive:true});
const m=JSON.parse(await readFile('output/sites-demonstracao-20261110/credenciais.local.json','utf8'));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[],componentes=new Set();
async function gravar(){await writeFile(resolve(out,'resultados.json'),JSON.stringify({ok:resultados.every(r=>r.ok),componentesExecutados:[...componentes],resultados},null,2))}
try{
 for(const e of m.empresas){
  assert(e.slug.startsWith('teste-'));const ctx=await browser.newContext({viewport:{width:390,height:844},locale:'pt-BR',serviceWorkers:'block'}),p=await ctx.newPage(),erros=[];p.on('pageerror',x=>erros.push(x.message));p.setDefaultTimeout(30000);
  try{await p.goto(base+'/oficina/'+e.slug);await p.locator('.portal-login').waitFor();for(const width of [1920,390,320]){await p.setViewportSize({width,height:900});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));}await p.screenshot({path:resolve(out,e.perfil+'-publico.png'),fullPage:true});
   resultados.push({perfil:e.perfil,teste:'Site público em 1920, 390 e 320px',ok:true});
   for(const c of e.clientes){await p.locator('.portal-login').getByLabel('E-mail',{exact:true}).fill(c.email);await p.locator('.portal-login').getByLabel('Senha',{exact:true}).fill(c.senha);await p.getByRole('button',{name:'Entrar na área do cliente',exact:true}).click();await p.getByRole('button',{name:'Sair',exact:true}).waitFor();await p.locator('.portal-servicos').first().waitFor();assert(!/INTERNO_SITE|custo_unitario|custo_centavos/.test(await p.locator('#area-cliente').innerText()));assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));for(const n of await p.evaluate(()=>[...(globalThis.__qaComponentes||[])]))componentes.add(n);resultados.push({perfil:e.perfil,teste:'Cliente fictício consulta seus serviços no portal',ok:true});await p.getByRole('button',{name:'Sair',exact:true}).click();await p.locator('.portal-login').waitFor();}
   assert.deepEqual(erros,[]);
  }catch(x){resultados.push({perfil:e.perfil,ok:false,erro:x.message});await p.screenshot({path:resolve(out,e.perfil+'-falha.png')})}finally{await ctx.close();await gravar()}
 }
 // Estados de entrada/ausência de token: nunca transmite redefinição de senha ou aceita convites.
 const ctx=await browser.newContext({viewport:{width:390,height:844},locale:'pt-BR',serviceWorkers:'block'}),p=await ctx.newPage();
 for(const rota of ['/demonstracao-ramos','/previa-site','/cadastro','/recuperar-senha','/definir-senha','/convite','/nova-oficina','/proposta','/aprovar-servico','/vistoria']){try{await p.goto(base+rota);await p.locator('#root > *').waitFor();await p.waitForTimeout(250);assert.equal(await p.getByText('Não conseguimos abrir esta tela.',{exact:true}).count(),0);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));for(const n of await p.evaluate(()=>[...(globalThis.__qaComponentes||[])]))componentes.add(n);resultados.push({rota,teste:'Estado inicial sem sessão ou token',ok:true})}catch(x){resultados.push({rota,ok:false,erro:x.message})}await gravar()}
 await ctx.close();
}finally{await browser.close();await gravar()}
assert(resultados.every(r=>r.ok),'Revisar os resultados dos portais');
