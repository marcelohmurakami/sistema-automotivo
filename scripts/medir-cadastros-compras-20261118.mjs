import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {preview} from 'vite';
import {chromium} from 'playwright';
import {createClient} from '@supabase/supabase-js';
import {sessaoQa} from './sessoes-qa-concorrencia-20261116.mjs';
import {cenarios} from './cadastros-compras-cenarios-20261118.mjs';
const root=resolve('output/cadastros-compras-velocidade-20261118'),fase=process.env.QA_FASE||'antes',out=resolve(root,fase),dist=resolve(process.env.QA_BUILD||root+'/build-antes');await mkdir(out,{recursive:true});
const env=Object.fromEntries((await readFile('.env.local','utf8')).split(/\r?\n/).filter(l=>/^VITE_SUPABASE_/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.filter(c=>!process.env.QA_PERFIS||process.env.QA_PERFIS.split(',').includes(c.especialidade));
const server=await preview({build:{outDir:dist},preview:{host:'127.0.0.1',port:0,strictPort:true}}),base=`http://127.0.0.1:${server.httpServer.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const resultados=[],falhas=[],verificacoes=[],limpeza=[],rede=[],manifesto=[];
const gravar=()=>writeFile(resolve(out,'resultados.json'),JSON.stringify({fase,geradoEm:new Date().toISOString(),build:dist,condicoes:{frontend:'Build local em Vite preview, banco Supabase conectado, empresas fictícias',desktop:'1920x1080',celular:'390x844, toque, CPU 4x',entrada:'Automação; não inclui digitação/pensamento humano'},resultados,falhas,verificacoes,limpeza,rede,manifesto},null,2));
async function caso(c,mobile,cli,session){
 const tag=`QA CAD ${Date.now().toString(36)}${randomUUID().slice(0,3)}`,ids={servicos:[],funcionarios:[],fornecedores:[],compras:[],locais:[],fisicos:[],produto:randomUUID()},registro={perfil:c.especialidade,mobile,empresa:c.empresa_id,tag,ids};manifesto.push(registro);
 const rpc=async(n,args={})=>{const r=await cli.rpc(n,{p_oficina:c.empresa_id,...args});if(r.error)throw new Error(n+': '+r.error.message);return r.data};
 const ctx=await browser.newContext({viewport:{width:mobile?390:1920,height:mobile?844:1080},isMobile:mobile,hasTouch:mobile,locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
 await ctx.addInitScript(({session,base})=>{if(location.origin!==base)return;localStorage.setItem('sb-hzihxtjirttetnfdujcx-auth-token',JSON.stringify(session));window.qaAcoes={cliques:0,campos:0};document.addEventListener('click',()=>window.qaAcoes.cliques++,true);document.addEventListener('change',()=>window.qaAcoes.campos++,true)},{session,base});
 const p=await ctx.newPage();p.setDefaultTimeout(25000);if(mobile)await(await ctx.newCDPSession(p)).send('Emulation.setCPUThrottlingRate',{rate:4});
 let etapa='preparar';const erros=[],trabalhos=[],inicios=new Map();p.on('pageerror',e=>erros.push(e.message));
 p.on('request',r=>{if(r.url().includes('/rest/v1/rpc/'))inicios.set(r,performance.now())});
 p.on('response',r=>{if(!r.url().includes('/rest/v1/rpc/'))return;const n=new URL(r.url()).pathname.split('/').at(-1),req=r.request();rede.push({perfil:c.especialidade,mobile,etapa,nome:n,status:r.status(),ms:performance.now()-(inicios.get(req)||performance.now())});if(!r.ok())return;const b=req.postDataJSON();const k={salvar_servico_detalhado:'servicos',salvar_funcionario:'funcionarios',salvar_fornecedor:'fornecedores',registrar_compra_com_pagamento:'compras',salvar_local_fisico:'locais',registrar_conjunto_fisico:'fisicos'}[n];if(k){assert.equal(b.p_oficina,c.empresa_id);const id=b.p_id||b.p_dados?.id;if(id&&!ids[k].includes(id))ids[k].push(id);trabalhos.push(gravar())}});
 const d=()=>p.locator('dialog[open]').last(),fechar=async()=>{await d().getByRole('button',{name:'Fechar janela',exact:true}).click();await p.locator('dialog[open]').waitFor({state:'hidden'})};
 const check=(nome,condicao)=>{assert(condicao,nome);verificacoes.push({perfil:c.especialidade,mobile,nome,ok:true})};
 const layout=async(nome)=>{const v=await p.evaluate(()=>({pagina:document.documentElement.scrollWidth-innerWidth,dialogos:[...document.querySelectorAll('dialog[open]')].map(e=>e.scrollWidth-e.clientWidth)}));check('Layout: '+nome,v.pagina<=2&&v.dialogos.every(n=>n<=2))};
 const medir=async(nome,fn)=>{etapa=nome;const a=await p.evaluate(()=>window.qaAcoes||{cliques:0,campos:0}),t=performance.now(),n=rede.length;await fn();const b=await p.evaluate(()=>window.qaAcoes);resultados.push({perfil:c.especialidade,mobile,nome,segundos:(performance.now()-t)/1000,cliques:Math.max(0,b.cliques-a.cliques),campos:Math.max(0,b.campos-a.campos),consultas:rede.length-n});await gravar()};
 const abrir=async(modulo,path,pronto)=>medir(modulo+' · abrir',async()=>{const n={'Serviços':'listar_catalogo_paginado','Funcionários':'listar_funcionarios','Fornecedores':'listar_fornecedores','Localização':'listar_itens_fisicos','Compras':'listar_compras_estoque'}[modulo];const resposta=p.waitForResponse(r=>r.url().endsWith('/rpc/'+n)&&r.ok());await p.goto(base+path);await resposta;await pronto();await p.getByText('Carregando funcionários…',{exact:true}).waitFor({state:'hidden'});await layout(modulo)});
 try{
  await rpc('salvar_produto_estoque',{p_id:ids.produto,p_revisao:null,p_dados:{id:ids.produto,descricao:tag+' peça',unidade:'un',preco_padrao_centavos:2500,custo_centavos:1111,minimo:0,codigo:tag,localizacao:'',fornecedor:''}});
  const fluxo = process.env.QA_SO_COMPRAS ? (await import('./cadastros-cancelamento-20261118.mjs')).cenariosCompra : cenarios;
  await fluxo({p,d,fechar,check,layout,medir,abrir,rpc,tag,ids,base,mobile,out,perfil:c.especialidade});check('Sem exceção JavaScript',erros.length===0);
  console.log('PASS',fase,c.especialidade,mobile?'celular':'desktop');
 }catch(e){falhas.push({perfil:c.especialidade,mobile,etapa,erro:e.message,erros});console.log('FAIL',fase,c.especialidade,mobile,etapa,e.message.slice(0,180));await p.screenshot({path:resolve(out,c.especialidade+(mobile?'-mobile':'-desktop')+'-falha.png')});await writeFile(resolve(out,c.especialidade+(mobile?'-mobile':'-desktop')+'-falha.txt'),await p.locator('body').innerText())}
 finally{
  await Promise.allSettled(trabalhos);await ctx.close();
  try{
   for(const id of ids.compras){const x=await rpc('consultar_compra_estoque',{p_compra:id});assert(x.documento===tag);if(!x.cancelado_em)await rpc('cancelar_compra_estoque',{p_compra:id,p_motivo:'Encerramento do teste '+tag})}
   for(const id of ids.servicos){const x=await rpc('consultar_ficha_servico',{p_item:id});assert(x.descricao.startsWith(tag));if(!x.arquivado_em)await rpc('salvar_servico_detalhado',{p_id:id,p_revisao:x.revisao,p_dados:{...x,arquivado:true}})}
   for(const x of(await rpc('listar_funcionarios')).filter(x=>ids.funcionarios.includes(x.id))){assert(x.nome.startsWith(tag));if(x.ativo)await rpc('salvar_funcionario',{p_id:x.id,p_revisao:x.revisao,p_dados:{...x,ativo:false}})}
   for(const x of(await rpc('listar_fornecedores',{p_busca:tag,p_arquivados:false,p_pagina:0})).itens){assert(ids.fornecedores.includes(x.id));await rpc('arquivar_fornecedor',{p_id:x.id,p_revisao:x.revisao,p_arquivar:true})}
   for(const x of(await rpc('listar_itens_fisicos',{p_busca:tag,p_situacao:'',p_local:null,p_vinculo:{},p_antes:null,p_id_antes:null})).itens){assert(ids.fisicos.includes(x.id));if(x.situacao!=='entregue')await rpc('movimentar_itens_fisicos',{p_itens:[{id:x.id,revisao:x.revisao}],p_acao:'entregar',p_local:null,p_com_quem:'Equipe QA',p_observacoes:'Encerramento do teste '+tag,p_chave:randomUUID()})}
   for(const x of await rpc('listar_locais_fisicos',{p_busca:tag,p_inativos:false})){assert(ids.locais.includes(x.id));await rpc('salvar_local_fisico',{p_id:x.id,p_nome:x.nome,p_descricao:x.descricao,p_ativo:false,p_revisao:x.revisao})}
   const produtos=await rpc('listar_estoque',{p_busca:tag,p_filtro:'',p_pagina:0});const prod=produtos.itens.find(x=>x.id===ids.produto);if(prod){assert.equal(prod.saldo,0);await rpc('arquivar_produto_estoque',{p_produto:ids.produto,p_arquivar:true})}
   limpeza.push({...registro,ok:true,saldoFinal:0});
  }catch(e){limpeza.push({...registro,ok:false,erro:e.message});console.log('CLEANUP FAIL',c.especialidade,e.message)}
  await gravar();
 }
}
try{for(const c of contas){assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));const cli=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},db:{retry:false}}),session=await sessaoQa(cli,c);for(const mobile of process.env.QA_DESKTOP?[false]:[false,true]){await caso(c,mobile,cli,session);if(falhas.length&&process.env.QA_PARAR_FALHA)break}if(falhas.length&&process.env.QA_PARAR_FALHA)break}}finally{await browser.close();await new Promise(r=>server.httpServer.close(r));await gravar()}
assert.equal(falhas.length,0);assert(limpeza.every(x=>x.ok));
