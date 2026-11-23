import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
const root=resolve('output/regressao-mapa-orcamentos-os-20261116'),out=resolve(process.env.QA_OUTPUT||resolve(root,'compartilhado/fotos'));
await mkdir(out,{recursive:true});
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.filter(c=>c.ramo==='automotivo'&&(!process.env.QA_PERFIS||process.env.QA_PERFIS.split(',').includes(c.especialidade)));
const origem=JSON.parse(await readFile(resolve(root,'orcamentos/aprovacao-conversao/resultados.json'),'utf8'));
assert(origem.ok);
const base=process.env.QA_BASE||'https://patio-gestao-peach.vercel.app',banco='https://hzihxtjirttetnfdujcx.supabase.co',resultados=[],erros=[];
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const tag=randomUUID().slice(0,8),imagem={name:'qa-foto-sintetica.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf1kAAAAASUVORK5CYII=','base64')};
const gravar=()=>writeFile(resolve(out,'resultados.json'),JSON.stringify({ok:!process.exitCode,metodo:'Upload real ao Storage privado de imagem sintética, usando exclusivamente documentos criados nesta rodada nas empresas fictícias.',resultados,erros},null,2));
try{for(const [idx,c]of contas.entries()){
 assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
 const ctx=await browser.newContext({viewport:{width:idx%2?390:1920,height:idx%2?844:1080},locale:'pt-BR',serviceWorkers:'block'}),p=await ctx.newPage();p.setDefaultTimeout(30000);let headers;
 p.on('pageerror',e=>erros.push(e.message));p.on('request',r=>{if(r.url().startsWith(banco+'/rest/v1/')){const h=r.headers();if(h.authorization)headers={authorization:h.authorization,apikey:h.apikey,'content-type':'application/json'};}});
 const rpc=async(n,args)=>{assert.equal(args.p_oficina,c.empresa_id);const r=await p.request.post(banco+'/rest/v1/rpc/'+n,{headers,data:args});assert(r.ok(),n+' '+r.status()+' '+await r.text());return r.status()===204?null:r.json();};
 const pass=(nome,modulo)=>{resultados.push({perfil:c.especialidade,tela:idx%2?'celular':'desktop',nome,modulo,ok:true});};
 try{
  await p.goto(base+'/entrar',{waitUntil:'domcontentloaded'});await p.getByLabel('E-mail',{exact:true}).fill(c.email);await p.getByLabel('Senha',{exact:true}).fill(c.senha);await p.getByRole('button',{name:'Entrar no sistema',exact:true}).click();await p.getByRole('textbox',{name:'Buscar veículo no mapa',exact:true}).waitFor();
  const modelo=origem.documentos.find(d=>d.perfil===c.especialidade&&d.tela==='desktop'&&d.modo==='revisao');assert(modelo);
  const anterior=await rpc('consultar_orcamento',{p_oficina:c.empresa_id,p_orcamento:modelo.id,p_versao:null});
  let q=await rpc('salvar_orcamento',{p_oficina:c.empresa_id,p_orcamento:null,p_revisao:null,p_chave:randomUUID(),p_dados:{cliente_id:anterior.cliente_id,veiculo_id:anterior.veiculo_id,data_servico:'2026-11-16',itens:anterior.itens.map(({id,...i})=>i),desconto_centavos:1700,observacoes:'QA rodada de fotos',condicoes:'Exclusivo para teste'}});const doc={id:q.id,numero:q.numero};assert.equal(q.situacao,'draft');
  await p.goto(base+'/orcamentos?orcamento='+doc.id,{waitUntil:'domcontentloaded'});const d=p.getByRole('dialog',{name:'Orçamento #'+doc.numero,exact:true});await d.waitFor();await d.locator('summary').filter({hasText:'Fotos do orçamento'}).click();
  const input=d.getByLabel('Adicionar foto',{exact:true});await input.setInputFiles({name:'qa.txt',mimeType:'text/plain',buffer:Buffer.from('QA arquivo inválido')});await d.getByRole('alert').waitFor();assert.equal((await rpc('listar_fotos_orcamento',{p_oficina:c.empresa_id,p_versao:q.versao.id})).length,0);pass('Tipo de arquivo inválido não cria anexo','orcamentos');
  await d.getByLabel('Legenda',{exact:true}).fill('Foto sintética QA para remover');let r=p.waitForResponse(r=>r.url().endsWith('/rpc/confirmar_foto_orcamento'));await input.setInputFiles(imagem);assert((await r).ok());await d.getByRole('button',{name:'Remover foto',exact:true}).waitFor();await d.getByRole('button',{name:'Remover foto',exact:true}).click();await d.getByRole('button',{name:'Remover foto',exact:true}).waitFor({state:'hidden'});assert.equal((await rpc('listar_fotos_orcamento',{p_oficina:c.empresa_id,p_versao:q.versao.id})).length,0);pass('Anexar e remover foto no rascunho','orcamentos');
  const legenda='Foto sintética QA '+doc.numero;await d.getByLabel('Legenda',{exact:true}).fill(legenda);r=p.waitForResponse(r=>r.url().endsWith('/rpc/confirmar_foto_orcamento'));await input.setInputFiles(imagem);assert((await r).ok());await d.getByRole('img',{name:legenda,exact:true}).waitFor();await d.getByRole('button',{name:'Concluir orçamento',exact:true}).click();await d.getByLabel('Link desta versão',{exact:true}).waitFor();const link=await d.getByLabel('Link desta versão',{exact:true}).inputValue();
  const anon=await browser.newContext({viewport:{width:390,height:844},locale:'pt-BR',serviceWorkers:'block'}),u=await anon.newPage();
  try{
   const consulta=u.waitForResponse(r=>r.url().endsWith('/rpc/consultar_orcamento_publico'));await u.goto(link,{waitUntil:'domcontentloaded'});const publico=await(await consulta).json();
   assert(!JSON.stringify(publico).match(/"(?:custo_unitario_previsto_centavos|custo_hora_centavos|outros_custos_centavos)"/));pass('Link público não expõe campos de custo interno','orcamentos');
   const foto=u.getByRole('img',{name:legenda,exact:true});await foto.waitFor();await foto.scrollIntoViewIfNeeded();await u.waitForFunction(t=>[...document.images].some(i=>i.alt===t&&i.complete&&i.naturalWidth>0),legenda);pass('Foto publicada abre no link do cliente sem login','orcamentos');
   await u.screenshot({path:resolve(out,c.especialidade+'-proposta-mobile.png'),fullPage:true});
  }finally{await anon.close();}
  await p.reload({waitUntil:'domcontentloaded'});q=await rpc('consultar_orcamento',{p_oficina:c.empresa_id,p_orcamento:doc.id,p_versao:null});const fotos=await rpc('listar_fotos_orcamento',{p_oficina:c.empresa_id,p_versao:q.versao.id});assert.equal(fotos.length,1);assert.equal(fotos[0].legenda,legenda);pass('Legenda e foto preservadas ao emitir e reabrir','orcamentos');
  const os=origem.documentos.find(o=>o.perfil===c.especialidade&&o.modo==='total'&&o.tela==='desktop').os;assert(os);await p.goto(base+'/ordens-servico?os='+os,{waitUntil:'domcontentloaded'});const osd=p.locator('dialog[open].dialogo-detalhes-os');await osd.getByRole('button',{name:'Fotos',exact:true}).click();await osd.getByRole('button',{name:'Salvar foto',exact:true}).waitFor();
  for(const fase of ['before','after']){await osd.locator('select[name=fase]').selectOption(fase);await osd.getByLabel('Legenda',{exact:true}).fill('QA '+tag+' '+fase);await osd.locator('input[type=file]').setInputFiles(imagem);const confirmar=p.waitForResponse(r=>r.url().endsWith('/rpc/confirmar_foto_os'));await osd.getByRole('button',{name:'Salvar foto',exact:true}).click();assert((await confirmar).ok());await osd.getByRole('img',{name:'QA '+tag+' '+fase,exact:true}).waitFor();pass('Upload de foto '+fase+' na OS','os');}
  await p.reload({waitUntil:'domcontentloaded'});await osd.getByRole('button',{name:'Fotos',exact:true}).click();await osd.getByRole('img',{name:'QA '+tag+' after',exact:true}).waitFor();const atual=await rpc('consultar_ordem_servico',{p_oficina:c.empresa_id,p_os:os});assert.equal(atual.fotos.filter(f=>f.legenda==='QA '+tag+' before'||f.legenda==='QA '+tag+' after').length,2);assert.equal(atual.total_centavos,15300);assert(await osd.evaluate(el=>el.scrollWidth<=el.clientWidth+1));pass('Fotos antes/depois e total da OS preservados após reabrir','os');await p.screenshot({path:resolve(out,c.especialidade+'-os-fotos.png')});
  console.log('PASS fotos',c.especialidade);await gravar();
 }catch(e){process.exitCode=1;console.error(e.stack);await p.screenshot({path:resolve(out,c.especialidade+'-falha.png')});await writeFile(resolve(out,c.especialidade+'-falha.txt'),await p.locator('body').innerText());throw e;}finally{await ctx.close();}
}}catch{process.exitCode=1;}finally{await browser.close();if(erros.length)process.exitCode=1;await gravar();}

