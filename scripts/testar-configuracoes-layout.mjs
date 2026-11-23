import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build,preview} from './lib/vite-conferencia.mjs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {chromium} from './lib/chrome-conferencia.mjs';
const pasta=resolve(process.env.QA_OUTPUT || 'output/configuracoes-layout-20261109');
await mkdir(pasta,{recursive:true});
const config={configFile:false,envDir:false,plugins:[react(),tailwindcss()],logLevel:'error',define:{'import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':'""'},build:{outDir:resolve(pasta,'fixture-build'),rollupOptions:{input:'scripts/fixtures/configuracoes.html'}}};
await build(config);
const server=await preview({...config,preview:{host:'127.0.0.1',port:0}});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const context=await browser.newContext({locale:'pt-BR'}),page=await context.newPage(),base=server.resolvedUrls.local[0],resultados=[],erros=[];
page.on('pageerror',e=>erros.push(e.message));
await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
const secoes=['empresa','especialidade','documentos','aparencia','conta'];
const nomes=['Dados da empresa','Especialidade','Logo e documentos','Aparência','Conta e plano'];
async function escolher(id){const i=secoes.indexOf(id);if(await page.locator('.configuracoes-menu-mobile').isVisible())await page.getByLabel('O que deseja configurar?').selectOption(id);else await page.locator('.configuracoes-menu').getByRole('button',{name:nomes[i],exact:true}).click();await page.locator('#config-'+id).waitFor();if(id==='documentos')await page.getByLabel('Cor dos documentos').waitFor();if(id==='especialidade')await page.locator('#config-especialidade select').waitFor();}
async function conferir(nome){
 const d=await page.evaluate(()=>{
  const els=[...document.querySelectorAll('.configuracoes-pagina *')].filter(e=>e.checkVisibility({checkVisibilityCSS:true}));
  return{largura:innerWidth,documento:document.documentElement.scrollWidth,paineis:document.querySelectorAll('.configuracoes-painel:not([hidden])').length,excedentes:els.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.left< -1||r.right>innerWidth+1);}).map(e=>e.tagName+'.'+e.className),campos:els.filter(e=>e.matches('input:not([type=color]),select,textarea')).map(e=>({h:e.getBoundingClientRect().height,w:e.getBoundingClientRect().width})),botoes:els.filter(e=>e.matches('button')).map(e=>({texto:e.textContent,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})),errosTexto:document.body.innerText.includes('Não conseguimos abrir esta tela')};
 });
 assert(d.documento<=d.largura+1,nome+': scroll horizontal');assert.equal(d.paineis,1);assert.deepEqual(d.excedentes,[],nome+': overflow');assert(!d.errosTexto);assert(d.campos.every(c=>c.h>=44&&c.w>=65),nome+': campo comprimido');assert(d.botoes.every(b=>b.h>=40),nome+': alvo pequeno');assert.deepEqual(erros,[]);resultados.push({nome,...d});
}
try{
 await page.goto(base+'scripts/fixtures/configuracoes.html');await page.getByLabel('Nome fantasia da empresa').waitFor();
 const perfis=await page.evaluate(()=>window.fixturePerfis);
 for(const perfil of perfis){
  for(const width of [1920,390]){
   await page.setViewportSize({width,height:900});await page.goto(`${base}scripts/fixtures/configuracoes.html?perfil=${perfil}`);await page.getByLabel('Nome fantasia da empresa').waitFor();await page.evaluate(()=>document.fonts.ready);
   for(const id of secoes){await escolher(id);await conferir(`${perfil}-${width}-${id}`);}
  }
 }
 for(const tema of ['claro','escuro'])for(const width of [320,768,1024,1366]){
  await page.setViewportSize({width,height:900});await page.goto(`${base}scripts/fixtures/configuracoes.html?tema=${tema}`);await page.getByLabel('Nome fantasia da empresa').waitFor();
  for(const id of secoes){await escolher(id);await conferir(`${tema}-${width}-${id}`);}
 }
 await page.setViewportSize({width:1366,height:900});await escolher('empresa');
 await page.getByLabel('Nome fantasia da empresa').fill('Empresa QA layout');await escolher('documentos');await escolher('empresa');assert.equal(await page.getByLabel('Nome fantasia da empresa').inputValue(),'Empresa QA layout');
 await page.getByRole('button',{name:'Salvar dados da empresa'}).click();await page.getByRole('status').filter({hasText:'Dados da empresa atualizados.'}).waitFor();
 await page.reload();await page.getByLabel('Nome fantasia da empresa').waitFor();assert.equal(await page.getByLabel('Nome fantasia da empresa').inputValue(),'Empresa QA layout');resultados.push({nome:'salvar-empresa-persistencia-e-troca-secao',ok:true});
 await escolher('especialidade');await page.locator('#config-especialidade select').selectOption('retifica');await page.getByRole('button',{name:'Salvar especialidade'}).click();await page.getByRole('status').filter({hasText:'Especialidade atualizada'}).waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('patio_especialidade:qa-config-mecanica')),'retifica');resultados.push({nome:'salvar-especialidade',ok:true});
 await escolher('documentos');
 const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=100;c.height=100;const x=c.getContext('2d');x.fillStyle='#246346';x.fillRect(0,0,100,100);return c.toDataURL('image/png').split(',')[1];}),'base64');
 await page.getByLabel('Logo (PNG ou JPG, até 5 MB)',{exact:true}).setInputFiles({name:'logo-teste.png',mimeType:'image/png',buffer:png});await page.getByAltText('Prévia da logo da empresa').waitFor();
 await page.getByLabel('QR Code Pix da empresa (PNG ou JPG, até 5 MB)',{exact:true}).setInputFiles({name:'imagem-teste.png',mimeType:'image/png',buffer:png});await page.getByAltText('QR Code Pix cadastrado').waitFor();
 await page.getByLabel('Mensagem no final do documento').fill('Obrigado pela preferência.');await page.getByLabel('Cor dos documentos').fill('#316845');
 await escolher('conta');await escolher('documentos');assert.equal(await page.getByLabel('Mensagem no final do documento').inputValue(),'Obrigado pela preferência.');
 await page.getByRole('button',{name:'Salvar identidade',exact:true}).click();await page.getByRole('status').filter({hasText:'Logo e identidade salvas'}).waitFor();
 await page.reload();await escolher('documentos');await page.getByAltText('Prévia da logo da empresa').waitFor();await page.getByAltText('QR Code Pix cadastrado').waitFor();assert.equal(await page.getByLabel('Mensagem no final do documento').inputValue(),'Obrigado pela preferência.');assert.equal(await page.getByLabel('Cor dos documentos').inputValue(),'#316845');resultados.push({nome:'envio-imagens-rodape-cor-salvamento-persistencia',ok:true});
 await page.getByRole('button',{name:'Remover logo',exact:true}).click();await page.getByRole('button',{name:'Remover QR Code Pix',exact:true}).click();assert.equal(await page.locator('.identidade-previa img').count(),0);await page.getByRole('button',{name:'Salvar identidade',exact:true}).click();await page.getByRole('status').filter({hasText:'Logo e identidade salvas'}).waitFor();resultados.push({nome:'remover-imagens-e-salvar',ok:true});
 await escolher('aparencia');for(const [nome,tema] of [['Claro','claro'],['Escuro','escuro'],['Automático','sistema']]){await page.getByRole('button',{name:nome,exact:true}).click();assert.equal(await page.getByRole('button',{name:nome,exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await page.evaluate(()=>localStorage.getItem('patio_tema')),tema);resultados.push({nome:'tema-'+tema,ok:true});}
 await page.goto(`${base}scripts/fixtures/configuracoes.html?staff=1`);await page.getByLabel('Nome fantasia da empresa').waitFor();assert(await page.getByLabel('Nome fantasia da empresa').isDisabled());await escolher('especialidade');assert(await page.locator('#config-especialidade select').isDisabled());await escolher('documentos');assert(await page.getByLabel('Cor dos documentos').isDisabled());resultados.push({nome:'funcionario-sem-permissao-edicao',ok:true});
 await writeFile(resolve(pasta,'interface.json'),JSON.stringify({ok:true,tipo:'interface isolada com persistência local; nenhuma gravação em empresas reais',resultados},null,2));console.log(JSON.stringify({ok:true,verificacoes:resultados.length}));
}catch(e){await page.screenshot({path:resolve(pasta,'falha-fixture.png'),fullPage:true});await writeFile(resolve(pasta,'interface-falha.json'),JSON.stringify({ok:false,erro:e.message,resultados,erros},null,2));throw e;}finally{await browser.close();await server.httpServer.close();}
