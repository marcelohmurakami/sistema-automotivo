import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider,useQuery} from '@tanstack/react-query';
import {MemoryRouter,Routes,Route,Link} from 'react-router-dom';
import {ContextoAcesso} from '../../src/auth/contexto';
import {ProvedorPagamentoAposRegistro} from '../../src/components/ProvedorPagamentoAposRegistro';
import {FichaCliente} from '../../src/components/FichaCliente';
import {OrdensServico} from '../../src/pages/OrdensServico';
import {Orcamentos} from '../../src/pages/Orcamentos';
import {Servicos} from '../../src/pages/Servicos';
import {Catalogo} from '../../src/pages/Catalogo';
import {Financeiro} from '../../src/pages/Financeiro';
import {especialidades} from '../../src/lib/especialidades';
import {SelecaoCatalogo} from '../../src/components/SelecaoCatalogo';
import {useBuscaDebounced} from '../../src/lib/useBuscaDebounced';
import {SelecaoOperacao} from '../../src/components/servicos/SelecaoOperacao';
import '../../src/index.css';import '../../src/App.css';import '../../src/Tema.css';import '../../src/Clareza.css';
// No app esta folha vem do LayoutEmpresa; a bancada monta as páginas diretamente.
import '../../src/pages/Servicos.css';
const params=new URLSearchParams(location.search),perfil=params.get('perfil')||'retifica',ramo=especialidades[perfil].ramo,auto=ramo==='automotivo';
window.qaPerfis=Object.keys(especialidades);
window.qaCliques=0;document.addEventListener('click',()=>window.qaCliques++,true);
document.documentElement.dataset.tema=params.get('tema')||'escuro';
const cliente={id:'exemplo-0',oficina_id:'demo',nome:'Cliente QA Processo',tipo:'pessoa_fisica',telefone_e164:'',email:'',endereco:'Rua de teste 10',observacoes:'',criado_em:new Date().toISOString(),revisao:1,arquivado_em:null};
if(!params.has('reabrir')){
 localStorage.clear();
 localStorage.setItem('patio_clientes_demo_v1',JSON.stringify([cliente]));
 localStorage.setItem('patio_catalogo_v1',JSON.stringify(Array.from({length:Number(params.get('catalogo'))||5},(_,i)=>({id:'catalogo-'+i,tipo:'service',descricao:'Serviço QA '+(i+1),unidade:'serv',preco_padrao_centavos:10000,custo_centavos:2000,favorito:true,revisao:1,arquivado_em:null}))));
 localStorage.setItem('patio_servicos:demo',JSON.stringify({objetos:[{id:'objeto-qa',cliente_id:cliente.id,nome:ramo==='limpeza'?'Imóvel QA':ramo==='manutencao_campo'?'Instalação QA':'Equipamento QA',dados:{endereco:'Rua de teste 10',marca:'Marca QA'},revisao:1,arquivado:false}],atendimentos:[],recursos:[{id:'recurso-qa',nome:'Equipe QA',ativo:true,revisao:1}],agenda:[],cobrancas:[]}));
 localStorage.setItem('patio_os_v1','[]');
 localStorage.setItem('patio_financeiro_v1',JSON.stringify({titulos:[],baixas:[]}));
}
window.qaImpressoes=[];const abrir=window.open.bind(window);
window.open=(...args)=>{const j=abrir(...args);if(j)j.print=()=>window.qaImpressoes.push(j.document.body.innerText);return j};
function ConsultaSecundariaLenta(){useQuery({queryKey:['alertas','qa-lento'],initialData:0,staleTime:Infinity,queryFn:async()=>{window.qaConsultasLentas=(window.qaConsultasLentas||0)+1;await new Promise(ok=>setTimeout(ok,2000));window.qaSecundariaAtualizada=true;return 1}});return null}
const cache=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});window.qaCache=cache;
function SeletorQA(){const [valor,setValor]=React.useState(params.has('selecionado')?'catalogo-4':''),[busca,setBusca]=React.useState('anterior');const termo=useBuscaDebounced(busca);return <section><SelecaoCatalogo valor={valor} selecionar={setValor}/><label>Busca com atraso<input value={busca} onChange={e=>setBusca(e.target.value)}/></label><button onClick={()=>setBusca('')}>Limpar busca QA</button><output data-qa-termo>{termo}</output></section>}
function ObjetoQA(){const[valor,setValor]=React.useState(''),[c,setC]=React.useState(cliente.id);return <section><SelecaoOperacao tipo="objetos" cliente={c} rotulo="Equipamento QA" valor={valor} selecionar={setValor} selecionarUnico={!params.has('edicao')}/><button onClick={()=>setValor('')}>Limpar equipamento</button><button onClick={()=>{setC('outro');setValor('')}}>Outro cliente</button><output data-qa-objeto>{valor}</output></section>}
if(params.has('operacao')){const chave='patio_servicos:demo',d=JSON.parse(localStorage.getItem(chave));if(params.has('vazio'))d.objetos=[];if(params.has('varios'))d.objetos.push({...d.objetos[0],id:'objeto-2',nome:'Equipamento 2'});d.objetos.push({id:'objeto-outro',nome:'Outro equipamento',cliente_id:'outro',dados:{},revisao:1});localStorage.setItem(chave,JSON.stringify(d));}
createRoot(document.getElementById('root')).render(
 <QueryClientProvider client={cache}>
 <ContextoAcesso.Provider value={{demo:true,usuario:'qa',oficina:{id:'demo',nome:'Empresa QA Processo',perfil:'owner',ramo,especialidade:perfil,codigo_plano:'complete',recursos:['finance']},permite:()=>true}}>
 <MemoryRouter initialEntries={[params.has('operacao')?'/qa-objeto':params.has('seletor')?'/qa-seletor':'/cliente']}><ProvedorPagamentoAposRegistro>
 {params.has('lento')&&<ConsultaSecundariaLenta/>}
 <main className="estrutura-sistema" style={{display:'block',padding:16}}>
 <nav aria-label="Navegação de teste" style={{display:'flex',gap:16,flexWrap:'wrap',marginBottom:16}}><Link to="/cliente">Ficha QA</Link><Link to={auto?'/ordens-servico':'/atendimentos'}>OS QA</Link><Link to="/orcamentos">Orçamentos QA</Link><Link to="/catalogo">Catálogo QA</Link><Link to="/financeiro">Financeiro QA</Link></nav>
 <Routes><Route path="/qa-objeto" element={<ObjetoQA/>}/><Route path="/qa-seletor" element={<SeletorQA/>}/><Route path="/cliente" element={<FichaCliente id={cliente.id} editar={()=>{}}/>}/><Route path="/ordens-servico" element={<OrdensServico/>}/><Route path="/atendimentos" element={<Servicos tela="/atendimentos"/>}/><Route path="/orcamentos" element={auto?<Orcamentos/>:<Servicos tela="/orcamentos"/>}/><Route path="/catalogo" element={<Catalogo/>}/><Route path="/financeiro" element={<Financeiro/>}/></Routes>
 </main></ProvedorPagamentoAposRegistro></MemoryRouter></ContextoAcesso.Provider></QueryClientProvider>);
