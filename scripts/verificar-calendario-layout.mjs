import assert from 'node:assert/strict';
import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {build, preview} from './lib/vite-conferencia.mjs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {chromium} from './lib/chrome-conferencia.mjs';

const pasta=resolve(process.env.QA_OUTPUT || 'output/agenda-layout-20261110');
await mkdir(pasta,{recursive:true});
const config={configFile:false,envDir:false,logLevel:'error',plugins:[{
  name:'rpc-ficticio-agenda-layout',enforce:'pre',resolveId(id){
    if(/(?:^|\/)lib\/rpc(?:\.ts)?$/.test(id))return resolve('scripts/fixtures/agenda-layout-rpc.js');
  },
},react(),tailwindcss()],define:{'import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':'""'},build:{outDir:resolve(pasta,'build-fixture'),rollupOptions:{input:'scripts/fixtures/agenda-fluxos.html'}}};
if(!process.argv.includes('--reusar-build'))await build(config);
const server=await preview({...config,preview:{host:'127.0.0.1',port:0}});
let browser;const resultados=[];let falha='';
try{
 const base=server.resolvedUrls.local[0];
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const context=await browser.newContext({locale:'pt-BR',timezoneId:process.env.QA_TZ||'America/Sao_Paulo'});
 await context.route('**/*',async r=>{
  const u=new URL(r.request().url());if(u.origin!==new URL(base).origin)return r.abort();
  const path=resolve(config.build.outDir,'.'+decodeURIComponent(u.pathname));if(!path.startsWith(config.build.outDir+sep))return r.abort();
  try{await r.fulfill({status:200,contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream',body:await readFile(path)});}catch{await r.fulfill({status:404,body:'Não encontrado'});}
 });
 const page=await context.newPage();page.setDefaultTimeout(12000);
 const erros=[];page.on('pageerror',e=>erros.push(e.message));
 const ir=async(perfil)=>{
  await page.setViewportSize({width:1920,height:1080});
  await page.goto(`${base}scripts/fixtures/agenda-fluxos.html?perfil=${perfil}`);
  await page.locator('.cal-oficina').waitFor();
  await page.locator('.cal-oficina-barra input[type=date]').fill('2026-11-10');
  await page.locator('.cal-oficina-evento').first().waitFor();
  await page.evaluate(()=>document.fonts.ready);
 };
 const conferir=async(nome)=>{
  const dados=await page.evaluate(()=>{
   const root=document.querySelector('.cal-oficina'),rect=root.getBoundingClientRect();
   const visivel=e=>e.checkVisibility({checkVisibilityCSS:true});
   const excessos=[...root.querySelectorAll('*')].filter(visivel).flatMap(e=>{
    const r=e.getBoundingClientRect();
    return r.width>0&&(r.left<rect.left-1||r.right>rect.right+1||e.scrollWidth>e.clientWidth+2&&!['svg','path','line','polyline','circle'].includes(e.tagName.toLowerCase())&&getComputedStyle(e).display!=='inline')?[`${e.tagName}.${e.className}`]:[];
   });
   const cards=[...root.querySelectorAll('.cal-oficina-evento')].filter(visivel);
   const cortados=cards.filter(e=>e.scrollHeight>e.clientHeight+2).map(e=>e.textContent);
   const colisao=cards.some((e,i)=>cards.slice(i+1).some(f=>{const a=e.getBoundingClientRect(),b=f.getBoundingClientRect();return a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1;}));
   return {largura:innerWidth,documento:document.documentElement.scrollWidth,excessos,cortados,colisao};
  });
  assert(dados.documento<=dados.largura+1,`${nome}: página larga`);
  assert.deepEqual(dados.excessos,[],`${nome}: elementos fora da grade`);
  assert.deepEqual(dados.cortados,[],`${nome}: texto cortado`);assert(!dados.colisao,`${nome}: cartões sobrepostos`);
  assert.deepEqual(erros,[],`${nome}: exceção de interface`);resultados.push({nome,...dados});
 };
 await ir('mecanica');let perfis=await page.evaluate(()=>window.fixturePerfis);
 if(process.env.QA_PERFIS)perfis=perfis.filter(p=>process.env.QA_PERFIS.split(',').includes(p));
 for(const [i,perfil] of perfis.entries()){
  await ir(perfil);const auto=!(perfil.startsWith('assistencia_')||perfil.startsWith('manutencao_')||perfil.startsWith('limpeza_'));
  const visual=page.getByRole('combobox',{name:'Visualização',exact:true});
  const data=page.locator('.cal-oficina-barra input[type=date]');
  assert.equal(await page.locator('.cal-oficina-semana > section').first().getAttribute('data-dia'),'2026-11-09');
  await page.getByRole('button',{name:'Próximo período',exact:true}).click();assert.equal(await data.inputValue(),'2026-11-17');
  await page.getByRole('button',{name:'Período anterior',exact:true}).click();assert.equal(await data.inputValue(),'2026-11-10');
  for(const visao of ['semana','mes','dia']){
   await visual.selectOption(visao);
   if(visao==='mes'){
    assert.equal(await page.locator('.cal-oficina-mes > section').first().getAttribute('data-dia'),'2026-10-26');
    assert.equal(await page.locator('.cal-oficina-mes > section').nth(6).getAttribute('data-dia'),'2026-11-01');
    if(!auto)await page.waitForFunction(()=>window.fixtureChamadas.some(x=>x.nome==='pagina_servicos'&&x.dados.p_filtros.inicio==='2026-10-26'&&x.dados.p_filtros.fim==='2026-12-07'));
   }
   for(const width of [1920,1366,768,390,320]){
    await page.setViewportSize({width,height:1080});
    await page.evaluate(tema=>document.documentElement.dataset.tema=tema,i%2?'claro':'escuro');
    await conferir(`${perfil}-${visao}-${width}`);
    if(['mecanica','assistencia_celulares','manutencao_climatizacao','limpeza_residencial'].includes(perfil)&&[1920,390].includes(width)){
     await page.locator('.cal-oficina').scrollIntoViewIfNeeded();
     await page.screenshot({path:resolve(pasta,`${perfil}-${visao}-${width}.png`)});
    }
   }
  }
  await page.setViewportSize({width:i%2?390:1366,height:1080});
  const recurso=page.getByRole('combobox',{name:auto?'Box ou responsável':'Profissional / equipe',exact:true});
  await recurso.selectOption(auto?'Equipe principal':'recurso-0');
  assert.equal(await page.locator('.cal-oficina-responsaveis > section').count(),1);
  await page.getByRole('combobox',{name:'Situação',exact:true}).selectOption('cancelado');
  assert.equal(await page.locator('.cal-oficina-evento:visible').count(),0);
  await recurso.selectOption('');await page.locator('.cal-oficina-evento--cancelado').waitFor();
  await page.getByRole('combobox',{name:'Situação',exact:true}).selectOption('');
  await page.locator('.cal-oficina-evento').filter({hasText:'Ana Maria'}).first().click();
  if(auto){
   const detalhe=page.locator('dialog[open]');
   assert(await detalhe.isVisible());
   const largura=await detalhe.evaluate(e=>({w:e.clientWidth,scroll:e.scrollWidth}));
   assert(largura.scroll<=largura.w+2,'Detalhe do agendamento com rolagem lateral');
  }
  if(auto)await page.getByRole('button',{name:'Editar agendamento',exact:true}).click();
  const d=page.locator('dialog[open]');await d.waitFor();
  assert.equal(await d.locator('[name=inicio]').inputValue(),'2026-11-10T09:00');
  await d.locator('[name=inicio]').fill('2026-11-10T10:35');
  await d.locator('[name=fim]').fill('2026-11-10T11:20');
  await page.evaluate(()=>window.fixtureFalharGravacao=true);
  await d.getByRole('button',{name:'Salvar agendamento',exact:true}).click();
  await d.getByText(/horário escolhido está ocupado/).waitFor();assert(await d.isVisible());
  await page.evaluate(()=>window.fixtureFalharGravacao=false);
  await d.getByRole('button',{name:'Salvar agendamento',exact:true}).click();await d.waitFor({state:'hidden'});
  await page.locator('.cal-oficina-evento').filter({hasText:'Ana Maria'}).filter({hasText:'10:35'}).waitFor();
  const salvo=await page.evaluate(()=>window.fixtureGravacoes.at(-1));assert.equal(Date.parse(salvo.dados.p_dados.inicio),Date.parse('2026-11-10T10:35:00-03:00'));
  await recurso.selectOption(auto?'Equipe principal':'recurso-0');
  const grupo=page.locator('.cal-oficina-responsaveis > section');
  await grupo.locator('input[type=time]').fill('13:25');await grupo.getByRole('button',{name:'Agendar',exact:true}).click();await d.waitFor();
  const caixa=await d.evaluate(e=>({w:e.clientWidth,scroll:e.scrollWidth}));assert(caixa.scroll<=caixa.w+2,'Formulário com rolagem lateral');
  assert.equal(await d.locator('[name=inicio]').inputValue(),'2026-11-10T13:25');
  assert.equal(await d.locator(auto?'[name=recurso]':'[name=recurso_id]').inputValue(),auto?'Equipe principal':'recurso-0');
  await d.getByRole('button',{name:'Fechar janela',exact:true}).click();
  await conferir(`${perfil}-filtros-edicao-conflito-atalho`);
  console.log(`${perfil}: 15 larguras/visões + navegação, filtros, edição, erro recuperável e horário personalizado OK`);
 }
}catch(e){falha=e.stack||String(e);throw e;}finally{
 await browser?.close();await server.httpServer.close();
 await writeFile(resolve(pasta,process.env.QA_RELATORIO||'verificacao-layout.json'),JSON.stringify({ok:!falha,falha,resultados},null,2));
}
console.log(JSON.stringify({ok:true,verificacoes:resultados.length}));
