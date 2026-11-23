// Transporte local: não autentica, não usa a rede e não grava empresas reais.
const cliente={id:'cliente-qa',nome:'Cliente de teste'};
const atendimento={id:'atendimento-qa',cliente_id:cliente.id,cliente_nome:cliente.nome,objeto_id:'objeto-qa',titulo:'Atendimento de teste',situacao:'aprovado',dados:{},valor_centavos:12500,revisao:1};
const recurso={id:'recurso-qa',nome:'Equipe de teste',ativo:true,revisao:1};
const anterior={id:'agenda-existente',cliente:cliente.nome,cliente_id:cliente.id,veiculo:'Bem do cliente',veiculo_id:null,identificacao:'Bem do cliente',recurso:recurso.nome,recurso_id:recurso.id,atendimento_id:atendimento.id,inicio:'2026-11-10T09:00:00-03:00',fim:'2026-11-10T10:00:00-03:00',servico:'Serviço de teste',situacao:'agendado',revisao:1,observacoes:'',ordem_servico_id:null};
window.fixtureChamadas=[];
window.fixtureGravacoes=[];
export async function rpc(nome,dados={}) {
  window.fixtureChamadas.push({nome,dados});
  const agenda=new URLSearchParams(location.search).has('existente')?[anterior]:[];
  if(nome==='consultar_produtividade') return {agenda,pacotes:[],manutencoes:[],adicionais:[],tempos:[],retornos:[],vistoria:null};
  if(nome==='pagina_servicos') return {clientes:[cliente],agenda,atendimentos:[atendimento],objetos:[],recursos:[recurso],cobrancas:[],proximo:null};
  if(nome==='resumo_operacao_servicos') return {};
  if(nome==='buscar_cadastros_operacao') return dados.p_tipo==='clientes'?[cliente]:[];
  if(nome==='buscar_selecao_servicos') return dados.p_tipo==='atendimentos'?[atendimento]:[];
  if(nome==='consultar_distribuicao_agenda') return {perfis:[],habilidades:[],ferramentas:[]};
  if(nome==='consultar_recursos_reserva') return [];
  if(nome==='prever_visitas_calendario') {
    if(window.fixtureFalharPrevia) throw new Error('Não foi possível conferir as datas. Tente novamente.');
    if(window.fixtureAtrasarPrevia) await new Promise(r=>setTimeout(r,300));
    return [{original:'2026-11-10',data:'2026-11-10',motivo:'Data prevista'},{original:'2026-11-17',data:'2026-11-17',motivo:'Data prevista'}];
  }
  if(['operar_produtividade','salvar_agenda_servico','programar_agenda_calendario','programar_visitas_limpeza'].includes(nome)) {
    if(window.fixtureFalharGravacao) throw new Error('O horário escolhido está ocupado. Escolha outro horário.');
    window.fixtureGravacoes.push({nome,dados});
    return nome==='operar_produtividade'?{}:nome==='salvar_agenda_servico'?'agenda-nova':[];
  }
  throw new Error(`Chamada sem simulação: ${nome}`);
}
