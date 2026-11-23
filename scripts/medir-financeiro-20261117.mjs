import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {preview} from 'vite';
import {chromium} from 'playwright';
import {createClient} from '@supabase/supabase-js';
import {sessaoQa} from './sessoes-qa-concorrencia-20261116.mjs';
const root=resolve('output/financeiro-velocidade-20261117'),fase=process.env.QA_FASE||'antes',out=resolve(root,fase),dist=resolve(process.env.QA_BUILD||'output/picos-abertura-20261117/build-depois');await mkdir(out,{recursive:true});
const env=Object.fromEntries((await readFile('.env.local','utf8')).split(/\r?\n/).filter(l=>/^VITE_SUPABASE_/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.filter(c=>!process.env.QA_PERFIS||process.env.QA_PERFIS.split(',').includes(c.especialidade));
const hoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const clientes=[],sessoes=[];for(const c of contas){assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));const cli=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},db:{retry:false}});clientes.push(cli);sessoes.push(await sessaoQa(cli,c))}
const server=await preview({build:{outDir:dist},preview:{host:'127.0.0.1',port:0,strictPort:true}}),base=`http://127.0.0.1:${server.httpServer.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[],falhas=[],verificacoes=[],limpeza=[],rede=[],manifesto=[];
let interromper=false;const repeticoes=Number(process.env.QA_REPETICOES||1);assert(Number.isInteger(repeticoes)&&repeticoes>=1&&repeticoes<=50);
const build=JSON.parse(await readFile(resolve(dist,'health.json'),'utf8'));
const gravar=()=>writeFile(resolve(out,'resultados.json'),JSON.stringify({fase,build,geradoEm:new Date().toISOString(),condicoes:{desktop:'1920x1080',celular:'390x844, toque, CPU 4x',entrada:'Automação sem tempo de digitação humana; conta cliques e campos',workers:Number(process.env.QA_WORKERS||1)},resultados,falhas,verificacoes,limpeza,rede,manifesto},null,2));
async function caso(i,mobile){
 const c=contas[i],cli=clientes[i],tag=`QA FIN ${Date.now().toString(36)}${randomUUID().slice(0,3)}${mobile?'M':'D'}`,ctx=await browser.newContext({viewport:{width:mobile?390:1920,height:mobile?844:1080},isMobile:mobile,hasTouch:mobile,locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
 const ids=new Set(),regras=new Set(),transferencias=new Set(),trabalhos=[];let etapa='preparação',baseSaldos,baseResumo;
 const rpc=async(n,args={})=>{const r=await cli.rpc(n,{p_oficina:c.empresa_id,...args});if(r.error)throw new Error(n+': '+r.error.message+' ['+(r.error.code||'sem código')+'] '+(r.error.details||''));return r.data};
 const painel=()=>rpc('consultar_painel_financeiro',{p_inicio:hoje.slice(0,7)+'-01',p_fim:hoje,p_busca:tag,p_filtro:'periodo',p_natureza:'',p_pagina:0,p_os:null,p_titulo:null});
 const saldos=async()=>Object.fromEntries((await rpc('consultar_contas_financeiras',{p_data:hoje})).map(x=>[x.codigo,x.saldo]));
 const verificar=(nome,condicao)=>{assert(condicao,nome);verificacoes.push({perfil:c.especialidade,mobile,nome,ok:true})};
 await ctx.addInitScript(({session,base})=>{if(location.origin!==base)return;localStorage.setItem('sb-hzihxtjirttetnfdujcx-auth-token',JSON.stringify(session));window.qaAcoes={cliques:0,campos:0};document.addEventListener('click',()=>window.qaAcoes.cliques++,true);document.addEventListener('change',()=>window.qaAcoes.campos++,true)},{session:sessoes[i],base});
 const p=await ctx.newPage();p.setDefaultTimeout(25000);const cdp=await ctx.newCDPSession(p);if(mobile)await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 const erros=[];p.on('pageerror',e=>erros.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('Failed to load resource'))erros.push(m.text().replace(/eyJ[A-Za-z0-9_.-]{50,}/g,'[token omitido]'))});const tempos=new Map();p.on('request',r=>{if(r.url().includes('/rest/v1/rpc/'))tempos.set(r,performance.now())});
 p.on('requestfailed',r=>{if(r.url().includes('/rest/v1/rpc/'))rede.push({horario:new Date().toISOString(),perfil:c.especialidade,mobile,etapa,nome:new URL(r.url()).pathname.split('/').at(-1),status:0,falha:r.failure()?.errorText,ms:performance.now()-(tempos.get(r)||performance.now())})});
 p.on('response',r=>{if(!r.url().includes('/rest/v1/rpc/'))return;const req=r.request(),nome=new URL(r.url()).pathname.split('/').at(-1);rede.push({horario:new Date().toISOString(),perfil:c.especialidade,mobile,etapa,nome,status:r.status(),ms:performance.now()-(tempos.get(req)||performance.now())});
  if(!['salvar_titulo_financeiro','criar_conta_parcelada','salvar_conta_recorrente','informar_valor_conta_mensal','transferir_financeiro'].includes(nome)||!r.ok())return;
  const tarefa=(async()=>{const dados=req.postDataJSON();assert.equal(dados.p_oficina,c.empresa_id);if(nome==='salvar_conta_recorrente'){regras.add(dados.p_id)}else{const corpo=await r.text(),valor=corpo?JSON.parse(corpo):null;if(nome==='transferir_financeiro'){transferencias.add(typeof valor==='string'?valor:dados.p_chave)}else if(Array.isArray(valor)){valor.forEach(x=>ids.add(x))}else if(typeof valor==='string')ids.add(valor)}manifesto.push({perfil:c.especialidade,mobile,empresa:c.empresa_id,tag,nome,ids:[...ids],regras:[...regras],transferencias:[...transferencias]})})().catch(e=>{erros.push('Captura do teste: '+e.message)});trabalhos.push(tarefa);
 });
 const d=()=>p.locator('dialog[open]').last(),fechar=async()=>{await d().getByRole('button',{name:'Fechar janela',exact:true}).click();await p.locator('dialog[open]').waitFor({state:'hidden'})};
 const tab=async(nome,id)=>{await p.getByRole('navigation',{name:'Visões do financeiro'}).waitFor();const btn=p.getByRole('navigation',{name:'Visões do financeiro'}).getByRole('button',{name:nome,exact:true});if(await btn.isVisible())await btn.click();else await p.getByRole('combobox',{name:'O que você quer consultar?',exact:true}).selectOption(id)};
 const buscar=async(nome,mostrar='abertos')=>{await tab('A pagar e receber','contas');await p.getByRole('combobox',{name:'Mostrar',exact:true}).selectOption(mostrar);await p.getByRole('combobox',{name:'Tipo',exact:true}).selectOption('');await p.getByPlaceholder('Descrição ou pessoa',{exact:true}).fill(nome);await p.locator('.fin-linha-agil').filter({hasText:nome}).first().waitFor()};
 const linha=nome=>p.locator('.fin-linha-agil').filter({hasText:nome}).first();
 const ac=()=>p.evaluate(()=>window.qaAcoes||{cliques:0,campos:0});
 const medir=async(nome,fn)=>{etapa=nome;const a=await ac(),t=performance.now(),n=rede.length;await fn();const b=await ac();resultados.push({perfil:c.especialidade,mobile,nome,segundos:(performance.now()-t)/1000,cliques:b.cliques-a.cliques,campos:b.campos-a.campos,consultas:rede.length-n});await gravar()};
 const layout=async(nome)=>{const v=await p.evaluate(()=>({pagina:document.documentElement.scrollWidth-innerWidth,dialogos:[...document.querySelectorAll('dialog[open]')].map(e=>e.scrollWidth-e.clientWidth)}));verificar('Layout '+nome,v.pagina<=2&&v.dialogos.every(x=>x<=2))};
 const confirmar=async()=>{await d().getByRole('button',{name:'Confirmar registro',exact:true}).click();await p.locator('dialog[open]').waitFor({state:'hidden'})};
 const titulo=async(nome)=>(await painel()).itens.find(x=>x.descricao===nome);
 try{
  baseResumo=(await painel()).resumo;baseSaldos=await saldos();manifesto.push({perfil:c.especialidade,mobile,empresa:c.empresa_id,tag,nome:"base",ids:[],regras:[],transferencias:[],baseSaldos,baseResumo});await gravar();
  if(process.env.QA_MENSAL){const {conferirMensais}=await import('./conferir-mensais-transicao-20261117.mjs');await conferirMensais({p,d,tab,fechar,medir,layout,verificar,rpc,tag,base,hoje});assert.deepEqual(erros,[]);console.log('PASS MENSAIS',fase,c.especialidade,mobile?'celular':'desktop');return;}
  if(process.env.QA_ABERTURA){await medir('Abrir financeiro com captura de diagnóstico',async()=>{await p.goto(base+'/financeiro',{waitUntil:'commit'});await p.waitForFunction(()=>document.querySelector('.fin-cartoes-caixa')||document.querySelector('.cartao-acesso[role=alert]'));assert(await p.locator('.fin-cartoes-caixa').count(),'Proteção do aplicativo acionada ao abrir')});await layout('Abertura');assert.deepEqual(erros,[]);console.log('PASS ABERTURA',fase,c.especialidade,mobile?'celular':'desktop');return;}
  if(process.env.QA_GERAL){
   const {conferirConsultas}=await import('./conferir-financeiro-consultas-20261117.mjs');
   await conferirConsultas({p,medir,layout,base,automotivo:c.ramo==='automotivo',verificar});
   assert.deepEqual(erros,[]);console.log('PASS CONSULTAS',fase,c.especialidade,mobile?'celular':'desktop');return;
  }
  if(process.env.QA_CONTROLE){
   const {conferir}=await import('./conferir-financeiro-agil-casos-20261117.mjs');
   await conferir({p,d,fechar,tab,buscar,linha,medir,layout,confirmar,titulo,rpc,ids,tag,base,hoje,mobile,verificar,out,perfil:c.especialidade,fase});
   assert.deepEqual(erros,[]);console.log('PASS CONTROLE',fase,c.especialidade,mobile?'celular':'desktop');return;
  }
  await medir('Abrir financeiro',async()=>{await p.goto(base+'/financeiro',{waitUntil:'commit'});await p.locator('.fin-cartoes-caixa').waitFor()});await layout('Resumo');
  // O mesmo objetivo é medido completo nas duas versões; a nova pode encadear cadastro e baixa.
  for(const [tipo,valor] of [['receber','123.45'],['pagar','88.90']]){
   const nome=tag+' '+tipo;
   const etapasTempo=[];let ultimaMarca=performance.now();const marcar=etapa=>{const agora=performance.now();if(process.env.QA_RAPIDO)etapasTempo.push({etapa,segundos:(agora-ultimaMarca)/1000});ultimaMarca=agora};
   await medir('Cadastrar e '+tipo+' uma conta',async()=>{
    marcar('Início');
    await p.getByRole('button',{name:'Nova conta a '+tipo,exact:true}).click();await d().locator('[name=descricao]').fill(nome);await d().locator('[name=valor]').fill(valor);
    marcar('Abrir e preencher conta');
    const atalho=d().getByRole('button',{name:'Salvar e '+tipo,exact:true});
    if(await atalho.count()){await atalho.click();await d().locator('.fin-form-baixa').waitFor()}
    else{await d().getByRole('button',{name:'Salvar lançamento',exact:true}).click();await p.locator('dialog[open]').waitFor({state:'hidden'});await buscar(nome);await linha(nome).getByRole('button',{name:(tipo==='receber'?'Receber ':'Pagar ')+nome,exact:true}).click()}
    marcar('Salvar e abrir confirmação');
    if(tipo==='pagar')await d().locator('[name=forma]').selectOption('dinheiro');await confirmar();
    marcar('Confirmar e atualizar saldos');
   });
   if(process.env.QA_RAPIDO)resultados.at(-1).etapasTempo=etapasTempo;
   const t=await titulo(nome);ids.add(t.id);verificar(tipo+' quitado',t.aberto_centavos===0&&t.baixado_centavos===Math.round(Number(valor)*100));
   const h=await rpc('historico_financeiro',{p_titulo:t.id});verificar(tipo+' sem duplicação',h.length===1);verificar(tipo+' conta correta',h[0].conta===(tipo==='pagar'?'caixa':'banco'));
   await tab('Resumo','visao');
  }
  let s=await saldos();verificar('Saldo após receber e pagar',s.banco===baseSaldos.banco+12345&&s.caixa===baseSaldos.caixa-8890);
  if(process.env.QA_RAPIDO){assert.deepEqual(erros,[]);console.log('PASS RAPIDO',fase,c.especialidade,mobile?'celular':'desktop');return;}
  const parcial=tag+' parcial';
  await medir('Criar conta a prazo',async()=>{await p.getByRole('button',{name:'Nova conta a receber',exact:true}).click();await d().locator('[name=descricao]').fill(parcial);await d().locator('[name=valor]').fill('100');await d().getByRole('button',{name:'Salvar lançamento',exact:true}).click();await p.locator('dialog[open]').waitFor({state:'hidden'})});
  await medir('Encontrar uma conta',()=>buscar(parcial));
  await medir('Editar valor e vencimento',async()=>{await linha(parcial).locator('.fin-lancamento').click();await d().getByRole('button',{name:'Editar',exact:true}).click();await d().locator('[name=valor]').fill('120');await d().locator('[name=vencimento]').fill(hoje);await d().getByRole('button',{name:'Salvar lançamento',exact:true}).click();await p.locator('dialog[open]').waitFor({state:'hidden'})});
  await medir('Receber parte com taxa de cartão',async()=>{await linha(parcial).getByRole('button',{name:'Receber '+parcial,exact:true}).click();await d().locator('[name=valor]').fill('40');await d().locator('[name=forma]').selectOption('credito');await d().locator('[name=taxa]').fill('2');await layout('Recebimento');await confirmar();await linha(parcial).getByText(/Pago em parte/).waitFor()});
  let t=await titulo(parcial);ids.add(t.id);verificar('Saldo parcial correto',t.aberto_centavos===8000&&t.baixado_centavos===4000);
  await medir('Impedir pagamento acima do saldo',async()=>{await linha(parcial).getByRole('button',{name:'Receber '+parcial,exact:true}).click();await d().locator('[name=valor]').fill('999');assert(await d().getByRole('button',{name:'Confirmar registro',exact:true}).isDisabled());await fechar()});
  await medir('Receber restante por Pix',async()=>{await linha(parcial).getByRole('button',{name:'Receber '+parcial,exact:true}).click();await confirmar();await linha(parcial).waitFor({state:'hidden'})});
  const hist=await rpc('historico_financeiro',{p_titulo:t.id});verificar('Duas baixas e taxa somente do cartão',hist.length===2&&hist.reduce((x,b)=>x+b.taxa_centavos,0)===200);t=await titulo(parcial);verificar('Quitação exata',t.aberto_centavos===0&&t.baixado_centavos===12000);
  await buscar(parcial,'pagos');
  await medir('Consultar histórico do recebimento',async()=>{await linha(parcial).locator('.fin-lancamento').click();await d().locator('.fin-historico').nth(1).waitFor();await layout('Histórico')});
  await medir('Estornar recebimento',async()=>{await d().getByRole('button',{name:'Estornar este registro',exact:true}).first().click();await d().locator('[name=motivo]').fill('Encerrar recebimento fictício de teste');await d().getByRole('button',{name:'Confirmar',exact:true}).click();await p.locator('dialog[open]').waitFor({state:'hidden'})});
  await tab('A pagar e receber','contas');await p.getByRole('combobox',{name:'Mostrar',exact:true}).selectOption('abertos');await linha(parcial).waitFor();
  await medir('Exportar lista filtrada',async()=>{const download=p.waitForEvent('download');await p.getByRole('button',{name:'Exportar lista',exact:true}).click();const f=await download;const stream=await f.createReadStream();let csv='';for await(const x of stream)csv+=x.toString();assert(csv.includes(parcial));assert(!csv.includes(tag+' receber'))});
  await medir('Criar conta parcelada',async()=>{await p.getByRole('button',{name:'Nova conta a pagar',exact:true}).click();await d().locator('[name=descricao]').fill(tag+' parcelas');await d().locator('[name=valor]').fill('100.01');if(await d().getByRole('checkbox',{name:'Dividir em parcelas',exact:true}).count())await d().getByRole('checkbox',{name:'Dividir em parcelas',exact:true}).check();else await d().getByRole('combobox',{name:'Condição combinada',exact:true}).selectOption('parcelado');await d().getByLabel('Quantidade de parcelas',{exact:true}).fill('3');await d().getByRole('button',{name:'Gerar parcelas mensais',exact:true}).click();await d().getByRole('button',{name:'Criar parcelas',exact:true}).click();await p.locator('dialog[open]').waitFor({state:'hidden'})});
  const pp=await rpc('consultar_painel_financeiro',{p_inicio:hoje.slice(0,7)+'-01',p_fim:hoje,p_busca:tag+' parcelas',p_filtro:'abertos',p_natureza:'',p_pagina:0,p_os:null,p_titulo:null});pp.itens.forEach(t=>ids.add(t.id));verificar('Parcelamento fecha centavos',pp.itens.length===3&&pp.itens.reduce((s,x)=>s+x.valor_centavos,0)===10001);
  for(const variavel of [false,true]){
   await tab('Contas mensais','recorrencias');await p.getByRole('heading',{name:'Contas mensais',exact:true}).waitFor();const nome=tag+(variavel?' mensal variavel':' mensal fixa');
   await medir('Criar conta mensal '+(variavel?'variável':'fixa'),async()=>{await p.getByRole('button',{name:'Nova conta mensal',exact:true}).click();await d().getByLabel('Nome da conta',{exact:true}).fill(nome);if(variavel)await d().getByRole('combobox',{name:'Valor mensal',exact:true}).selectOption('variavel');else await d().getByLabel('Valor fixo mensal',{exact:true}).fill('59.90');await d().getByLabel('Dia do vencimento',{exact:true}).fill(String(Number(hoje.slice(-2))));await d().getByRole('button',{name:'Salvar conta mensal',exact:true}).click();await p.locator('dialog[open]').waitFor({state:'hidden'});await p.locator('.mensais-lista .mensal-linha').filter({hasText:nome}).waitFor()});
   const rr=(await rpc('consultar_contas_recorrentes')).find(r=>r.descricao===nome);regras.add(rr.id);
   if(variavel)await medir('Informar valor mensal variável',async()=>{const row=p.locator('.mensais-pendentes .mensal-linha').filter({hasText:nome});await row.getByRole('button',{name:'Informar valor',exact:true}).click();await d().locator('input[type=number]').fill('49.90');await d().locator('button.botao-primario').click();await p.locator('dialog[open]').waitFor({state:'hidden'});await p.getByText('49,90',{exact:false}).first().waitFor()});
   if(variavel)await tab('Contas mensais','recorrencias');
   await medir('Pausar conta mensal '+(variavel?'variável':'fixa'),async()=>{const row=p.locator('.mensais-lista .mensal-linha').filter({hasText:nome});await row.getByRole('button',{name:'Pausar',exact:true}).click();await row.getByRole('button',{name:'Retomar',exact:true}).waitFor()});
  }
  await tab('Contas bancárias','bancos');await p.getByRole('heading',{name:'Contas e saldos',exact:true}).waitFor();
  await medir('Registrar transferência entre contas',async()=>{await p.getByRole('button',{name:'Registrar transferência',exact:true}).click();await d().locator('[name=origem]').selectOption('banco');await d().locator('[name=destino]').selectOption('caixa');await d().locator('[name=valor]').fill('10');await confirmar()});
  await tab('Resumo','visao');await p.locator('.fin-cartoes-caixa').waitFor();
  await medir('Consultar entradas detalhadas',async()=>{await p.getByRole('link',{name:'Ver histórico: entradas',exact:true}).click();await p.locator('.fin-hist-resumo').waitFor();await layout('Detalhamento')});
  assert.deepEqual(erros,[]);if(['retifica','assistencia_celulares','manutencao_climatizacao','limpeza_geral'].includes(c.especialidade))await p.screenshot({path:resolve(out,c.especialidade+(mobile?'-celular':'-desktop')+'.png')});
  console.log('PASS',fase,c.especialidade,mobile?'celular':'desktop');
 }catch(e){if(process.env.QA_PARAR_FALHA)interromper=true;falhas.push({perfil:c.especialidade,mobile,etapa,erro:e.message,errosNavegador:erros,recursos:await p.evaluate(()=>performance.getEntriesByType('resource').filter(x=>x.name.includes('/assets/')).map(x=>({arquivo:x.name.split('/').at(-1),status:x.responseStatus,ms:x.duration,bytes:x.transferSize}))).catch(()=>[]),diagnosticos:await p.evaluate(()=>JSON.parse(sessionStorage.getItem('patio_diagnosticos_v1')||'[]')).catch(()=>[])});console.log('FAIL',c.especialidade,mobile,etapa,e.message.slice(0,200));await p.screenshot({path:resolve(out,c.especialidade+(mobile?'-celular':'-desktop')+'-falha.png')});await writeFile(resolve(out,c.especialidade+(mobile?'-celular':'-desktop')+'-falha.txt'),await p.locator('body').innerText())}
 finally{
  await Promise.allSettled(trabalhos);await ctx.close();
  try{
   // Só encerra registros identificados pelo prefixo único desta execução.
   for(const r of (await rpc('consultar_contas_recorrentes')).filter(r=>r.descricao.startsWith(tag))){if(r.ativa)await rpc('salvar_conta_recorrente',{p_id:r.id,p_dados:{...r,ativa:false},p_revisao:r.revisao})}
   for(const id of transferencias)await rpc('estornar_transferencia_financeira',{p_transferencia:id,p_data:hoje,p_motivo:'Encerramento do teste '+tag});
   const todos=await rpc('consultar_painel_financeiro',{p_inicio:hoje.slice(0,7)+'-01',p_fim:hoje,p_busca:tag,p_filtro:'periodo',p_natureza:'',p_pagina:0,p_os:null,p_titulo:null});todos.itens.forEach(t=>ids.add(t.id));
   for(const id of ids){let t=await rpc('consultar_titulo_alerta',{p_titulo:id});if(!t||t.cancelado_em||t.transferencia_id)continue;assert(t.descricao.startsWith(tag));const h=await rpc('historico_financeiro',{p_titulo:id});for(const b of h.filter(b=>!b.estorno_de&&!h.some(e=>e.estorno_de===b.id)))await rpc('estornar_baixa_financeira',{p_baixa:b.id,p_data:hoje,p_motivo:'Encerramento do teste '+tag});t=await rpc('consultar_titulo_alerta',{p_titulo:id});await rpc('cancelar_titulo_financeiro',{p_titulo:id,p_revisao:t.revisao,p_motivo:'Encerramento do teste '+tag})}
   const atual=await saldos();assert.deepEqual(atual,baseSaldos);const resumo=(await painel()).resumo;assert.deepEqual(resumo,baseResumo);limpeza.push({perfil:c.especialidade,mobile,tag,ok:true,saldosRestaurados:true,resumoRestaurado:true});
  }catch(e){limpeza.push({perfil:c.especialidade,mobile,tag,ok:false,erro:e.message});interromper=true;console.log('CLEANUP FAIL',c.especialidade,e.message.slice(0,220))}
  await gravar();
 }
}
try{rodada:for(let repeticao=0;repeticao<repeticoes;repeticao++)for(let i=0;i<contas.length;i++)for(const mobile of(process.env.QA_DESKTOP?[false]:[false,true])){await caso(i,mobile);if(interromper)break rodada}}finally{await browser.close();await new Promise(r=>server.httpServer.close(r));await gravar()}
assert.equal(falhas.length,0);assert(limpeza.every(x=>x.ok));assert.equal(limpeza.length,repeticoes*contas.length*(process.env.QA_DESKTOP?1:2));
