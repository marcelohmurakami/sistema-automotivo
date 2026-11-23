// Conferência somente de leitura em propostas das empresas fictícias existentes.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const out=process.env.QA_OUTPUT||'output/orcamentos-impressao-20261111',base=process.env.QA_URL||'https://patio-gestao-peach.vercel.app',modo=process.env.QA_URL?'local':'publicado';
await mkdir(out,{recursive:true});
const perfis=['mecanica','assistencia_celulares','manutencao_climatizacao','limpeza_geral'];
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.filter(c=>perfis.includes(c.especialidade));
assert.equal(contas.length,4);
const esperado=JSON.parse(await readFile('dist/health.json','utf8'));
const health=await fetch(base+'/health.json',{cache:'no-store'}).then(r=>r.json());assert.equal(health.build,esperado.build);
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[];
try {
 for(const c of contas){
  assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
  const ctx=await browser.newContext({viewport:{width:1440,height:1000},locale:'pt-BR'}),p=await ctx.newPage(),erros=[];
  await ctx.addInitScript(()=>window.print=()=>{window.qaImpresso=true;});
  ctx.on('page',page=>page.on('pageerror',e=>erros.push(e.message)));p.setDefaultTimeout(30000);
  await ctx.route('**/rest/v1/rpc/**',r=>{const d=r.request().postDataJSON();if(d?.p_oficina&&d.p_oficina!==c.empresa_id)return r.abort();return r.continue();});
  try {
   await p.goto(base+'/entrar');await p.getByLabel('E-mail',{exact:true}).fill(c.email);await p.getByLabel('Senha',{exact:true}).fill(c.senha);await p.getByRole('button',{name:'Entrar no sistema',exact:true}).click();await p.waitForURL(u=>!u.pathname.startsWith('/entrar'));
   if(c.ramo==='automotivo'){
    await p.goto(base+'/orcamentos');await p.locator('.abrir-proposta').first().click();await p.getByRole('link',{name:/^Imprimir orçamento #/}).click();await p.locator('.folha-orcamento').waitFor();
    assert.equal(await p.locator('.docs-selecao').count(),0);assert.equal(await p.getByText('Página não encontrada',{exact:true}).count(),0);
    for(const width of [1440,390]) {await p.setViewportSize({width,height:900});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:`${out}/${modo}-central-${width}.png`,fullPage:true});}
   }else if(c.ramo!=='limpeza'){
    const seed=JSON.parse(await readFile(`output/jornada-assistencia-campo-20261110/${c.especialidade}.json`,'utf8'));
    await p.goto(base+'/atendimentos?atendimento='+seed.documentos.orcamento.id);
   }else{
    await p.goto(base+'/orcamentos');await p.locator('.servico-linha-abrir').first().click();
   }
   const print=c.ramo==='automotivo'?p.getByRole('button',{name:'Imprimir',exact:true}):p.getByRole('button',{name:'Imprimir orçamento',exact:true});
   await print.waitFor();const pp=p.waitForEvent('popup');await print.click();const popup=await pp;
   await popup.locator('.folha-orcamento').waitFor();await popup.waitForFunction(()=>window.qaImpresso);
   for(const width of [1440,390]){
    await popup.setViewportSize({width,height:900});
    assert(await popup.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    const overflow=await popup.locator('.folha-orcamento').evaluate(e=>{const r=e.getBoundingClientRect();return [...e.querySelectorAll('*')].filter(x=>{const a=x.getBoundingClientRect();return a.width&&(a.left<r.left-1||a.right>r.right+1);}).map(x=>x.className);});assert.deepEqual(overflow,[]);
    await popup.screenshot({path:`${out}/${modo}-${c.especialidade}-${width}.png`,fullPage:true});
   }
   const texto=await popup.locator('.folha-orcamento').innerText();assert(texto.includes('Total do orçamento'));assert(!texto.includes('NaN'));
   if(c.ramo!=='automotivo')assert(!/VEÍCULO|Placa:|Motor:/.test(texto));
   const download=Promise.race([p.waitForEvent('download'),popup.waitForEvent('download')]);await popup.getByRole('button',{name:'Baixar PDF',exact:true}).click();await (await download).saveAs(`${out}/${modo}-${c.especialidade}.pdf`);
   assert.deepEqual(erros,[]);resultados.push({perfil:c.especialidade,ok:true,build:health.build,impressao:true,download:true,desktop:true,mobile:true});
   console.log('PASS '+modo+' '+c.especialidade);
  }catch(e){await p.screenshot({path:`${out}/falha-${modo}-${c.especialidade}.png`});resultados.push({perfil:c.especialidade,ok:false,erro:e.message});console.log('FAIL '+c.especialidade+': '+e.message.slice(0,200));}
  await ctx.close();await writeFile(`${out}/${modo}.json`,JSON.stringify({ok:resultados.every(r=>r.ok),build:health.build,resultados},null,2));
 }
}finally{await browser.close();}
assert(resultados.every(r=>r.ok));
