import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{QueryClient,QueryClientProvider}from'@tanstack/react-query';
import{MemoryRouter,Routes,Route}from'react-router-dom';
import{ProvedorAcesso}from'../../src/auth/ProvedorAcesso';
import{ExigirSessao}from'../../src/pages/Entrar';
import{useAcesso}from'../../src/auth/contexto';
window.qa={calls:0,falhas:[],montagens:0};
const qc=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
window.qa.atualizar=()=>qc.invalidateQueries({queryKey:['acesso']});
window.qa.semearCache=()=>qc.setQueryData(['dados-privados','empresa-compartilhada'],{origem:'usuario-anterior'});
window.qa.lerCache=()=>qc.getQueryData(['dados-privados','empresa-compartilhada'])??null;
function Formulario(){const[v,setV]=useState(()=>{window.qa.montagens++;return''});const a=useAcesso();return <><p>Acesso ativo {a.oficina.nome}</p><label>Rascunho<input value={v} onChange={e=>setV(e.target.value)}/></label></>;}
createRoot(document.getElementById('root')).render(<QueryClientProvider client={qc}><MemoryRouter><ProvedorAcesso><Routes><Route element={<ExigirSessao/>}><Route path="/" element={<Formulario/>}/></Route><Route path="/entrar" element={<p>Login obrigatório</p>}/><Route path="/nova-oficina" element={<p>Sem empresa autorizada</p>}/></Routes></ProvedorAcesso></MemoryRouter></QueryClientProvider>);
