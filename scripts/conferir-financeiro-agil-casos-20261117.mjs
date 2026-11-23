import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {setTimeout as esperar} from 'node:timers/promises';

// Falhas deliberadas de rede só no navegador QA; o banco continua real.
export async function conferir({p,d,fechar,tab,buscar,linha,medir,layout,confirmar,titulo,rpc,ids,tag,base,hoje,mobile,verificar,out,perfil,fase}){
 const novo=fase.includes('depois');
 await p.goto(base+'/financeiro',{waitUntil:'commit'});await p.locator('.fin-cartoes-caixa').waitFor();
 if(process.env.QA_CACHE){
  const caixa=(await rpc('consultar_contas_financeiras',{p_data:hoje})).find(c=>c.codigo==='caixa').saldo;
  let primeira=true;const verSaldo=async()=>{await tab('Resumo','visao');await p.getByRole('link',{name:'Ver histórico: saldo',exact:true}).click();await p.locator('.fin-hist-total strong').waitFor();const resposta=primeira||process.env.QA_ESPERA_SALDO_ATUAL?p.waitForResponse(r=>r.url().endsWith('/rpc/consultar_detalhe_financeiro')&&r.request().postDataJSON()?.p_conta==='caixa'):null;await p.getByRole('combobox',{name:'Conta',exact:true}).selectOption('caixa');if(resposta)await(await resposta).finished();await p.waitForURL(/conta=caixa/);await p.locator('.fin-hist-lista[aria-busy=false]').waitFor();primeira=false};
  const valor=async()=>Number((await p.locator('.fin-hist-total strong').innerText()).replace(/[^\d,-]/g,'').replace(',','.'))*100;
  await verSaldo();verificar('Saldo inicial exibido correto',Math.round(await valor())===caixa);await p.locator('.fin-hist-voltar').click();await tab('Contas bancárias','bancos');
  await medir('Transferir e consultar saldo atualizado',async()=>{await p.getByRole('button',{name:'Registrar transferência',exact:true}).click();await d().locator('[name=origem]').selectOption('banco');await d().locator('[name=destino]').selectOption('caixa');await d().locator('[name=valor]').fill('10');await confirmar();await verSaldo()});
  const esperado=process.env.QA_ESPERA_SALDO_ATUAL?caixa+1000:caixa;
  verificar(process.env.QA_ESPERA_SALDO_ATUAL?'Histórico atualiza imediatamente após transferência':'Reprodução: histórico reutiliza saldo anterior à transferência',Math.round(await valor())===esperado);
  verificar('Banco contém transferência correta',(await rpc('consultar_contas_financeiras',{p_data:hoje})).find(c=>c.codigo==='caixa').saldo===caixa+1000);return;
 }
 const nome=tag+' controle';
 const abrirNova=async(desc)=>{await p.getByRole('button',{name:'Nova conta a receber',exact:true}).click();await d().locator('[name=descricao]').fill(desc);await d().locator('[name=valor]').fill('100')};
 await abrirNova(nome);await layout('Cadastro');await p.screenshot({path:resolve(out,perfil+(mobile?'-celular':'-desktop')+'-cadastro.png')});
 if(novo){
  const detalhes=d().locator('.fin-titulo-detalhes');await detalhes.locator('summary').click();await detalhes.locator('[name=competencia]').fill('');await detalhes.locator('summary').click();
  await d().getByRole('button',{name:'Salvar lançamento',exact:true}).click();verificar('Validação abre campo obrigatório recolhido',await detalhes.getAttribute('open')!==null);await detalhes.locator('[name=competencia]').fill(hoje);
 }
 await d().getByRole('button',{name:'Salvar lançamento',exact:true}).click();await p.locator('dialog[open]').waitFor({state:'hidden'});const t=await titulo(nome);ids.add(t.id);
 await buscar(nome);await linha(nome).locator('.fin-lancamento').click();await d().getByRole('button',{name:'Editar',exact:true}).click();await d().locator('[name=valor]').fill('101');
 let atrasoResolve;const atrasado=new Promise(r=>atrasoResolve=r);let interceptou=false;
 const atrasar=async route=>{const res=await route.fetch();interceptou=true;await esperar(2200);await route.fulfill({response:res});atrasoResolve()};
 await p.route('**/rest/v1/rpc/historico_financeiro',atrasar);
 await medir('Controle: salvar com histórico secundário 2,2 s lento',async()=>{await d().getByRole('button',{name:'Salvar lançamento',exact:true}).click();await p.locator('dialog[open]').waitFor({state:'hidden'})});
 await atrasado;verificar('Histórico secundário realmente atrasado',interceptou);await p.unroute('**/rest/v1/rpc/historico_financeiro',atrasar);

 let consultaIniciada;const iniciou=new Promise(r=>consultaIniciada=r);let liberar;const libera=new Promise(r=>liberar=r);let retencaoTerminou,erroRetencao;const retida=new Promise(r=>retencaoTerminou=r);
 const reter=async route=>{try{const res=await route.fetch();consultaIniciada();await libera;await route.fulfill({response:res})}catch(e){erroRetencao=e}finally{retencaoTerminou()}};
 await p.route('**/rest/v1/rpc/consultar_painel_financeiro',reter);
 const input=p.getByPlaceholder('Descrição ou pessoa',{exact:true});await input.fill(nome+' ');await iniciou;
 const foco=await p.evaluate(()=>document.activeElement?.getAttribute('placeholder')==='Descrição ou pessoa');
 verificar(novo?'Busca mantém foco durante resposta lenta':'Reprodução anterior: busca perde o foco',foco===novo);
 if(novo)verificar('Conta antiga bloqueada durante atualização',await linha(nome).locator('.fin-lancamento').isDisabled());
 liberar();await retida;assert.equal(erroRetencao,undefined);await p.unroute('**/rest/v1/rpc/consultar_painel_financeiro',reter);await linha(nome).locator('.fin-lancamento').waitFor();
 await buscar(nome);await linha(nome).getByRole('button',{name:'Receber '+nome,exact:true}).click();
 await d().locator('[name=forma]').selectOption('credito');await d().locator('[name=taxa]').fill('2');await d().locator('[name=forma]').selectOption('pix');
 verificar(novo?'Trocar cartão por Pix limpa taxa anterior':'Reprodução anterior: taxa persiste ao trocar forma',await d().locator('[name=taxa]').inputValue()===(novo?'0':'2'));
 if(!novo)await d().locator('[name=taxa]').fill('0');
 await layout('Baixa');await p.screenshot({path:resolve(out,perfil+(mobile?'-celular':'-desktop')+'-pagamento.png')});
 let chamadas=0,dados;
 const lento=async route=>{chamadas++;dados=route.request().postDataJSON();const res=await route.fetch();await esperar(800);await route.fulfill({response:res})};
 await p.route('**/rest/v1/rpc/baixar_titulo_financeiro',lento);
 await medir('Controle: clique repetido com confirmação lenta',async()=>{await d().getByRole('button',{name:'Confirmar registro',exact:true}).evaluate(el=>{el.click();el.click()});await p.locator('dialog[open]').waitFor({state:'hidden'})});
 await p.unroute('**/rest/v1/rpc/baixar_titulo_financeiro',lento);verificar('Clique repetido envia somente uma baixa',chamadas===1);
 const h=await rpc('historico_financeiro',{p_titulo:t.id});verificar('Pagamento sem taxa residual nem duplicação',h.length===1&&h[0].valor_centavos===10100&&h[0].taxa_centavos===0);
 await rpc('baixar_titulo_financeiro',dados);verificar('Reenvio da mesma chave é idempotente',(await rpc('historico_financeiro',{p_titulo:t.id})).length===1);

 // Cobertura de seções financeiras adicionais sem alterar registros existentes.
 for(const [label,id,pronto] of [['Contas bancárias','bancos','Contas e saldos'],['Contas mensais','recorrencias','Contas mensais']]){
  await medir('Abrir '+label,async()=>{await tab(label,id);await p.getByRole('heading',{name:pronto,exact:true}).waitFor()});await layout(label);
 }
 await tab('Resultado completo','resultado');await p.locator('.apuracao-demonstrativo').waitFor();
 for(const botao of ['Exportar apuração contábil','Exportar pagamentos e conciliação']){
  let consultas=0;const contar=req=>{if(req.url().endsWith('/rpc/consultar_apuracao_completa'))consultas++};p.on('request',contar);
  await medir(botao,async()=>{const download=p.waitForEvent('download');await p.getByRole('button',{name:botao,exact:true}).click();const arquivo=await download;const stream=await arquivo.createReadStream();let csv='';for await(const x of stream)csv+=x.toString();assert(csv.includes('Descrição'));await p.waitForFunction(label=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===label&&!b.disabled),botao)});
  p.off('request',contar);verificar(novo?'Exportação sem recálculo redundante: '+botao:'Reprodução anterior: exportação recalcula resultado: '+botao,consultas===(novo?0:1));
 }
 if(novo){
  await tab('Resumo','visao');const falhaNome=tag+' recuperação';await abrirNova(falhaNome);
  const falhar=route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Falha transitória simulada no teste'})});
  await p.route('**/rest/v1/rpc/consultar_titulo_alerta',falhar);await d().getByRole('button',{name:'Salvar e receber',exact:true}).click();await p.getByText('A conta foi salva, mas não conseguimos abrir o pagamento.',{exact:false}).waitFor();
  await p.unroute('**/rest/v1/rpc/consultar_titulo_alerta',falhar);const salva=await titulo(falhaNome);ids.add(salva.id);verificar('Falha após cadastro preserva conta sem pagamento',salva.aberto_centavos===10000&&salva.baixado_centavos===0);await linha(falhaNome).waitFor();
  await linha(falhaNome).getByRole('button',{name:'Receber '+falhaNome,exact:true}).click();
  await p.route('**/rest/v1/rpc/baixar_titulo_financeiro',falhar);await d().getByRole('button',{name:'Confirmar registro',exact:true}).click();await d().locator('[role=alert]').waitFor();await p.unroute('**/rest/v1/rpc/baixar_titulo_financeiro',falhar);
  verificar('Falha da baixa mantém conta em aberto',(await titulo(falhaNome)).baixado_centavos===0);await confirmar();verificar('Nova tentativa confirma uma única vez',(await rpc('historico_financeiro',{p_titulo:salva.id})).length===1);
 }
}
