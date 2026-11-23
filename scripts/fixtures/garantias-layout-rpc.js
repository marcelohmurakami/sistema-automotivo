import {rpc as anterior} from './lucro-recebidas-rpc.js';
const data=new Date().toLocaleDateString('en-CA'),p=new URLSearchParams(location.search);
const itens=p.has('vazio')?[]:[
 {id:'aberta',atendimento_id:'os',funcionario_id:'func',tipo:'garantia',motivo:'Problema voltou após o atendimento',solucao:'',aberto_em:data,resolvido_em:null,custo_centavos:12345,minutos:75,nota:4,revisao:1,cliente:'Ana Souza',cliente_id:'cliente',titulo:'Revisão do equipamento',subsetor:p.get('perfil')||'assistencia_celulares'},
 {id:'resolvida',atendimento_id:'os',funcionario_id:null,tipo:'retrabalho',motivo:'Conexão substituída e testada',solucao:'Teste final aprovado',aberto_em:data,resolvido_em:data,custo_centavos:5000,minutos:30,nota:5,revisao:2,cliente:'João Silva',cliente_id:'cliente',titulo:'Correção da conexão',subsetor:p.get('perfil')||'assistencia_celulares'},
 {id:'reclamacao',atendimento_id:'os',funcionario_id:null,tipo:'reclamacao',motivo:'Cliente pediu nova conferência',solucao:'',aberto_em:data,resolvido_em:null,custo_centavos:0,minutos:0,nota:null,revisao:1,cliente:'Maria Alves',cliente_id:'cliente',titulo:'Conferência',subsetor:p.get('perfil')||'assistencia_celulares'},
];
window.fixtureErro=false;
export async function rpc(n,args={}){
 if(n==='consultar_ocorrencias_servicos'){window.fixtureChamadas.push({n,args});return structuredClone(itens.filter(i=>i.aberto_em>=args.p_inicio&&i.aberto_em<=args.p_fim));}
 if(n==='consultar_relatorios_servicos'){window.fixtureChamadas.push({n,args});return {qualidade:structuredClone(itens.filter(i=>i.aberto_em>=args.p_inicio&&i.aberto_em<=args.p_fim))};}
 if(n==='buscar_documentos_qualidade'){window.fixtureChamadas.push({n,args});return [{id:'os',origem:'atendimento',numero:123,cliente_id:'cliente',cliente:'Ana Souza',objeto:'Equipamento de teste'}];}
 if(n==='consultar_detalhes_atendimento'){const d=await anterior(n,args);d.qualidade=structuredClone(itens);d.equipe=[{id:'participante',funcionario_id:'func',nome:'Técnico QA'}];return d;}
 if(n==='salvar_qualidade_atendimento'){
  window.fixtureChamadas.push({n,args});if(window.fixtureErro){window.fixtureErro=false;throw Error('Não foi possível salvar. Tente novamente.');}
  const i=itens.find(i=>i.id===args.p_id);if(i){if(i.revisao!==args.p_revisao)throw Error('Revisão desatualizada.');Object.assign(i,args.p_dados);i.revisao++;}else itens.push({id:args.p_id,atendimento_id:args.p_atendimento,...args.p_dados,revisao:1,cliente:'Ana Souza',cliente_id:'cliente',titulo:'Equipamento de teste',subsetor:p.get('perfil')||'assistencia_celulares'});return args.p_id;
 }
 return anterior(n,args);
}
