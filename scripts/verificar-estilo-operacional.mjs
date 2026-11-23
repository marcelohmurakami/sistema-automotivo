import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {build,preview} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// PLAYWRIGHT_MODULE allows a bundled runtime; normal development uses the dev dependency.
const modulePath=process.env.PLAYWRIGHT_MODULE;
const {chromium}=await import(modulePath ? pathToFileURL(resolve(modulePath)).href : 'playwright');
const pasta=resolve('output/revisao-estilo-20261029');
await mkdir(pasta,{recursive:true});
const config={configFile:false,envDir:false,plugins:[react(),tailwindcss()],logLevel:'error',define:{'import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':'""'},build:{outDir:'output/revisao-estilo-20261029/fixture-build',rollupOptions:{input:'scripts/fixtures/estilo-operacional.html'}}};
await build(config);
console.log('Fixture compilada com dados fictícios.');
const server=await preview({...config,preview:{host:'127.0.0.1',port:0}});
let browser;
const resultados=[];
try {
 const base=server.resolvedUrls.local[0];
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_BROWSER?{executablePath:process.env.PLAYWRIGHT_BROWSER}:{})});
 const context=await browser.newContext({locale:'pt-BR',timezoneId:'America/Sao_Paulo'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
 const page=await context.newPage();
 const erros=[];page.on('pageerror',e=>erros.push(e.message));
 const visitar=async(tela,tema,largura,extra='')=>{
  await page.setViewportSize({width:largura,height:900});
  await page.goto(`${base}scripts/fixtures/estilo-operacional.html?tela=${tela}&tema=${tema}${extra}`,{timeout:60000});
  await page.locator('main h1').waitFor();await page.evaluate(()=>document.fonts.ready);
  console.log(`${tela} · ${tema} · ${largura}px`);
 };
 const conferir=async(nome)=>{
  const dados=await page.evaluate(()=>{
   const visivel=e=>e.checkVisibility({checkVisibilityCSS:true}) && e.getBoundingClientRect().width>0;
   const excedentes=[...document.querySelectorAll('main *,dialog[open] *')].filter(visivel).filter(e=>{const r=e.getBoundingClientRect();return r.right>innerWidth+1 || r.left< -1;}).map(e=>`${e.tagName}.${e.className}`);
   const checks=[...document.querySelectorAll('input[type=checkbox]')].filter(visivel).map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}));
   return {largura:innerWidth,documento:document.documentElement.scrollWidth,excedentes,checks,font:getComputedStyle(document.body).fontFamily};
  });
  resultados.push({nome,...dados});
  assert.ok(dados.documento<=dados.largura+1,`${nome}: página excede a largura ${JSON.stringify(dados)}`);
  assert.deepEqual(dados.excedentes,[],`${nome}: conteúdo fora da tela`);
  assert.ok(dados.checks.every(c=>c.w<=22&&c.h<=22),`${nome}: checkbox deformado`);
  assert.match(dados.font,/Manrope/,`${nome}: fonte diferente da aplicação`);
  assert.deepEqual(erros,[],`${nome}: erro de renderização`);
 };
 for(const tema of ['claro','escuro']) for(const largura of [320,390,768,1440]) for(const tela of ['contratos','conciliacao','bancos','custos','precos','resultado','lista-contratos','calendarios','agenda']) {
  await visitar(tela,tema,largura);await conferir(`${tela}-${tema}-${largura}`);
  if(largura===390||largura===1440) await page.screenshot({path:resolve(pasta,`${tela}-${tema}-${largura}.png`),fullPage:true});
  if(tela==='contratos'){
   await page.getByRole('button',{name:'Selecionar pendentes da página'}).click();
   await page.getByRole('button',{name:/Gerar 1 cobranças/}).click();
   await page.getByRole('dialog',{name:'Conferir cobranças do mês'}).waitFor();
   await conferir(`confirmacao-${tema}-${largura}`);
   const checkbox=page.getByRole('dialog').getByRole('checkbox'); await checkbox.check();assert.equal(await checkbox.isChecked(),true);
   await page.keyboard.press('Escape');assert.equal(await page.locator('dialog[open]').count(),0);
  }
  if(tela==='bancos'){
   await page.getByRole('button',{name:'Nova conta',exact:true}).click();
   await page.getByRole('dialog',{name:'Nova conta',exact:true}).waitFor();
   await conferir(`nova-conta-${tema}-${largura}`);
  }
  if(tela==='precos'){
   await page.locator('.custo-config > summary').click();
   await conferir(`parametros-${tema}-${largura}`);
   assert.equal(await page.locator('.preco-parametros-grupo input').count(),13);
   if(largura===390) await page.screenshot({path:resolve(pasta,`parametros-${tema}-${largura}.png`),fullPage:true});
  }
  if(tela==='conciliacao'){
   await page.getByRole('button',{name:'Importar extrato'}).click();
   await page.locator('dialog[open]').waitFor();await conferir(`importacao-${tema}-${largura}`);
  }
  if(tela==='lista-contratos'){
   await page.getByRole('button',{name:'Novo contrato',exact:true}).click();await page.locator('dialog[open]').waitFor();await conferir(`cadastro-contrato-${tema}-${largura}`);
   if(largura===390) await page.screenshot({path:resolve(pasta,`cadastro-contrato-${tema}-${largura}.png`),fullPage:true});
   const dados=await page.locator('dialog[open] form').evaluate(form=>Object.fromEntries(new FormData(form)));
   for(const campo of ['franquia_visitas','franquia_minutos','franquia_materiais','excedente_visita','excedente_hora','participacao_visita']) assert.equal(dados[campo],'0',`${campo} preservado quando recolhido`);
   assert.equal(dados.vencimento_dia,'10');
   const opcionais=page.getByText('Franquias, excedentes e equipamentos (opcional)',{exact:true});
   assert.equal(await opcionais.locator('..').getAttribute('open'),null);
   await opcionais.click();await conferir(`contrato-opcionais-${tema}-${largura}`);
   await page.locator('input[name=excedente_hora]').fill('-1');await opcionais.click();
   assert.equal(await page.locator('input[name=excedente_hora]').evaluate(e=>e.reportValidity()),false);
   assert.notEqual(await opcionais.locator('..').getAttribute('open'),null,'erro de validação abre a seção para correção');
  }
  if(tela==='calendarios'){
   await page.getByText('Feriados e dias de fechamento',{exact:true}).click();
   await page.getByRole('button',{name:'Editar calendário'}).click();await page.locator('dialog[open]').waitFor();await conferir(`feriados-${tema}-${largura}`);await page.keyboard.press('Escape');
   await page.getByText('Google Calendar e Outlook',{exact:true}).click();
   await page.getByRole('button',{name:'Criar assinatura da agenda'}).click();await page.locator('dialog[open]').waitFor();await conferir(`assinatura-${tema}-${largura}`);
  }
  if(tela==='agenda'){
   await page.getByText('Feriados e exceções (opcional)',{exact:true}).click();
   await conferir(`recorrencia-${tema}-${largura}`);
   if(largura===390) await page.screenshot({path:resolve(pasta,`recorrencia-${tema}-${largura}.png`),fullPage:true});
  }
 }
 for(const estado of ['vazio','erro']){await visitar('conciliacao','escuro',320,`&estado=${estado}`);await conferir(`conciliacao-${estado}`);}
 await visitar('contratos','escuro',390);
 const perfis=await page.evaluate(()=>window.fixturePerfis);
 for(const perfil of perfis){await visitar('contratos','escuro',390,`&perfil=${perfil}`);await conferir(`perfil-${perfil}`);}
 await page.getByRole('combobox',{name:'O que você quer consultar?'}).selectOption('bancos');
 await page.getByRole('heading',{name:'Contas e saldos'}).waitFor();
 resultados.push({nome:'navegacao-celular',ok:true});
 console.log(`PASS ${resultados.length} verificações de layout e interação em navegador isolado.`);
}finally{
 await writeFile(resolve(pasta,'resultados.json'),JSON.stringify({resultados},null,2));
 await browser?.close();await new Promise(r=>server.httpServer.close(r));
}
