import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {ContextoAcesso} from '../../src/auth/contexto';
import {Configuracoes} from '../../src/pages/Gestao';
import {especialidades} from '../../src/lib/especialidades';
import '../../src/index.css';
import '../../src/App.css';
import '../../src/Tema.css';
import '../../src/Clareza.css';
// These module styles are also loaded after navigation in the real application.
import '../../src/pages/Compras.css';
const params=new URLSearchParams(location.search),perfil=params.get('perfil')||'mecanica',oficina={id:'qa-config-'+perfil,nome:'Empresa QA',perfil:params.has('staff')?'staff':'owner',ramo:especialidades[perfil].ramo,especialidade:perfil,nome_plano:'Completo'};
window.fixturePerfis=Object.keys(especialidades);
document.documentElement.dataset.tema=params.get('tema')||'escuro';
if(!localStorage.getItem('patio_configuracoes_demo'))localStorage.setItem('patio_configuracoes_demo',JSON.stringify({nome:'Empresa de testes',telefone:'16999990000',endereco:{logradouro:'Rua de teste, 123',cidade:'São Paulo',uf:'SP',cep:'01001-000'},revisao:1}));
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ContextoAcesso.Provider value={{demo:true,oficina,usuario:'qa-user',permite:()=>true,atualizar:async()=>{}}}><MemoryRouter initialEntries={['/configuracoes']}><div className="estrutura-sistema"><main style={{padding:16}}><Configuracoes/></main></div></MemoryRouter></ContextoAcesso.Provider></QueryClientProvider>);
