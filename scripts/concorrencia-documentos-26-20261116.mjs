// Navegadores isolados, empresas fictícias; gravação somente pelos controles do site.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createClient} from '@supabase/supabase-js';
const root='output/timeouts-concorrencia-26-20261116',fase=process.env.QA_FASE||'antes',limite=Number(process.env.QA_CONCORRENCIA||4),qtd=Number(process.env.QA_ITENS||12);
const out=root+'/'+fase+'-documentos-'+limite;await mkdir(out,{recursive:true});
const base=process.env.QA_URL||'https://patio-gestao-peach.vercel.app',api='https://hzihxtjirttetnfdujcx.supabase.co';
const env=Object.fromEntries((await readFile('.env.local','utf8')).split(/\r?\n/).filter(l=>/^VITE_SUPABASE_/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));assert.equal(env.VITE_SUPABASE_URL,api);
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.filter(c=>!process.env.QA_PERFIS||process.env.QA_PERFIS.split(',').includes(c.especialidade));assert(contas.every(c=>c.empresa.startsWith('ZZ [TESTE 20261019] ')));
const build=await fetch(base+'/health.json?qa='+Date.now(),{signal:AbortSignal.timeout(30000)}).then(r=>r.json());console.log('BUILD',build.build);
const clients=[];for(const c of contas){const cli=createClient(api,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(30000)})}});const {data,error}=await cli.auth.signInWithPassword({email:c.email,password:c.senha});assert.ifError(error);clients.push({cli,session:data.session});console.log('SESSÃO',c.especialidade);}
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const resultados=[],requisicoes=[],falhas=[],docs=[],errosJs=[],inicio=new Date().toISOString();let parar=false,picoGravacoes=0,gravacoes=0;
let filaArquivo=Promise.resolve();const salvar=()=>{const json=JSON.stringify({fase,limite,qtd,build:build.build,inicio,fim:new Date().toISOString(),picoGravacoes,resultados,requisicoes,falhas,docs,errosJs,paradaPreventiva:parar},null,2);filaArquivo=filaArquivo.then(()=>writeFile(out+'/resultado.json',json));return filaArquivo};
const nomes={assistencia_tecnica:['Ordem de reparo','Equipamento'],manutencao_campo:['Visita técnica','Local / equipamento'],limpeza:['Serviço de limpeza','Local']};
async function abrir(i){
 const c=contas[i],auto=c.ramo==='automotivo',mobile=(i%2===1)!==(process.env.QA_INVERTER==='1'),ctx=await browser.newContext({viewport:{width:mobile?390:1920,height:mobile?844:1080},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block',locale:'pt-BR',timezoneId:'America/Sao_Paulo'});
 await ctx.addInitScript(({session,base})=>{if(location.origin===base&&!localStorage.getItem('sb-hzihxtjirttetnfdujcx-auth-token'))localStorage.setItem('sb-hzihxtjirttetnfdujcx-auth-token',JSON.stringify(session))},{session:clients[i].session,base});
 const p=await ctx.newPage();p.setDefaultTimeout(30000);const tempos=new Map(),u={c,auto,mobile,ctx,p,i,tipo:null,doc:null};
 p.on('pageerror',e=>errosJs.push({perfil:c.especialidade,erro:e.message}));
 p.on('request',r=>{if(r.url().startsWith(api+'/rest/v1/')){const payload=r.postDataJSON();if(payload?.p_oficina)assert.equal(payload.p_oficina,c.empresa_id);const nome=new URL(r.url()).pathname.split('/').pop(),write=/^(salvar_|criar_|emitir_|cadastrar_)/.test(nome);if(write){gravacoes++;picoGravacoes=Math.max(picoGravacoes,gravacoes)}tempos.set(r,{nome,inicio:performance.now(),write});}});
 p.on('requestfinished',async r=>{const t=tempos.get(r);if(!t)return;if(t.write)gravacoes--;const response=await r.response();const q={perfil:c.especialidade,tipo:u.tipo,nome:t.nome,segundos:(performance.now()-t.inicio)/1000,status:response.status(),timestamp:new Date().toISOString()};if(!response.ok()){try{q.erro=JSON.parse(await response.text()).code}catch{}if(q.erro==='57014'||response.status()>=500){falhas.push({...q,origem:'API'});if(falhas.filter(f=>f.origem==='API').length>=3)parar=true}}requisicoes.push(q)});
 p.on('requestfailed',r=>{const t=tempos.get(r);if(t?.write)gravacoes--;});
 u.btn=(name,scope=p)=>scope.getByRole('button',{name,exact:true});
 u.form=()=>p.locator('dialog[open].dialogo-orcamento');
 u.dd=()=>auto?p.locator('dialog[open]').last():p.locator('dialog[open].detalhes-servico');
 u.rpc=async(n,args={})=>{const {data,error}=await clients[i].cli.rpc(n,{p_oficina:c.empresa_id,...args});assert.ifError(error);return data};
 u.resposta=async(n,fn)=>{const espera=p.waitForResponse(r=>r.url().endsWith('/rpc/'+n));await fn();const r=await espera;const text=await r.text(),d=text?JSON.parse(text):null;assert(r.ok(),n+': '+JSON.stringify(d));return d};
 u.pronto=async()=>{if(auto){if(u.tipo==='ordem')await u.btn('Imprimir nota da OS').waitFor();else{await p.locator('dialog[open] .documento-orcamento,dialog[open] .proposta-documento').first().waitFor();await p.waitForFunction(()=>{const b=document.querySelector('dialog[open] button[aria-label="Compartilhar PDF"]');return b&&!b.disabled})}}else{await u.btn('Resumo',u.dd()).waitFor();await p.waitForFunction(()=>{const b=[...document.querySelectorAll('dialog[open].detalhes-servico button')].find(b=>b.textContent==='Resumo');return b&&!b.disabled})}};
 u.layout=async()=>{const m=await p.evaluate(()=>({largura:innerWidth,documento:document.documentElement.scrollWidth,dialogos:[...document.querySelectorAll('dialog[open]')].map(e=>({largura:e.clientWidth,conteudo:e.scrollWidth}))}));assert(m.documento<=m.largura+2&&m.dialogos.every(d=>d.conteudo<=d.largura+2),'Transbordamento horizontal '+JSON.stringify(m));return m};
 u.ler=()=>u.rpc(auto?(u.tipo==='ordem'?'consultar_ordem_servico':'consultar_orcamento'):'consultar_detalhes_atendimento',auto?(u.tipo==='ordem'?{p_os:u.doc.id}:{p_orcamento:u.doc.id,p_versao:null}):{p_atendimento:u.doc.id});
 return u;
}
async function etapa(u,nome,fn){const t=performance.now();try{await fn();resultados.push({perfil:u.c.especialidade,mobile:u.mobile,tipo:u.tipo,nome,segundos:(performance.now()-t)/1000,ok:true});return true}catch(e){falhas.push({perfil:u.c.especialidade,mobile:u.mobile,tipo:u.tipo,nome,erro:e.message,segundos:(performance.now()-t)/1000});u.falhou=true;console.log('FAIL',u.c.especialidade,nome,e.message.slice(0,240));await u.p.screenshot({path:out+'/'+u.c.especialidade+'-'+u.tipo+'-falha.png'}).catch(()=>{});await writeFile(out+'/'+u.c.especialidade+'-'+u.tipo+'-falha.txt',await u.p.locator('body').innerText().catch(()=>''));return false}finally{await salvar()}}
async function preparar(u,tipo){
 const {c,p,auto}=u;u.tipo=tipo;u.token='QA C26 '+Date.now()+' '+c.especialidade;u.item='QA C26 serviço 1';u.doc=null;
 await p.goto(base+(tipo==='orcamento'?'/orcamentos':auto?'/ordens-servico':'/atendimentos'),{waitUntil:'domcontentloaded',timeout:45000});
 await u.btn(tipo==='orcamento'?'Novo orçamento':auto?'Nova OS':nomes[c.ramo][0],p.locator('main')).click();
 if(auto){await p.getByRole('option',{name:'Informar cliente sem cadastrar',exact:true}).click();await p.getByLabel('Nome do cliente',{exact:true}).fill(u.token);
  if(c.especialidade==='retifica'){await p.getByLabel('Carro',{exact:true}).fill('Volkswagen Gol QA');await p.getByLabel('Motor',{exact:true}).fill('AP 1.6')}
  else{await u.btn('Novo veículo').click();await p.getByLabel('Nome / modelo do veículo',{exact:true}).fill(u.token+' Gol');await u.btn('Cadastrar e selecionar').click();await p.getByText('Veículo cadastrado e selecionado.',{exact:true}).waitFor()}
 }else{const s=JSON.parse(await readFile('output/regressao-assistencia-manutencao-limpeza-20261116/sementes/'+c.especialidade+'.json','utf8'));await u.form().getByRole('combobox',{name:'Cliente',exact:true}).fill(s.clienteNome);await u.form().getByRole('option',{name:s.clienteNome,exact:true}).click();const obj=u.form().getByRole('combobox',{name:nomes[c.ramo][1],exact:true});if(!(await obj.inputValue()).includes(s.objetoNome)){await obj.fill(s.objetoNome);await u.form().getByRole('option').filter({hasText:s.objetoNome}).first().click()}}
 for(let n=1;n<=qtd;n++){await u.btn(/Serviço ou (peça avulsa|material avulso|produto avulso)/).click();const g=p.getByRole('group',{name:'Novo item avulso'});await g.getByLabel(/^Nome do serviço ou /).fill('QA C26 serviço '+n);await g.getByLabel('Preço unitário (R$)',{exact:true}).fill('100');await u.btn('Adicionar serviço',g).click()}
 await p.getByLabel('Desconto (%)',{exact:true}).fill('10');await u.layout();
}
async function criar(u){
 const n=u.auto?(u.tipo==='ordem'?'salvar_os_com_itens':'emitir_orcamento'):'criar_atendimento_com_itens';
 const d=await u.resposta(n,()=>u.btn(u.tipo==='ordem'?'Abrir ordem de serviço':'Salvar orçamento').click());u.doc={perfil:u.c.especialidade,mobile:u.mobile,tipo:u.tipo,id:u.auto?d.id:d,numero:d?.numero};docs.push(u.doc);await salvar();await u.pronto();
 const r=await u.ler();u.doc.numero=u.auto?r.numero:r.atendimento.numero;const total=u.auto?(u.tipo==='ordem'?r.total_centavos:r.versao.total_centavos):r.atendimento.valor_centavos;assert.equal(total,qtd*9000);assert.equal(r.itens.length,qtd);await u.layout();
}
async function editar(u){
 const {p,auto}=u;
 if(auto){if(u.tipo==='ordem'){await u.btn('Editar OS').click();await u.btn('Salvar alterações da OS').waitFor()}else{await u.btn('Fechar janela',u.dd()).click();await p.getByLabel('Buscar orçamentos',{exact:true}).fill(String(u.doc.numero));await u.btn('Editar orçamento #'+u.doc.numero).click();await u.btn('Salvar alterações').waitFor()}
  await p.getByLabel('Quantidade de '+u.item,{exact:true}).fill('2');await u.btn('Desconto em porcentagem').click();await p.getByLabel('Desconto (%)',{exact:true}).fill('20');
 }else{await u.btn(u.c.ramo==='assistencia_tecnica'?'Serviços e peças':'Serviços e materiais',u.dd()).click();const first=u.dd().locator('.atendimento-item').filter({has:p.getByRole('button',{name:'Aumentar quantidade de '+u.item,exact:true})});await u.btn('Aumentar quantidade de '+u.item,first).click();await u.btn('Desconto em porcentagem',u.dd()).click();await u.dd().getByLabel('Desconto (%)',{exact:true}).fill('20')}
}
async function salvarEdicao(u){
 await u.resposta(u.auto?(u.tipo==='ordem'?'salvar_os_com_itens':'emitir_orcamento'):'salvar_itens_atendimento_nota',()=>u.btn(u.auto?(u.tipo==='ordem'?'Salvar alterações da OS':'Salvar alterações'):'Salvar itens e valores').click());await u.pronto();
 const d=await u.ler();const total=u.auto?(u.tipo==='ordem'?d.total_centavos:d.versao.total_centavos):d.atendimento.valor_centavos;assert.equal(total,(qtd+1)*8000);assert.equal(d.itens.length,qtd);u.doc.total=total;u.doc.conferido=true;await u.layout();
}
async function consultar(u){
 const {p,auto}=u;await u.btn('Fechar janela',u.dd()).click();
 if(auto){await p.getByLabel(u.tipo==='ordem'?'Buscar ordens de serviço':'Buscar orçamentos',{exact:true}).fill(String(u.doc.numero));await u.btn(new RegExp('^Abrir '+(u.tipo==='ordem'?'OS':'orçamento')+' #'+u.doc.numero+'(?: de |$)')).click()}
 else{await p.getByRole('searchbox').filter({visible:true}).first().fill(String(u.doc.numero));await p.locator('.servico-linha-abrir').filter({hasText:'#'+u.doc.numero}).click()}
 await u.pronto();await u.layout();await p.screenshot({path:out+'/'+u.c.especialidade+'-'+u.tipo+'.png'});
 const d=await u.ler();assert.equal(u.auto?(u.tipo==='ordem'?d.total_centavos:d.versao.total_centavos):d.atendimento.valor_centavos,u.doc.total);
}
try{for(let start=0;start<contas.length&&!parar;start+=limite){const users=await Promise.all(contas.slice(start,start+limite).map((_,n)=>abrir(start+n)));try{
 for(const tipo of ['ordem','orcamento']){if(parar)break;
  await Promise.all(users.filter(u=>!u.falhou).map(u=>etapa(u,'Preencher '+tipo,()=>preparar(u,tipo))));
  if(parar)break;console.log('GRAVAR',tipo,users.filter(u=>!u.falhou).length,new Date().toISOString());
  await Promise.all(users.filter(u=>!u.falhou).map(u=>etapa(u,'Salvar criação',()=>criar(u))));
  if(parar)break;await Promise.all(users.filter(u=>!u.falhou).map(u=>etapa(u,'Preparar edição',()=>editar(u))));
  if(parar)break;await Promise.all(users.filter(u=>!u.falhou).map(u=>etapa(u,'Salvar edição',()=>salvarEdicao(u))));
  if(parar)break;await Promise.all(users.filter(u=>!u.falhou).map(u=>etapa(u,'Consultar e conferir',()=>consultar(u))));
 }console.log('LOTE',start,'docs',docs.length,'falhas',falhas.length);
 }finally{await Promise.all(users.map(u=>u.ctx.close()))}}
}finally{await browser.close();await salvar()}
console.log(JSON.stringify({docs:docs.length,conferidos:docs.filter(x=>x.conferido).length,falhas:falhas.length,picoGravacoes,parar}));if(falhas.length||docs.length!==contas.length*2)process.exitCode=1;
