import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
const base=process.env.QA_URL||'https://patio-gestao-peach.vercel.app',fase=process.env.QA_FASE||'antes';
const out=resolve(process.env.QA_OUTPUT||`output/orcamentos-velocidade-20261113/${fase}`);await mkdir(out,{recursive:true});
const health=await fetch(base+'/health.json?qa='+Date.now()).then(r=>r.json());
if(process.env.QA_EXPECTED_BUILD)assert.equal(health.build,process.env.QA_EXPECTED_BUILD);
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.filter(c=>c.ramo==='automotivo'&&(!process.env.QA_PERFIS||process.env.QA_PERFIS.split(',').includes(c.especialidade)));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[],documentos=[],erros=[],extras=[];
const banco='https://hzihxtjirttetnfdujcx.supabase.co';
const gravar=()=>writeFile(resolve(out,'resultados.json'),JSON.stringify({fase,build:health.build,geradoEm:new Date().toISOString(),ok:!process.exitCode,resultados,documentos,erros,extras},null,2));
try{for(const c of contas){
 assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
 const ctx=await browser.newContext({viewport:{width:1920,height:1080},locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'}),p=await ctx.newPage();p.setDefaultTimeout(25000);let headers,requests=[],medindo=false,tela,contagem;
 p.on('pageerror',e=>erros.push({perfil:c.especialidade,erro:e.message}));
 p.on('request',r=>{if(r.url().startsWith(banco+'/rest/v1/')){const h=r.headers();if(h.authorization)headers={authorization:h.authorization,apikey:h.apikey,'content-type':'application/json'};if(medindo)requests.push({request:r,nome:new URL(r.url()).pathname.split('/').pop(),inicio:performance.now()});}});
 p.on('requestfinished',r=>{const a=requests.find(x=>x.request===r);if(a)a.segundos=(performance.now()-a.inicio)/1000;});
 const rpc=async(nome,args)=>{assert.equal(args.p_oficina,c.empresa_id);const r=await p.request.post(banco+'/rest/v1/rpc/'+nome,{headers,data:args});assert(r.ok(),nome+' '+r.status()+' '+await r.text());return r.json();};
 const medir=async(nome,fn)=>{requests=[];contagem={cliques:0,campos:0};medindo=true;const ini=performance.now();try{await fn();resultados.push({perfil:c.especialidade,tela,nome,...contagem,segundos:+((performance.now()-ini)/1000).toFixed(3),requisicoes:requests.map(({nome,segundos})=>({nome,segundos:segundos?+segundos.toFixed(3):null})),ok:true});await gravar();}catch(e){resultados.push({perfil:c.especialidade,tela,nome,ok:false,erro:e.message});throw e;}finally{medindo=false;}};
 const click=async l=>{if(medindo)contagem.cliques++;await l.click();},fill=async(l,v)=>{if(medindo)contagem.campos++;await l.fill(v);};
 const btn=name=>name==='Novo orçamento'?p.locator('.titulo-pagina').getByRole('button',{name,exact:true}):p.getByRole('button',{name,exact:true});
 const pronto=async()=>{await p.locator('dialog[open] .documento-orcamento,dialog[open] .proposta-documento').first().waitFor();await p.waitForFunction(()=>{const b=document.querySelector('dialog[open] button[aria-label="Compartilhar PDF"]');return b&&!b.disabled});};
 const item=async(nome,preco='100')=>{await click(btn('Serviço ou peça avulsa'));const g=p.getByRole('group',{name:'Novo item avulso'});await fill(g.getByLabel('Nome do serviço ou peça',{exact:true}),nome);await fill(g.getByLabel('Preço unitário (R$)',{exact:true}),preco);await click(g.getByRole('button',{name:'Adicionar serviço',exact:true}));};
 try{
  await p.goto(base+'/entrar');await p.getByLabel('E-mail',{exact:true}).fill(c.email);await p.getByLabel('Senha',{exact:true}).fill(c.senha);await btn('Entrar no sistema').click();await p.getByRole('textbox',{name:'Buscar veículo no mapa',exact:true}).waitFor();
  for(const largura of [1920,390]){
   tela=largura===1920?'desktop':'celular';await p.setViewportSize({width:largura,height:largura===1920?1080:844});
   if(process.env.QA_REMEDIR_BUSCA==='1'){
    const origem=JSON.parse(await readFile('output/orcamentos-velocidade-20261113/antes/resultados.json','utf8')).documentos.find(d=>d.perfil===c.especialidade&&d.tela===tela);
    const q=await rpc('consultar_orcamento',{p_oficina:c.empresa_id,p_orcamento:origem.id,p_versao:null});await p.goto(base+'/orcamentos');const busca=p.getByLabel('Buscar orçamentos',{exact:true});
    const primeiro=p.waitForResponse(r=>r.url().endsWith('/rpc/listar_orcamentos_gestao')&&r.request().postDataJSON()?.p_busca===q.versao.dados_cliente.nome);await busca.fill(q.versao.dados_cliente.nome);assert((await primeiro).ok());await p.getByRole('article',{name:'Orçamento #'+q.numero,exact:true}).waitFor();
    await medir('Buscar orçamento pelo número',async()=>{const ret=p.waitForResponse(r=>r.url().endsWith('/rpc/listar_orcamentos_gestao')&&r.request().postDataJSON()?.p_busca===String(q.numero));await fill(busca,String(q.numero));assert((await ret).ok());await p.getByRole('article',{name:'Orçamento #'+q.numero,exact:true}).waitFor();});
    await p.getByRole('article',{name:'Orçamento #'+q.numero,exact:true}).getByRole('button',{name:new RegExp('^Abrir orçamento')}).click();await pronto();
    await medir('Editar a partir da consulta',async()=>{const atalho=btn('Editar orçamento');if(await atalho.count())await click(atalho);else{await click(p.getByRole('dialog',{name:'Orçamento #'+q.numero,exact:true}).getByRole('button',{name:'Fechar janela',exact:true}));await click(btn('Editar orçamento #'+q.numero));}await btn('Salvar alterações').waitFor();});await btn('Cancelar').click();
    if(fase.startsWith('depois')){
     const respostaNumero=p.waitForResponse(r=>r.url().endsWith('/rpc/listar_orcamentos_gestao')&&r.request().postDataJSON()?.p_busca===String(q.numero));
     await busca.fill('#000'+q.numero);await busca.press('Enter');assert((await respostaNumero).ok());await p.getByRole('article',{name:'Orçamento #'+q.numero,exact:true}).waitFor();
     extras.push({perfil:c.especialidade,tela,nome:'Número copiado com #, zeros e Enter',ok:true});
     await btn('Limpar busca de orçamentos').click();assert.equal(await busca.inputValue(),'');
     extras.push({perfil:c.especialidade,tela,nome:'Limpar busca publicada em um clique',ok:true});await gravar();
    }
    console.log('PASS busca e atalho',c.especialidade,tela);continue;
   }
   if(process.env.QA_RAPIDO==='1'){
    const cad=async(tipo,cliente=null)=>rpc('buscar_cadastros_operacao',{p_oficina:c.empresa_id,p_tipo:tipo,p_busca:'',p_cliente:cliente,p_id:null,p_tipo_item:tipo==='catalogo'?'service':null});
    const clientes=await cad('clientes');let cliente,veiculos=[];
    for(const item of clientes){const lista=c.especialidade==='retifica'?[]:await cad('veiculos',item.id);if(c.especialidade==='retifica'||lista.length){cliente=item;veiculos=lista;break;}}
    assert(cliente,'Cliente fictício com identificação para o orçamento');
    const servico=(await cad('catalogo')).find(i=>i.preco_padrao_centavos>0);assert(servico);
    await p.goto(base+'/orcamentos');await btn('Novo orçamento').waitFor();let proposta;
    await medir('Criar orçamento com cliente e serviço cadastrados',async()=>{
     await click(btn('Novo orçamento'));await fill(p.getByRole('combobox',{name:'Cliente',exact:true}),cliente.nome);await click(p.getByRole('option').filter({hasText:cliente.nome}).first());
     if(c.especialidade==='retifica'){await fill(p.getByLabel('Carro',{exact:true}),'Volkswagen Gol QA');await fill(p.getByLabel('Motor',{exact:true}),'AP 1.6');}
     else if(veiculos.length===1){const campo=await p.getByRole('combobox',{name:'Veículo',exact:true}).getAttribute('id');await p.waitForFunction(({campo,modelo})=>document.getElementById(campo)?.value.includes(modelo),{campo,modelo:veiculos[0].modelo});}
     else{await fill(p.getByRole('combobox',{name:'Veículo',exact:true}),veiculos[0].modelo);await click(p.getByRole('option').filter({hasText:veiculos[0].modelo}).first());}
     await fill(p.getByLabel('Buscar serviço ou peça: orçamento',{exact:true}),servico.descricao);await click(p.locator('.os-editor-catalogo button').filter({hasText:servico.descricao}).first());
     const resposta=p.waitForResponse(r=>r.url().endsWith('/rpc/emitir_orcamento')&&r.request().method()==='POST');await click(btn('Salvar orçamento'));const r=await resposta;assert(r.ok(),await r.text());proposta=await r.json();await pronto();
    });
    const q=await rpc('consultar_orcamento',{p_oficina:c.empresa_id,p_orcamento:proposta.id,p_versao:null});assert.equal(q.cliente_id,cliente.id);assert.equal(q.itens.length,1);assert.equal(q.itens[0].item_catalogo_id,servico.id);assert.equal(q.versao.total_centavos,servico.preco_padrao_centavos);assert.equal(q.situacao,'awaiting_approval');
    documentos.push({perfil:c.especialidade,tela,id:q.id,numero:q.numero,verificado:{itens:1,total:q.versao.total_centavos,cliente:cliente.id,catalogo:servico.id}});await gravar();console.log('PASS rápido',c.especialidade,tela);continue;
   }
   const token='QAO'+randomUUID().slice(0,8),nome=token+' Orçamento '+fase;
   await medir('Abrir lista de orçamentos',async()=>{await p.goto(base+'/orcamentos');await btn('Novo orçamento').waitFor();await p.locator('.paginacao-clientes').waitFor();await p.getByText('Carregando orçamentos…',{exact:true}).waitFor({state:'hidden'});});
   let proposta;
   const completoNovo=process.env.QA_COMPLETO==='1';
   const catalogo=completoNovo?(await rpc('buscar_cadastros_operacao',{p_oficina:c.empresa_id,p_tipo:'catalogo',p_busca:'',p_cliente:null,p_id:null,p_tipo_item:'service'})).find(i=>i.preco_padrao_centavos>0):null;
   if(completoNovo)assert(catalogo,'Catálogo fictício precisa de um serviço com preço');
   const salvar=async(texto)=>{const resposta=p.waitForResponse(r=>r.url().endsWith('/rpc/emitir_orcamento')&&r.request().method()==='POST');await click(btn(texto));const r=await resposta;assert(r.ok(),await r.text());proposta=await r.json();await pronto();};
   await medir(completoNovo?'Criar orçamento completo do início ao fim':'Criar orçamento simples completo',async()=>{
    await click(btn('Novo orçamento'));await click(p.getByRole('option',{name:'Informar cliente sem cadastrar',exact:true}));await fill(p.getByLabel('Nome do cliente',{exact:true}),nome);
    if(c.especialidade==='retifica'){await fill(p.getByLabel('Carro',{exact:true}),'Volkswagen Gol QA');await fill(p.getByLabel('Motor',{exact:true}),'AP 1.6');}
    else{await click(btn('Novo veículo'));await fill(p.getByLabel('Nome / modelo do veículo',{exact:true}),'Volkswagen Gol QA '+token);await click(btn('Cadastrar e selecionar'));await p.getByText('Veículo cadastrado e selecionado.',{exact:true}).waitFor();}
    await item('QA revisão '+token);
    if(completoNovo){
     await fill(p.getByLabel('Buscar serviço ou peça: orçamento',{exact:true}),catalogo.descricao);
     await click(p.locator('.os-editor-catalogo button').filter({hasText:catalogo.descricao}).first());
     for(let n=1;n<=10;n++)await item('QA item completo '+n+' '+token,String(10+n));
     await fill(p.getByLabel('Desconto (%)',{exact:true}),'10');await fill(p.getByLabel('Observações (opcional)',{exact:true}),'Orçamento detalhado QA '+token);
     const primeiro=p.locator('.os-editor-item').first();await click(primeiro.locator('summary'));await fill(primeiro.getByLabel('Custo da unidade (R$) · interno (opcional)',{exact:true}),'30');await fill(primeiro.getByLabel('Tempo total previsto (min) (opcional)',{exact:true}),'60');await fill(primeiro.getByLabel('Custo da hora (R$) · interno (opcional)',{exact:true}),'20');await fill(primeiro.getByLabel('Explique ao cliente (opcional)',{exact:true}),'Revisão e diagnóstico com conferência.');
     await click(p.locator('summary').filter({hasText:'Informações adicionais do orçamento'}));await click(p.locator('summary').filter({hasText:'Fotos e condições do orçamento'}));await fill(p.locator('textarea[name=condicoes]'),'Execução após aprovação. Garantia conforme documento.');
    }
    await salvar('Salvar orçamento');
   });
   const id=proposta.id,numero=proposta.numero;documentos.push({perfil:c.especialidade,tela,id,numero});await gravar();
   const ler=()=>rpc('consultar_orcamento',{p_oficina:c.empresa_id,p_orcamento:id,p_versao:null});
   const atual=await ler();assert.equal(atual.situacao,'awaiting_approval');
   if(completoNovo){const subtotal=25500+catalogo.preco_padrao_centavos,total=subtotal-Math.round(subtotal*.1);assert.equal(atual.itens.length,12);assert.equal(atual.versao.total_centavos,total);assert(atual.itens.some(i=>i.item_catalogo_id===catalogo.id));assert.equal(atual.itens[0].custo_unitario_previsto_centavos,3000);assert.equal(atual.itens[0].minutos_previstos,60);assert.equal(atual.versao.condicoes,'Execução após aprovação. Garantia conforme documento.');documentos.at(-1).verificado={itens:12,total,catalogo:catalogo.id,versoes:1};await p.screenshot({path:resolve(out,c.especialidade+'-'+tela+'-completo.png')});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));console.log('PASS completo',fase,c.especialidade,tela);await gravar();continue;}
   assert.equal(atual.versao.total_centavos,10000);assert.equal(atual.itens.length,1);
   await click(p.getByRole('dialog',{name:'Orçamento #'+numero,exact:true}).getByRole('button',{name:'Fechar janela',exact:true}));
   const busca=p.getByRole('textbox',{name:'Buscar orçamentos',exact:true}),linha=()=>p.getByRole('article',{name:'Orçamento #'+numero,exact:true});
   await medir('Buscar orçamento pelo cliente',async()=>{await fill(busca,token);await linha().waitFor();await p.waitForFunction(()=>document.querySelectorAll('.linha-proposta').length===1);});
   await medir('Consultar orçamento encontrado',async()=>{await click(linha().getByRole('button',{name:new RegExp('^Abrir orçamento')}));await pronto();});
   await p.screenshot({path:resolve(out,c.especialidade+'-'+tela+'-consulta.png')});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await click(p.getByRole('dialog',{name:'Orçamento #'+numero,exact:true}).getByRole('button',{name:'Fechar janela',exact:true}));
   await medir('Abrir edição pela lista',async()=>{await click(btn('Editar orçamento #'+numero));await btn('Salvar alterações').waitFor();});
   await medir('Modificar quantidade, desconto e observação',async()=>{
    await fill(p.getByLabel('Quantidade de QA revisão '+token,{exact:true}),'2');
    await click(btn('Desconto em porcentagem'));await fill(p.getByLabel('Desconto (%)',{exact:true}),'10');
    await fill(p.getByLabel('Observações (opcional)',{exact:true}),'Conferência QA '+token);await salvar('Salvar alterações');
   });
   const editado=await ler();assert.equal(editado.itens[0].quantidade,2);assert.equal(editado.versao.desconto_centavos,2000);assert.equal(editado.versao.total_centavos,18000);assert.equal(editado.versao.numero_versao,2);assert(editado.historico.length>=2);assert.equal(editado.versao.observacoes,'Conferência QA '+token);
   await click(p.getByRole('dialog',{name:'Orçamento #'+numero,exact:true}).getByRole('button',{name:'Fechar janela',exact:true}));
   await medir('Buscar orçamento pelo número',async()=>{const ret=p.waitForResponse(r=>r.url().endsWith('/rpc/listar_orcamentos_gestao')&&r.request().postDataJSON()?.p_busca===String(numero));await fill(busca,String(numero));assert((await ret).ok());await linha().waitFor();});
   await click(btn('Editar orçamento #'+numero));await btn('Salvar alterações').waitFor();
   await medir('Completar orçamento com 12 itens e custos',async()=>{
    for(let n=1;n<12;n++)await item('QA item '+n+' '+token,String(10+n));
    const primeiro=p.locator('.os-editor-item').first();await click(primeiro.locator('summary').filter({hasText:'Detalhes e custo deste item'}));
    await fill(primeiro.getByLabel('Custo da unidade (R$) · interno (opcional)',{exact:true}),'30');await fill(primeiro.getByLabel('Tempo total previsto (min) (opcional)',{exact:true}),'60');await fill(primeiro.getByLabel('Custo da hora (R$) · interno (opcional)',{exact:true}),'20');await fill(primeiro.getByLabel('Explique ao cliente (opcional)',{exact:true}),'Teste, revisão e inspeção detalhada.');
    await click(btn('Desconto em porcentagem'));await fill(p.getByLabel('Desconto (%)',{exact:true}),'10');await salvar('Salvar alterações');
   });
   const completo=await ler();assert.equal(completo.itens.length,12);assert.equal(completo.versao.numero_versao,3);assert.equal(completo.itens[0].custo_unitario_previsto_centavos,3000);assert.equal(completo.itens[0].minutos_previstos,60);assert.equal(completo.itens[0].custo_hora_centavos,2000);assert.equal(completo.versao.subtotal_centavos,37600);assert.equal(completo.versao.total_centavos,33840);
   await p.reload();await p.getByLabel('Buscar orçamentos',{exact:true}).fill(token);await linha().getByRole('button',{name:new RegExp('^Abrir orçamento')}).click();await pronto();assert((await p.locator('dialog[open]').innerText()).includes('338,40'));
   documentos.at(-1).verificado={itens:12,total:33840,versoes:completo.historico.length,situacao:completo.situacao};console.log('PASS',fase,c.especialidade,tela);await gravar();
  }
 }catch(e){process.exitCode=1;console.error(c.especialidade,e.stack);await p.screenshot({path:resolve(out,c.especialidade+'-falha.png')});await writeFile(resolve(out,c.especialidade+'-falha.txt'),await p.locator('body').innerText());throw e;}finally{await ctx.close();}
}}catch{process.exitCode=1;}finally{await browser.close();if(erros.length)process.exitCode=1;await gravar();console.log(JSON.stringify({ok:!process.exitCode,medicoes:resultados.length,documentos:documentos.length}));}

