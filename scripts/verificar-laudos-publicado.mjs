import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const base='https://patio-gestao-peach.vercel.app',banco='https://hzihxtjirttetnfdujcx.supabase.co',out='output/laudos-20261106/publicado';await mkdir(out,{recursive:true});
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas;
const pacote=JSON.parse(await readFile('output/laudos-20261106/pacote-publicacao.json','utf8'));
assert.equal((await fetch(base+'/health.json?qa='+Date.now()).then(r=>r.json())).build,pacote.build);
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[],erros=[];let ctx,p,perfil;
try {
 assert.equal(contas.length,26);
 for(const [i,c] of contas.entries()) {
  assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));perfil=c.especialidade;
  await ctx?.close();ctx=await browser.newContext({viewport:{width:i%2?390:1920,height:1080},locale:'pt-BR',timezoneId:'America/Sao_Paulo'});
  await ctx.addInitScript(()=>{window.qaPrint=0;const open=window.open.bind(window);window.open=(...args)=>{const w=open(...args);if(w)w.print=()=>{window.qaPrint++};return w}});
  p=await ctx.newPage();p.setDefaultTimeout(30000);p.on('pageerror',e=>erros.push({perfil,mensagem:e.message}));let headers;
  p.on('request',r=>{if(r.url().startsWith(banco+'/rest/v1/')){const h=r.headers();if(h.authorization)headers={authorization:h.authorization,apikey:h.apikey,'content-type':'application/json'};}});
  const rpc=async(n,args)=>{assert.equal(args.p_oficina,c.empresa_id);const r=await p.request.post(banco+'/rest/v1/rpc/'+n,{headers,data:args});if(r.status()!==200)throw Error(n+' '+r.status()+' '+(await r.text()).slice(0,600));return r.json();};
  await p.goto(base+'/entrar');await p.getByLabel('E-mail',{exact:true}).fill(c.email);await p.getByLabel('Senha',{exact:true}).fill(c.senha);await p.getByRole('button',{name:'Entrar no sistema',exact:true}).click();await p.waitForURL(u=>!u.pathname.startsWith('/entrar'));await p.goto(base+'/laudos');await p.getByRole('button',{name:'Novo laudo',exact:true}).waitFor();
  await p.locator('.laudos-lista').waitFor();for(let t=0;!headers&&t<100;t++)await p.waitForTimeout(50);assert(headers);
  const fontes=await rpc('buscar_origens_laudo',{p_oficina:c.empresa_id,p_busca:''});assert(fontes.length>0,perfil+' precisa de OS de teste');const fonte=fontes[0];
  const original=await rpc(fonte.tipo==='os'?'consultar_ordem_servico':'consultar_detalhes_atendimento',{p_oficina:c.empresa_id,...(fonte.tipo==='os'?{p_os:fonte.id}:{p_atendimento:fonte.id})});
  await p.goto(base+`/laudos?tipo=${fonte.tipo}&origem=${fonte.id}&novo=1`);await p.getByRole('dialog',{name:'Novo laudo técnico',exact:true}).waitFor();await p.getByText(/Vinculado a /).waitFor();
  assert.equal(await p.getByLabel('Cliente / solicitante',{exact:true}).inputValue(),fonte.cliente);
  const titulo='QA Laudo '+perfil+' '+Date.now();await p.getByLabel('Título',{exact:true}).fill(titulo);await p.getByLabel('O que foi constatado',{exact:true}).fill('Teste fictício do módulo de laudos: inspeção e medições registradas.');await p.getByLabel('Serviços realizados',{exact:true}).fill('Conferência simulada do serviço para '+perfil);await p.getByLabel('Conclusão técnica',{exact:true}).fill('Documento exclusivamente de teste. Resultado conferido.');await p.getByLabel('Responsável pelo laudo',{exact:true}).fill('Técnico QA fictício');
  assert(await p.locator('dialog.laudos-dialogo[open]').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  const salva=p.waitForResponse(r=>r.url().endsWith('/rpc/operar_laudo')&&r.request().postDataJSON().p_acao==='salvar');await p.getByRole('button',{name:'Salvar e visualizar',exact:true}).click();const res=await salva;assert.equal(res.status(),200);const laudo=await res.json();assert.equal(laudo.origem_id,fonte.id);assert.equal(laudo.dados.cliente,fonte.cliente);
  await p.getByRole('button',{name:'Emitir laudo',exact:true}).click();const emite=p.waitForResponse(r=>r.url().endsWith('/rpc/operar_laudo')&&r.request().postDataJSON().p_acao==='emitir');await p.getByRole('button',{name:'Confirmar emissão',exact:true}).click();assert.equal((await emite).status(),200);await p.getByRole('button',{name:'Criar nova revisão',exact:true}).waitFor();
  const v=await rpc('consultar_versao_laudo',{p_oficina:c.empresa_id,p_id:laudo.id,p_versao:1});assert.equal(v.conteudo.dados.titulo,titulo);assert.equal(v.conteudo.empresa.nome,c.empresa);assert.equal(v.conteudo.dados.cliente,fonte.cliente);assert.match(v.hash,/^[a-f0-9]{64}$/);
  const popupPromise=p.waitForEvent('popup');await p.getByRole('button',{name:'Imprimir / PDF',exact:true}).click();const popup=await popupPromise;await p.waitForFunction(()=>window.qaPrint===1);const text=await popup.locator('body').innerText();assert(text.includes(fonte.cliente));assert(text.includes(c.empresa));assert(text.includes(titulo));assert(text.includes('Documento exclusivamente de teste'));
  if(['retifica','assistencia_celulares','manutencao_climatizacao','limpeza_residencial'].includes(perfil)){await popup.screenshot({path:out+'/'+perfil+'-impressao.png',fullPage:true});await p.screenshot({path:out+'/'+perfil+'-tela.png',fullPage:true});}
  await popup.close();await p.getByText('Histórico e outras opções',{exact:true}).click();await p.getByRole('button',{name:'Cancelar laudo',exact:true}).click();await p.getByLabel('Motivo',{exact:true}).fill('Teste concluído; documento fictício.');await p.getByRole('button',{name:'Confirmar cancelamento',exact:true}).click();await p.getByText('LAUDO CANCELADO',{exact:true}).waitFor();
  assert.deepEqual(await rpc(fonte.tipo==='os'?'consultar_ordem_servico':'consultar_detalhes_atendimento',{p_oficina:c.empresa_id,...(fonte.tipo==='os'?{p_os:fonte.id}:{p_atendimento:fonte.id})}),original);
  const armazenado=await rpc('consultar_laudo',{p_oficina:c.empresa_id,p_id:laudo.id});assert.equal(armazenado.situacao,'cancelado');assert.equal(armazenado.versoes.length,1);
  resultados.push({perfil,empresa:c.empresa_id,laudo:laudo.id,numero:laudo.numero,origem:fonte.id,vinculoConferido:true,emitido:true,impressao:true,versaoPreservada:true,semAlterarOS:true,canceladoAposTeste:true,largura:i%2?390:1920,ok:true});await writeFile(out+'/parcial.json',JSON.stringify({resultados},null,2));console.log('PASS',perfil);
 }
 assert.deepEqual(erros,[]);
}catch(e){console.error(perfil,e.stack);process.exitCode=1;if(p){await p.screenshot({path:out+'/falha.png'});await writeFile(out+'/falha.txt',await p.locator('body').innerText());}}
finally{await browser.close();await writeFile(out+'/resultado.json',JSON.stringify({ok:!process.exitCode,build:pacote.build,resultados,erros},null,2));console.log(JSON.stringify({ok:!process.exitCode,subsistemas:resultados.length}));}
