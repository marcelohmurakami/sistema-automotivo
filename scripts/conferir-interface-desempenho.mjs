// Somente leitura nas empresas ZZ de teste. Não salva OS, pagamentos ou dados pessoais.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from './lib/chrome-conferencia.mjs';
const base=process.env.QA_URL||'http://127.0.0.1:5189',out=process.env.QA_OUTPUT?resolve(process.env.QA_OUTPUT):resolve('output/desempenho-20261111',process.env.QA_SAIDA||(process.env.QA_URL?'publicado':'interface'));
await mkdir(out,{recursive:true});
const health=await fetch(base+'/health.json',{cache:'no-store'}).then(r=>r.json());
if(process.env.QA_EXPECTED_BUILD)assert.equal(health.build,process.env.QA_EXPECTED_BUILD);
const filtros=process.env.QA_PERFIS?.split(',');
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.filter(c=>!filtros||filtros.includes(c.especialidade));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[],componentes=new Set();
const profundo=new Set(['mecanica','assistencia_celulares','manutencao_climatizacao','limpeza_geral']);
const salvar=()=>writeFile(resolve(out,'resultados.json'),JSON.stringify({ok:resultados.every(x=>x.ok),componentesExecutados:[...componentes].sort(),ambiente:{url:base,build:health.build,larguras:[1366,390],operacoes:'Leitura; formulários abertos e fechados, sem gravação; assistente sem envio ao provedor'},resultados},null,2));
try{for(const c of contas){
 assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
 const ctx=await browser.newContext({viewport:{width:1366,height:900},locale:'pt-BR',serviceWorkers:'block'}),p=await ctx.newPage();p.setDefaultTimeout(25000);
 const erros=[],chamadas=[];p.on('pageerror',e=>erros.push(e.message));p.on('request',r=>{if(r.url().includes('/rest/v1/'))chamadas.push(new URL(r.url()).pathname);});
 let pending=0,last=performance.now();const requests=new Set();
 p.on('request',r=>{if(r.url().includes('/rest/v1/')||['script','stylesheet'].includes(r.resourceType())){requests.add(r);pending=requests.size;last=performance.now();}});
 const done=r=>{requests.delete(r);pending=requests.size;last=performance.now();};p.on('requestfinished',done);p.on('requestfailed',done);
 // Uma navegação completa encerra o documento anterior. Preloads abortados daquele
 // documento não podem contaminar a espera das páginas seguintes da bancada.
 p.on('framenavigated',f=>{if(f===p.mainFrame()){requests.clear();pending=0;last=performance.now();}});
 const pronto=async()=>{await p.waitForTimeout(200);const inicio=performance.now();while(performance.now()-inicio<25000&&(pending||performance.now()-last<300))await p.waitForTimeout(100);assert(!pending,'Requisição pendente: '+[...requests].map(r=>new URL(r.url()).pathname).join(', '));assert.equal(await p.getByText('Não conseguimos abrir esta tela.',{exact:true}).count(),0);};
 const layout=async()=>{await pronto();for(const nome of await p.evaluate(()=>[...(globalThis.__qaComponentes||[])]))componentes.add(nome);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Rolagem horizontal da página');const ds=p.locator('dialog[open]');if(await ds.count())assert(await ds.last().evaluate(e=>e.scrollWidth<=e.clientWidth+2),'Rolagem horizontal do diálogo');assert.equal(erros.length,0,erros.join(';'));};
 const fechar=async()=>{const d=p.locator('dialog[open]').last();await d.getByRole('button',{name:'Fechar janela',exact:true}).click();await d.waitFor({state:'hidden'});};
 const check=async(nome,fn)=>{try{await fn();resultados.push({perfil:c.especialidade,teste:nome,ok:true});}catch(e){resultados.push({perfil:c.especialidade,teste:nome,ok:false,erro:e.message.slice(0,1800)});await p.screenshot({path:resolve(out,`${c.especialidade}-falha-${resultados.length}.png`),fullPage:false}).catch(()=>{});console.log('FAIL',c.especialidade,nome,e.message.slice(0,200));}await salvar();};
 try{
  await p.goto(base+'/entrar');await p.getByLabel('E-mail',{exact:true}).fill(c.email);await p.getByLabel('Senha',{exact:true}).fill(c.senha);await p.getByRole('button',{name:'Entrar no sistema',exact:true}).click();await p.waitForURL(u=>!u.pathname.startsWith('/entrar'));await pronto();
  const rotas=process.env.QA_ROTAS?process.env.QA_ROTAS.split(',').map(r=>r==='{os}'?(c.ramo==='automotivo'?'/ordens-servico':'/atendimentos'):r):['/','/clientes','/catalogo','/estoque','/financeiro','/relatorios','/funcionarios','/compras','/configuracoes','/orcamentos',c.ramo==='automotivo'?'/ordens-servico':'/atendimentos','/agenda','/garantias','/historico','/localizacao','/meu-site','/execucao-offline'];
  for(const rota of rotas){await check(rota,async()=>{
   chamadas.length=0;await p.setViewportSize({width:1366,height:900});await p.goto(base+rota,{waitUntil:'domcontentloaded'});await p.locator('main').waitFor();await layout();
   assert.equal(await p.getByText('Página não encontrada',{exact:true}).count(),0);assert(await p.locator('main').innerText());
   if(rota==='/')await p.screenshot({path:resolve(out,c.especialidade+'-desktop.png')});
   await p.setViewportSize({width:390,height:844});await layout();
   if(rota==='/')await p.screenshot({path:resolve(out,c.especialidade+'-mobile.png')});
   if(rota==='/meu-site'&&process.env.QA_SITE_CHECK){
    assert(!chamadas.some(x=>/\/(listar_estoque|listar_clientes)$/.test(x)),'Seções fechadas não devem consultar estoque/clientes');
    await p.locator('summary').filter({hasText:'Produtos exibidos no site'}).click();await layout();assert(chamadas.some(x=>x.endsWith('/listar_estoque')),'Estoque deve carregar ao abrir a seção');
    await p.locator('summary').filter({hasText:'Acesso dos clientes'}).click();await layout();assert(chamadas.some(x=>x.endsWith('/listar_clientes')),'Clientes devem carregar ao abrir a seção');
   }
  });}
  if(profundo.has(c.especialidade)&&!process.env.QA_SKIP_DEEP){
   await check('Assistente: primeira abertura, texto preservado e reabertura',async()=>{
    await p.goto(base);await pronto();await p.evaluate(()=>window.dispatchEvent(new CustomEvent('patio:abrir-assistente',{detail:{pedido:'QA: preparar serviço; não enviar'}})));
    const d=p.getByRole('dialog',{name:'Assistente',exact:true});await d.waitFor();await pronto();assert.equal(await d.getByLabel('Seu pedido',{exact:true}).inputValue(),'QA: preparar serviço; não enviar');await layout();await fechar();
    await p.getByRole('button',{name:'Abrir assistente por voz ou texto'}).click();await d.waitFor();assert.equal(await d.getByLabel('Seu pedido',{exact:true}).inputValue(),'QA: preparar serviço; não enviar');await fechar();
    const link=p.locator('a[href="/clientes"]').first();await p.setViewportSize({width:1366,height:900});await link.click();await pronto();assert.equal(await p.locator('dialog[open]').count(),0);
   });
   await check('Serviços: ficha, editor, importação e impressão carregam ao abrir',async()=>{
    await p.goto(base+'/catalogo');await pronto();await p.getByRole('button',{name:'Novo serviço',exact:true}).click();await p.getByRole('dialog').last().waitFor();await layout();await fechar();
    await p.getByRole('button',{name:'Importar serviços',exact:true}).click();await p.getByRole('dialog',{name:'Importar serviços'}).waitFor();await layout();
    await p.locator('dialog[open] input[type=file]').setInputFiles({name:'teste.csv',mimeType:'text/csv',buffer:Buffer.from('descricao;tipo;unidade;preco;favorito\nServiço fictício;servico;serv;80,00;sim\n')});await p.getByText('1 registros prontos para conferir.',{exact:false}).waitFor();await fechar();
    await p.getByRole('button',{name:'Imprimir tabela de preços',exact:true}).click();await p.locator('dialog[open]').waitFor();await layout();await fechar();
   });
   await check('Compras: leitor XML sob demanda e conferência sem gravar',async()=>{
    await p.goto(base+'/compras');await pronto();await p.getByRole('button',{name:'Importar compra por XML',exact:true}).first().click();
    const d=p.getByRole('dialog',{name:'Conferir compra da NF-e',exact:true});await d.waitFor();
    const chave='35261012345678000190550010000000011000000010';
    const xml=`<nfeProc><NFe><infNFe Id="NFe${chave}"><ide><mod>55</mod><dhEmi>2026-10-05T10:00:00-03:00</dhEmi></ide><emit><xNome>Fornecedor fictício QA</xNome><CNPJ>12345678000190</CNPJ></emit><det nItem="1"><prod><cProd>QA001</cProd><xProd>Material fictício QA</xProd><uCom>un</uCom><qCom>2.000</qCom><vUnCom>15.00</vUnCom><vProd>30.00</vProd></prod></det><total><ICMSTot><vNF>30.00</vNF></ICMSTot></total></infNFe></NFe><protNFe><infProt><cStat>100</cStat><chNFe>${chave}</chNFe></infProt></protNFe></nfeProc>`;
    await d.getByLabel('XML da NF-e').setInputFiles({name:'qa-nao-importar.xml',mimeType:'application/xml',buffer:Buffer.from(xml)});
    await d.getByRole('heading',{name:'Fornecedor fictício QA',exact:true}).waitFor();
    assert.equal(await d.getByLabel('Quantidade',{exact:true}).inputValue(),'2');
    assert.match(await d.innerText(),/30,00/);assert(await d.getByRole('button',{name:'Confirmar compra e conta a pagar',exact:true}).isDisabled());
    await layout();await fechar();
   });
   await check('Financeiro: abas secundárias sob demanda',async()=>{
    await p.goto(base+'/financeiro');await pronto();
    for(const nome of ['Contas bancárias','Contas mensais','Resultado completo']){await p.getByRole('button',{name:nome,exact:true}).click();await layout();}
    for(const value of ['conciliacao','custos','precos',...(c.ramo==='automotivo'?['comissoes']:['contratos'])]){await p.getByLabel('Outras consultas do financeiro').selectOption(value);await layout();}
   });
   await check('OS: formulário completo, detalhes, lucro e fotos',async()=>{
    await p.goto(base+(c.ramo==='automotivo'?'/ordens-servico':'/atendimentos'));await pronto();
    const linhas=c.ramo==='automotivo'?p.locator('.linha-ordem-servico'):p.locator('.servico-linha-abrir');
    assert(await linhas.count(),'Empresa de teste deve ter documentos');await linhas.first().click();await p.locator('dialog[open]').waitFor();await pronto();for(const nome of ['Lucro e custos','Fotos','Resumo']){const b=p.locator('dialog[open]').getByRole('button',{name:nome,exact:true});if(await b.count()){await b.click();await layout();}}await p.setViewportSize({width:390,height:844});await layout();await p.screenshot({path:resolve(out,c.especialidade+'-detalhe-mobile.png')});await fechar();
    const nomes={automotivo:'Nova OS',assistencia_tecnica:'Ordem de reparo',manutencao_campo:'Visita técnica',limpeza:'Serviço de limpeza'};
    const b=p.getByRole('button',{name:nomes[c.ramo],exact:true}).first();await b.click();await p.locator('dialog[open]').waitFor();await layout();await p.setViewportSize({width:390,height:844});await layout();await p.screenshot({path:resolve(out,c.especialidade+'-formulario-mobile.png')});await fechar();
   });
  }
 }catch(e){resultados.push({perfil:c.especialidade,teste:'Acesso',ok:false,erro:e.message});console.log('FAIL acesso',c.especialidade,e.message.slice(0,120));}
 await ctx.close();console.log('DONE',c.especialidade,resultados.filter(x=>x.perfil===c.especialidade).length);await salvar();
}}finally{await browser.close();await salvar();}
assert(resultados.every(x=>x.ok),'Há verificações que precisam de revisão; consulte resultados.json');
assert.equal((await fetch(base+'/health.json',{cache:'no-store'}).then(r=>r.json())).build,health.build,'O build mudou durante a verificação');
