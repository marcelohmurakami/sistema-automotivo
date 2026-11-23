// Páginas reais, com transporte substituído apenas na compilação de teste.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {ContextoAcesso} from '../../src/auth/contexto';
import {Produtividade} from '../../src/pages/Produtividade';
import {Servicos} from '../../src/pages/Servicos';
import {especialidades} from '../../src/lib/especialidades';
import '../../src/index.css';
import '../../src/App.css';
import '../../src/Tema.css';
import '../../src/Clareza.css';
import '../../src/pages/Clientes.css';
import '../../src/pages/Servicos.css';

const params = new URLSearchParams(location.search);
const perfil = params.get('perfil') || 'mecanica';
const ramo = especialidades[perfil].ramo;
document.documentElement.dataset.tema = params.get('tema') || 'escuro';
const acesso={demo:false,carregando:false,erro:'',usuario:'qa',oficina:{id:'qa-agenda',nome:'Empresa fictícia de teste',especialidade:perfil,ramo,perfil:params.get('papel') || 'owner',codigo_plano:'complete'},permite:()=>true};
const qc = new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity,refetchOnWindowFocus:false},mutations:{retry:false}}});
window.fixturePerfis = Object.keys(especialidades);
createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={qc}><ContextoAcesso.Provider value={acesso}><MemoryRouter initialEntries={['/agenda']}>
    <div className="estrutura-sistema"><main style={{minWidth:0,width:'100%',maxWidth:1440,margin:'0 auto',padding:'clamp(12px, 3vw, 32px)'}}>
      {ramo==='automotivo' ? <Produtividade/> : <Servicos tela="/agenda"/>}
    </main></div>
  </MemoryRouter></ContextoAcesso.Provider></QueryClientProvider>
);
