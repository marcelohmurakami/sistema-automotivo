import {novaOcorrencia,custoQualidade} from '../../src/services/qualidade';
const p=new URLSearchParams(location.search),data=new Date().toLocaleDateString('en-CA');
const tipos=['aberta','em_analise','em_retrabalho','resolvida','cancelada'];
const itens=tipos.map((situacao,i)=>({...novaOcorrencia(),id:'q'+i,ordem_original_id:'os',numero_os:123,cliente:i?'Cliente '+i:'João Souza',veiculo:'Veículo de teste',tipo:i===2?'retrabalho':i===1?'reclamacao':'garantia',situacao,aberto_em:data+'T12:00:00Z',resolvido_em:situacao==='resolvida'?data+'T14:00:00Z':null,revisao:1,descricao:i?'Ocorrência de teste '+i:'Problema voltou após atendimento',diagnostico:'Diagnóstico preservado',solucao:i===3?'Solução anterior':'',ordem_retrabalho_id:'retorno',funcionario_id:'func',item_os_id:'item',motivo:'recorrencia',cobertura:'coberta',reclamacao:true,houve_retrabalho:true,horas_retrabalho:1.5,custo_hora_centavos:1000,custo_pecas_centavos:2345,outros_custos_centavos:200,reembolso_centavos:300,recuperado_centavos:100,custos_conferidos:true,nota_cliente:4,comentario_cliente:'Comentário preservado'}));
if(p.has('vazio'))itens.splice(0);if(p.has('muitos'))for(let i=5;i<32;i++)itens.push({...itens[0],id:'q'+i,descricao:'Ocorrência '+i});
window.fixtureChamadas=[];window.fixtureErro=false;
export async function rpc(n,args={}){
 window.fixtureChamadas.push({n,args});
 if(n==='consultar_qualidade')return {ocorrencias:structuredClone(itens.filter(i=>i.aberto_em.slice(0,10)>=args.p_inicio&&i.aberto_em.slice(0,10)<=args.p_fim)),abertas:itens.filter(i=>!['resolvida','cancelada'].includes(i.situacao)).length};
 if(n==='opcoes_os_qualidade'){const todas=[{id:'os',numero:123,cliente:'João Souza',veiculo:'Veículo de teste',servicos:[{id:'item',descricao:'Serviço de teste'}]},{id:'retorno',numero:124,cliente:'João Souza',veiculo:'Veículo de teste',servicos:[]}];return args.p_os?todas.filter(o=>o.id===args.p_os):todas;}
 if(n==='listar_funcionarios')return [{id:'func',nome:'Técnico QA'}];
 if(n==='consultar_historico_qualidade'){const i=itens.find(i=>i.id===args.p_id);return [{id:1,revisao:i.revisao,ocorrido_em:data+'T12:00:00Z',depois:structuredClone(i)}];}
 if(n==='salvar_ocorrencia_qualidade'){
  if(window.fixtureErro){window.fixtureErro=false;throw Error('Não foi possível salvar. Tente novamente.');}
  const old=itens.find(i=>i.id===args.p_id);if(old&&old.revisao!==args.p_revisao)throw Error('Revisão desatualizada');
  const d=args.p_dados;if(!d.ordem_original_id||d.descricao.length<5)throw Error('Escolha a OS e descreva o problema.');if(d.situacao==='resolvida'&&d.solucao.length<3)throw Error('Informe a solução.');if(custoQualidade(d)<0)throw Error('O valor recuperado não pode superar o custo.');
  const next={...d,revisao:(old?.revisao||0)+1,resolvido_em:d.situacao==='resolvida'?d.resolvido_em||new Date().toISOString():null};if(old)Object.assign(old,next);else itens.push(next);return d.id;
 }
 return [];
}
