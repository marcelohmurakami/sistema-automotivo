import assert from 'node:assert/strict';

export async function conferirMensais({p,d,tab,fechar,medir,layout,verificar,rpc,tag,base,hoje}){
 const antes=!!process.env.QA_MENSAL_ANTES;
 await p.goto(base+'/financeiro',{waitUntil:'commit'});await p.locator('.fin-cartoes-caixa').waitFor();
 await tab('Contas mensais','recorrencias');await p.locator('.mensais-lista').waitFor();
 for(const variavel of [false,true]){
  await medir('Cadastrar mensal '+(variavel?'variável':'fixa'),async()=>{
   await p.getByRole('button',{name:'Nova conta mensal',exact:true}).click();await d().getByLabel('Nome da conta',{exact:true}).fill(tag+(variavel?' variável':' fixa'));
   if(variavel)await d().getByRole('combobox',{name:'Valor mensal',exact:true}).selectOption('variavel');else await d().getByLabel('Valor fixo mensal',{exact:true}).fill('59.90');
   await d().getByLabel('Dia do vencimento',{exact:true}).fill(String(Number(hoje.slice(-2))));await d().getByRole('button',{name:'Salvar conta mensal',exact:true}).click();await p.locator('dialog[open]').waitFor({state:'hidden'});
  });
 }
 const fixa=p.locator('.mensais-lista .mensal-linha').filter({hasText:tag+' fixa'});
 const variavel=p.locator('.mensais-pendentes .mensal-linha').filter({hasText:tag+' variável'});
 await variavel.waitFor();
 let liberar,observou;const liberado=new Promise(r=>liberar=r),interceptado=new Promise(r=>observou=r);
 let terminado,iniciada=false;const terminada=new Promise(r=>terminado=r);
 const reter=async route=>{iniciada=true;try{const res=await route.fetch();observou();await liberado;await route.fulfill({response:res})}finally{terminado()}};
 await p.route('**/rest/v1/rpc/consultar_contas_mensais_pendentes',reter);
 try{
  await fixa.getByRole('button',{name:'Pausar',exact:true}).click();let limite;
  try{await Promise.race([interceptado,new Promise((_,reject)=>limite=setTimeout(()=>reject(new Error('Consulta de pendências não começou')),20000))])}finally{clearTimeout(limite)}
  await fixa.getByRole('button',{name:'Retomar',exact:true}).waitFor();
  const nova=p.getByRole('button',{name:'Nova conta mensal',exact:true});
  verificar(antes?'Reprodução: novo cadastro liberado antes de concluir pausa':'Novo cadastro aguarda pausa terminar',await nova.isDisabled()===!antes);
  verificar(antes?'Reprodução: informar valor também liberado cedo':'Informar valor aguarda operação atual',await variavel.getByRole('button',{name:'Informar valor',exact:true}).isDisabled()===!antes);
  await nova.evaluate(el=>el.click());
  if(antes)await p.getByRole('dialog',{name:'Nova conta mensal',exact:true}).waitFor();
  else verificar('Clique durante atualização não abre formulário que seria fechado',await p.locator('dialog[open]').count()===0);
  liberar();await terminada;
  await p.getByText('Pausada. Contas já geradas permanecem no financeiro.',{exact:true}).waitFor();
  if(antes){await p.locator('dialog[open]').waitFor({state:'hidden'});verificar('Reprodução: fim da pausa fecha cadastro aberto depois',true);return;}
 }finally{liberar();if(iniciada)await terminada;await p.unroute('**/rest/v1/rpc/consultar_contas_mensais_pendentes',reter);}
 await medir('Abrir cadastro após pausa terminar',async()=>{
  await p.getByRole('button',{name:'Nova conta mensal',exact:true}).click();await d().getByLabel('Nome da conta',{exact:true}).fill(tag+' rascunho');
 });
 await layout('Novo cadastro após pausa');verificar('Novo formulário permanece aberto e editável',await d().getByLabel('Nome da conta',{exact:true}).inputValue()===tag+' rascunho');await fechar();
 await medir('Informar valor mensal depois da pausa',async()=>{
  await variavel.getByRole('button',{name:'Informar valor',exact:true}).click();await d().getByLabel('Valor deste mês',{exact:true}).fill('49.90');
  await d().getByRole('button',{name:'Salvar valor e abrir conta',exact:true}).click();await p.locator('dialog[open]').waitFor({state:'hidden'});await p.getByText('49,90',{exact:false}).first().waitFor();
 });
 const conta=(await rpc('consultar_painel_financeiro',{p_inicio:hoje.slice(0,7)+'-01',p_fim:hoje,p_busca:tag+' variável',p_filtro:'periodo',p_natureza:'',p_pagina:0,p_os:null,p_titulo:null})).itens;
 assert.equal(conta.length,1);verificar('Mensal variável mantém valor e não registra pagamento',conta[0].valor_centavos===4990&&conta[0].aberto_centavos===4990&&conta[0].baixado_centavos===0);
 await tab('Contas mensais','recorrencias');const linha=p.locator('.mensais-lista .mensal-linha').filter({hasText:tag+' variável'});
 await medir('Pausar mensal variável',async()=>{await linha.getByRole('button',{name:'Pausar',exact:true}).click();await linha.getByRole('button',{name:'Retomar',exact:true}).waitFor();await p.getByText('Pausada. Contas já geradas permanecem no financeiro.',{exact:true}).waitFor()});
}
