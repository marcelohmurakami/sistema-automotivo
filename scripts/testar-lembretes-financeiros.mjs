import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {build,preview} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {chromium} from 'playwright';
import {criarCenarioSubsistemas} from '../supabase/tests/subsistemas-fixture.mjs';
import {especialidades} from '../src/lib/especialidades.ts';
process.env.DB_VALIDATION_RUNTIME=resolve('node_modules/@electric-sql/pglite/dist/index.js');
process.env.DB_VALIDATION_MIGRATION_LIMIT='99999999999999';
const out=resolve(process.env.QA_OUTPUT||'output/lembretes-financeiros-20261117'),resultados=[],falhas=[],rede=[];await mkdir(out,{recursive:true});
const c=await criarCenarioSubsistemas(),db=c.db;
let fila=Promise.resolve();const serial=fn=>{const p=fila.then(fn);fila=p.catch(()=>{});return p};
const call=(perfil,n,args={})=>serial(async()=>{await c.login(c.ids[perfil]);const entradas=Object.entries({p_oficina:c.registros[perfil].w,...args});assert(/^[a-z_]+$/.test(n)&&entradas.every(([k])=>/^[a-z_]+$/.test(k)));return Object.values((await db.query(`select public.${n}(${entradas.map(([k],i)=>`${k}=>$${i+1}`).join(',')})`,entradas.map(([,v])=>v))).rows[0])[0]});
const nonce=randomUUID();
const api=createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','*');res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return}
 const match=req.url?.match(new RegExp(`^/${nonce}/rest/v1/rpc/([a-z_]+)$`));if(!match){res.writeHead(404);res.end();return}
 let body='';for await(const x of req)body+=x;
 const inicio=performance.now();let nome=match[1];try{
  const args=JSON.parse(body),perfil=Object.keys(c.registros).find(p=>c.registros[p].w===args.p_oficina);assert(perfil);
  const valor=await call(perfil,nome,args);rede.push({perfil,nome,ms:performance.now()-inicio,ok:true});res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(valor));
 }catch(e){rede.push({nome,ms:performance.now()-inicio,ok:false,erro:e.message});res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({message:e.message,code:e.code||'TEST_ERROR'}));}
});
await new Promise(r=>api.listen(0,'127.0.0.1',r));
const config={configFile:false,envDir:false,logLevel:'error',plugins:[react(),tailwindcss()],define:{'import.meta.env.VITE_SUPABASE_URL':'window.__qaApi','import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':JSON.stringify('sb_publishable_test_local_only')},build:{outDir:resolve(out,'build-teste'+(process.env.QA_VARIANTE||'')),rollupOptions:{input:'scripts/fixtures/lembretes-financeiros.html'}}};
if(!process.env.QA_REUSE)await build(config);const server=await preview({...config,preview:{host:'127.0.0.1',port:0}});
const url=server.resolvedUrls.local[0]+'scripts/fixtures/lembretes-financeiros.html';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
let parar=false;
async function caso(perfil,mobile){
 const r=c.registros[perfil],tag='QA UI '+(mobile?'celular':'desktop')+' ',ctx=await browser.newContext({viewport:{width:mobile?390:1920,height:mobile?844:1080},isMobile:mobile,hasTouch:mobile,locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'}),p=await ctx.newPage();p.setDefaultTimeout(20000);
 const logs=[],etapas=[],checks=[];let etapa='preparar';
 const verificar=(nome,cond)=>{assert(cond,nome);checks.push(nome)};
 const medir=async(nome,fn)=>{etapa=nome;const t=performance.now();await fn();etapas.push({nome,segundos:(performance.now()-t)/1000})};
 const rpc=(n,args={})=>call(perfil,n,args),get=()=>rpc('consultar_lembretes_financeiros');
 const d=()=>p.locator('dialog[open]'),fechar=()=>d().getByRole('button',{name:'Fechar janela',exact:true}).click();
 const layout=async(nome)=>{verificar('Sem scroll horizontal: '+nome,await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&[...document.querySelectorAll('dialog[open]')].every(d=>d.scrollWidth<=d.clientWidth+1)));};
 const sininho=async()=>{await p.locator('.sininho-alertas').click();await d().getByRole('button',{name:'Conferir contas',exact:true}).waitFor()};
 const pendencias=async()=>{await sininho();await d().getByRole('button',{name:'Conferir contas',exact:true}).click();await d().getByRole('heading',{name:'Contas para conferir',exact:true}).waitFor();await d().locator('.lembrete-acoes').first().waitFor()};
 const linha=nome=>d().locator('.lembrete-item').filter({hasText:tag+nome});
 const ids={};
 try{
  await rpc('atualizar_lembretes_financeiros',{p_acao:'configurar',p_dados:{mostrar_entrada:true,frequencia:'todos',horario:'00:00'}});
  for(const [nome,natureza,vencimento] of [['receber','receber','2000-01-01'],['pagar','pagar','2000-01-01'],['futura','pagar','2030-01-01']]){ids[nome]=randomUUID();await rpc('salvar_titulo_financeiro',{p_id:ids[nome],p_dados:{natureza,vencimento,competencia:r.hoje,descricao:tag+nome,categoria:natureza==='receber'?'outras_receitas':'outras_despesas',valor_centavos:10000}});}
  const saldos=()=>rpc('consultar_contas_financeiras',{p_data:r.hoje});const antes=await saldos();
  await ctx.addInitScript(dados=>{window.__qaAcesso=dados;window.__qaApi=dados.api},{id:r.w,usuario:c.ids[perfil],especialidade:perfil,ramo:especialidades[perfil].ramo,api:`http://127.0.0.1:${api.address().port}/${nonce}`});
  p.on('pageerror',e=>logs.push(e.message));
  if(mobile){const cdp=await ctx.newCDPSession(p);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4})}
  await medir('Mostrar lembretes na entrada',async()=>{await p.goto(url);await p.locator('.lembrete-faixa').waitFor()});await layout('entrada');
  verificar('Conferência do dia visível',await p.getByText('Conferiu o dinheiro de hoje?',{exact:true}).isVisible());
  await p.getByRole('link',{name:'Recebi',exact:true}).click();await d().getByRole('heading',{name:'Nova conta a receber',exact:true}).waitFor();await fechar();
  await p.evaluate(()=>window.qaNavegar('/'));await p.getByRole('link',{name:'Paguei',exact:true}).click();await d().getByRole('heading',{name:'Nova conta a pagar',exact:true}).waitFor();await fechar();checks.push('Recebi e Paguei abrem cadastro rápido');
  await p.evaluate(()=>window.qaNavegar('/'));await pendencias();await layout('pendências');
  verificar('Conta futura fora da cobrança',await d().getByText(tag+'futura',{exact:true}).count()===0);
  await linha('pagar').getByRole('button',{name:'Lembrar depois',exact:true}).click();await layout('adiar');
  await medir('Adiar aviso por uma hora',async()=>{await d().getByRole('button',{name:'Confirmar lembrete',exact:true}).click();await d().waitFor({state:'hidden'})});
  verificar('Adiamento persistido',(await get()).adiamentos.some(x=>x.id===ids.pagar));
  await p.reload();await p.locator('.lembrete-faixa').waitFor();await pendencias();verificar('Adiamento preservado ao reabrir',await linha('pagar').count()===0);await fechar();
  await sininho();await d().locator('.alertas-grupo-financeiro').first().waitFor();verificar('Contas agrupadas no sininho',await d().getByText(/Contas a receber \(/).isVisible());
  verificar('Sininho respeita adiamento',await d().getByText(tag+'pagar',{exact:true}).count()===0);
  await d().getByRole('button',{name:'Configurar lembretes',exact:true}).click();await layout('configuração');
  await d().getByRole('button',{name:'Voltar a mostrar avisos adiados',exact:true}).click();await d().waitFor({state:'hidden'});
  await pendencias();await linha('pagar').waitFor();
  if(['retifica','assistencia_celulares','manutencao_climatizacao','limpeza_geral'].includes(perfil))await p.screenshot({path:resolve(out,perfil+(mobile?'-celular':'-desktop')+'.png')});
  for(const [nome,valor] of [['receber','40'],['receber','60'],['pagar','100']]){
   await medir('Abrir registro de '+nome+' '+valor,async()=>{await linha(nome).getByRole('link',{name:'Registrar agora',exact:true}).click();await p.locator('.fin-form-baixa [name=valor]').waitFor()});
   await layout('pagamento '+valor);await d().locator('[name=valor]').fill(valor);
   await medir('Confirmar '+nome+' '+valor,async()=>{await d().getByRole('button',{name:'Confirmar registro',exact:true}).evaluate(b=>{b.click();b.click()});await d().waitFor({state:'hidden'})});
   const t=await rpc('consultar_titulo_alerta',{p_titulo:ids[nome]});verificar('Saldo exato '+nome+' '+valor,t.aberto_centavos===(valor==='40'?6000:0));
   await pendencias();if(valor!=='40')verificar('Quitada não reaparece '+nome,await linha(nome).count()===0);
  }
  await fechar();const h=await rpc('historico_financeiro',{p_titulo:ids.receber});verificar('Duplo clique não duplica recebimentos',h.length===2);const h2=await rpc('historico_financeiro',{p_titulo:ids.pagar});verificar('Duplo clique não duplica pagamento',h2.length===1);
  const depois=await saldos();verificar('Receita e despesa iguais mantêm saldo líquido',JSON.stringify(antes.map(x=>[x.codigo,x.saldo]))===JSON.stringify(depois.map(x=>[x.codigo,x.saldo])));
  await p.evaluate(id=>window.qaNavegar('/financeiro?aba=contas&titulo='+id+'&acao=registrar'),ids.receber);await p.getByText('Esta conta já foi quitada, cancelada ou não está mais disponível.',{exact:true}).waitFor();verificar('Link de aviso antigo não abre novo pagamento',await d().count()===0);
  await p.evaluate(()=>window.qaNavegar('/'));await p.getByRole('button',{name:'Configurar lembretes',exact:true}).click();
  await d().getByRole('checkbox').uncheck();await d().getByRole('combobox').selectOption('desligado');await d().getByRole('button',{name:'Salvar preferências',exact:true}).click();await d().waitFor({state:'hidden'});await p.reload();await p.locator('h1').waitFor();await sininho();await d().getByRole('button',{name:'Configurar lembretes',exact:true}).click();await d().getByRole('combobox').waitFor();
  verificar('Preferências persistem após recarregar',await d().getByRole('combobox').inputValue()==='desligado'&&!await d().getByRole('checkbox').isChecked());
  await d().getByRole('checkbox').check();await d().getByRole('combobox').selectOption('todos');await d().locator('[name=horario]').fill('00:00');await d().getByRole('button',{name:'Salvar preferências',exact:true}).click();await d().waitFor({state:'hidden'});

  if(process.env.QA_EXTRA){
   const preferencias=(await get()).preferencias;
   await sininho();await d().getByRole('button',{name:'Configurar lembretes',exact:true}).click();
   await p.route('**/rpc/atualizar_lembretes_financeiros',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'QA_REDE',message:'Falha de rede simulada'})}));
   await d().getByRole('checkbox').uncheck();await d().getByRole('button',{name:'Salvar preferências',exact:true}).click();await d().getByRole('alert').waitFor();
   verificar('Erro de rede mantém a janela aberta',await d().getByRole('button',{name:'Salvar preferências',exact:true}).isEnabled());
   verificar('Falha não grava preferências',JSON.stringify((await get()).preferencias)===JSON.stringify(preferencias));
   await p.unroute('**/rpc/atualizar_lembretes_financeiros');await fechar();
   const id=randomUUID();await rpc('salvar_titulo_financeiro',{p_id:id,p_dados:{natureza:'pagar',vencimento:'2000-01-01',competencia:r.hoje,descricao:tag+'adiado',categoria:'outras_despesas',valor_centavos:4200}});
   const aviso=(await rpc('consultar_alertas')).find(x=>x.id===id);await rpc('marcar_alertas_lidos',{p_chaves:[aviso.chave]});await p.evaluate(()=>window.qaAtualizar());
   await pendencias();await linha('adiado').getByRole('button',{name:'Lembrar depois',exact:true}).click();await d().getByRole('button',{name:'Confirmar lembrete',exact:true}).click();await d().waitFor({state:'hidden'});
   await sininho();await d().getByRole('button',{name:'Configurar lembretes',exact:true}).click();await d().getByRole('button',{name:'Voltar a mostrar avisos adiados',exact:true}).click();await d().waitFor({state:'hidden'});
   await sininho();await d().locator('.alertas-grupo-financeiro').filter({hasText:tag+'adiado'}).locator('summary').click();
   verificar('Aviso volta como novo após adiar um já lido',await d().locator('.alerta-novo').filter({hasText:tag+'adiado'}).count()===1);
   await d().getByRole('button',{name:'Excluir todos',exact:true}).click();await d().getByText('Avisos excluídos.',{exact:true}).waitFor();
   verificar('Excluir todos preserva o saldo da conta',(await rpc('consultar_titulo_alerta',{p_titulo:id})).aberto_centavos===4200);
   verificar('Excluir todos remove avisos agrupados',await d().locator('.alertas-grupo-financeiro').count()===0);await fechar();
   await p.evaluate(()=>window.qaNavegar('/'));await p.locator('.lembrete-faixa').getByRole('button',{name:'Lembrar depois',exact:true}).click();
   await d().getByRole('combobox').selectOption('escolher');await d().locator('[name=data]').fill(r.hoje);await d().locator('[name=hora]').fill('00:00');await d().getByRole('button',{name:'Confirmar lembrete',exact:true}).click();
   await d().getByText('Escolha um horário futuro, em até um ano.',{exact:true}).waitFor();verificar('Não aceita adiamento no passado',!(await get()).preferencias.adiado_ate);await fechar();
  }
  if(mobile){await p.getByRole('button',{name:'Já conferi hoje',exact:true}).click();await p.getByText('Conferiu o dinheiro de hoje?',{exact:true}).waitFor({state:'hidden'});verificar('Conferência salva sem pagamento',(await get()).preferencias.conferido_em===r.hoje)}
  verificar('Sem erro JavaScript',logs.length===0);
  const relogio=await p.evaluate(()=>{const p={mostrar_entrada:true,frequencia:'uteis',horario:'17:00',conferido_em:null,adiado_ate:null};return [window.qaRelogio.conferenciaPendente(p,'2026-11-18T19:59:00Z'),window.qaRelogio.conferenciaPendente(p,'2026-11-18T20:00:00Z'),window.qaRelogio.conferenciaPendente(p,'2026-11-21T20:00:00Z'),window.qaRelogio.conferenciaPendente({...p,conferido_em:'2026-11-18'},'2026-11-18T20:00:00Z')]});verificar('Horário de São Paulo, dias úteis e já conferido',JSON.stringify(relogio)==='[false,true,false,false]');
  resultados.push({perfil,mobile,checks,etapas,ok:true});console.log('PASS',perfil,mobile?'celular':'desktop',checks.length);
 }catch(e){parar=true;falhas.push({perfil,mobile,etapa,erro:e.message,logs});console.error('FAIL',perfil,mobile,etapa,e.message);await p.screenshot({path:resolve(out,'falha-'+perfil+(mobile?'-celular':'-desktop')+'.png')});await writeFile(resolve(out,'falha.txt'),await p.locator('body').innerText());}
 finally{await ctx.close();await writeFile(resolve(out,process.env.QA_ARQUIVO||'interface.json'),JSON.stringify({metodo:'Componentes reais, RPCs reais em PostgreSQL local PGlite; empresas fictícias. Desktop 1920x1080; celular 390x844 CPU 4x. Tempos de automação local, sem digitação humana nem latência de produção.',resultados,falhas,rede},null,2));}
}
try{for(const perfil of Object.keys(c.registros).filter(p=>!process.env.QA_PERFIS||process.env.QA_PERFIS.split(',').includes(p))){for(const mobile of process.env.QA_DESKTOP?[false]:[false,true]){await caso(perfil,mobile);if(parar)break}if(parar)break}}
finally{await browser.close();await new Promise(r=>server.httpServer.close(r));await new Promise(r=>api.close(r));await fila;await db.close()}
assert.equal(falhas.length,0);
