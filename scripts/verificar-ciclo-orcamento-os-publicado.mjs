// Dados preparados por RPC; decisões do cliente e conversão realizadas na interface publicada.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {chromium} from 'playwright';
const base='https://patio-gestao-peach.vercel.app',banco='https://hzihxtjirttetnfdujcx.supabase.co';
const out=resolve(process.env.QA_OUTPUT||'output/regressao-mapa-orcamentos-os-20261116/orcamentos/aprovacao-conversao');
await mkdir(out,{recursive:true});
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.filter(c=>c.ramo==='automotivo'&&(!process.env.QA_PERFIS||process.env.QA_PERFIS.split(',').includes(c.especialidade)));
const health=await fetch(base+'/health.json?qa='+Date.now()).then(r=>r.json());
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[],erros=[],documentos=[];
const gravar=()=>writeFile(resolve(out,'resultados.json'),JSON.stringify({ok:!process.exitCode,build:health.build,geradoEm:new Date().toISOString(),metodo:'Preparação de propostas via RPC nas empresas fictícias; cliente anônimo, decisões, PDF e conversão pela interface publicada; confirmação independente no banco.',resultados,documentos,erros},null,2));
try{for(const c of contas){
 assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
 const equipe=await browser.newContext({viewport:{width:1920,height:1080},locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'}),p=await equipe.newPage();p.setDefaultTimeout(30000);let headers;
 p.on('request',r=>{if(r.url().startsWith(banco+'/rest/v1/')){const h=r.headers();if(h.authorization)headers={authorization:h.authorization,apikey:h.apikey,'content-type':'application/json'};}});
 p.on('pageerror',e=>erros.push({perfil:c.especialidade,erro:e.message}));
 const rpc=async(nome,args,esperado=200)=>{assert.equal(args.p_oficina,c.empresa_id);const r=await p.request.post(banco+'/rest/v1/rpc/'+nome,{headers,data:args});assert.equal(r.status(),esperado,nome+' '+r.status()+' '+await r.text());return esperado===204?null:r.json();};
 try{
  await p.goto(base+'/entrar');await p.getByLabel('E-mail',{exact:true}).fill(c.email);await p.getByLabel('Senha',{exact:true}).fill(c.senha);await p.getByRole('button',{name:'Entrar no sistema',exact:true}).click();await p.getByRole('textbox',{name:'Buscar veículo no mapa',exact:true}).waitFor();
  const cliente=(await rpc('buscar_cadastros_operacao',{p_oficina:c.empresa_id,p_tipo:'clientes',p_busca:'',p_cliente:null,p_id:null,p_tipo_item:null}))[0];assert(cliente);
  let veiculo=(await rpc('buscar_cadastros_operacao',{p_oficina:c.empresa_id,p_tipo:'veiculos',p_busca:'',p_cliente:cliente.id,p_id:null,p_tipo_item:null}))[0]?.id;
  if(!veiculo&&c.especialidade!=='retifica')veiculo=await rpc('cadastrar_veiculo_orcamento',{p_oficina:c.empresa_id,p_cliente:cliente.id,p_modelo:'Volkswagen Gol QA ciclo',p_placa:''});
  for(const largura of [1920,390])for(const modo of ['total','parcial','recusa','revisao','cancelamento']){
   const tela=largura===1920?'desktop':'celular',inicio=performance.now(),checks=[];
   const clienteCtx=await browser.newContext({viewport:{width:largura,height:largura===1920?1080:844},locale:'pt-BR',serviceWorkers:'block'}),u=await clienteCtx.newPage();u.setDefaultTimeout(30000);u.on('pageerror',e=>erros.push({perfil:c.especialidade,tela,modo,erro:e.message}));
   await p.setViewportSize({width:largura,height:largura===1920?1080:844});
   let q;
   try{
    const chave=randomUUID(),tag=chave.slice(0,8),dados={cliente_id:cliente.id,veiculo_id:veiculo||null,...(c.especialidade==='retifica'?{carro_livre:'Volkswagen Gol QA',motor_livre:'AP 1.6'}:{}),data_servico:'2026-11-16',itens:[
     {tipo:'service',descricao:'QA diagnóstico '+tag,unidade:'un',quantidade:1,preco_unitario_centavos:10000,custo_unitario_previsto_centavos:3000,minutos_previstos:45,custo_hora_centavos:2000,grupo_servico:'Diagnóstico'},
     {tipo:'service',descricao:'QA adicional '+tag,unidade:'un',quantidade:1,preco_unitario_centavos:5000,custo_unitario_previsto_centavos:1000,grupo_servico:'Adicional'},
     {tipo:'service',descricao:'QA teste final '+tag,unidade:'un',quantidade:1,preco_unitario_centavos:2000,grupo_servico:'Teste final',depende_grupo:'Diagnóstico'}
    ],desconto_centavos:1700,observacoes:'Teste integrado '+tag,condicoes:'Não executar grupos sem autorização.'};
    const args={p_oficina:c.empresa_id,p_dados:dados,p_chave:chave,p_orcamento:null,p_revisao:null};q=await rpc('salvar_orcamento',args);assert.equal((await rpc('salvar_orcamento',args)).id,q.id);checks.push('Repetição da criação preserva o mesmo orçamento');
    const token=randomBytes(32).toString('hex');q=await rpc('emitir_orcamento',{p_oficina:c.empresa_id,p_orcamento:q.id,p_revisao:q.revisao,p_validade_dias:7,p_hash_token:createHash('sha256').update(token).digest('hex')});
    documentos.push({perfil:c.especialidade,tela,modo,id:q.id,numero:q.numero});
    await u.goto(base+'/proposta#'+token);await u.getByRole('heading',{name:'Podemos seguir com o serviço?',exact:true}).waitFor();assert.equal((await clienteCtx.cookies()).some(x=>/sb-.*auth/.test(x.name)),false);checks.push('Cliente abre a proposta sem login');
    assert(await u.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks.push('Página pública sem rolagem horizontal');
    assert.equal(await u.getByRole('button',{name:'Aprovar serviços selecionados',exact:true}).isDisabled(),true);checks.push('Autorização exige nome e confirmação explícita');
    if(modo==='revisao'||modo==='cancelamento'){
     const acao=modo==='revisao'?'revisar_orcamento':'cancelar_orcamento';
     const novo=await rpc(acao,{p_oficina:c.empresa_id,p_orcamento:q.id,p_revisao:q.revisao},modo==='cancelamento'?204:200);
     await u.reload();await u.getByRole('heading',{name:'Proposta indisponível',exact:true}).waitFor();checks.push('Link antigo recusado após '+modo);
     const historico=await rpc('consultar_orcamento',{p_oficina:c.empresa_id,p_orcamento:q.id,p_versao:q.versao.id});assert.equal(historico.versao.total_centavos,15300);assert.equal(historico.itens.length,3);checks.push('Versão original e três itens preservados');
     if(modo==='revisao'){assert.equal(novo.versao.numero_versao,2);assert.equal(novo.situacao,'draft');checks.push('Nova versão exige nova aprovação');}
    }else{
     const grupos=u.locator('.agil-grupo input');await grupos.nth(0).uncheck();await grupos.nth(1).uncheck();assert.equal(await u.getByRole('button',{name:'Aprovar serviços selecionados',exact:true}).isDisabled(),true);assert.equal(await grupos.nth(2).isChecked(),false);checks.push('Remover grupo necessário remove dependentes; seleção vazia não aprova');
     await grupos.nth(2).check();assert.equal(await grupos.nth(0).isChecked(),true);checks.push('Selecionar serviço dependente inclui o diagnóstico obrigatório');
     if(modo==='parcial')await grupos.nth(2).uncheck();else await grupos.nth(1).check();
     await u.getByLabel('Seu nome completo',{exact:true}).fill('Cliente fictício QA '+tag);await u.locator('.confirmar-proposta input').check();
     const download=u.waitForEvent('download');await u.getByRole('button',{name:'Baixar orçamento em PDF',exact:true}).click();await(await download).saveAs(resolve(out,c.especialidade+'-'+tela+'-'+modo+'.pdf'));checks.push('PDF baixado antes da decisão');
     await u.getByRole('button',{name:modo==='recusa'?'Recusar orçamento':'Aprovar serviços selecionados',exact:true}).click();await u.getByRole('heading',{name:modo==='recusa'?'Orçamento recusado':'Orçamento aprovado',exact:true}).waitFor();
     await u.reload();await u.getByRole('heading',{name:modo==='recusa'?'Orçamento recusado':'Orçamento aprovado',exact:true}).waitFor();checks.push('Decisão continua registrada após recarregar');
     const atualizado=await rpc('consultar_orcamento',{p_oficina:c.empresa_id,p_orcamento:q.id,p_versao:null});assert.equal(atualizado.situacao,modo==='recusa'?'declined':'approved');assert.equal(atualizado.itens.length,3);assert.equal(atualizado.versao.total_centavos,15300);checks.push('Proposta original preservada sem remover itens recusados');
     assert.equal(atualizado.aprovacao.comprovante.versao_id,q.versao.id);checks.push('Comprovante vinculado à versão respondida');
     if(modo!=='recusa'){
      const total=modo==='parcial'?9000:15300;assert.equal(atualizado.aprovacao.total_aprovado_centavos,total);checks.push('Desconto proporcional e valor autorizado conferidos no banco');
      await p.goto(base+'/orcamentos');await p.getByLabel('Buscar orçamentos',{exact:true}).fill('#'+q.numero);const linha=p.getByRole('article',{name:'Orçamento #'+q.numero,exact:true});await linha.getByRole('button',{name:'Transformar em OS',exact:true}).click();await p.getByRole('button',{name:'Sim, transformar em OS',exact:true}).click();await p.locator('dialog[open].dialogo-detalhes-os .os-resumo-limpo').waitFor();
      const convertido=await rpc('consultar_orcamento',{p_oficina:c.empresa_id,p_orcamento:q.id,p_versao:null});assert(convertido.ordem_servico_id);documentos.at(-1).os=convertido.ordem_servico_id;
      const os=await rpc('consultar_ordem_servico',{p_oficina:c.empresa_id,p_os:convertido.ordem_servico_id});assert.equal(os.total_centavos,total);assert.equal(os.itens.length,modo==='parcial'?1:3);assert.equal(os.data_servico,'2026-11-16');checks.push('Conversão pela tela abre a OS com data, itens e valor autorizados');
      const outra=await rpc('converter_orcamento_em_os',{p_oficina:c.empresa_id,p_orcamento:q.id});assert.equal(outra,os.id);checks.push('Repetir conversão retorna a mesma OS, sem duplicar');
      assert(await p.locator('dialog[open].dialogo-detalhes-os').evaluate(el=>el.scrollWidth<=el.clientWidth+1));checks.push('OS convertida cabe no modal, incluindo celular');
     }else{
      const resposta=await p.request.post(banco+'/rest/v1/rpc/converter_orcamento_em_os',{headers,data:{p_oficina:c.empresa_id,p_orcamento:q.id}});assert(!resposta.ok());assert.equal(atualizado.ordem_servico_id,null);checks.push('Orçamento recusado não pode gerar OS');
     }
    }
    await u.screenshot({path:resolve(out,c.especialidade+'-'+tela+'-'+modo+'.png'),fullPage:true});assert(await u.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    resultados.push({perfil:c.especialidade,tela,modo,ok:true,segundos:+((performance.now()-inicio)/1000).toFixed(3),checks});console.log('PASS ciclo',c.especialidade,tela,modo);await gravar();
   }catch(e){process.exitCode=1;resultados.push({perfil:c.especialidade,tela,modo,ok:false,checks,erro:e.message});await u.screenshot({path:resolve(out,c.especialidade+'-'+tela+'-'+modo+'-falha.png'),fullPage:true});await writeFile(resolve(out,c.especialidade+'-'+tela+'-'+modo+'-falha.txt'),(await u.locator('body').innerText())+'\n--- EQUIPE ---\n'+await p.locator('body').innerText());throw e;}finally{await clienteCtx.close();}
  }
 }finally{await equipe.close();}
}}catch(e){console.error(e.stack);process.exitCode=1;}finally{await browser.close();if(erros.length)process.exitCode=1;await gravar();console.log(JSON.stringify({ok:!process.exitCode,cenarios:resultados.length,verificacoes:resultados.reduce((s,r)=>s+r.checks.length,0)}));}
