import {iniciarJornada,concluirJornada} from "./lib/medir-jornadas.mjs";
import assert from 'node:assert/strict';
import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {build, preview} from './lib/vite-conferencia.mjs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {chromium} from './lib/chrome-conferencia.mjs';

const pasta=resolve(process.env.QA_OUTPUT || 'output/agendamento-separado-20261103');
const somenteLayout=process.argv.includes('--somente-layout');
await mkdir(pasta,{recursive:true});
const config={configFile:false,envDir:false,logLevel:'error',plugins:[{
  name:'rpc-ficticio-agenda',enforce:'pre',resolveId(id){
    if(/(?:^|\/)lib\/rpc(?:\.ts)?$/.test(id)) return resolve('scripts/fixtures/agenda-rpc.js');
  },
},react(),tailwindcss()],define:{'import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':'""'},build:{outDir:resolve(pasta,'build'),rollupOptions:{input:'scripts/fixtures/agenda-fluxos.html'}}};
if(!process.argv.includes('--reusar-build')) await build(config);
console.log('Páginas compiladas com transporte fictício.');
const server=await preview({...config,preview:{host:'127.0.0.1',port:0}});
let browser;
let sucesso=false;
let falha='';
const resultados=[];
try {
  const base=server.resolvedUrls.local[0];
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_BROWSER?{executablePath:process.env.PLAYWRIGHT_BROWSER}:{})});
  const context=await browser.newContext({locale:'pt-BR',timezoneId:'America/Sao_Paulo'});
  // Entrega arquivos da compilação diretamente ao navegador, inclusive em ambientes
  // sem permissão de loopback. Nenhuma chamada sai para a rede.
  await context.route('**/*',async r=>{
    const url=new URL(r.request().url());
    if(url.origin!==new URL(base).origin)return r.abort();
    const arquivo=resolve(config.build.outDir,'.'+decodeURIComponent(url.pathname));
    if(!arquivo.startsWith(config.build.outDir+sep))return r.abort();
    const tipos={'.html':'text/html','.js':'application/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'};
    try { await r.fulfill({status:200,contentType:tipos[extname(arquivo)]||'application/octet-stream',body:await readFile(arquivo)}); }
    catch { await r.fulfill({status:404,body:'Arquivo não encontrado'}); }
  });
  const page=await context.newPage();
  const erros=[];page.on('pageerror',e=>erros.push(e.message));
  const ir=async(perfil,largura=1440,tema='escuro',extra='')=>{
    await page.setViewportSize({width:largura,height:1080});
    await page.goto(`${base}scripts/fixtures/agenda-fluxos.html?perfil=${perfil}&tema=${tema}${extra}`);
    await page.getByRole('button',{name:'Novo agendamento',exact:true}).waitFor();
    await page.evaluate(()=>document.fonts.ready);
  };
  const conferir=async(nome)=>{
    const d=await page.evaluate(()=>{
      const dialogo=document.querySelector('dialog[open]');
      const fora=dialogo?[...dialogo.querySelectorAll('*')].filter(e=>e.checkVisibility({checkVisibilityCSS:true})).filter(e=>{const r=e.getBoundingClientRect(),b=dialogo.getBoundingClientRect();return r.width>0&&(r.left<b.left-1||r.right>b.right+1);}).map(e=>`${e.tagName}.${e.className}`):[];
      const checks=[...document.querySelectorAll('input[type=checkbox]')].filter(e=>e.checkVisibility({checkVisibilityCSS:true})).map(e=>({largura:e.getBoundingClientRect().width,altura:e.getBoundingClientRect().height}));
      return {largura:innerWidth,documento:document.documentElement.scrollWidth,fora,checks};
    });
    assert.ok(d.documento<=d.largura+1,`${nome}: página excede a largura`);
    assert.deepEqual(d.fora,[],`${nome}: conteúdo fora do diálogo`);
    assert.ok(d.checks.every(c=>c.largura<=24&&c.altura<=24),`${nome}: checkbox deformado`);
    assert.deepEqual(erros,[],`${nome}: erros de renderização`);
    resultados.push({nome,...d});
  };
  const abrir=async(recorrente)=>{
    await page.getByRole('button',{name:recorrente?'Agendamento recorrente':'Novo agendamento',exact:true}).click();
    const dialogo=page.getByRole('dialog',{name:recorrente?'Agendamento recorrente':'Novo agendamento',exact:true});
    await dialogo.waitFor();return dialogo;
  };
  const preencher=async(dialogo,auto,comFim=true)=>{
    await dialogo.getByRole('combobox',{name:auto?'Cliente':'Atendimento',exact:true}).click();
    await dialogo.getByRole('option').first().click();
    if(auto){
      await dialogo.locator('[name=identificacao]').fill('Bem do cliente');
      await dialogo.locator('[name=recurso]').fill('Equipe de teste');
      await dialogo.locator('[name=servico]').fill('Serviço de teste');
    }else await dialogo.locator('[name=recurso_id]').selectOption('recurso-qa');
    await dialogo.locator('[name=inicio]').fill('2026-11-10T09:00');
    if(comFim) await dialogo.locator('[name=fim]').fill('2026-11-10T10:00');
  };
  const gravar=async(dialogo,recorrente)=>{
    await dialogo.getByRole('button',{name:recorrente?'Salvar agendamentos recorrentes':'Salvar agendamento',exact:true}).click();
    await dialogo.waitFor({state:'hidden'});
    return await page.evaluate(()=>window.fixtureGravacoes.at(-1));
  };
  await ir('mecanica');
  const perfis=await page.evaluate(()=>window.fixturePerfis);
  if(!somenteLayout){
  for(const [i,perfil] of perfis.entries()) {
    await ir(perfil,i%2?390:1440,i%3?'escuro':'claro');
    iniciarJornada("Agenda: agendamento único e recorrente, salvar e conferir",perfil);
    const auto=i<10;
    if(perfil==='mecanica')await page.screenshot({path:resolve(pasta,'agenda-acoes.png')});
    let d=await abrir(false);
    assert.equal(await d.locator('[name=quantidade],[name=regra_calendario]').count(),0);
    assert.equal(await d.getByText('Feriados e exceções (opcional)',{exact:true}).count(),0);
    await preencher(d,auto,!auto);
    await conferir(`${perfil}-unico`);
    if(perfil==='mecanica')await page.screenshot({path:resolve(pasta,'agendamento-unico.png')});
    let salvo=await gravar(d,false);
    assert.equal(salvo.nome,auto?'operar_produtividade':'salvar_agenda_servico');
    if(auto){assert.equal(salvo.dados.p_acao,'salvar_agenda');assert.equal(salvo.dados.p_dados.fim,null);}
    assert.equal(salvo.dados.p_dados.regra_calendario,undefined);
    d=await abrir(true);
    assert.equal(await d.locator('[name=quantidade]').inputValue(),'4');
    assert.equal(await d.getByText('Feriados e exceções (opcional)',{exact:true}).locator('..').getAttribute('open'),null);
    await preencher(d,auto);
    await d.getByRole('button',{name:'Ver datas previstas',exact:true}).click();
    await d.getByLabel('Datas previstas',{exact:true}).waitFor();
    await conferir(`${perfil}-recorrente`);
    if(['mecanica','assistencia_celulares','manutencao_climatizacao','limpeza_residencial'].includes(perfil)){
      await d.evaluate(e=>e.scrollTop=0);
      await page.screenshot({path:resolve(pasta,`${perfil}-recorrente.png`)});
    }
    salvo=await gravar(d,true);
    assert.equal(salvo.nome,perfil.startsWith('limpeza_')?'programar_visitas_limpeza':'programar_agenda_calendario');
    assert.equal(salvo.dados.p_quantidade,4);
    assert.equal(salvo.dados.p_dados.regra_calendario.frequencia,'semanal');
    d=await abrir(false);
    assert.equal(await d.locator('[name=regra_calendario]').count(),0,'série anterior não contamina cadastro único');
    await d.getByRole('button',{name:'Fechar janela'}).click();
    concluirJornada();console.log(`OK ${perfil}: único e recorrente.`);
  }
  // Interações e regressões que não dependem do vocabulário do perfil.
  for(const perfil of ['mecanica','assistencia_celulares','manutencao_climatizacao','limpeza_residencial']){
    await ir(perfil,390);
    let d=await abrir(true);
    await preencher(d,perfil==='mecanica');
    await d.locator('[name=quantidade]').fill('1');
    assert.equal(await d.locator('[name=quantidade]').evaluate(e=>e.checkValidity()),false);
    await d.locator('[name=quantidade]').fill('3');
    await d.getByRole('combobox',{name:'Frequência',exact:true}).selectOption('mensal');
    await d.getByRole('combobox',{name:'Em qual dia do mês?',exact:true}).selectOption('semana');
    await d.getByText('Feriados e exceções (opcional)',{exact:true}).click();
    await d.getByLabel('Data a alterar',{exact:true}).fill('2026-12-08');
    await d.getByRole('combobox',{name:'O que fazer nesta data?',exact:true}).selectOption('mover');
    assert.equal(await d.getByRole('button',{name:'Adicionar exceção'}).isDisabled(),true);
    await d.getByLabel('Nova data',{exact:true}).fill('2026-12-09');
    await d.getByRole('button',{name:'Adicionar exceção'}).click();
    assert.equal(JSON.parse(await d.locator('[name=regra_calendario]').inputValue()).excecoes['2026-12-08'].data,'2026-12-09');
    await conferir(`${perfil}-excecoes`);
    await d.getByRole('button',{name:'Remover exceção de 08/12/2026'}).click();
    await d.getByLabel('Data a alterar',{exact:true}).fill('2026-12-08');
    await d.getByRole('combobox',{name:'O que fazer nesta data?',exact:true}).selectOption('pular');
    await d.getByRole('button',{name:'Adicionar exceção'}).click();
    await d.getByRole('button',{name:'Ver datas previstas'}).click();
    await d.getByLabel('Datas previstas',{exact:true}).waitFor();
    await d.locator('[name=inicio]').fill('2026-11-10T08:00');
    assert.equal(await d.getByLabel('Datas previstas',{exact:true}).count(),0,'prévia anterior é descartada ao mudar horário');
    await page.evaluate(()=>window.fixtureFalharPrevia=true);
    await d.getByRole('button',{name:'Ver datas previstas'}).click();
    await d.getByRole('alert').filter({hasText:'Não foi possível conferir'}).waitFor();
    await page.evaluate(()=>window.fixtureFalharPrevia=false);
    await d.getByRole('button',{name:'Ver datas previstas'}).click();
    await d.getByLabel('Datas previstas',{exact:true}).waitFor();
    await page.evaluate(()=>window.fixtureFalharGravacao=true);
    await d.getByRole('button',{name:'Salvar agendamentos recorrentes'}).click();
    await d.getByRole('alert').filter({hasText:'O horário escolhido'}).first().waitFor();
    assert.equal(await d.locator('[name=quantidade]').inputValue(),'3','erro preserva preenchimento');
    await page.evaluate(()=>window.fixtureFalharGravacao=false);
    if(perfil==='limpeza_residencial') await d.getByLabel('Como organizar as visitas?').selectOption('mesmo');
    const salvo=await gravar(d,true);
    assert.equal(salvo.nome,'programar_agenda_calendario');
    assert.equal(salvo.dados.p_dados.regra_calendario.excecoes['2026-12-08'].acao,'pular');
    assert.equal(salvo.dados.p_dados.regra_calendario.mensal,'semana');
    await ir(perfil,390,'escuro','&papel=staff');
    assert.equal(await page.getByRole('button',{name:'Agendamento recorrente',exact:true}).count(),0);
    d=await abrir(false);assert.equal(await d.locator('[name=quantidade]').count(),0);
    resultados.push({nome:`${perfil}-validacao-erros-e-permissoes`,ok:true});
  }
  }
  for(const tema of ['claro','escuro'])for(const largura of [320,390,768,1920])for(const perfil of ['mecanica','assistencia_celulares','manutencao_climatizacao','limpeza_residencial']){
    await ir(perfil,largura,tema);
    await conferir(`${perfil}-${largura}-${tema}-pagina`);
    const d=await abrir(true);
    await conferir(`${perfil}-${largura}-${tema}-recorrente`);
    await d.getByText('Feriados e exceções (opcional)',{exact:true}).click();
    await conferir(`${perfil}-${largura}-${tema}-excecoes`);
    if(largura===320||largura===1920){await d.evaluate(e=>e.scrollTop=0);await page.screenshot({path:resolve(pasta,`${perfil}-${largura}-${tema}.png`)});}
  }
  for(const perfil of ['mecanica','limpeza_residencial']){
    await ir(perfil,390,'escuro','&existente=1');
    if(perfil==='mecanica'){await page.getByLabel('Data',{exact:true}).fill('2026-11-10');await page.locator('.cal-oficina-evento').first().click();await page.getByRole('dialog',{name:'Detalhes do agendamento',exact:true}).getByRole('button',{name:'Editar agendamento',exact:true}).click();}
    else {
      await page.getByLabel('Data',{exact:true}).fill('2026-11-10');
      await page.locator('.cal-oficina-evento').first().click();
    }
    const d=page.getByRole('dialog',{name:'Editar agendamento',exact:true});
    await d.waitFor();assert.equal(await d.locator('[name=regra_calendario]').count(),0);
    const salvo=await gravar(d,false);
    assert.equal(salvo.nome,perfil==='mecanica'?'operar_produtividade':'salvar_agenda_servico');
    resultados.push({nome:`${perfil}-edicao-isolada`,ok:true});
  }
  assert.deepEqual(erros,[]);
  sucesso=true;
  console.log(`PASS: ${resultados.length} verificações, ${somenteLayout?'4 perfis representativos':'26 perfis'}, 4 larguras e 2 temas.`);
}catch(e){
  falha=e.message;
  await browser?.contexts()[0]?.pages()[0]?.screenshot({path:resolve(pasta,'falha.png')});
  throw e;
}finally{
  await writeFile(resolve(pasta,somenteLayout?'resultados-layout.json':'resultados.json'),JSON.stringify({sucesso,falha,resultados},null,2));
  await browser?.close();await new Promise(r=>server.httpServer.close(r));
}
