// Concorrência e resposta perdida, somente nas ordens fictícias da rodada R16.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {matrizConcluida} from './dados-regressao-servicos-20261116.mjs';
const root='output/regressao-assistencia-manutencao-limpeza-20261116',out=root+'/excecoes';await mkdir(out,{recursive:true});
const base=process.env.QA_URL||'https://patio-gestao-peach.vercel.app',banco='https://hzihxtjirttetnfdujcx.supabase.co';
const docs=await matrizConcluida();
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.filter(c=>c.ramo!=='automotivo'&&(!process.env.QA_PERFIS||process.env.QA_PERFIS.split(',').includes(c.especialidade)));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[];
try{resultados.push(...JSON.parse(await readFile(out+'/resultados.json','utf8')).resultados)}catch{}
const gravar=()=>writeFile(out+'/resultados.json',JSON.stringify({geradoEm:new Date().toISOString(),ok:resultados.every(r=>r.ok),resultados},null,2));
for(const c of contas){
 if(resultados.some(r=>r.perfil===c.especialidade&&r.ok))continue;
 const antigo=resultados.findIndex(r=>r.perfil===c.especialidade);if(antigo>=0)resultados.splice(antigo,1);
 assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
 const s=JSON.parse(await readFile(`${root}/sementes/${c.especialidade}.json`,'utf8'));
 const doc=docs.find(d=>d.perfil===c.especialidade&&d.tipo==='ordem'&&d.completo&&d.pdf);assert(doc,'Documento completo de referência ausente: '+c.especialidade);
 const r={perfil:c.especialidade,checks:[],tempos:[],ok:false};resultados.push(r);
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
 const p=await ctx.newPage();p.setDefaultTimeout(25000);let headers,passo='login';
 p.on('request',q=>{if(q.url().startsWith(banco+'/rest/v1/')){const h=q.headers();if(h.authorization)headers={authorization:h.authorization,apikey:h.apikey,'content-type':'application/json'}}});
 const rpc=async(n,a={})=>{const q=await p.request.post(banco+'/rest/v1/rpc/'+n,{headers,data:{p_oficina:c.empresa_id,...a}});assert(q.ok(),n+': '+await q.text());return q.json()};
 const d=pg=>pg.locator('dialog[open].detalhes-servico'),f=pg=>pg.locator('dialog[open].dialogo-orcamento');
 const button=(scope,name)=>scope.getByRole('button',{name,exact:true});
 const abrir=async pg=>{await pg.goto(base+'/atendimentos?atendimento='+doc.id,{waitUntil:'domcontentloaded'});await button(d(pg),'Editar ficha e dados').waitFor()};
 const salvar=async(pg,nome,botao)=>{const espera=pg.waitForResponse(q=>q.url().endsWith('/rpc/'+nome));await button(botao.scope,botao.nome).click();return espera};
 const check=(cond,nome,extra)=>{assert(cond,nome);r.checks.push({nome,...extra})};
 const layout=async(nome,width)=>{await p.setViewportSize({width,height:844});const m=await p.evaluate(()=>({inner:innerWidth,body:document.documentElement.scrollWidth,dialogs:[...document.querySelectorAll('dialog[open]')].map(x=>({w:x.clientWidth,scroll:x.scrollWidth}))}));check(m.inner<=width+2&&m.body<=width+2&&m.dialogs.every(x=>x.scroll<=x.w+2),nome,{width,medidas:m});await p.screenshot({path:`${out}/${c.especialidade}-${nome}-${width}.png`})};
 try{
  await p.goto(base+'/entrar',{waitUntil:'domcontentloaded'});await p.getByLabel('E-mail',{exact:true}).fill(c.email);await p.getByLabel('Senha',{exact:true}).fill(c.senha);await button(p,'Entrar no sistema').click();await p.waitForURL(u=>!u.pathname.startsWith('/entrar'),{waitUntil:'domcontentloaded'});await abrir(p);
  passo='layout e linguagem';for(const tema of ['claro','escuro']){await p.evaluate(t=>{localStorage.setItem('patio_tema',t);document.documentElement.dataset.tema=t},tema);await layout('resumo-'+tema,320);await layout('resumo-'+tema,390)}
  await button(d(p),'Editar ficha e dados').click();await f(p).locator('textarea[name=titulo]').waitFor();await layout('editar-ficha',320);
  const place=await f(p).locator('[placeholder]').evaluateAll(es=>es.map(e=>e.getAttribute('placeholder')));check(!place.some(x=>/virabrequim|alinhamento da direção|placa do veículo|cabeçote/i.test(x)),'Placeholders sem vocabulário automotivo');
  await button(f(p),'Fechar janela').click();await abrir(p);await button(d(p),c.ramo==='assistencia_tecnica'?'Serviços e peças':'Serviços e materiais').click();
  passo='validação de quantidade e preço';const item=d(p).locator('.atendimento-item').filter({has:p.getByRole('button',{name:'Aumentar quantidade de '+s.servicoNome,exact:true})});
  const qty=item.getByLabel('Quantidade de '+s.servicoNome,{exact:true}),preco=item.getByLabel('Preço unitário (R$)',{exact:true});const anterior=await qty.inputValue();
  let gravacoes=0;const contar=q=>{if(q.url().endsWith('/rpc/salvar_itens_atendimento_nota'))gravacoes++};p.on('request',contar);
  await qty.fill('1.001');await button(d(p),'Salvar itens e valores').click();check(!(await qty.evaluate(e=>e.validity.valid))&&gravacoes===0,'Quantidade fracionada em unidade inteira bloqueada antes do envio');await qty.fill(anterior);
  await preco.fill('-1');await button(d(p),'Salvar itens e valores').click();check(!(await preco.evaluate(e=>e.validity.valid))&&gravacoes===0,'Preço negativo bloqueado antes do envio');p.off('request',contar);
  await abrir(p);passo='edição concorrente';const outro=await ctx.newPage();outro.setDefaultTimeout(25000);await abrir(outro);await button(d(p),'Editar ficha e dados').click();await button(d(outro),'Editar ficha e dados').click();
  await f(p).locator('textarea[name=observacoes_cliente]').fill('QA R16: edição A preservada');await f(outro).locator('textarea[name=observacoes_cliente]').fill('QA R16: edição B antiga não deve sobrescrever');
  const ini=performance.now();const respA=await salvar(p,'salvar_atendimento_servico',{scope:f(p),nome:'Salvar'});assert(respA.ok(),await respA.text());await button(d(p),'Resumo').waitFor();
  const respB=await salvar(outro,'salvar_atendimento_servico',{scope:f(outro),nome:'Salvar'});const e=await respB.json();check(!respB.ok()&&e.code==='PT409','Conflito de revisão recusado',{code:e.code});
  check((await f(outro).locator('textarea[name=observacoes_cliente]').inputValue()).includes('edição B'),'Texto da edição recusada continua no formulário');
  const depois=await rpc('consultar_detalhes_atendimento',{p_atendimento:doc.id});check(depois.atendimento.dados.observacoes_cliente==='QA R16: edição A preservada','Edição antiga não sobrescreve a nova');r.tempos.push({nome:'Salvar A e bloquear edição antiga B',segundos:(performance.now()-ini)/1000});await outro.close();
  passo='resposta perdida após gravar';await p.goto(base+'/atendimentos',{waitUntil:'domcontentloaded'});const nome={assistencia_tecnica:'Ordem de reparo',manutencao_campo:'Visita técnica',limpeza:'Serviço de limpeza'}[c.ramo];await button(p.locator('main'),nome).click();
  await f(p).getByRole('combobox',{name:'Cliente',exact:true}).fill(s.clienteNome);await f(p).getByRole('option',{name:s.clienteNome,exact:true}).click();
  const objeto=f(p).getByRole('combobox',{name:{assistencia_tecnica:'Equipamento',manutencao_campo:'Local / equipamento',limpeza:'Local'}[c.ramo],exact:true});await objeto.fill(s.objetoNome);await f(p).getByRole('option').filter({hasText:s.objetoNome}).first().click();
  await f(p).getByRole('textbox',{name:/^Buscar serviço ou/}).fill(s.servicoNome);await f(p).getByRole('button',{name:'Adicionar '+s.servicoNome+' por',exact:false}).click();
  let primeiro=true,ids=[];const url=banco+'/rest/v1/rpc/criar_atendimento_com_itens';await ctx.route(url,async route=>{const data=route.request().postDataJSON();assert.equal(data.p_oficina,c.empresa_id);ids.push(data.p_id);if(primeiro){primeiro=false;const q=await route.fetch();assert(q.ok(),await q.text());r.idRespostaPerdida=await q.json();await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'QA_NETWORK_LOST',message:'Resposta interrompida depois da gravação de teste'})})}else await route.continue()});
  const t=performance.now();await button(f(p),'Abrir ordem de serviço').click();await f(p).getByRole('alert').waitFor();check(await button(f(p),'Abrir ordem de serviço').isEnabled(),'Falha preserva o formulário para tentar novamente');
  const repetida=p.waitForResponse(q=>q.url()===url&&q.status()===200);await button(f(p),'Abrir ordem de serviço').click();const rr=await repetida;await button(d(p),'Resumo').waitFor();
  check((await rr.json())===r.idRespostaPerdida&&ids.length===2&&ids[0]===ids[1],'Reenvio usa o mesmo ID e não duplica a OS');
  const salvo=await rpc('consultar_detalhes_atendimento',{p_atendimento:r.idRespostaPerdida});check(salvo.itens.length===1&&salvo.atendimento.valor_centavos===20000,'OS recuperada mantém item e total exatos');r.tempos.push({nome:'Recuperar após resposta perdida',segundos:(performance.now()-t)/1000});await ctx.unroute(url);
  r.ok=true;console.log('PASS',c.especialidade,r.checks.length);
 }catch(e){r.falha={passo,mensagem:e.message};console.error('FAIL',c.especialidade,passo,e.message);await p.screenshot({path:`${out}/${c.especialidade}-falha.png`}).catch(()=>{});await writeFile(`${out}/${c.especialidade}-falha.txt`,await p.locator('body').innerText().catch(()=>''))}
 await gravar();await ctx.close();
}
await browser.close();if(resultados.some(r=>!r.ok))process.exitCode=1;
