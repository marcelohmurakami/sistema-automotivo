const produtos=Array.from({length:32},(_,i)=>({id:'item-'+i,descricao:i===0?'Kit de reposição com descrição longa para conferir o alinhamento da linha':i===1?'Item sem controle':i===2?'Item esgotado':i===3?'Unidade com série':i===4?'Item arquivado':'Material de reposição '+String(i).padStart(2,'0'),codigo:'SKU-'+i,unidade:'un',saldo:i===1?null:i===2||i===4?0:1007,minimo:3,custo_centavos:5300,preco_padrao_centavos:7500,revisao:1,reservado:i===0?7:0,disponivel:i===1?null:i===2||i===4?0:i===0?1000:1007,localizacao:i===0?'Prateleira A · Caixa 3':'',fornecedor:'Fornecedor QA',arquivado_em:i===4?'2026-11-01':null,rastreado:i===3}));
const movimentos=[];window.fixtureChamadas=[];window.fixtureProdutos=produtos;window.fixtureFalhar=null;
export async function rpc(n,args={}) {
 window.fixtureChamadas.push({n,args:structuredClone(args)});
 if(window.fixtureFalhar===n){window.fixtureFalhar=null;throw new Error('Falha simulada na consulta. Tente novamente.');}
 const p=produtos.find(x=>x.id===args.p_produto||x.id===args.p_id);
 let result;
 switch(n){
 case 'listar_estoque':{const ativos=produtos.filter(x=>!x.arquivado_em),controlados=ativos.filter(x=>x.saldo!==null),itens=produtos.filter(x=>(args.p_filtro==='arquivados'?x.arquivado_em:!x.arquivado_em)&&(!args.p_busca||(x.descricao+' '+x.codigo).toLowerCase().includes(args.p_busca.toLowerCase()))&&(args.p_filtro!=='baixo'||x.saldo!==null&&x.disponivel<=x.minimo)&&(args.p_filtro!=='zerado'||x.saldo===0)&&(args.p_filtro!=='controlados'||x.saldo!==null));result={itens:itens.slice(args.p_pagina*24,(args.p_pagina+1)*24),total:itens.length,resumo:{produtos:controlados.length,baixos:controlados.filter(x=>x.disponivel<=x.minimo).length,zerados:controlados.filter(x=>x.saldo===0).length,valor_centavos:3045148000}};break;}
 case 'consultar_produto_estoque':result=p;break;
 case 'consultar_depositos_estoque':result={padrao:'deposito-principal',total:2,itens:[{id:'deposito-principal',nome:'Estoque principal',ativo:true,padrao:true,tipo:'deposito',saldo:p?.saldo??0,disponivel:p?.disponivel??0,reservado:0},{id:'veiculo',nome:'Veículo da equipe',ativo:true,tipo:'veiculo',saldo:0,disponivel:0,reservado:0}],produtos:[],total_produtos:0};break;
 case 'salvar_produto_estoque':{if(p){Object.assign(p,args.p_dados,{revisao:p.revisao+1,saldo:p.saldo??0,disponivel:p.disponivel??0});}else produtos.unshift({...args.p_dados,revisao:1,saldo:0,disponivel:0});result=args.p_id;break;}
 case 'movimentar_estoque_deposito':{if(args.p_revisao!==p.revisao)throw new Error('Saldo alterado. Atualize antes de movimentar.');const delta=args.p_tipo==='ajuste'?args.p_quantidade-p.saldo:args.p_quantidade*(args.p_tipo==='saida'?-1:1);if(p.disponivel+delta<0)throw new Error('Saldo disponível insuficiente.');p.saldo+=delta;p.disponivel+=delta;p.revisao++;movimentos.unshift({id:'mov-'+movimentos.length,item_catalogo_id:p.id,tipo:args.p_tipo,quantidade:delta,saldo_apos:p.saldo,custo_centavos:p.custo_centavos,motivo:args.p_motivo,documento:args.p_documento,criado_em:new Date().toISOString(),estornado:false});result=null;break;}
 case 'consultar_movimentacoes_estoque':result=movimentos.filter(x=>x.item_catalogo_id===p.id);break;
 case 'arquivar_produto_estoque':p.arquivado_em=p.arquivado_em?null:'2026-11-05';p.revisao++;result=null;break;
 case 'consultar_unidades_estoque':case 'consultar_unidades_deposito':case 'consultar_transferencias_estoque':result={itens:[],total:0};break;
 case 'listar_fornecedores':result={itens:[],total:0};break;
 case 'listar_locais_fisicos':result=[];break;
 case 'listar_itens_fisicos':result={itens:[],tem_mais:false,vinculo:null};break;
 case 'localizar_codigo_estoque':result=[{produto_id:'item-0',descricao:produtos.find(x=>x.id==='item-0').descricao,unidade_id:null,disponivel:1000}];break;
 case 'configurar_planejamento_estoque':Object.assign(p,args.p_dados,{revisao:p.revisao+1});result=null;break;
 default:throw new Error('RPC sem fixture: '+n);
 }
 return structuredClone(result);
}
