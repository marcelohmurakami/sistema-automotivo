// Regressão: a bancada de segurança não pode invalidar os módulos do app aberto.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
const base='http://localhost:5173',out='output/correcao-inicio-20261111';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try {
 const p=await browser.newPage(),modulos=new Set(),erros=[];
 p.on('request',r=>{if(r.url().includes('/.vite-app/deps/')&&r.resourceType()==='script')modulos.add(r.url());});
 p.on('pageerror',e=>erros.push(e.message));
 const c=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.find(c=>c.especialidade==='retifica');
 assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
 await p.goto(base+'/entrar');await p.getByLabel('E-mail',{exact:true}).fill(c.email);await p.getByLabel('Senha',{exact:true}).fill(c.senha);await p.getByRole('button',{name:'Entrar no sistema',exact:true}).click();await p.getByRole('heading',{name:'Mapa da oficina.',exact:true}).waitFor();
 await p.getByRole('region',{name:'Veículos da oficina',exact:true}).waitFor();
 const verificar=async()=>{const hashes={};for(const url of modulos){const r=await fetch(url);assert.equal(r.status,200,url);hashes[new URL(url).pathname]=createHash('sha256').update(await r.text()).digest('hex');}return hashes;};
 assert(modulos.size>5,'Deve carregar módulos reais do servidor local');
 const antes=await verificar();
 const {stdout}=await promisify(execFile)(process.execPath,['scripts/testar-segredos-dev.mjs'],{windowsHide:true,timeout:60000});
 const depois=await verificar();assert.deepEqual(depois,antes,'A bancada não pode remover nem trocar as dependências da sessão ativa');
 await p.reload();await p.getByRole('heading',{name:'Mapa da oficina.',exact:true}).waitFor();await p.getByRole('region',{name:'Veículos da oficina',exact:true}).waitFor();
 assert.equal(await p.getByText('Não conseguimos abrir esta tela.',{exact:true}).count(),0);assert.deepEqual(erros,[]);
 await p.screenshot({path:out+'/apos-bancada-retifica.png'});
 await writeFile(out+'/isolamento-cache.json',JSON.stringify({ok:true,modulosVerificados:modulos.size,cacheInalterado:true,mapaAbriuAposTeste:true,erros,testeSeguranca:stdout},null,2));
 console.log(`PASS: ${modulos.size} módulos intactos; segurança passou; mapa abriu após rodar a bancada.`);
} finally {await browser.close();}
