import { Navigate, Route, Routes } from "react-router-dom";
import { PaginaNaoEncontrada } from "./pages/Paginas";
import { lazy } from "react";
import { Entrar, ExigirSessao, RecursoProtegido } from "./pages/Entrar";
import { useAcesso } from "./auth/contexto";
import { LayoutPorRamo } from "./layouts/LayoutEmpresa";
const DefinirSenha = lazy(() =>
  import("./pages/DefinirSenha").then((m) => ({ default: m.DefinirSenha })),
);
const RecuperarSenha = lazy(() =>
  import("./pages/RecuperarSenha").then((m) => ({ default: m.RecuperarSenha })),
);
const Laudos = lazy(() =>
  import("./pages/Laudos").then((m) => ({ default: m.Laudos })),
);
const Contratos = lazy(() =>
  import("./pages/Contratos").then((m) => ({ default: m.Contratos })),
);
const ExecucaoOffline = lazy(() =>
  import("./pages/ExecucaoOffline").then((m) => ({ default: m.ExecucaoOffline })),
);
const Localizacao = lazy(() =>
  import("./pages/Localizacao").then((m) => ({ default: m.Localizacao })),
);
const DemonstracaoRamos = lazy(() =>
  import("./pages/DemonstracaoRamos").then((m) => ({ default: m.DemonstracaoRamos })),
);
const Ajuda = lazy(() => import("./pages/Ajuda").then((m) => ({ default: m.Ajuda })));
const DadosSeguranca = lazy(() =>
  import("./pages/DadosSeguranca").then((m) => ({ default: m.DadosSeguranca })),
);

const Qualidade = lazy(() =>
  import("./pages/QualidadeAvancada").then((m) => ({ default: m.QualidadeAvancada })),
);
const PesquisaPublica = lazy(() =>
  import("./pages/PesquisaPublica").then((m) => ({ default: m.PesquisaPublica })),
);
const HistoricoImportado = lazy(() =>
  import("./pages/HistoricoImportado").then((m) => ({
    default: m.HistoricoImportado,
  })),
);
const Comecar = lazy(() =>
  import("./pages/Comecar").then((m) => ({ default: m.Comecar })),
);
const Oportunidades = lazy(() =>
  import("./pages/Oportunidades").then((m) => ({ default: m.Oportunidades })),
);
const Produtividade = lazy(() =>
  import("./pages/Produtividade").then((m) => ({ default: m.Produtividade })),
);
const VistoriaPublica = lazy(() =>
  import("./pages/VistoriaPublica").then((m) => ({
    default: m.VistoriaPublica,
  })),
);
const PreviaSite = lazy(() =>
  import("./pages/SitePublico").then((m) => ({ default: m.PreviaSite })),
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
const Funcionarios = lazy(() =>
  import("./pages/GestaoFuncionarios").then((m) => ({ default: m.GestaoFuncionarios })),
);
const MapaOficina = lazy(() =>
  import("./pages/MapaOficina").then((m) => ({ default: m.MapaOficina })),
);
const Clientes = lazy(() =>
  import("./pages/Clientes").then((m) => ({ default: m.Clientes })),
);
const Fornecedores = lazy(() =>
  import("./pages/Fornecedores").then((m) => ({ default: m.Fornecedores })),
);
const Compras = lazy(() =>
  import("./pages/CentralCompras").then((m) => ({ default: m.CentralCompras })),
);
const FinanceiroDetalhe = lazy(() =>
  import("./pages/FinanceiroDetalhe").then((m) => ({ default: m.FinanceiroDetalhe })),
);
const Financeiro = lazy(() =>
  import("./pages/Financeiro").then((m) => ({ default: m.Financeiro })),
);
const Relatorios = lazy(() =>
  import("./pages/Relatorios").then((m) => ({ default: m.Relatorios })),
);
const Historico = lazy(() =>
  import("./pages/Historico").then((m) => ({ default: m.Historico })),
);
const Configuracoes = lazy(() =>
  import("./pages/Gestao").then((m) => ({ default: m.Configuracoes })),
);
const Estoque = lazy(() =>
  import("./pages/Estoque").then((m) => ({ default: m.Estoque })),
);
const Suprimentos = lazy(() =>
  import("./pages/CentralCompras").then((m) => ({
    default: m.RedirecionarSuprimentos,
  })),
);
const OrdensServico = lazy(() =>
  import("./pages/OrdensServico").then((m) => ({ default: m.OrdensServico })),
);
const Orcamentos = lazy(() =>
  import("./pages/Orcamentos").then((m) => ({ default: m.Orcamentos })),
);
const CentralDocumentos = lazy(() =>
  import("./pages/CentralDocumentos").then((m) => ({
    default: m.CentralDocumentos,
  })),
);
const PropostaPublica = lazy(() =>
  import("./pages/PropostaPublica").then((m) => ({
    default: m.PropostaPublica,
  })),
);
const PropostaServicoPublica = lazy(() =>
  import("./pages/PropostaServicoPublica").then((m) => ({
    default: m.PropostaServicoPublica,
  })),
);
const Planos = lazy(() =>
  import("./pages/Planos").then((m) => ({ default: m.Planos })),
);
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
export default function RotasSistema() {
  return (
    <Routes>
      <Route path="ajuda" element={<Ajuda />} />
      <Route path="demonstracao-ramos" element={<DemonstracaoRamos />} />
      <Route path="previa-site" element={<PreviaSite />} />
      <Route path="oficina/:slug" element={<SitePublico />} />
      <Route path="vistoria" element={<VistoriaPublica />} />
      <Route path="proposta" element={<PropostaPublica />} />
      <Route path="aprovar-servico" element={<PropostaServicoPublica />} />
      <Route path="pesquisa/:token" element={<PesquisaPublica />} />
      <Route path="cadastro" element={<CadastroConta />} />
      <Route path="nova-oficina" element={<NovaOficina />} />
      <Route path="convite" element={<AceitarConvite />} />
      <Route path="rascunhos" element={<Navigate to="/execucao-offline" replace />} />
      <Route path="execucao-offline" element={<ExecucaoOffline />} />
      <Route path="entrar" element={<Entrar />} />
      <Route path="definir-senha" element={<DefinirSenha />} />
      <Route path="recuperar-senha" element={<RecuperarSenha />} />
      <Route element={<ExigirSessao />}>
        <Route element={<LayoutPorRamo />}>
          <Route
            path="laudos"
            element={
              <RecursoProtegido recurso="work_orders">
                <Laudos />
              </RecursoProtegido>
            }
          />
          <Route
            path="contratos"
            element={
              <RecursoProtegido recurso="finance">
                <Contratos />
              </RecursoProtegido>
            }
          />
          <Route
            path="localizacao"
            element={
              <RecursoProtegido recurso="work_orders">
                <Localizacao />
              </RecursoProtegido>
            }
          />
          <Route path="atendimentos" element={<Navigate to="/" replace />} />
          <Route path="agenda" element={<Navigate to="/produtividade" replace />} />
          <Route path="objetos" element={<Navigate to="/clientes" replace />} />
          <Route index element={<Inicio />} />
          <Route path="comecar" element={<Comecar />} />
          <Route path="dados-seguranca" element={<DadosSeguranca />} />
          <Route
            path="oportunidades"
            element={
              <RecursoProtegido recurso="quotes">
                <Oportunidades />
              </RecursoProtegido>
            }
          />
          <Route
            path="produtividade"
            element={
              <RecursoProtegido recurso="work_orders">
                <Produtividade />
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
          <Route path="funcionarios" element={<Funcionarios />} />
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
            path="documentos"
            element={
              <RecursoProtegido recurso="quotes">
                <CentralDocumentos />
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
            path="suprimentos"
            element={
              <RecursoProtegido recurso="inventory">
                <RecursoProtegido recurso="finance">
                  <Suprimentos />
                </RecursoProtegido>
              </RecursoProtegido>
            }
          />
          <Route
            path="financeiro/detalhes/:indicador"
            element={
              <RecursoProtegido recurso="finance">
                <FinanceiroDetalhe />
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
            path="garantias"
            element={
              <RecursoProtegido recurso="work_orders">
                <Qualidade />
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
          <Route
            path="historico-importado"
            element={
              <RecursoProtegido recurso="customers">
                <HistoricoImportado />
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
  );
}
