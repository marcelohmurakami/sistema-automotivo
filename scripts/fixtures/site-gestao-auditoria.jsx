import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {ContextoAcesso} from '../../src/auth/contexto';import {MeuSite} from '../../src/pages/MeuSite';
import '../../src/index.css';import '../../src/App.css';import '../../src/Tema.css';import '../../src/Clareza.css';
const p=new URLSearchParams(location.search),c=await(await fetch('/test-context?perfil='+p.get('perfil'))).json();document.documentElement.dataset.tema='escuro';
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}})}><ContextoAcesso.Provider value={{...c,demo:false,permite:()=>true}}><MemoryRouter><main style={{padding:16,minWidth:0}}><MeuSite/></main></MemoryRouter></ContextoAcesso.Provider></QueryClientProvider>);
