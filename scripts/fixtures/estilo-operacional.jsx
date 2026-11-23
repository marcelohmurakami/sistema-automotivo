// Componentes reais com dados fictícios em memória. Nenhuma operação usa o servidor.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ContextoAcesso } from '../../src/auth/contexto';
import { NavegacaoFinanceiro } from '../../src/components/financeiro/NavegacaoFinanceiro';
import { CobrancasContratos } from '../../src/components/financeiro/CobrancasContratos';
import { ConciliacaoBancaria } from '../../src/components/financeiro/ConciliacaoBancaria';
import { ContasBancarias } from '../../src/components/financeiro/ContasBancarias';
import { PrecificacaoServicos } from '../../src/components/financeiro/PrecificacaoServicos';
import { ApuracaoCompleta } from '../../src/components/financeiro/ApuracaoCompleta';
import { CustosServicos } from '../../src/components/financeiro/CustosServicos';
import { Contratos } from '../../src/pages/Contratos';
import { CalendariosExternos } from '../../src/components/CalendariosExternos';
import { ConfiguracaoCalendario } from '../../src/components/CalendarioOperacao';
import { AgendamentoRecorrente } from '../../src/components/AgendamentoRecorrente';
import { PlanejamentoVisita } from '../../src/components/PlanejamentoVisita';
import { ReservaRecursos } from '../../src/components/ReservaRecursos';
import { DistribuicaoAgenda } from '../../src/components/DistribuicaoAgenda';
import { parametrosIniciais } from '../../src/lib/precificacao';
import { especialidades } from '../../src/lib/especialidades';
import '../../src/index.css';
import '../../src/App.css';
import '../../src/Tema.css';
import '../../src/Clareza.css';
import '../../src/pages/Clientes.css';
import '../../src/pages/Financeiro.css';
import '../../src/components/PlanejamentoOperacional.css';

const params = new URLSearchParams(location.search);
document.documentElement.dataset.tema = params.get('tema') || 'claro';
const w = 'empresa-ficticia-estilo';
const perfil = params.get('perfil') || Object.keys(especialidades)[0];
const especialidade = especialidades[perfil];
const estado = params.get('estado') || 'dados';
const qc = new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity,refetchOnWindowFocus:false,queryFn:()=>Promise.resolve(null)}}});
const data = new Date(); data.setDate(1); data.setMonth(data.getMonth()-1);
const mes = `${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,'0')}`;
const inicio = '2026-10-01', fim = '2026-10-29';
const cliente = 'Maria Aparecida de Oliveira · Unidade São José dos Campos';
const nome = 'Plano preventivo completo · equipamentos da unidade administrativa';
const conta = {codigo:'banco',tipo:'banco',nome:'Conta principal · Cooperativa de crédito da empresa',banco:'Banco de testes',agencia:'0001',numero:'12345-6',ativo:true,revisao:1,saldo:129996743};
const set = (key, dados) => qc.setQueryData(key, dados);
set(['contas-bancarias',false,w],[conta,{...conta,codigo:'caixa',tipo:'caixa',nome:'Caixa da recepção',saldo:-73223}]);
set(['conciliacao',w,'banco',inicio,fim,'pendente',0],{itens:estado==='vazio'?[]:[{id:'linha',data:inicio,descricao:'Recebimento de serviços e materiais · cliente com descrição longa para conferência do extrato',valor:123456789,estado:'pendente'},{id:'saida',data:fim,descricao:'Fornecedor de peças e equipamentos',valor:-378044,estado:'pendente'}],total:estado==='vazio'?0:2,resumo:{pendentes:2,conciliados:18,ignorados:1,sem_extrato:0,movimento_extrato:123078745,movimento_sistema:123078745}});
set(['contratos-cobrancas',w,mes,0,true],{total:estado==='vazio'?0:1,itens:estado==='vazio'?[]:[{id:'contrato',nome,cliente,fechada:false,assinatura:'abc',fatura:{inicio:mes+'-01',fim:mes+'-28',total:123456789,mensalidade:123400000,excedente_visitas:2000,excedente_horas:2000,excedente_materiais:52789,participacao:0,vencimento:mes+'-28'}}]});
set(['parametros-custeio',w,false,'2026-10'],{mes:'2026-10-01',dados:{...parametrosIniciais,salarios:1800000,indiretos:320000,profissionais:4,encargos:30,beneficios:120000},revisao:1});
set(['simulacoes-precos',w],[]);
set(['custeio',w,inicio,fim,'',0],{total:1,itens:[{id:'os',titulo:'Serviço preventivo e substituição dos componentes desgastados',cliente,data:inicio,receita:123456789,custo:93456789,margem:30000000,conferido:false}]});
set(['apuracao',w,inicio,fim],{conferido:false,servicos_revisar:1,valores_nao_confirmados:0,custos_sem_financeiro:0,grupos:{receita:123456789,custos:93456789,operacionais:13456789},receita_liquida:123456789,resultado_bruto:30000000,resultado_operacional:16543211,resultado_liquido:16543211,clientes:[{id:'cliente',cliente,quantidade:12,pendentes:1,receita:123456789,custo:93456789,margem:30000000}],ajustes:[],plano:[],sem_mapeamento:0});
set(['contratos',w,'',0],{total:1,itens:[{id:'contrato',nome,cliente,inicio,regras:{mensalidade:150000,servicos:[],equipamentos:[]}}]});
set(['clientes-contrato',w,''],[{id:'cliente',nome:cliente}]);
set(['assinaturas-calendario',w],{itens:[{id:'agenda',nome:'Agenda da equipe de atendimento · unidade principal',recurso:'Equipe São José dos Campos',criado_em:inicio,revogado_em:null}]});
set(['calendario-operacao',w],{feriados:[{data:'2026-11-02',nome:'Finados',anual:true}],revisao:1});
set(['series-calendario',w,0],[{id:'serie',titulo:'Visitas preventivas da unidade administrativa',proxima:'2026-11-03T09:00:00-03:00'}]);
set(['configuracoes-visita',w,false],{endereco:'Rua de testes, 10'});
set(['ativos-agenda',w],[]);
set(['distribuicao',w],{perfis:[],habilidades:[],ferramentas:[]});
if(estado==='erro'){
 const q=qc.getQueryCache().find({queryKey:['conciliacao',w,'banco',inicio,fim,'pendente',0]});
 q.setState({data:undefined,status:'error',error:new Error('Não foi possível carregar. Confira a conexão e tente novamente.')});
}
const acesso={demo:false,carregando:false,erro:'',usuario:'ficticio',email:null,oficina:{id:w,nome:'Empresa fictícia',especialidade:perfil,ramo:especialidade.ramo,perfil:'owner',codigo_plano:'complete'},permite:()=>true};

function Fixture(){
 const [aba,setAba]=useState(params.get('tela') || 'contratos');
 const [quantidade,alterar]=useState(4);
 const financeiro=['contratos','conciliacao','bancos','custos','precos','resultado'].includes(aba);
 return <div className="estrutura-sistema"><main style={{width:'100%',maxWidth:1200,margin:'0 auto',padding:'clamp(16px, 3vw, 32px)',minWidth:0}}>
  {financeiro && <><div className="titulo-pagina"><div><h1>Financeiro<span>.</span></h1><p>Acompanhe receitas, despesas e resultados da empresa.</p></div></div><NavegacaoFinanceiro aba={aba} automotivo={especialidade.ramo==='automotivo'} selecionar={setAba}/></>}
  {aba==='contratos' && <CobrancasContratos/>}
  {aba==='conciliacao' && <ConciliacaoBancaria inicio={inicio} fim={fim}/>}
  {aba==='bancos' && <ContasBancarias/>}
  {aba==='precos' && <PrecificacaoServicos mesInicial="2026-10"/>}
  {aba==='resultado' && <ApuracaoCompleta inicio={inicio} fim={fim} abrirCustos={()=>setAba('custos')}/>}
  {aba==='custos' && <CustosServicos inicio={inicio} fim={fim} abrirParametros={()=>setAba('precos')}/>}
  {aba==='lista-contratos' && <Contratos/>}
  {aba==='calendarios' && <div className="plano-op"><h1>Agenda e calendário</h1><CalendariosExternos/><ConfiguracaoCalendario/></div>}
  {aba==='agenda' && <form className="plano-op" onSubmit={e=>e.preventDefault()}><h1>Agendamento recorrente</h1><div className="plano-campos"><label>Início<input name="inicio" type="datetime-local" defaultValue="2026-11-03T09:00"/></label><label>Fim previsto<input name="fim" type="datetime-local" defaultValue="2026-11-03T10:00"/></label></div><PlanejamentoVisita inicial={{visita:true,deslocamento_minutos:25,logistica:{origem:'Rua da empresa, 10',destino:'Avenida do cliente, 100',fonte:'manual',retorno_minutos:25,margem_minutos:10}}} inicio="2026-11-03T12:00:00Z" fim="2026-11-03T13:00:00Z" aoProcessar={()=>{}}/><DistribuicaoAgenda id="novo" aoEscolher={()=>{}} aoProcessar={()=>{}}/><ReservaRecursos id="novo" inicio="2026-11-03T12:00:00Z" fim="2026-11-03T13:00:00Z"/><AgendamentoRecorrente quantidade={quantidade} alterar={alterar} inicio="2026-11-03T12:00:00Z" fim="2026-11-03T13:00:00Z"/><button className="botao-primario">Salvar agendamento</button></form>}
 </main></div>;
}
createRoot(document.getElementById('root')).render(<QueryClientProvider client={qc}><ContextoAcesso.Provider value={acesso}><MemoryRouter><Fixture/></MemoryRouter></ContextoAcesso.Provider></QueryClientProvider>);
window.fixturePerfis=Object.keys(especialidades);
