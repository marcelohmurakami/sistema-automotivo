const params=new URLSearchParams(location.search),db={funcionarios:[],fornecedores:[],catalogo:[]},calls=[];window.qaChamadas=calls;window.qaDB=db;
const pausa=(ms,signal)=>new Promise((ok,no)=>{const t=setTimeout(ok,ms);signal?.addEventListener('abort',()=>{clearTimeout(t);no(signal.reason)},{once:true})});
export async function rpc(n,a={},signal){
 calls.push({nome:n,args:a,t:performance.now()});
 const list={listar_funcionarios:'funcionarios',listar_fornecedores:'fornecedores',listar_catalogo_paginado:'catalogo'}[n];
 if(list){const itens=structuredClone(db[list]);if(list==="catalogo")for(const i of itens)delete i.ficha;if(params.has('corrida')&&calls.filter(c=>c.nome===n).length===1)await pausa(2500,signal);if(params.has('lista-lenta')&&calls.filter(c=>c.nome===n).length>1)await pausa(1800,signal);return list==='funcionarios'?itens:{itens,total:itens.length,proximo:null}}
 if(n==='resumo_catalogo')return{ativos:db.catalogo.length,favoritos:0};
 const save={salvar_funcionario:'funcionarios',salvar_fornecedor:'fornecedores',salvar_servico_detalhado:'catalogo',salvar_item_catalogo:'catalogo'}[n];
 if(save){await pausa(80);if(params.has('falhar')&&!window.qaFalhou){window.qaFalhou=true;throw Error('Falha temporária simulada')}const i=db[save].findIndex(x=>x.id===a.p_id);const x={...a.p_dados,id:a.p_id,revisao:(a.p_revisao||0)+1};if(i<0)db[save].push(x);else db[save][i]=x;return a.p_id}
 if(n==='consultar_ficha_servico'){await pausa(120,signal);return structuredClone(db.catalogo.find(x=>x.id===a.p_item))}
 if(n==='listar_registros_funcionario')return[];
 if(n==='listar_locais_fisicos'){await pausa(40,signal);return[{id:'local',nome:'Bancada QA',codigo:'PTL-1234567812345678',ativo:true,revisao:1}]}
 if(n==='movimentar_itens_fisicos'){await pausa(120);return[]}
 throw Error('RPC não simulada: '+n);
}
