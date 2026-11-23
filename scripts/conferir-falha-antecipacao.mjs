import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),out='output/agilidade-20261111/falha-antecipacao.json';let resultado;
try{
 const c=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.find(c=>c.especialidade==='retifica');assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
 const ctx=await browser.newContext({serviceWorkers:'block'}),p=await ctx.newPage();let tentativas=0;const erros=[];p.on('pageerror',e=>erros.push(e.message));
 await p.route('**/assets/Clientes-*.js',async route=>{tentativas++;if(tentativas===1)return route.abort('internetdisconnected');await route.continue();});
 await p.goto('http://127.0.0.1:5189/entrar');await p.getByLabel('E-mail',{exact:true}).fill(c.email);await p.getByLabel('Senha',{exact:true}).fill(c.senha);await p.getByRole('button',{name:'Entrar no sistema',exact:true}).click();await p.waitForURL(u=>!u.pathname.startsWith('/entrar'));await p.locator('main h1').waitFor();
 const link=p.locator('aside a[href="/clientes"]').first();await link.hover();await p.waitForTimeout(600);assert(tentativas>=1);assert.deepEqual(erros,[]);
 await link.click();await p.getByRole('button',{name:'Novo cliente',exact:true}).waitFor({timeout:20000});assert.deepEqual(erros,[]);
 resultado={ok:true,tentativas,checks:['Falha de rede durante a antecipação não derruba a tela atual','Navegação recupera o código ao clicar','Sem exceção JavaScript']};await ctx.close();
}catch(e){resultado={ok:false,erro:e.stack};process.exitCode=1;console.error(e.stack);}finally{await browser.close();await writeFile(out,JSON.stringify(resultado,null,2));console.log(JSON.stringify(resultado));}
