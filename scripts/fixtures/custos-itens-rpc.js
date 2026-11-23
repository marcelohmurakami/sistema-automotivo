window.fixtureChamadas=[];window.fixtureErro=false;
const item={id:'item',descricao:'Serviço com insumos de teste',quantidade:2,preco:10000,origem:'externa',custo_unitario:3000,custo_ajustado:false,custo:6000,receita:18000,margem:12000};
const doc={id:'os',revisao:1,cliente:'Cliente de teste',titulo:'OS #123',data:'2026-11-03',bruto:20000,desconto:2000,receita:18000,pago:5000,aberto:13000,direto:8000,mao_obra_apropriada:0,indiretos:0,custo:8000,margem:10000,conferido:false,fontes_pendentes:0,conferencia:null,parametros:null,itens:[item],fontes:[{chave:'item:item',categoria:'materiais',descricao:item.descricao,valor:6000,financeiro:false,pendente:false},{chave:'comissao:1',categoria:'comissoes',descricao:'Comissão',valor:1500},{chave:'taxa:1',categoria:'impostos',descricao:'Taxas',valor:500}]};
// Formato real da API antes da primeira conferência (não equivale a conferencia:null).
doc.minutos=0;doc.assinatura='assinatura-qa';
const estadoConferencia=new URLSearchParams(location.search).get('conferencia');
if(estadoConferencia!=='nula')doc.conferencia={dados:null,revisao:null,conferido_em:null};
if(estadoConferencia==='vazia')doc.conferencia={};
if(estadoConferencia==='conferida'){
 doc.conferencia={dados:{minutos:30,categorias:{materiais:'Custos registrados e conferidos'},desconsideradas:{'comissao:1':'Já incluído em outra fonte acima'}},revisao:1,conferido_em:'2026-11-05T12:00:00Z'};
 doc.conferido=true;doc.custo=6500;doc.margem=11500;
}
const catalogo={id:'catalogo',descricao:'Serviço com insumos de teste',tipo:'service',unidade:'un',preco_padrao_centavos:10000,custo_centavos:3000,revisao:1,favorito:false,arquivado_em:null};
export {doc as fixtureLucro, item as fixtureItem};
export async function rpc(n,args={}){
 window.fixtureChamadas.push({n,args});
 if(n==='consultar_lucro_documento'||n==='consultar_custeio_servico')return structuredClone(doc);
 if(n==='consultar_lucro_cliente')return {quantidade:1,receita:18000,ticket_medio:18000,lucro:doc.margem,lucro_medio:doc.margem,pendentes:1};
 if(n==='salvar_custo_item_documento'){
  if(window.fixtureErro){window.fixtureErro=false;throw Error('A OS mudou. Atualize os custos antes de salvar.');}
  item.custo_unitario=args.p_custo;item.custo_ajustado=true;item.custo=args.p_custo===null?null:args.p_custo*2;item.margem=item.custo===null?null:item.receita-item.custo;doc.custo=(item.custo||0)+2000;doc.margem=doc.receita-doc.custo;doc.revisao++;doc.fontes[0].valor=item.custo;return;
 }
 if(n==='listar_catalogo_paginado')return {itens:[catalogo],proximo:null};
 if(n==='consultar_ficha_servico')return {...catalogo,ficha:{notas:'',duracao_minutos:null,custos:[]}};
 if(n==='resumo_catalogo')return {ativos:1,favoritos:0};
 if(n==='buscar_cadastros_operacao')return [];
 if(n==='salvar_item_catalogo'||n==='salvar_servico_detalhado'){Object.assign(catalogo,args.p_dados);catalogo.revisao++;return catalogo.id;}
 if(n==='consultar_ficha_cliente')return {cliente:{id:'cliente',nome:'Cliente de teste',tipo:'pessoa_fisica',criado_em:'2026-11-01',atualizado_em:'2026-11-03'},resumo:{atendimentos_concluidos:1,total_servicos_centavos:18000,ticket_medio_centavos:18000,em_andamento:0},financeiro:{pago_centavos:5000,aberto_centavos:13000},historico:{total:0,itens:[]},recursos:{ordens:true,notinhas:false},veiculos:[]};
 return [];
}
