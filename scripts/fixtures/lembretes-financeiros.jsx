import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route,Link,useNavigate} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {ContextoAcesso,recursosPorPlano} from '../../src/auth/contexto';
import {ProvedorLembretesFinanceiros} from '../../src/components/financeiro/ProvedorLembretesFinanceiros';
import {FaixaLembretesFinanceiros} from '../../src/components/financeiro/FaixaLembretesFinanceiros';
import {AlertasOficina} from '../../src/components/AlertasOficina';
import {Financeiro} from '../../src/pages/Financeiro';
import {conferenciaPendente,lembreteAdiado} from '../../src/services/lembretesFinanceiros';
import '../../src/index.css';import '../../src/App.css';import '../../src/Tema.css';import '../../src/Clareza.css';
const dados=window.__qaAcesso;
document.documentElement.dataset.tema='escuro';
const oficina={...dados,codigo_plano:'complete',nome:'Empresa de teste · '+dados.especialidade,perfil:'owner',recursos:recursosPorPlano.complete};
const acesso={demo:false,usuario:dados.usuario,oficina,oficinas:[oficina],permite:r=>oficina.recursos.includes(r),carregando:false,erro:'',atualizar:async()=>{}};
const qc=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
window.qaRelogio={conferenciaPendente:(p,d)=>conferenciaPendente(p,new Date(d)),lembreteAdiado:(a,t,id,v,d)=>lembreteAdiado(a,t,id,v,new Date(d))};
function App(){
 const navegar=useNavigate();window.qaNavegar=navegar;window.qaAtualizar=()=>qc.invalidateQueries();
 return <ProvedorLembretesFinanceiros key={oficina.id}>
  <header style={{padding:16,display:'flex',justifyContent:'space-between'}}><Link to="/">Início</Link><AlertasOficina/></header>
  <main style={{padding:16,maxWidth:1600,margin:'auto'}}><FaixaLembretesFinanceiros/><Routes>
   <Route path="/" element={<h1>{oficina.nome}</h1>}/><Route path="/financeiro" element={<Financeiro/>}/>
  </Routes></main>
 </ProvedorLembretesFinanceiros>;
}
createRoot(document.getElementById('root')).render(<QueryClientProvider client={qc}><ContextoAcesso.Provider value={acesso}><MemoryRouter><App/></MemoryRouter></ContextoAcesso.Provider></QueryClientProvider>);
