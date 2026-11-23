const doc={id:'os',titulo:'OS #8154',cliente:'João Batista',data:'2026-11-04',receita:30000,situacao:'ready',assinatura:'a',custo:0,conferido:false};
const detalhe={documento:doc,fontes:[],atribuicao:new URLSearchParams(location.search).has('manual')?{revisao:1,dados:{criterio:'manual',participantes:[{funcionario_id:'a',execucao_bp:7000,venda_bp:10000},{funcionario_id:'b',execucao_bp:3000,venda_bp:0}],fontes:{}}}:null,participantes:[],revisar:false,horas:[]};
const locais=[{id:'p1',codigo:'PTL-1111111111111111',nome:'Prateleira 1',ativo:true},{id:'p2',codigo:'PTL-2222222222222222',nome:'Bancada 2',ativo:true}],itens=[];window.fixtureChamadas=[];
export async function rpc(n,a={}){window.fixtureChamadas.push({n,a});
 if(n==='listar_funcionarios')return [{id:'a',nome:'Ana',ativo:true},{id:'b',nome:'Bruno',ativo:true}];
 if(n==='resumo_contribuicao_equipe')return {servicos:1,receita:30000,pendentes:0,funcionarios:[]};
 if(n==='listar_contribuicoes_equipe')return [doc];
 if(n==='consultar_contribuicao_equipe')return structuredClone(detalhe);
 if(n==='salvar_atribuicao_equipe'){detalhe.atribuicao={revisao:(detalhe.atribuicao?.revisao||0)+1,dados:a.p_dados};return;}
 if(n==='listar_locais_fisicos')return locais;
 if(n==='listar_itens_fisicos')return {itens:itens.filter(i=>!a.p_busca||i.descricao.includes(a.p_busca)),tem_mais:false,vinculo:null};
 if(n==='registrar_conjunto_fisico'){const i={...a.p_dados,id:a.p_id,codigo:'PTI-1111111111111111',revisao:1,situacao:'na_empresa',local_nome:locais.find(l=>l.id===a.p_dados.local_id)?.nome,criado_em:new Date().toISOString()};itens.push(i);return [i];}
 if(n==='consultar_item_fisico')return {...itens.find(i=>i.codigo===a.p_codigo),relacionados:[]};
 if(n==='historico_item_fisico')return {eventos:[],tem_mais:false};
 if(n==='movimentar_itens_fisicos'){for(const i of itens.filter(i=>a.p_itens.some(x=>x.id===i.id))){i.local_id=a.p_local;i.local_nome=locais.find(l=>l.id===a.p_local).nome;i.revisao++;}return itens;}
 throw Error('RPC não simulada '+n);
}
