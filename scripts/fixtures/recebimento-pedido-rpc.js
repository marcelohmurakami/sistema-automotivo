window.fixtureChamadas=[];
const params=new URLSearchParams(location.search),serial=params.has('serial'),unico=params.has('unico');
const criar=(id,quantidade)=>({id,produto_id:id,descricao:id==='a'?'Produto A':'Produto B',unidade:'un',quantidade,custo_centavos:2000,recebido:0,devolvido:0,reposto:0,creditado:0,sem_reposicao:0,pendente:quantidade,rastreado:serial});
const p={id:'pedido',referencia:'Pedido de teste',fornecedor:'Fornecedor QA',previsao:null,condicoes:'30 dias',observacoes:'',revisao:1,cancelado:false,total_centavos:30000,pendente:15,itens:unico?[criar('a',10)]:[criar('a',10),criar('b',5)],entregas:[],total_entregas:0};window.fixturePedido=p;
export async function rpc(n,args={}){
 window.fixtureChamadas.push({n,args});
 if(n==='consultar_pedidos_compra')return structuredClone(p);
 if(n==='consultar_depositos_estoque')return {itens:[{id:'deposito',nome:'Principal',ativo:true}],padrao:'deposito',total:1};
 if(n==='consultar_contas_financeiras')return [{codigo:'banco',nome:'Banco QA',ativo:true},{codigo:'caixa',nome:'Dinheiro em caixa',ativo:true}];
 if(n==='receber_pedido_com_pagamento'){
  if(window.fixtureFalhar){window.fixtureFalhar=false;throw Error('Pedido alterado. Atualize a tela.');}
  if(args.p_revisao!==p.revisao)throw Error('Pedido alterado. Atualize a tela.');
  for(const l of args.p_itens){const i=p.itens.find(i=>i.id===l.item_id);if(args.p_tipo==='compra')i.recebido+=l.quantidade;else if(args.p_tipo==='devolucao')i.devolvido+=l.quantidade;else i.reposto+=l.quantidade;i.pendente=i.quantidade-i.recebido+i.devolvido-i.reposto;}
  p.entregas.unshift({id:args.p_chave,tipo:args.p_tipo,data:args.p_data,documento:args.p_documento,motivo:args.p_motivo,itens:args.p_itens,compra_id:args.p_tipo==='compra'&&args.p_itens.some(i=>i.quantidade>0)?args.p_chave:null});p.total_entregas++;p.revisao++;return args.p_chave;
 }
 throw Error('RPC não simulada: '+n);
}
