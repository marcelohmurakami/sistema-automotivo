import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build,preview} from './lib/vite-conferencia.mjs';
import {chromium} from './lib/chrome-conferencia.mjs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
const out=resolve(process.env.QA_OUTPUT||'output/revisao-integral-20261119/concorrencia-final');
await mkdir(out,{recursive:true});
const config={configFile:false,envDir:false,plugins:[react(),tailwindcss()],logLevel:'error',define:{'import.meta.env.VITE_SUPABASE_URL':'window.location.origin','import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':JSON.stringify('qa-local-sem-acesso-externo')},build:{outDir:resolve(out,'build'),rollupOptions:{input:'scripts/fixtures/retornos-assincronos.html'}}};
await build(config);const server=await preview({...config,preview:{host:'127.0.0.1',port:0}}),base=server.resolvedUrls.local[0];
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[],erros=[],antes=!!process.env.QA_SOURCE_DIR;
const custos={id:'os-a',cliente:'Cliente fictício',titulo:'Custos da OS fictícia',data:'2026-11-19',receita:10000,direto:1000,custo:1000,margem:9000,minutos:30,mao_obra_apropriada:0,indiretos:0,fontes:[],fontes_pendentes:0,assinatura:'qa-a',conferido:false,conferencia:null,parametros:{}};
try {
 for(const width of [1920,390]) {
  const ctx=await browser.newContext({viewport:{width,height:900},locale:'pt-BR'});
  const liberacoesEquipe=[];
  let falharAnalise=false,falharCusto=false,conferencias=0,sugestoes=0,liberarCusto,liberarEquipe,liberarEtiqueta;
  const etiquetaIniciou={};
  await ctx.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==new URL(base).origin)return route.abort();
   const rpc=url.pathname.split('/').at(-1),failure={status:503,json:{message:'Indisponibilidade temporária simulada',code:'PGRST000'}};
   if(rpc==='buscar_opcoes_analiticas')return route.fulfill({json:[{id:'problema-a',nome:'Problema A'}]});
   if(rpc==='consultar_vinculo_analitico')return route.fulfill(falharAnalise?failure:{json:{dados:{descricao:'Original',documento_id:'os-a'},revisao:1,ativo:true}});
   if(rpc==='listar_locais_fisicos'){
    const busca=route.request().postDataJSON().p_busca,locais=['A','B'].map(x=>({id:'local-'+x,codigo:'PTL-'+x.repeat(16),nome:'Bancada '+x,ativo:true,revisao:1}));
    if(busca?.startsWith('PTL-')){etiquetaIniciou[busca]=true;await new Promise(r=>liberarEtiqueta=r);}
    return route.fulfill({json:busca?locais.filter(l=>l.codigo===busca):locais}).catch(()=>{});
   }
   if(rpc==='consultar_custeio_servico')return route.fulfill(falharCusto?failure:{json:custos});
   if(rpc==='conferir_custeio_servico'){conferencias++;await new Promise(r=>liberarCusto=r);return route.fulfill({json:null});}
   if(rpc==='consultar_distribuicao_agenda')return route.fulfill({json:{perfis:[{id:'perfil-a',ativo:true,habilidades:['Diagnóstico'],regioes:[]}],recursos:[]}});
   if(rpc==='sugerir_tecnico_agenda'){sugestoes++;await new Promise(r=>{liberarEquipe=r;liberacoesEquipe.push(r)});return route.fulfill({json:{candidatos:[],materiais_faltantes:[],verificado_em:'2026-11-19T12:00:00Z'}});}
   if(url.pathname.startsWith('/rest/')||url.pathname.startsWith('/functions/')||url.pathname.startsWith('/auth/'))throw Error('API não prevista: '+url.pathname);
   return route.continue();
  });
  const p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));
  await p.goto(base+'scripts/fixtures/retornos-assincronos.html?tela=local');
  await p.getByRole('option',{name:'Bancada B',exact:true}).waitFor({state:'attached'});
  await p.getByText('Buscar outro local',{exact:true}).click();await p.getByRole('button',{name:'Ler local',exact:true}).click();
  await p.getByLabel('Código da etiqueta').fill('PTL-AAAAAAAAAAAAAAAA');
  await p.getByRole('button',{name:'Localizar',exact:true}).click();
  while(!etiquetaIniciou['PTL-AAAAAAAAAAAAAAAA'])await new Promise(r=>setTimeout(r,10));
  await p.getByLabel('Onde vai ficar?').selectOption('local-B');liberarEtiqueta();
  await p.waitForTimeout(150);const local=await p.getByTestId('local').textContent();if(!antes)assert.equal(local,'local-B');
  resultados.push({width,caso:'leitura antiga não sobrescreve destino escolhido manualmente',local});
  await p.goto(base+'scripts/fixtures/retornos-assincronos.html?tela=analise');
  const descricao=p.getByLabel('Qual problema será acompanhado?');await descricao.fill('Texto digitado e ainda não salvo');
  falharAnalise=true;await p.evaluate(()=>window.qa.cache.refetchQueries({queryKey:['vinculo-analitico']}));
  await p.getByRole('alert').waitFor();const texto=await descricao.count()?await descricao.inputValue():null;
  if(!antes)assert.equal(texto,'Texto digitado e ainda não salvo');
  falharAnalise=false;if(antes)await p.evaluate(()=>window.qa.cache.refetchQueries({queryKey:['vinculo-analitico']}));else await p.getByRole('button',{name:'Tentar novamente',exact:true}).click();await descricao.waitFor();
  if(!antes)assert.equal(await descricao.inputValue(),texto);
  resultados.push({width,caso:'503 e recuperação preservam formulário de análise',texto});
  await p.goto(base+'scripts/fixtures/retornos-assincronos.html?tela=custo');
  const minutos=p.getByLabel('Tempo produtivo do serviço (minutos)');await minutos.fill('47');
  falharCusto=true;await p.evaluate(()=>window.qa.cache.refetchQueries({queryKey:['custeio-detalhe']}));
  await p.getByRole('alert').waitFor();const campo=await minutos.count()?await minutos.inputValue():null;
  if(!antes)assert.equal(campo,'47');
  falharCusto=false;if(antes)await p.evaluate(()=>window.qa.cache.refetchQueries({queryKey:['custeio-detalhe']}));else await p.getByRole('button',{name:'Tentar novamente',exact:true}).click();await minutos.waitFor();
  if(!antes)assert.equal(await minutos.inputValue(),'47');
  resultados.push({width,caso:'503 e recuperação preservam conferência de custos',minutos:campo});
  for(const select of await p.locator('.plano-campos select').all())await select.selectOption('Não houve custo nesta categoria');
  await p.getByRole('button',{name:'Confirmar custos conferidos',exact:true}).evaluate(b=>{b.click();b.click()});
  while(!liberarCusto)await new Promise(r=>setTimeout(r,10));
  await p.keyboard.press('Escape');const manteveAberto=await p.getByRole('dialog').count();
  liberarCusto();await p.waitForTimeout(150);
  if(!antes){assert.equal(manteveAberto,1);assert.equal(conferencias,1);await p.getByText('Conferência salva.',{exact:false}).waitFor();await p.keyboard.press('Escape');await p.getByText('Detalhe fechado').waitFor();}
  resultados.push({width,caso:'duplo envio e fechar custos durante salvamento',manteveAberto,conferencias});
  await p.goto(base+'scripts/fixtures/retornos-assincronos.html?tela=equipe');
  const escolher=p.getByRole('button',{name:'Escolher automaticamente',exact:true});await escolher.waitFor();await p.waitForFunction(()=>[...document.querySelectorAll('button')].some(x=>x.textContent.includes('Escolher automaticamente')&&!x.disabled));
  await escolher.evaluate(b=>{b.click();b.click()});while(!liberarEquipe)await new Promise(r=>setTimeout(r,10));
  await p.waitForTimeout(50);for(const liberar of liberacoesEquipe)liberar();await p.waitForTimeout(150);if(!antes)assert.equal(sugestoes,1);
  resultados.push({width,caso:'duplo acionamento da distribuição de equipe',sugestoes});
  assert.deepEqual(erros,[]);await ctx.close();
 }
 console.log(JSON.stringify({antes,resultados,erros}));
} finally {
 await writeFile(resolve(out,'resultados.json'),JSON.stringify({antes,resultados,erros,escopo:'Componentes reais; API local simulada, incluindo 503 e respostas fora de ordem. Nenhum registro real alterado.'},null,2));
 await browser.close();await new Promise(r=>server.httpServer.close(r));
}
