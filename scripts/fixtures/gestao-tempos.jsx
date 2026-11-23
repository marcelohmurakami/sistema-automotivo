import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider,useQuery} from '@tanstack/react-query';
import {ContextoAcesso} from '../../src/auth/contexto';
import {Oportunidades} from '../../src/pages/Oportunidades';
import {Produtividade} from '../../src/pages/Produtividade';
import {QualidadeAvancada} from '../../src/pages/QualidadeAvancada';
import '../../src/index.css';import '../../src/App.css';import '../../src/Tema.css';import '../../src/Clareza.css';
const params=new URLSearchParams(location.search),modulo=params.get('modulo')||'contatos';
document.documentElement.dataset.tema='escuro';
window.qaAlertas=0;
function PainelSecundario(){useQuery({queryKey:['alertas','qa'],queryFn:async()=>{if(window.qaGravou)await new Promise(r=>setTimeout(r,1800));window.qaAlertas++;return []}});return null}
const acesso={demo:false,usuario:'qa',oficina:{id:'qa',nome:'Empresa fictícia',ramo:'automotivo',especialidade:'retifica',perfil:'owner'},permite:()=>true};
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity,refetchOnWindowFocus:false}}})}><ContextoAcesso.Provider value={acesso}><MemoryRouter initialEntries={[modulo==='qualidade'?'/garantias?aba=analise':'/']}><PainelSecundario/><main style={{padding:16,minWidth:0}}>{modulo==='contatos'?<Oportunidades/>:modulo==='qualidade'?<QualidadeAvancada/>:<Produtividade/>}</main></MemoryRouter></ContextoAcesso.Provider></QueryClientProvider>);
