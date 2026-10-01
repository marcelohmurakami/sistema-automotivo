const Automacoes = lazy(() =>
  import("./pages/Automacoes").then((m) => ({ default: m.Automacoes })),
);
const MeuSite = lazy(() =>
  import("./pages/MeuSite").then((m) => ({ default: m.MeuSite })),
);
const SitePublico = lazy(() =>
  import("./pages/SitePublico").then((m) => ({ default: m.SitePublico })),
);
const Notinhas = lazy(() =>
  import("./pages/Notinhas").then((m) => ({ default: m.Notinhas })),
);
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { LayoutSistema } from "./layouts/LayoutSistema";
import { MapaOficina } from "./pages/MapaOficina";
import { PaginaNaoEncontrada } from "./pages/Paginas";
import { Clientes } from "./pages/Clientes";
import { lazy, Suspense } from "react";
const Fornecedores = lazy(() =>
  import("./pages/Compras").then((m) => ({ default: m.Fornecedores })),
);
const Compras = lazy(() =>
  import("./pages/Compras").then((m) => ({ default: m.Compras })),
);
const Financeiro = lazy(() =>
  import("./pages/Financeiro").then((m) => ({ default: m.Financeiro })),
);
const Relatorios = lazy(() =>
  import("./pages/Gestao").then((m) => ({ default: m.Relatorios })),
);
const Historico = lazy(() =>
  import("./pages/Gestao").then((m) => ({ default: m.Historico })),
);
const Configuracoes = lazy(() =>
  import("./pages/Gestao").then((m) => ({ default: m.Configuracoes })),
);
const Estoque = lazy(() =>
  import("./pages/Estoque").then((m) => ({ default: m.Estoque })),
);
const OrdensServico = lazy(() =>
  import("./pages/OrdensServico").then((m) => ({ default: m.OrdensServico })),
);
const Orcamentos = lazy(() =>
  import("./pages/Orcamentos").then((m) => ({ default: m.Orcamentos })),
);
const PropostaPublica = lazy(() =>
  import("./pages/PropostaPublica").then((m) => ({
    default: m.PropostaPublica,
  })),
);
import { Planos } from "./pages/Planos";
import { DefinirSenha } from "./pages/DefinirSenha";
import { RecuperarSenha } from "./pages/RecuperarSenha";
import { Entrar, ExigirSessao, RecursoProtegido } from "./pages/Entrar";
import { ProvedorAcesso } from "./auth/ProvedorAcesso";
import { useAcesso } from "./auth/contexto";
const Catalogo = lazy(() =>
  import("./pages/Catalogo").then((m) => ({ default: m.Catalogo })),
);
const Equipe = lazy(() =>
  import("./pages/Equipe").then((m) => ({ default: m.Equipe })),
);
const CadastroConta = lazy(() =>
  import("./pages/EntradaOficina").then((m) => ({ default: m.CadastroConta })),
);
const NovaOficina = lazy(() =>
  import("./pages/EntradaOficina").then((m) => ({ default: m.NovaOficina })),
);
const AceitarConvite = lazy(() =>
  import("./pages/EntradaOficina").then((m) => ({ default: m.AceitarConvite })),
);
import "./App.css";
import "./Tema.css";
function Inicio() {
  const acesso = useAcesso();
  return acesso.permite("production_board") ? (
    <RecursoProtegido recurso="production_board">
      <MapaOficina />
    </RecursoProtegido>
  ) : (
    <Navigate to="/clientes" replace />
  );
}
export default function App() {
  return (
    <BrowserRouter>
      <ProvedorAcesso>
        <Suspense
          fallback={
            <div className="estado-lista" role="status">
              Carregando…
            </div>
          }
        >
          <Routes>
            <Route path="oficina/:slug" element={<SitePublico />} />
            <Route path="proposta" element={<PropostaPublica />} />
            <Route path="cadastro" element={<CadastroConta />} />
            <Route path="nova-oficina" element={<NovaOficina />} />
            <Route path="convite" element={<AceitarConvite />} />
            <Route path="entrar" element={<Entrar />} />
            <Route path="definir-senha" element={<DefinirSenha />} />
            <Route path="recuperar-senha" element={<RecuperarSenha />} />
            <Route element={<ExigirSessao />}>
              <Route element={<LayoutSistema />}>
                <Route index element={<Inicio />} />
                <Route
                  path="automacoes"
                  element={
                    <RecursoProtegido recurso="automations">
                      <Automacoes />
                    </RecursoProtegido>
                  }
                />
                <Route
                  path="meu-site"
                  element={
                    <RecursoProtegido recurso="website">
                      <MeuSite />
                    </RecursoProtegido>
                  }
                />
                <Route
                  path="notinhas"
                  element={
                    <RecursoProtegido recurso="simple_notes">
                      <Notinhas />
                    </RecursoProtegido>
                  }
                />
                <Route
                  path="orcamentos"
                  element={
                    <RecursoProtegido recurso="quotes">
                      <Orcamentos />
                    </RecursoProtegido>
                  }
                />
                <Route
                  path="ordens-servico"
                  element={
                    <RecursoProtegido recurso="work_orders">
                      <OrdensServico />
                    </RecursoProtegido>
                  }
                />
                <Route
                  path="clientes"
                  element={
                    <RecursoProtegido recurso="customers">
                      <Clientes />
                    </RecursoProtegido>
                  }
                />
                <Route
                  path="catalogo"
                  element={
                    <RecursoProtegido recurso="catalog">
                      <Catalogo />
                    </RecursoProtegido>
                  }
                />
                <Route
                  path="estoque"
                  element={
                    <RecursoProtegido recurso="inventory">
                      <Estoque />
                    </RecursoProtegido>
                  }
                />
                <Route
                  path="fornecedores"
                  element={
                    <RecursoProtegido recurso="inventory">
                      <Fornecedores />
                    </RecursoProtegido>
                  }
                />
                <Route
                  path="compras"
                  element={
                    <RecursoProtegido recurso="inventory">
                      <RecursoProtegido recurso="finance">
                        <Compras />
                      </RecursoProtegido>
                    </RecursoProtegido>
                  }
                />
                <Route
                  path="financeiro"
                  element={
                    <RecursoProtegido recurso="finance">
                      <Financeiro />
                    </RecursoProtegido>
                  }
                />
                <Route
                  path="relatorios"
                  element={
                    <RecursoProtegido recurso="reports">
                      <Relatorios />
                    </RecursoProtegido>
                  }
                />
                <Route
                  path="historico"
                  element={
                    <RecursoProtegido recurso="reports">
                      <Historico />
                    </RecursoProtegido>
                  }
                />
                <Route path="equipe" element={<Equipe />} />
                <Route path="planos" element={<Planos />} />
                <Route
                  path="configuracoes"
                  element={
                    <RecursoProtegido recurso="customers">
                      <Configuracoes />
                    </RecursoProtegido>
                  }
                />
                <Route path="*" element={<PaginaNaoEncontrada />} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </ProvedorAcesso>
    </BrowserRouter>
  );
}
