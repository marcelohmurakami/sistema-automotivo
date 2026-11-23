import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {build,preview} from './lib/vite-conferencia.mjs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {chromium} from './lib/chrome-conferencia.mjs';
import {criarCenarioSubsistemas,exemplosSubsistemas} from '../supabase/tests/subsistemas-fixture.mjs';
import {especialidades} from '../src/lib/especialidades.ts';
process.env.DB_VALIDATION_RUNTIME ||= resolve('node_modules/@electric-sql/pglite/dist/index.js');process.env.DB_VALIDATION_MIGRATION_LIMIT ||= '20261029001100';
const pasta=resolve(process.env.QA_OUTPUT || 'output/logistica-estoque-20261029');await mkdir(pasta,{recursive:true});
const {db,ids,registros,login}=await criarCenarioSubsistemas();
const one=async(s,a=[])=>Object.values((await db.query(s,a)).rows[0])[0];
const call=(fn,a)=>one(`select public.${fn}(${a.map((_,i)=>'$'+(i+1)).join(',')})`,a);
const contextos={};
for(const [perfil,r] of Object.entries(registros)){
 await login(ids[perfil]);let documento=r.atendimento,ramo='atendimento';
 if(!documento){ramo='os';const os=await call('salvar_ordem_servico',[r.w,{cliente_id:r.cliente,veiculo_id:r.objeto},uuid()]);documento=os.id;await call('adicionar_peca_estoque_os',[r.w,documento,r.produto,2,os.revisao]);}
 await call('salvar_fornecedor',[r.w,uuid(),{nome:'Fornecedor de testes'}]);
 await call('salvar_fornecedor',[r.w,uuid(),{nome:'Fornecedor alternativo'}]);
 const serial=uuid();await call('salvar_produto_estoque',[r.w,{descricao:'Unidade individual QA',unidade:'un',custo_centavos:1000},serial]);await call('configurar_planejamento_estoque',[r.w,serial,1,{rastreado:true}]);
 const p=(await call('listar_estoque',[r.w])).itens.find(i=>i.id===serial);
 contextos[perfil]={usuario:ids[perfil],oficina:{id:r.w,nome:'Empresa QA '+perfil,perfil:'owner',ramo:especialidades[perfil].ramo,especialidade:perfil,codigo_plano:'complete'},documento,ramo,serial:p};
}
// Adaptador local das RPCs reais. Só aceita as empresas fictícias desta bancada.
let fila=Promise.resolve();const errosRpc=[];
const api={name:'qa-suprimentos-api',configurePreviewServer(server){server.middlewares.use((req,res,next)=>{
 const url=new URL(req.url,'http://localhost');res.setHeader('Content-Type','application/json');
 if(url.pathname==='/test-context'){fila=fila.then(async()=>{const c=contextos[url.searchParams.get('perfil')]||contextos.mecanica;await login(c.usuario);const serial=await call('consultar_produto_estoque',[c.oficina.id,c.serial.id]);res.end(JSON.stringify({...c,serial}));});return;}
 if(!url.pathname.startsWith('/rest/v1/rpc/')){res.removeHeader('Content-Type');next();return;}
 const fn=url.pathname.split('/').at(-1);if(!/^[a-z_]+$/.test(fn)){res.statusCode=400;res.end('{}');return;}
 let text='';req.on('data',b=>text+=b);req.on('end',()=>{fila=fila.then(async()=>{try{
  const args=JSON.parse(text||'{}'),perfil=Object.keys(registros).find(k=>registros[k].w===args.p_oficina);if(!perfil)throw Error('Empresa fora da bancada');
  await login(ids[perfil]);const keys=Object.keys(args);assert.ok(keys.every(k=>/^p_[a-z_]+$/.test(k)));
  const data=await one(`select public.${fn}(${keys.map((k,i)=>`${k} => $${i+1}`).join(',')})`,keys.map(k=>['reservar_estoque_atendimento','reservar_estoque_deposito','transferir_estoque'].includes(fn)&&k==='p_unidades'?'{'+args[k].join(',')+'}':args[k]));res.end(JSON.stringify(data));
 }catch(e){errosRpc.push({fn,code:e.code,message:e.message});res.statusCode=400;res.end(JSON.stringify({code:e.code||'QA',message:e.message}));}});});
});}};
const config={configFile:false,envDir:false,plugins:[react(),tailwindcss(),api],logLevel:'error',define:{'import.meta.env.VITE_SUPABASE_URL':'window.location.origin','import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':JSON.stringify('qa-local-no-external-access')},build:{target:'esnext',outDir:resolve(pasta,'fixture-build'),rollupOptions:{input:'scripts/fixtures/suprimentos.html'}}};
let browser,server,page;const resultados=[],errors=[];
try{
 await build(config);server=await preview({...config,preview:{host:'127.0.0.1',port:0}});const base=server.resolvedUrls.local[0];
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const ctx=await browser.newContext({locale:'pt-BR',timezoneId:'America/Sao_Paulo'});await ctx.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 const ir=async(perfil,tela='',largura=1440,tema='escuro')=>{await page.setViewportSize({width:largura,height:960});await page.goto(`${base}scripts/fixtures/suprimentos.html?perfil=${perfil}&tela=${tela}&tema=${tema}`);await page.getByRole('heading',{level:1}).waitFor();await page.evaluate(()=>document.fonts.ready);};
 const layout=async(nome)=>{const r=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,fora:[...document.querySelectorAll('main *,dialog[open] *')].filter(e=>e.checkVisibility()).filter(e=>{const r=e.getBoundingClientRect();return r.left< -1||r.right>innerWidth+1}).map(e=>e.tagName+'.'+e.className)}));assert.ok(r.scroll<=r.width+1,nome+JSON.stringify(r));assert.deepEqual(r.fora,[],nome);assert.deepEqual(errors,[]);resultados.push({nome,...r});};
 for(const perfil of Object.keys(registros)){
  const curto=process.argv.includes('--rapido');if(curto&&perfil!=='mecanica')continue;if(process.env.QA_PERFIL&&perfil!==process.env.QA_PERFIL)continue;
  await ir(perfil,'',perfil.includes('assistencia')?390:1440);await page.getByRole('button',{name:'+ Novo pedido'}).click();await page.getByLabel('Nome do pedido').fill('Pedido UI '+perfil);
  await page.getByRole('combobox',{name:'Fornecedor',exact:true}).fill('Fornecedor de testes');await page.getByRole('option',{name:'Fornecedor de testes',exact:true}).click();
  await page.getByRole('combobox',{name:'Adicionar produto'}).fill(exemplosSubsistemas[perfil][2]);await page.getByRole('listbox').getByRole('option').first().click();await page.getByLabel('Quantidade',{exact:true}).fill('5');await layout('novo-pedido-'+perfil);await page.getByRole('button',{name:'Criar pedido',exact:true}).click();
  await page.getByRole('button',{name:'Receber entrega',exact:true}).click();await page.getByLabel('Entregues agora',{exact:true}).fill('3');await page.getByLabel('Rejeitadas',{exact:true}).fill('1');assert.equal(await page.getByLabel('Aceitas (automático)',{exact:true}).inputValue(),'2');assert.equal(await page.getByLabel('Aceitas (automático)',{exact:true}).getAttribute('readonly'),'');await page.getByLabel('Motivo da devolução ou recusa').fill('Avaria identificada na conferência');await layout('entrega-parcial-'+perfil);await page.getByRole('button',{name:'Confirmar registro',exact:true}).click();await page.getByRole('dialog').getByText('3 pendentes',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Devolver para reposição',exact:true}).click();await page.getByLabel('Devolver',{exact:true}).fill('1');await page.getByLabel('Motivo da devolução ou recusa').fill('Defeito constatado');await page.getByRole('button',{name:'Confirmar registro',exact:true}).click();await page.getByRole('dialog').getByText('4 pendentes',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Receber reposição',exact:true}).click();await page.getByRole('button',{name:'Confirmar registro',exact:true}).click();await page.getByRole('dialog').getByText('3 pendentes',{exact:true}).waitFor();await page.getByRole('button',{name:'Receber entrega',exact:true}).click();await page.getByRole('button',{name:'Confirmar registro',exact:true}).click();await page.getByRole('dialog').getByText('0 pendentes',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Fechar janela',exact:true}).click();await page.getByRole('link',{name:'Cotações',exact:true}).click();await page.getByRole('button',{name:'+ Nova cotação'}).click();await page.getByLabel('O que deseja cotar?').fill('Comparação UI '+perfil);await page.getByRole('combobox',{name:'Adicionar produto'}).fill(exemplosSubsistemas[perfil][2]);await page.getByRole('listbox').getByRole('option').first().click();await page.getByRole('button',{name:'Criar cotação',exact:true}).click();
  for(const [fornecedor,custo] of [['Fornecedor de testes','20'],['Fornecedor alternativo','25']]){
   await page.getByRole('button',{name:'Adicionar / atualizar proposta'}).click();await page.getByRole('combobox',{name:'Fornecedor',exact:true}).fill(fornecedor);await page.getByRole('option',{name:fornecedor,exact:true}).click();await page.getByLabel('Custo final por unidade (R$)',{exact:true}).fill(custo);await page.getByLabel('Pagamento',{exact:true}).fill('30 dias');await page.getByRole('button',{name:'Salvar proposta',exact:true}).click();await page.getByRole('heading',{name:fornecedor,exact:true}).waitFor();
  }
  await layout('comparacao-'+perfil);await page.getByRole('button',{name:'Escolher fornecedor',exact:true}).first().click();await page.getByRole('button',{name:'Confirmar e criar pedido',exact:true}).click();await page.getByRole('button',{name:'Receber entrega',exact:true}).waitFor();await page.getByRole('button',{name:'Fechar janela'}).click();
  await page.getByRole('link',{name:'Reposição',exact:true}).click();await page.getByText('Estoque suficiente',{exact:true}).first().waitFor();await layout('sugestao-'+perfil);
  await ir(perfil,'reservas',390);await page.getByRole('button',{name:'Reservar tudo',exact:true}).click();await page.getByRole('button',{name:'Liberar',exact:true}).waitFor();await layout('reserva-'+perfil);await page.getByRole('button',{name:'Liberar',exact:true}).click();await page.getByRole('button',{name:'Reservar tudo',exact:true}).waitFor();
  await ir(perfil,'unidades',390);await page.getByRole('button',{name:'Registrar entrada',exact:true}).click();await page.getByLabel('Séries ou IMEIs · uma unidade por linha').fill('UI-SERIE-1\nUI-SERIE-2; 123456789012345');await page.getByLabel('Motivo',{exact:true}).fill('Unidades recebidas para teste');await page.getByRole('button',{name:'Confirmar movimentação',exact:true}).click();await page.getByText('UI-SERIE-1',{exact:true}).waitFor();await layout('unidades-'+perfil);
  await page.getByRole('button',{name:'Registrar saída',exact:true}).click();await page.getByRole('checkbox').first().check();await page.getByLabel('Motivo',{exact:true}).fill('Saída para teste');await page.getByRole('button',{name:'Confirmar movimentação',exact:true}).click();await page.getByText('Saída',{exact:true}).waitFor();
  await ir(perfil,'busca-unidades',390);await page.getByLabel('Série, IMEI ou produto').fill('123456789012345');await page.getByRole('button',{name:/UI-SERIE-2/}).click();await page.getByRole('heading',{name:'Histórico da unidade'}).waitFor();await layout('busca-imei-'+perfil);if(process.argv.includes('--rapido')){await ir(perfil,'planejamento',390);await page.getByLabel('Prazo de reposição (dias)').fill('12');await page.getByRole('button',{name:'Salvar planejamento',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('fieldset')?.disabled);await login(ids[perfil]);const planejado=await call('consultar_produto_estoque',[registros[perfil].w,contextos[perfil].serial.id]);assert.equal(planejado.prazo_reposicao_dias,12,'planejamento salva sem fornecedor opcional');resultados.push({nome:'planejamento-sem-fornecedor',ok:true});}console.log('PASS UI',perfil);
 }
 for(const tema of ['claro','escuro'])for(const width of [320,390,768,1440])for(const tela of ['','reservas','unidades','planejamento']){
  await ir('mecanica',tela,width,tema);await page.waitForTimeout(300);await layout(`responsivo-${tela||'pedidos'}-${tema}-${width}`);if(width===390||width===1440)await page.screenshot({path:resolve(pasta,`${tela||'pedidos'}-${tema}-${width}.png`),fullPage:true});
 }
 assert.deepEqual(errosRpc,[],'Nenhuma RPC deve falhar no caminho feliz');console.log('PASS',resultados.length,'verificações de interface');
}catch(e){console.error(e);if(page){await page.screenshot({path:resolve(pasta,'falha-ui.png'),fullPage:true}).catch(()=>{});await writeFile(resolve(pasta,'falha-ui.txt'),await page.locator('body').innerText().catch(()=>''));await writeFile(resolve(pasta,'falha-campos.json'),JSON.stringify(await page.locator('dialog[open] input').evaluateAll(es=>es.map(e=>({name:e.name,type:e.type,value:e.value,valid:e.validity.valid,message:e.validationMessage}))).catch(()=>[]),null,2));}process.exitCode=1;}finally{await writeFile(resolve(pasta,process.argv.includes('--rapido')?'interface-rapido.json':'interface.json'),JSON.stringify({resultados,errors,errosRpc},null,2));await browser?.close();if(server)await new Promise(r=>server.httpServer.close(r));await db.close();}

