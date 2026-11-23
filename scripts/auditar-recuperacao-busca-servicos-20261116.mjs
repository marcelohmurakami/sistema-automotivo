import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const root='output/regressao-assistencia-manutencao-limpeza-20261116',out=process.env.QA_OUTPUT||root+'/recuperacao-busca';await mkdir(out,{recursive:true});
const base=process.env.QA_URL||'http://127.0.0.1:5198',api='https://hzihxtjirttetnfdujcx.supabase.co/rest/v1/rpc/buscar_cadastros_operacao';
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.filter(c=>c.ramo!=='automotivo'&&(!process.env.QA_PERFIS||process.env.QA_PERFIS.split(',').includes(c.especialidade)));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[];
try{for(const c of contas){
 assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));const s=JSON.parse(await readFile(root+'/sementes/'+c.especialidade+'.json','utf8'));
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'}),p=await ctx.newPage();p.setDefaultTimeout(25000);
 await p.goto(base+'/entrar',{waitUntil:'domcontentloaded'});await p.getByLabel('E-mail',{exact:true}).fill(c.email);await p.getByLabel('Senha',{exact:true}).fill(c.senha);await p.getByRole('button',{name:'Entrar no sistema',exact:true}).click();await p.waitForURL(u=>!u.pathname.startsWith('/entrar'),{waitUntil:'domcontentloaded'});
 for(const teclado of [false,true]){
  const tipo=teclado?'orcamento':'ordem',novo=teclado?'Novo orçamento':{assistencia_tecnica:'Ordem de reparo',manutencao_campo:'Visita técnica',limpeza:'Serviço de limpeza'}[c.ramo];
  await p.goto(base+(teclado?'/orcamentos':'/atendimentos'),{waitUntil:'domcontentloaded'});await p.getByRole('button',{name:novo,exact:true}).click();const form=p.locator('dialog[open].dialogo-orcamento');
  await form.getByLabel('Observações (opcional)',{exact:true}).fill('QA: texto preservado após falha na busca');
  const input=form.getByRole('combobox',{name:'Cliente',exact:true});const termo=s.clienteNome+(teclado?' ':'');let falhou=0,consultas=0,identificacoes=0;
  await ctx.route(api,route=>{const a=route.request().postDataJSON();assert.equal(a.p_oficina,c.empresa_id);if(a.p_tipo==='clientes'&&a.p_id===s.cliente)identificacoes++;if(a.p_tipo==='clientes'&&a.p_busca===s.clienteNome){consultas++;if(!falhou++){return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'57014',message:'QA temporary lookup error'})})}}return route.continue()});
  await input.fill(termo);const botao=form.locator('.selecao-rapida').filter({has:p.getByRole('combobox',{name:'Cliente',exact:true})}).getByRole('button',{name:'Tentar novamente',exact:true});await botao.waitFor();assert.equal(consultas,1);assert.equal(await input.inputValue(),termo);
  assert.equal(await input.getAttribute('aria-activedescendant'),null);
  await input.press('Enter');assert.equal(await input.inputValue(),termo);assert.equal(await form.locator('.selecao-rapida').filter({has:p.getByRole('combobox',{name:'Cliente',exact:true})}).getByRole('option').count(),0);
  const inicio=performance.now();if(teclado){await botao.focus();await botao.press('Enter')}else await botao.click();await form.getByRole('option',{name:s.clienteNome,exact:true}).waitFor();assert.equal(consultas,2);
  await form.getByRole('option',{name:s.clienteNome,exact:true}).click();assert.equal(await input.inputValue(),s.clienteNome);assert.equal(await form.getByLabel('Observações (opcional)',{exact:true}).inputValue(),'QA: texto preservado após falha na busca');
  assert(await p.evaluate(()=>innerWidth===390&&document.documentElement.scrollWidth<=392));await p.screenshot({path:`${out}/${c.especialidade}-${teclado?'teclado':'toque'}.png`});assert.equal(identificacoes,0,'Seleção conhecida não precisa de nova consulta por ID');const registro={perfil:c.especialidade,teclado,tipo,ok:false,consultas,identificacoes,segundos:(performance.now()-inicio)/1000};resultados.push(registro);await ctx.unroute(api);
  const objeto=form.getByRole('combobox',{name:{assistencia_tecnica:'Equipamento',manutencao_campo:'Local / equipamento',limpeza:'Local'}[c.ramo],exact:true});await objeto.fill(s.objetoNome);await form.getByRole('option').filter({hasText:s.objetoNome}).first().click();
  await form.getByRole('textbox',{name:/^Buscar serviço ou/}).fill(s.servicoNome);await form.getByRole('button',{name:'Adicionar '+s.servicoNome+' por',exact:false}).click();
  const salvar=p.waitForResponse(r=>r.url().endsWith('/rpc/criar_atendimento_com_itens'));await form.getByRole('button',{name:teclado?'Salvar orçamento':'Abrir ordem de serviço',exact:true}).click();const resposta=await salvar;assert(resposta.ok(),await resposta.text());registro.documento=await resposta.json();
  const detalhe=p.locator('dialog[open].detalhes-servico');await detalhe.getByRole('button',{name:'Resumo',exact:true}).waitFor();
  const h=resposta.request().headers();const resp=await p.request.post('https://hzihxtjirttetnfdujcx.supabase.co/rest/v1/rpc/consultar_detalhes_atendimento',{headers:{authorization:h.authorization,apikey:h.apikey,'content-type':'application/json'},data:{p_oficina:c.empresa_id,p_atendimento:registro.documento}});assert(resp.ok(),await resp.text());const d=await resp.json();
  assert.equal(d.atendimento.cliente_id,s.cliente);assert.equal(d.atendimento.objeto_id,s.objeto);assert.equal(d.atendimento.valor_centavos,20000);assert.equal(d.atendimento.dados.documento,tipo);assert.equal(d.itens.length,1);assert.equal(d.atendimento.dados.observacoes_cliente,'QA: texto preservado após falha na busca');registro.ok=true;
 }
 await ctx.close();console.log('PASS',c.especialidade);
}}finally{await browser.close();await writeFile(out+'/resultados.json',JSON.stringify({url:base,ok:resultados.length===contas.length*2&&resultados.every(r=>r.ok),resultados},null,2))}
