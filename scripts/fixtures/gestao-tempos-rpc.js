import {rpc as agendaRpc} from './agenda-rpc.js';
const esperar=ms=>new Promise(r=>setTimeout(r,ms));
let contato={origem:'retirada',origem_id:'qa',cliente:'Cliente QA',cliente_id:'cliente-qa',veiculo:'Bem QA',descricao:'Retirada combinada',placa:null,telefone:null,situacao:'aberto',valor_centavos:10000,revisao:1},agenda=[];
window.qaChamadas=[];window.qaGravou=false;
export async function rpc(nome,dados={},signal){
 window.qaChamadas.push({nome,dados});
 if(nome==='listar_acompanhamentos_qualidade'){await esperar(50);if(signal?.aborted)throw new DOMException('Cancelado','AbortError');return []}
 if(nome==='consultar_oportunidades'){await esperar(100);return {itens:[{...contato}]}}
 if(nome==='acompanhar_oportunidade'){await esperar(100);contato={...contato,...dados.p_dados,revisao:2};window.qaGravou=true;return {orcamento:null}}
 if(nome==='operar_produtividade'){
   await esperar(100);const d=dados.p_dados;agenda=[{...d,id:d.id||'agenda-qa',cliente:'Cliente de teste',veiculo:'Bem QA',situacao:'agendado',revisao:1}];window.qaGravou=true;
 }
 const r=await agendaRpc(nome,dados);
 if(nome==='consultar_produtividade'){await esperar(100);return {...r,agenda}}
 return r;
}
