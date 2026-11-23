import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {ContextoAcesso} from '../../src/auth/contexto';
import {EditorItensOS} from '../../src/components/EditorItensOS';
import {useDesconto} from '../../src/lib/useDesconto';
import {itensParaAtendimento} from '../../src/lib/itensServico';
import '../../src/index.css';import '../../src/App.css';import '../../src/Tema.css';import '../../src/Clareza.css';
const caso=new URLSearchParams(location.search).get('caso');
const catalogo=[{id:'catalogo-1',tipo:'part',descricao:'Pastilha FIRE de teste',unidade:'un',preco_padrao_centavos:3000,favorito:true,produto_estoque_id:caso==='sem-estoque'?null:'estoque-2',custo_centavos:caso==='sem-estoque'?500:null}];
function App(){const[itens,setItens]=useState([]),desconto=useDesconto(itens.reduce((s,i)=>s+Math.round(i.quantidade*i.preco_unitario_centavos),0));window.qaItens=itens;window.qaAtendimento=itensParaAtendimento(itens);return <main className="estrutura-sistema" style={{display:'block',padding:16}}><EditorItensOS contexto={caso==='orcamento'?'orçamento':'OS'} itens={itens} alterar={setItens} catalogo={catalogo} desconto={desconto} aoProcessar={()=>{}} aoEditarItem={()=>{}}/></main>}
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}><ContextoAcesso.Provider value={{demo:true,oficina:{id:'demo',perfil:'staff',ramo:'assistencia_tecnica',especialidade:'celulares'},permite:()=>true}}><MemoryRouter><App/></MemoryRouter></ContextoAcesso.Provider></QueryClientProvider>);
