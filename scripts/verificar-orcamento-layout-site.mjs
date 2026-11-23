import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const pasta='output/orcamento-layout-20261105/site-publicado',base='https://patio-gestao-peach.vercel.app';
await mkdir(pasta,{recursive:true});
const pacote=JSON.parse(await readFile('output/orcamento-layout-20261105/pacote-publicacao.json','utf8'));
const health=await fetch(base+'/health.json?qa='+Date.now()).then(r=>r.json());assert.equal(health.build,pacote.build);
const conta=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.find(c=>c.especialidade==='retifica');assert(conta.empresa.startsWith('ZZ [TESTE 20261019] '));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),ctx=await browser.newContext({viewport:{width:1920,height:1080},locale:'pt-BR',timezoneId:'America/Sao_Paulo'}),p=await ctx.newPage(),resultados=[],erros=[];
p.setDefaultTimeout(30000);p.on('pageerror',e=>erros.push(e.message));
try{
 await p.goto(base+'/orcamentos');await p.getByLabel('E-mail',{exact:true}).fill(conta.email);await p.getByLabel('Senha',{exact:true}).fill(conta.senha);await p.getByRole('button',{name:'Entrar no sistema',exact:true}).click();
 await p.locator('.abrir-proposta').first().waitFor();
 const candidatos=p.locator('.linha-proposta').filter({hasText:/Aguardando aprovação|Rascunho|Aprovado/});assert(await candidatos.count()>0,'Precisa de orçamento fictício com ações habilitadas');await candidatos.first().locator('.abrir-proposta').click();
 const d=p.getByRole('dialog',{name:/^Orçamento #/});await d.waitFor();
 for(const tema of ['escuro','claro'])for(const largura of [1920,1366,1024,768,390,320]){
  await p.setViewportSize({width:largura,height:largura>768?1080:844});await p.evaluate(tema=>document.documentElement.dataset.tema=tema,tema);await d.evaluate(e=>e.scrollTop=0);await p.evaluate(()=>document.fonts.ready);
  const medidas=await d.evaluate(d=>{const r=d.getBoundingClientRect(),h=d.querySelector('.dialogo-cabecalho'),t=h.querySelector('h2'),x=h.querySelector('button[aria-label="Fechar janela"]'),a=d.querySelector('.acoes-detalhe-orcamento');const tr=t.getBoundingClientRect(),xr=x.getBoundingClientRect(),ar=a.getBoundingClientRect();return {conteudo:d.scrollWidth,largura:d.clientWidth,tituloLegivel:t.scrollWidth<=t.clientWidth+1&&tr.width>0,fecharVisivel:xr.right<=r.right&&xr.left>=r.left,acoesAbaixo:ar.top>=tr.bottom,botoesDentro:[...a.querySelectorAll(':scope > button, :scope > a')].every(e=>{const b=e.getBoundingClientRect();return b.left>=r.left&&b.right<=r.right&&b.height>=40&&e.innerText.trim().length>0})};});
  assert(medidas.conteudo<=medidas.largura+1&&medidas.tituloLegivel&&medidas.fecharVisivel&&medidas.acoesAbaixo&&medidas.botoesDentro,JSON.stringify(medidas));
  await p.screenshot({path:pasta+'/'+tema+'-'+largura+'.png'});
  await d.evaluate(e=>e.scrollTop=e.scrollHeight);const fechar=d.locator(':scope > .dialogo-interior > .dialogo-cabecalho > button[aria-label="Fechar janela"]');assert(await fechar.evaluate(e=>{const b=e.getBoundingClientRect();return e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));}),'Fechar deve continuar acessível ao rolar');
  resultados.push({tema,viewport:largura,...medidas,fecharAposRolagem:true});
 }
 await d.evaluate(e=>e.scrollTop=0);await d.getByRole('button',{name:'Atualizar situação',exact:true}).click();
 await d.getByRole('button',{name:'Cliente não aprovou / desistiu',exact:true}).click();const recusa=p.getByRole('dialog',{name:'Registrar recusa ou desistência',exact:true});await recusa.waitFor();assert(await recusa.evaluate(e=>e.scrollWidth<=e.clientWidth+1));await recusa.getByRole('button',{name:'Fechar janela',exact:true}).click();
 await d.getByRole('link',{name:/^Imprimir orçamento #/}).click();await p.waitForURL(/\/documentos\?/);await p.locator('.docs-papel .folha-cliente').waitFor();assert(await p.getByRole('button',{name:'Imprimir',exact:true}).isEnabled());
 assert.deepEqual(erros,[]);
 console.log('PASS orçamento publicado: 12 layouts, atualização, recusa sem salvar e prévia de impressão');
}catch(e){process.exitCode=1;console.error(e.message);await p.screenshot({path:pasta+'/falha.png'});}
finally{await browser.close();await writeFile(pasta+'/resumo.json',JSON.stringify({ok:!process.exitCode,build:health.build,resultados,erros,operacoes:'Somente leitura e navegação na empresa de teste; sem alterar orçamentos'},null,2));}
