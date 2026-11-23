import React,{lazy,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {BrowserRouter} from 'react-router-dom';
import {ContextoAcesso} from '../../src/auth/contexto';
import {CarregamentoPagina} from '../../src/components/CarregamentoPagina';
import '../../src/index.css';
import '../../src/App.css';
const pagina=lazy(()=>import('../../src/pages/QualidadeAvancada').then(m=>({default:m.QualidadeAvancada})));
const ramo=new URLSearchParams(location.search).get('ramo')||'automotivo';
window.qa={inicio:0};
function App(){const[liberado,setLiberado]=useState(false);window.qa.liberar=()=>{window.qa.inicio=performance.now();setLiberado(true)};
 const acesso={demo:false,usuario:'qa',permite:()=>true,oficina:{id:'qa',perfil:'owner',ramo,especialidade:ramo==='automotivo'?'mecanica':ramo==='assistencia_tecnica'?'assistencia_geral':ramo==='limpeza'?'limpeza_residencial':'manutencao_geral',recursos:['reports']}};
 return <QueryClientProvider client={cache}><ContextoAcesso.Provider value={acesso}><BrowserRouter><CarregamentoPagina>{liberado?<CarregamentoPagina>{React.createElement(pagina)}</CarregamentoPagina>:<p>Aguardando liberação</p>}</CarregamentoPagina></BrowserRouter></ContextoAcesso.Provider></QueryClientProvider>;
}
const cache=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});createRoot(document.getElementById('root')).render(<App/>);
