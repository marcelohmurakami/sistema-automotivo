import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {ContextoAcesso} from '../../src/auth/contexto';
import {ExecucaoOffline} from '../../src/pages/ExecucaoOffline';
import {SincronizacaoDocumentosOffline} from '../../src/components/offline/SincronizacaoDocumentosOffline';
import {guardarBase} from '../../src/lib/atendimentoOffline';
import '../../src/index.css';import '../../src/App.css';import '../../src/Tema.css';import '../../src/Clareza.css';
const perfil=new URLSearchParams(location.search).get('perfil')||'mecanica';
let c=JSON.parse(localStorage.getItem('qa-offline-'+perfil)||'null');
if(!c){c=await (await fetch('/qa/base?perfil='+perfil)).json();await guardarBase(c.base);localStorage.setItem('qa-offline-'+perfil,JSON.stringify(c));}
window.qaContexto=c;
document.documentElement.dataset.tema='escuro';
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ContextoAcesso.Provider value={{demo:false,oficina:c.oficina,oficinas:[c.oficina],usuario:c.usuario,permite:()=>true,atualizar:async()=>{},sair:async()=>{}}}><MemoryRouter initialEntries={['/execucao-offline']}><SincronizacaoDocumentosOffline/><main style={{padding:16}}><ExecucaoOffline/></main></MemoryRouter></ContextoAcesso.Provider></QueryClientProvider>);
