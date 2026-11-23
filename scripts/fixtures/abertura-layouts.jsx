import { useState, useEffect, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';
import { ContextoAcesso } from '../../src/auth/contexto';
import { ExigirSessao } from '../../src/pages/Entrar';
import { CarregamentoPagina } from '../../src/components/CarregamentoPagina';
window.qa = { eventos: [], consultas: 0 };
const parametros = new URLSearchParams(location.search);
const Borda = parametros.get('fase') === 'depois' ? CarregamentoPagina : Suspense;
const marcar = nome => window.qa.eventos.push({ nome, ms: performance.now() });
const Pagina = lazy(async () => {
  marcar('inicio_modulo');
  await new Promise(r => setTimeout(r, Number(parametros.get('codigo') || 0)));
  marcar('fim_modulo');
  return { default: function Tela() {
    const [pronta, setPronta] = useState(false);
    useEffect(() => {
      marcar('montagem'); window.qa.consultas++; marcar('consulta');
      const t = setTimeout(() => { marcar('dados'); setPronta(true); }, 100);
      return () => clearTimeout(t);
    }, []);
    return <main>{pronta ? 'Dados carregados' : 'Consultando dados'}</main>;
  } };
});
function Layout() {
  return <div><aside>Navegação da empresa</aside><Borda fallback={<p>Carregando página</p>}><Outlet /></Borda></div>;
}
function App() {
  const [estado, setEstado] = useState({ carregando: true, usuario: 'qa', oficina: { id: 'empresa', perfil: 'owner', recursos: ['reports'] }, erro: '', segundoFatorExigido: false });
  window.qa.alterar = d => setEstado(e => ({ ...e, ...d }));
  window.qa.liberar = () => { marcar('acesso_aprovado'); setEstado(e => ({ ...e, carregando: false })); };
  return <ContextoAcesso.Provider value={{ ...estado, demo: false, permite: () => true, atualizar: async () => {}, sair: async () => {} }}>
    <MemoryRouter><Borda fallback={<p>Carregando módulo</p>}><Routes>
      <Route element={<ExigirSessao />}><Route element={<Layout />}><Route path="/" element={<Pagina />} /></Route></Route>
      <Route path="/entrar" element={<p>Login obrigatório</p>} />
      <Route path="/nova-oficina" element={<p>Sem empresa autorizada</p>} />
    </Routes></Borda></MemoryRouter>
  </ContextoAcesso.Provider>;
}
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}><App /></QueryClientProvider>);
