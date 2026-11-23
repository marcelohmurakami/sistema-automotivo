import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {ContextoAcesso} from '../../src/auth/contexto';
import {PecasNaEntrega} from '../../src/components/PecasNaEntrega';
import '../../src/index.css';import '../../src/App.css';import '../../src/Tema.css';import '../../src/Clareza.css';
const caso=new URLSearchParams(location.search).get('caso');
const produto=n=>({id:'produto-'+n,descricao:'Peça de teste '+n,codigo:'TEST-'+n,unidade:'un',saldo:5,minimo:0,arquivado_em:null});
const os={id:'os-1',revisao:1,itens:[{id:'vinculado',tipo:'part',descricao:'Peça já vinculada',unidade:'un',quantidade:1,produto_estoque_id:'produto-1500'},{id:'repetido',tipo:'part',descricao:'Outro item do mesmo produto',unidade:'un',quantidade:1,item_catalogo_id:'produto-1500'},{id:'avulso',tipo:'part',descricao:'Peça avulsa',unidade:'un',quantidade:1}]};
window.qaChamadas=[];window.qaContinuou=false;
window.qaRPC=async(nome,dados,signal)=>{
 window.qaChamadas.push({nome,dados});signal?.throwIfAborted();
 if(nome==='consultar_ordem_servico')return structuredClone({...os,revisao:caso==='conflito'&&window.qaChamadas.filter(x=>x.nome===nome).length>1?2:os.revisao});
 if(nome==='consultar_produto_estoque'){if(caso==='erro')throw Error('Falha de conexão de teste');return produto(1500);}
 if(nome==='listar_estoque'){const n=dados.p_busca==='2000'?2000:null;return {total:2000,itens:n?[produto(n)]:Array.from({length:24},(_,i)=>produto(i+1)),resumo:{}};}
 if(nome==='vincular_estoque_item_os'){if(dados.p_produto!=='produto-2000')throw Error('Produto incorreto');os.revisao++;return;}
 throw Error('RPC inesperada: '+nome);
};
function App(){const[aberto,setAberto]=useState(true);return aberto?<PecasNaEntrega osId="os-1" fechar={()=>setAberto(false)} continuar={async()=>{window.qaContinuou=true;setAberto(false);}}/>:<p>Finalizado</p>;}
document.documentElement.dataset.tema='escuro';
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ContextoAcesso.Provider value={{demo:false,oficina:{id:'empresa-teste',perfil:'owner'},permite:()=>true}}><App/></ContextoAcesso.Provider></QueryClientProvider>);
