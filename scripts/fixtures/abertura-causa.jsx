import {useState,useEffect,lazy,Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {ContextoAcesso} from '../../src/auth/contexto';
import {ExigirSessao} from '../../src/pages/Entrar';
window.qa={eventos:[],consultas:0};
const marcar=nome=>window.qa.eventos.push({nome,ms:performance.now()});
const Pagina=lazy(async()=>{marcar('inicio_modulo');await new Promise(r=>setTimeout(r,Number(new URLSearchParams(location.search).get('codigo')||120)));marcar('fim_modulo');return{default:function Tela(){const[pronta,setPronta]=useState(false);useEffect(()=>{marcar('montagem');window.qa.consultas++;marcar('consulta');const t=setTimeout(()=>{marcar('dados');setPronta(true)},100);return()=>clearTimeout(t)},[]);return <main>{pronta?'Dados carregados':'Consultando dados'}</main>}}});
function App(){const[estado,setEstado]=useState({carregando:true,usuario:'qa',oficina:{id:'empresa',perfil:'owner',recursos:['reports']},erro:'',segundoFatorExigido:false});window.qa.alterar=d=>setEstado(e=>({...e,...d}));window.qa.liberar=()=>{marcar('acesso_aprovado');setEstado(e=>({...e,carregando:false}))};return <ContextoAcesso.Provider value={{...estado,demo:false,permite:()=>true,atualizar:async()=>{},sair:async()=>{}}}><MemoryRouter><Suspense fallback={<p>Carregando módulo</p>}><Routes><Route element={<ExigirSessao/>}><Route path="/" element={<Pagina/>}/></Route><Route path="/entrar" element={<p>Login obrigatório</p>}/><Route path="/nova-oficina" element={<p>Sem empresa autorizada</p>}/></Routes></Suspense></MemoryRouter></ContextoAcesso.Provider>}
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}><App/></QueryClientProvider>);
