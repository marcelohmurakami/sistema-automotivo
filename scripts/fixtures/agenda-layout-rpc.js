// Cenários isolados de apresentação. Nenhuma solicitação alcança o banco.
import { rpc as base } from './agenda-rpc.js';
const recursos = Array.from({length:6},(_,i)=>({id:`recurso-${i}`,nome:i===0?'Equipe principal':`Profissional ${i} · Atendimento e suporte especializado`,ativo:i!==5,revisao:1}));
const clientes=Array.from({length:9},(_,i)=>({id:`cliente-${i}`,nome:i===0?'Ana Maria · Cliente com identificação extensa para conferir a leitura':`Cliente ${i}`}));
const atendimentos=clientes.map((c,i)=>({id:`atendimento-${i}`,cliente_id:c.id,cliente_nome:c.nome,objeto_id:null,titulo:i===0?'Serviço completo com conferência de funcionamento e acompanhamento do cliente':'Atendimento de teste',situacao:'aprovado',dados:{},valor_centavos:12500,revisao:1}));
let agenda=clientes.map((c,i)=>({id:`agenda-${i}`,atendimento_id:atendimentos[i].id,cliente:c.nome,cliente_id:c.id,veiculo:'Bem do cliente',identificacao:'Bem do cliente',veiculo_id:null,recurso:recursos[i%6].nome,recurso_id:recursos[i%6].id,
  inicio:`2026-11-${i===6?'09':i===7?'01':'10'}T${i===0?'09:00':i===1?'09:15':'14:00'}:00-03:00`,fim:`2026-11-${i===6?'09':i===7?'01':'10'}T${i===0?'09:15':i===1?'09:30':'15:00'}:00-03:00`,
  servico:atendimentos[i].titulo,situacao:i===4?'cancelado':i===3?'concluido':'agendado',revisao:1,observacoes:'',ordem_servico_id:null,
  visita:i===2,deslocamento_minutos:i===2?25:0,logistica:i===2?{origem:'Base fictícia',destino:'Destino fictício',retorno_minutos:20,margem_minutos:10,fonte:'manual'}:null,
}));
export async function rpc(nome,dados={}) {
  if(!['consultar_produtividade','pagina_servicos','operar_produtividade','salvar_agenda_servico','buscar_selecao_servicos','buscar_cadastros_operacao'].includes(nome))return base(nome,dados);
  window.fixtureChamadas.push({nome,dados});
  if(nome==='consultar_produtividade')return {agenda,pacotes:[],manutencoes:[],adicionais:[],tempos:[],retornos:[],vistoria:null};
  if(nome==='pagina_servicos'){
    const f=dados.p_filtros||{};
    const inicio=Date.parse(`${f.inicio}T00:00:00-03:00`),fim=Date.parse(`${f.fim}T00:00:00-03:00`);
    return {clientes,atendimentos,recursos,objetos:[],cobrancas:[],proximo:null,agenda:agenda.filter(x=>Date.parse(x.inicio)<fim&&Date.parse(x.fim)>inicio)};
  }
  if(nome==='buscar_selecao_servicos')return dados.p_tipo==='atendimentos'?atendimentos:[];
  if(nome==='buscar_cadastros_operacao')return dados.p_tipo==='clientes'?clientes:[];
  if(window.fixtureFalharGravacao)throw Error('O horário escolhido está ocupado. Escolha outro horário.');
  window.fixtureGravacoes.push({nome,dados});
  const x=dados.p_dados, anterior=agenda.find(a=>a.id===(dados.p_id||x.id));
  const novo={...anterior,...x,id:anterior?.id||x.id||crypto.randomUUID(),revisao:(anterior?.revisao||0)+1};
  agenda=agenda.filter(a=>a.id!==novo.id).concat(novo);
  return nome==='salvar_agenda_servico'?novo.id:{};
}
