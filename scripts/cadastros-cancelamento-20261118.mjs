import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function cenariosCompra({p,d,check,layout,medir,abrir,rpc,tag,ids}){
 const fornecedor=randomUUID(),nome=tag+' fornecedor';ids.fornecedores.push(fornecedor);
 await rpc('salvar_fornecedor',{p_id:fornecedor,p_revisao:null,p_dados:{nome,documento:'',telefone:'',email:'',endereco:'',observacoes:''}});
 let gravou=false;
 p.on('request',r=>{if(r.url().endsWith('/rpc/registrar_compra_com_pagamento'))gravou=true});
 await p.route('**/rpc/listar_compras_estoque',async r=>{if(gravou)await new Promise(ok=>setTimeout(ok,2000));await r.continue()});
 await abrir('Compras','/compras',()=>p.getByRole('button',{name:'Registrar compra',exact:true}).waitFor());
 await medir('Compras · registrar com atualização atrasada',async()=>{
  await p.getByRole('button',{name:'Registrar compra',exact:true}).click();await d().locator('input[role=combobox]').first().fill(nome);await d().getByRole('option').filter({hasText:nome}).click();await d().locator('[name=documento]').fill(tag);await d().locator('input[role=combobox]').last().fill(tag+' peça');await d().getByRole('option').filter({hasText:tag+' peça'}).click();await d().getByLabel('Quantidade',{exact:true}).fill('3');await d().getByLabel('Custo unitário (R$)',{exact:true}).fill('11.11');await d().getByRole('button',{name:/^Confirmar compra e entrada/}).click();await p.getByRole('heading',{name:'Detalhes da compra',exact:true}).waitFor();await d().getByRole('button',{name:'Cancelar esta compra',exact:true}).waitFor();
 });
 const cancelar=d().getByRole('button',{name:'Cancelar esta compra',exact:true});
 if(process.env.QA_REPRODUZIR_CORRIDA){
  check('Versão anterior permite cancelar antes de terminar',await cancelar.isEnabled());await cancelar.click();check('Motivo aparece bloqueado',await d().locator('[name=motivo]').isDisabled());await d().locator('[name=motivo]').waitFor({state:'hidden'});check('Falha reproduzida: atualização anterior fechou o motivo',true);return;
 }
 check('Cancelamento aguarda finalizar registro anterior',await cancelar.isDisabled());
 await medir('Compras · cancelar após atualização atrasada',async()=>{await cancelar.click();await d().locator('[name=motivo]').fill('Encerramento do teste fictício');await d().getByRole('button',{name:'Confirmar cancelamento da compra',exact:true}).click();await d().getByText('Compra cancelada:',{exact:false}).waitFor();await layout('Cancelamento após atualização atrasada')});
 const compra=await rpc('consultar_compra_estoque',{p_compra:ids.compras[0]});check('Compra cancelada sem pagamentos',!!compra.cancelado_em&&compra.titulos.every(t=>t.baixado_centavos===0));
 const est=await rpc('listar_estoque',{p_busca:tag+' peça',p_filtro:'',p_pagina:0});check('Estoque revertido ao cancelar',est.itens.find(x=>x.id===ids.produto)?.saldo===0);
}
