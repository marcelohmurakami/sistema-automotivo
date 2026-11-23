// Fluxos reais exclusivamente em empresas ZZ; preparação por API, ações pelo navegador.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
const base=process.env.QA_URL||'https://patio-gestao-peach.vercel.app',fase=process.env.QA_FASE||'antes';
const out=resolve(process.env.QA_OUTPUT||`output/mapa-velocidade-20261113/${fase}-publicado`);await mkdir(out,{recursive:true});
const health=await fetch(base+'/health.json?qa='+Date.now()).then(r=>r.json());
if(process.env.QA_EXPECTED_BUILD)assert.equal(health.build,process.env.QA_EXPECTED_BUILD);
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.filter(c=>c.ramo==='automotivo'&&(!process.env.QA_PERFIS||process.env.QA_PERFIS.split(',').includes(c.especialidade)));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[],documentos=[],erros=[];
const banco='https://hzihxtjirttetnfdujcx.supabase.co';
const gravar=()=>writeFile(resolve(out,'resultados.json'),JSON.stringify({fase,build:health.build,geradoEm:new Date().toISOString(),ok:!process.exitCode,resultados,documentos,erros},null,2));
try{for(const c of contas){
 assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
 const ctx=await browser.newContext({viewport:{width:1920,height:1080},locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'}),p=await ctx.newPage();p.setDefaultTimeout(20000);let headers,requests=[],medindo=false;
 p.on('pageerror',e=>erros.push({perfil:c.especialidade,erro:e.message}));
 p.on('request',r=>{if(r.url().startsWith(banco+'/rest/v1/')){const h=r.headers();if(h.authorization)headers={authorization:h.authorization,apikey:h.apikey,'content-type':'application/json'};if(medindo)requests.push({request:r,nome:new URL(r.url()).pathname.split('/').pop(),inicio:performance.now()});}});
 p.on('requestfinished',r=>{const a=requests.find(x=>x.request===r);if(a)a.segundos=(performance.now()-a.inicio)/1000;});
 const rpc=async(nome,args)=>{assert.equal(args.p_oficina,c.empresa_id);const r=await p.request.post(banco+'/rest/v1/rpc/'+nome,{headers,data:args});assert(r.ok(),nome+' '+r.status()+' '+await r.text());return r.json();};
 let tela;
 const medir=async(nome,acoes,fn)=>{requests=[];medindo=true;const ini=performance.now();try{await fn();const segundos=(performance.now()-ini)/1000;resultados.push({perfil:c.especialidade,tela,nome,...acoes,segundos:Number(segundos.toFixed(3)),requisicoes:requests.map(({nome,segundos})=>({nome,segundos:segundos?+segundos.toFixed(3):null})),ok:true});await gravar();}catch(e){resultados.push({perfil:c.especialidade,tela,nome,ok:false,erro:e.message});throw e;}finally{medindo=false;}};
 const btn=(name)=>p.getByRole('button',{name,exact:true});
 try{
  await p.goto(base+'/entrar');await p.getByLabel('E-mail',{exact:true}).fill(c.email);await p.getByLabel('Senha',{exact:true}).fill(c.senha);await btn('Entrar no sistema').click();await p.getByRole('textbox',{name:'Buscar veículo no mapa',exact:true}).waitFor();
  for(const [indice,largura]of [1920,390].entries()){
   tela=largura===1920?'desktop':'celular';await p.setViewportSize({width:largura,height:largura===1920?1080:844});
   // Cada cenário recebe uma OS nova, sem contatos reais e sem peças/estoque.
   const termo='QA'+randomUUID().slice(0,8);let veiculo=null;if(c.especialidade!=='retifica')veiculo=await rpc('cadastrar_veiculo_orcamento',{p_oficina:c.empresa_id,p_cliente:null,p_modelo:'QA mapa '+fase+' '+tela+' '+Date.now(),p_placa:null});
   const os=await rpc('salvar_os_com_itens',{p_oficina:c.empresa_id,p_os:null,p_revisao:null,p_chave:randomUUID(),p_dados:{cliente_id:null,cliente_nome_livre:termo+' Mapa '+fase+' '+tela,veiculo_id:veiculo,...(c.especialidade==='retifica'?{carro_livre:'Volkswagen Gol QA',motor_livre:'AP 1.6'}:{}),data_servico:'2026-11-13',recebido_em:'2026-11-13T12:00:00Z',observacoes_internas:'Teste fictício de velocidade; sem cobrança real.',itens:[{id:randomUUID(),tipo:'service',descricao:'QA conferência do mapa',unidade:'serv',quantidade:1,preco_unitario_centavos:10000,situacao:'pending'}]}});
   assert(os.id&&os.numero);documentos.push({perfil:c.especialidade,tela,id:os.id,numero:os.numero});await gravar();
   const busca=p.getByRole('textbox',{name:'Buscar veículo no mapa',exact:true});
   const cartao=()=>p.locator('.cartao-veiculo,.mapa-item-lista').filter({has: p.locator('.numero-os,small').filter({hasText:new RegExp('OS #'+os.numero+'(?:\\s|·|$)')})}).first();
   if(process.env.QA_DIRETO==='1'){
    await p.goto(base+'/');await busca.fill(termo);await cartao().waitFor();
    const modo=indice===0?'total':'prazo';
    await medir('Fluxo contínuo: recebida → entregue '+(modo==='total'?'e paga em Pix':'com data combinada'),{cliques:8,campos:modo==='prazo'?1:0},async()=>{
     await btn('Avançar OS '+os.numero+' para Em execução').click();
     await btn('Avançar OS '+os.numero+' para Conferência').click();
     await btn('Concluir serviço da OS '+os.numero).click();
     await p.getByRole('dialog',{name:'Avisar o cliente que está pronto?',exact:true}).getByRole('button',{name:'Fechar',exact:true}).click();
     await btn('Entregar OS '+os.numero+' para Entregue').click();
     await p.getByRole('dialog',{name:'Como ficou o pagamento da OS?',exact:true}).getByRole('button',{name:modo==='total'?'Já recebi':'A receber',exact:false}).click();
     if(modo==='prazo'){await p.getByLabel('Receber em',{exact:true}).fill('2026-12-15');await btn('Salvar data combinada').click();}else await btn('Confirmar pagamento').click();
     await p.getByRole('dialog',{name:'Financeiro atualizado',exact:true}).getByRole('button',{name:'Concluir',exact:true}).click();
    });
    const titulo=await rpc('consultar_financeiro_os',{p_oficina:c.empresa_id,p_os:os.id}),atual=await rpc('consultar_ordem_servico',{p_oficina:c.empresa_id,p_os:os.id});
    assert.equal(atual.situacao,'delivered');assert.equal(titulo.baixado_centavos,modo==='total'?10000:0);if(modo==='prazo')assert.equal(titulo.vencimento,'2026-12-15');documentos.at(-1).verificado={situacao:atual.situacao,pago:titulo.baixado_centavos};
    console.log('PASS contínuo',c.especialidade,tela);await gravar();continue;
   }
   await medir('Abrir mapa (página e dados)',{cliques:1},async()=>{await p.goto(base+'/');await busca.waitFor();await cartao().waitFor();});
   await medir('Buscar OS pelo cliente',{cliques:0,campos:1},async()=>{await busca.fill(termo);await p.waitForFunction(()=>document.querySelectorAll('.cartao-veiculo,.mapa-item-lista').length===1);await cartao().waitFor();});
   for(const modo of ['lista','quadro'])await medir('Alternar para '+modo,{cliques:1},async()=>{await btn('Visualizar em '+modo).click();await p.locator(modo==='lista'?'.lista-veiculos':'.quadro').waitFor();});
   if(largura===390)await btn('Visualizar em lista').click();
   await medir('Limpar busca',{cliques:1},async()=>{await btn('Limpar busca').click();assert.equal(await busca.inputValue(),'');});
   await medir('Filtrar prontas e voltar',{cliques:2},async()=>{await p.locator('.mapa-resumo-acao').filter({hasText:'Prontos para entregar'}).click();await btn('Ver todas as OS').click();await cartao().waitFor();});
   await busca.fill(termo);
   await medir('Abrir detalhes da OS',{cliques:1},async()=>{await cartao().locator('.cartao-veiculo-conteudo,.linha-veiculo').click();await p.locator('dialog[open] .os-resumo-limpo').waitFor();});
   await p.goto(base+'/');await busca.fill(termo);await cartao().waitFor();
   const estado=()=>rpc('consultar_ordem_servico',{p_oficina:c.empresa_id,p_os:os.id});
   const mover=async(direcao,situacao)=>{
    const b=cartao().getByRole('button',{name:new RegExp('^'+(direcao==='avancar'?'Avançar':'Voltar')+' OS '+os.numero+' para ')});
    await medir((direcao==='avancar'?'Avançar':'Voltar')+' → '+situacao,{cliques:1},async()=>{const ret=p.waitForResponse(r=>r.url().endsWith('/rpc/mover_ordem_no_mapa')&&r.request().postDataJSON()?.p_os===os.id);await b.click();const r=await ret;assert(r.ok());assert.equal((await r.json()).situacao,situacao);await p.waitForFunction(({n,s})=>{const a=[...document.querySelectorAll('.cartao-veiculo,.mapa-item-lista')].find(x=>x.textContent.includes('OS #'+n));if(!a)return false;const b=a.querySelector('[aria-label^="Avançar OS"],[aria-label^="Concluir serviço"],[aria-label^="Entregar OS"]');return b&&!b.disabled&&!a.querySelector('[aria-busy="true"]')&&((s==='in_progress'&&!!a.querySelector('[aria-label$="para Conferência"]'))||(s==='quality_check'&&!!a.querySelector('[aria-label^="Concluir serviço"]'))||(s==='open'&&!!a.querySelector('[aria-label$="para Em execução"]')))}, {n:os.numero,s:situacao});});assert.equal((await estado()).situacao,situacao);
   };
   await mover('avancar','in_progress');await mover('voltar','open');await mover('avancar','in_progress');
   await medir('Parar aguardando peças',{cliques:2},async()=>{await btn('Parar serviço da OS '+os.numero).click();const d=p.getByRole('dialog',{name:'Parar serviço · OS #'+os.numero,exact:true});await d.getByRole('button',{name:'Aguardando peças',exact:true}).click();await btn('Retomar serviço da OS '+os.numero).waitFor();await p.waitForFunction(n=>{const b=document.querySelector('[aria-label="Retomar serviço da OS '+n+'"]');return b&&!b.disabled},os.numero);});
   assert((await estado()).paradas.some(x=>!x.encerrado_em));
   await medir('Retomar serviço',{cliques:1},async()=>{await btn('Retomar serviço da OS '+os.numero).click();await btn('Parar serviço da OS '+os.numero).waitFor();await p.waitForFunction(n=>{const b=document.querySelector('[aria-label="Parar serviço da OS '+n+'"]');return b&&!b.disabled},os.numero);});assert((await estado()).paradas.every(x=>x.encerrado_em));
   await mover('avancar','quality_check');await mover('voltar','in_progress');await mover('avancar','quality_check');
   await medir('Concluir serviço e dispensar aviso',{cliques:2},async()=>{await btn('Concluir serviço da OS '+os.numero).click();const aviso=p.getByRole('dialog',{name:'Avisar o cliente que está pronto?',exact:true});await aviso.getByRole('button',{name:'Fechar',exact:true}).click();await btn('Entregar OS '+os.numero+' para Entregue').waitFor();});
   const pronta=await estado();assert.equal(pronta.situacao,'ready');assert(pronta.itens.every(i=>i.situacao==='done'));
   await p.screenshot({path:resolve(out,c.especialidade+'-'+tela+'-pronta.png'),fullPage:false});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await medir('Entregar e abrir pagamento',{cliques:1},async()=>{await btn('Entregar OS '+os.numero+' para Entregue').click();await p.getByRole('dialog',{name:'Como ficou o pagamento da OS?',exact:true}).getByRole('button',{name:'Já recebi',exact:false}).waitFor();});
   const modo=indice===0?'total':'prazo';
   await medir(modo==='total'?'Receber total em Pix':'Combinar pagamento a prazo',{cliques:3,campos:modo==='prazo'?1:0},async()=>{await p.getByRole('button',{name:modo==='total'?'Já recebi':'A receber',exact:false}).click();if(modo==='prazo'){await p.getByLabel('Receber em',{exact:true}).fill('2026-12-15');await btn('Salvar data combinada').click();}else await btn('Confirmar pagamento').click();await p.getByRole('dialog',{name:'Financeiro atualizado',exact:true}).getByRole('button',{name:'Concluir',exact:true}).click();});
   const titulo=await rpc('consultar_financeiro_os',{p_oficina:c.empresa_id,p_os:os.id});assert.equal(titulo.baixado_centavos,modo==='total'?10000:0);if(modo==='prazo')assert.equal(titulo.vencimento,'2026-12-15');assert.equal((await estado()).situacao,'delivered');
   documentos.at(-1).verificado={situacao:'delivered',total:titulo.valor_centavos,pago:titulo.baixado_centavos,vencimento:titulo.vencimento};
   await p.reload();await busca.waitFor();await busca.fill(termo);await p.getByText('Nenhuma OS corresponde aos filtros',{exact:true}).waitFor();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   console.log('PASS',fase,c.especialidade,tela);await gravar();
  }
 }catch(e){process.exitCode=1;console.error(c.especialidade,e.stack);await p.screenshot({path:resolve(out,c.especialidade+'-falha.png')});await writeFile(resolve(out,c.especialidade+'-falha.txt'),await p.locator('body').innerText());throw e;}finally{await ctx.close();}
}}catch{process.exitCode=1;}finally{await browser.close();if(erros.length)process.exitCode=1;await gravar();console.log(JSON.stringify({ok:!process.exitCode,jornadas:resultados.length,documentos:documentos.length}));}


