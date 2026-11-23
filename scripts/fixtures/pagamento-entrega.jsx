import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter,Routes,Route,Link} from 'react-router-dom';
import {ContextoAcesso} from '../../src/auth/contexto';
import {ProvedorPagamentoAposRegistro} from '../../src/components/ProvedorPagamentoAposRegistro';
import {MapaOficina} from '../../src/pages/MapaOficina';
import {usePagamentoAposRegistro} from '../../src/lib/pagamentoAposRegistro';
import {OrdensServico} from '../../src/pages/OrdensServico';
import '../../src/index.css';import '../../src/App.css';import '../../src/Tema.css';import '../../src/Clareza.css';
const p=new URLSearchParams(location.search);
document.documentElement.dataset.tema=p.get('tema')||'escuro';
window.qaDialogos=[];const mostrar=HTMLDialogElement.prototype.showModal;HTMLDialogElement.prototype.showModal=function(){window.qaDialogos.push(this.getAttribute('aria-label'));return mostrar.call(this)};
window.qaImpressoes=[];window.qaJanelas=0;window.qaImpressaoIniciada=0;
const abrir=window.open.bind(window);
window.open=(...args)=>{window.qaJanelas++;const j=p.has('bloqueado')?null:abrir(...args);if(j){j.print=()=>{window.qaImpressaoIniciada++;window.qaImpressoes.push({html:j.document.documentElement.outerHTML,texto:j.document.body.innerText})}}return j};
const getItem=Storage.prototype.getItem;Storage.prototype.getItem=function(k){if(window.qaFalhaConsulta&&k==='patio_financeiro_v1')throw Error('Falha de consulta simulada');return getItem.call(this,k)};
function Reabrir(){const perguntar=usePagamentoAposRegistro();return <button onClick={()=>perguntar({tipo:'os',id:JSON.parse(localStorage.getItem('patio_os_v1')).at(-1).id,contexto:'entrega'})}>Conferir entrega QA</button>}
const criar=URL.createObjectURL.bind(URL);
URL.createObjectURL=blob=>criar(blob);
// O teste usa os serviços reais no armazenamento demo, sem alterar dados de clientes.
const setItem=Storage.prototype.setItem;
Storage.prototype.setItem=function(k,v){if(window.qaFalhaSalvar&&k==='patio_os_v1')throw Error('Falha de gravação simulada');if(window.qaFalhaPagamento&&k==='patio_financeiro_v1')throw Error('Falha de pagamento simulada');return setItem.call(this,k,v)};
createRoot(document.getElementById('root')).render(
 <QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}})}>
  <ContextoAcesso.Provider value={{demo:true,usuario:'qa',oficina:{id:'demo',nome:'Oficina QA',perfil:p.has('staff')?'staff':'owner',ramo:'automotivo',especialidade:p.get('perfil')||'retifica',codigo_plano:'complete',recursos:['finance']},permite:r=>!(p.has('semFinanceiro')&&r==='finance')}}>
   <MemoryRouter initialEntries={[p.has('mapa')?'/':'/ordens-servico?nova=1']}><ProvedorPagamentoAposRegistro><main className="estrutura-sistema" style={{display:'block',padding:24}}><nav><Link to="/">Mapa QA</Link><Link to="/ordens-servico">Ordens QA</Link><Reabrir/></nav><Routes><Route path="/" element={<MapaOficina/>}/><Route path="/ordens-servico" element={<OrdensServico/>}/></Routes></main></ProvedorPagamentoAposRegistro></MemoryRouter>
  </ContextoAcesso.Provider>
 </QueryClientProvider>
);
