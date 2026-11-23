import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,relative,dirname,sep,extname} from 'node:path';
import {createServer} from 'node:http';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {chromium} from 'playwright';
const fase=process.env.QA_FASE||'depois',out=resolve(process.env.QA_OUTPUT||'output/processos-agilidade-20261112'),dist=resolve(out,'build-'+fase),resultados=[];
const quantidadeItens=Number(process.env.QA_ITENS)||3,completo=process.env.QA_COMPLETO==='1',simples=process.env.QA_SIMPLES==='1';
await mkdir(out,{recursive:true});
const raiz=resolve('src'),baseline=resolve('output/processos-agilidade-20261112/baseline/src');
if(!process.env.QA_SKIP_BUILD)await build({configFile:false,envDir:false,logLevel:'error',plugins:[{name:'fonte-da-medicao',enforce:'pre',resolveId(id,importer){if(fase!=='antes'||!importer||!id.startsWith('.'))return;const p=resolve(dirname(importer),id);if(p.startsWith(raiz+sep))return this.resolve(resolve(baseline,relative(raiz,p)),importer,{skipSelf:true});}},react(),tailwindcss()],define:{'import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':'""'},build:{outDir:dist,rollupOptions:{input:'scripts/fixtures/processos-agilidade.html'}}});
const servidor=createServer(async(req,res)=>{try{const f=resolve(dist,'.'+new URL(req.url,'http://local').pathname);assert(f.startsWith(dist+sep));res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(f)]||'application/octet-stream');res.end(await readFile(f));}catch{res.statusCode=404;res.end()}});
await new Promise(ok=>servidor.listen(0,'127.0.0.1',ok));
const url=`http://127.0.0.1:${servidor.address().port}/scripts/fixtures/processos-agilidade.html`;
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
let p,ctx;
try{
 const amostra=await browser.newPage();await amostra.goto(url);const perfis=process.env.QA_PERFIS?.split(',')||await amostra.evaluate(()=>window.qaPerfis);await amostra.close();
 for(const perfil of perfis)for(const documento of (process.env.QA_CENARIO==='cadastro'?['cadastro']:['os','orcamento'])){
  ctx=await browser.newContext({viewport:{width:process.env.QA_MOBILE?390:1366,height:900},locale:'pt-BR',timezoneId:'America/Sao_Paulo'});p=await ctx.newPage();p.setDefaultTimeout(20000);
  const erros=[];p.on('pageerror',e=>erros.push(e.message));
  await p.goto(url+'?perfil='+perfil+'&catalogo='+Math.max(5,quantidadeItens)+(documento==='cadastro'?'&lento=1':''));await p.getByRole('heading',{name:'Cliente QA Processo',exact:true}).waitFor();
  const cdp=await ctx.newCDPSession(p);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const inicio=performance.now();await p.evaluate(()=>window.qaCliques=0);
  if(documento==='cadastro'){
   await p.getByRole('link',{name:'Catálogo QA',exact:true}).click();
   await p.getByRole('button',{name:'Novo serviço',exact:true}).click();
   const d=p.getByRole('dialog',{name:'Novo serviço',exact:true});
   await d.getByLabel('Descrição',{exact:true}).fill('Serviço cadastrado QA');
   await d.getByLabel('Preço de venda (R$)',{exact:true}).fill('100');
   const clicouSalvar=performance.now();await d.getByRole('button',{name:'Salvar cadastro',exact:true}).click();
   await p.getByText('Catálogo atualizado. Os valores dos atendimentos anteriores foram preservados.',{exact:true}).waitFor();
   const acabou=performance.now();
   const dados=await p.evaluate(()=>({salvo:JSON.parse(localStorage.getItem('patio_catalogo_v1')).find(x=>x.descricao==='Serviço cadastrado QA'),cliques:window.qaCliques,consultas:window.qaConsultasLentas}));
   assert.equal(dados.salvo.preco_padrao_centavos,10000);assert.equal(dados.consultas,1);
   resultados.push({perfil,documento,fase,segundos:Number(((acabou-inicio)/1000).toFixed(3)),confirmacaoSegundos:Number(((acabou-clicouSalvar)/1000).toFixed(3)),cliques:dados.cliques,ok:true});
   await p.waitForFunction(()=>window.qaSecundariaAtualizada);assert.deepEqual(erros,[]);
   console.log(JSON.stringify(resultados.at(-1)));await ctx.close();
   await writeFile(resolve(out,`${fase}-${process.env.QA_RODADA||'cadastro'}.json`),JSON.stringify({ok:true,ambiente:'Chrome CPU 4x; cadastro e armazenamento demo reais; consulta secundária de alertas simulada com 2 segundos. Tempo automatizado.',resultados},null,2));continue;
  }
  if(fase==='antes'){
   await p.getByRole('navigation',{name:'Navegação de teste'}).getByRole('link',{name:documento==='os'?'OS QA':'Orçamentos QA',exact:true}).click();
   await p.getByRole('button',{name:documento==='orcamento'?'Novo orçamento':/^(Nova OS|Ordem de reparo|Visita técnica|Serviço de limpeza)$/,exact:true}).first().click();
  }else await p.locator('.ficha-cliente-acoes a').filter({hasText:documento==='orcamento'?'Novo orçamento':/Nova OS|Ordem de reparo|Visita técnica|Serviço de limpeza/}).click();
  const d=p.locator('dialog[open]').last();await d.getByRole('combobox',{name:'Cliente',exact:true}).waitFor();
  if(fase==='antes'){
   await d.getByRole('combobox',{name:'Cliente',exact:true}).fill('Cliente QA');
   await d.getByRole('option',{name:'Cliente QA Processo',exact:false}).click();
  }else assert.equal(await d.getByRole('combobox',{name:'Cliente',exact:true}).inputValue(),'Cliente QA Processo');
  if(perfil==='retifica'){await d.getByLabel('Carro',{exact:true}).fill('Volkswagen Gol');await d.getByLabel('Motor',{exact:true}).fill('AP 1.6');}
  else {
   const seletor=d.getByRole('combobox',{name:/^(Veículo|Motor, peça ou veículo|Equipamento|Local|Local \/ equipamento)$/});
   if(await seletor.count() && !(await seletor.inputValue())){await seletor.click();await d.getByRole('option').filter({hasText:/Gol|QA/}).first().click();}
  }
  const busca=d.locator('.os-editor-busca input');
  for(let i=1;i<=quantidadeItens;i++){
   if(quantidadeItens>6)await busca.fill('Serviço QA '+i);
   if(fase==='antes'||process.env.QA_ENTRADA==='mouse')await d.getByRole('button',{name:`Adicionar Serviço QA ${i} por`,exact:false}).click();
   else{await busca.focus();for(let j=0;j<(quantidadeItens>6?1:i);j++)await busca.press('ArrowDown');await busca.press('Enter');}
  }
  assert.equal(await d.locator('.os-editor-lista li').count(),quantidadeItens);
  const itemEditado=quantidadeItens===1?1:2;
  if(!simples){await d.getByRole('button',{name:new RegExp('Editar Serviço QA '+itemEditado+':')}).click();await d.getByLabel('Preço unitário (R$)',{exact:true}).fill('120');await d.getByRole('button',{name:'Salvar item',exact:true}).click();}
  if(fase==='depois')assert(await busca.evaluate(e=>e===document.activeElement),'Foco retorna à busca depois de editar');
  let extra=0;
  if(completo){
   // Dois itens avulsos, quantidades diferentes, custos opcionais e observação impressa.
   for(const tipo of ['service','part']){
    await d.getByRole('button',{name:/Serviço ou .+ avuls/}).click();const painel=d.getByRole('group',{name:'Novo item avulso'});
    await painel.getByLabel(/Nome do serviço ou/).fill(tipo==='service'?'Serviço especial QA':'Material específico QA');await painel.getByRole('combobox',{name:/^Tipo/}).selectOption(tipo);await painel.getByLabel('Quantidade',{exact:true}).fill('2');await painel.getByLabel('Preço unitário (R$)',{exact:true}).fill('75');
    const custos=painel.locator('summary').filter({hasText:/Custo/}).first();if(await custos.count()){await custos.click();await painel.getByLabel('Custo direto por unidade (R$)',{exact:true}).fill('25');}
    await painel.getByRole('button',{name:/^Adicionar (serviço|peça|material|produto)$/}).click();extra+=15000;
   }
   const obs=d.getByLabel('Observações (opcional)',{exact:true});if(await obs.count())await obs.fill('Atendimento detalhado QA: executar os itens autorizados, conferir acabamento e informar o cliente ao concluir.');
   assert.equal(await d.locator('.os-editor-lista li').count(),quantidadeItens+2);
  }
  const desconto=d.locator('.campo-desconto input');
  if(!simples){if(await desconto.count())await desconto.fill('10');
  else{const descontoAlternativo=d.getByLabel('Desconto (opcional)',{exact:false});await descontoAlternativo.fill('10');}}
  await d.getByRole('button',{name:documento==='os'?'Abrir ordem de serviço':'Salvar orçamento',exact:true}).click();
  await p.waitForFunction(()=>!document.querySelector('dialog[open] .os-editor-busca'));
  // Concluir apenas depois de abrir o resumo, inclusive quando ele é carregado sob demanda.
  await p.locator('dialog[open] .atendimento-cabecalho, dialog[open] .os-resumo-limpo, dialog[open] .documento-orcamento').first().waitFor();
  const final=await p.evaluate(()=>({os:JSON.parse(localStorage.getItem('patio_os_v1')||'[]'),orcamentos:JSON.parse(localStorage.getItem('patio_orcamentos_v2')||'[]'),servicos:JSON.parse(localStorage.getItem('patio_servicos:demo')||'{}'),detalhes:JSON.parse(localStorage.getItem('patio_detalhes_servicos:demo')||'{}'),cliques:window.qaCliques}));
  const duracao=performance.now()-inicio;
  const auto=final.os.length||final.orcamentos.length;
  const registro=auto?(documento==='os'?final.os.at(-1):final.orcamentos.at(-1)):final.servicos.atendimentos.at(-1);
  assert(registro,'Documento persistido');assert.equal(registro.cliente_id,'exemplo-0');
  assert.equal(registro.total_centavos??registro.versao?.total_centavos??registro.valor_centavos,Math.round((quantidadeItens*10000+(simples?0:2000)+extra)*(simples?1:.9)));
  const custoAvulso=completo?(registro.itens??final.detalhes[registro.id]?.itens)?.find(i=>i.descricao==='Serviço especial QA'):null;
  if(completo && fase!=='antes')assert.equal(custoAvulso?.custo_unitario_previsto_centavos??custoAvulso?.custo_centavos,2500,'Custo avulso deve sobreviver ao salvamento completo');
  assert.deepEqual(erros,[]);
  for(const width of [1366,390]){await p.setViewportSize({width,height:900});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));for(const modal of await p.locator('dialog[open]').all())assert(await modal.evaluate(e=>e.scrollWidth<=e.clientWidth+2));}
  resultados.push({perfil,documento,fase,quantidadeItens:quantidadeItens+(completo?2:0),completo,simples,custoAvulso:custoAvulso?.custo_unitario_previsto_centavos??custoAvulso?.custo_centavos??null,segundos:Number((duracao/1000).toFixed(3)),cliques:final.cliques,ok:true});
  if(['retifica','assistencia_celulares','manutencao_climatizacao','limpeza_geral'].includes(perfil))await p.screenshot({path:resolve(out,`${fase}-${perfil}-${documento}.png`)});
  console.log(JSON.stringify(resultados.at(-1)));await ctx.close();
  await writeFile(resolve(out,`${fase}-${process.env.QA_RODADA||'1'}.json`),JSON.stringify({ok:true,ambiente:'Chrome CPU 4x; componentes e persistência demo reais; dados fictícios. Tempo automatizado, sem tempo humano de decisão/digitação e sem latência real do banco.',resultados},null,2));
 }
}catch(e){process.exitCode=1;console.error(e.stack);await p?.screenshot({path:resolve(out,fase+'-falha.png')});await writeFile(resolve(out,fase+'-falha.txt'),await p.locator('body').innerText());await writeFile(resolve(out,fase+'-falha.json'),JSON.stringify({ok:false,erro:e.message,resultados},null,2));}
finally{await browser.close();await new Promise(ok=>servidor.close(ok));}
