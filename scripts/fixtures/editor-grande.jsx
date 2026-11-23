import React from 'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';
import{ContextoAcesso}from'../../src/auth/contexto';import{EditorItensOS}from'../../src/components/EditorItensOS';import{useDesconto}from'../../src/lib/useDesconto';
import '../../src/index.css';import '../../src/App.css';import '../../src/Tema.css';
const noop=()=>{},cache=new QueryClient(),n=Number(new URLSearchParams(location.search).get('itens'))||100;
const acesso={demo:true,usuario:'qa',oficina:{id:'demo',nome:'QA',perfil:'owner',ramo:'automotivo',especialidade:'mecanica'},permite:()=>true};
function App(){const[itens,setItens]=React.useState(Array.from({length:n},(_,i)=>({id:'i'+i,descricao:'Serviço teste '+i,tipo:'service',unidade:'serv',quantidade:1,preco_unitario_centavos:10000,situacao:'pending'})));const desconto=useDesconto(itens.reduce((s,i)=>s+i.quantidade*i.preco_unitario_centavos,0));window.qaItens=itens;return <main style={{maxWidth:1100,margin:'auto',padding:16}}><EditorItensOS itens={itens} alterar={setItens} catalogo={[]} desconto={desconto} aoProcessar={noop} aoEditarItem={noop} somenteLocal/></main>}
createRoot(document.getElementById('root')).render(<QueryClientProvider client={cache}><ContextoAcesso.Provider value={acesso}><App/></ContextoAcesso.Provider></QueryClientProvider>);
