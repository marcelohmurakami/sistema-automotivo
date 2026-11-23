import { ProvedorLembretesFinanceiros } from "../components/financeiro/ProvedorLembretesFinanceiros";
import { lazy } from "react";
import { CarregamentoPagina } from "../components/CarregamentoPagina";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAcesso } from "../auth/contexto";
import { ProvedorPagamentoAposRegistro } from "../components/ProvedorPagamentoAposRegistro";
import { LayoutSistema } from "./LayoutSistema";
import { EstruturaAssistencia } from "./EstruturaAssistencia";
import { RecursoProtegido } from "../pages/Entrar";
import { AcessoAssistente } from "../components/AcessoAssistente";
import "../pages/Servicos.css";
const Servicos = lazy(() =>
  import("../pages/Servicos").then((m) => ({ default: m.Servicos })),
);
const RelatoriosServicos = lazy(() =>
  import("../pages/RelatoriosServicos").then((m) => ({
    default: m.RelatoriosServicos,
  })),
);
const modulos = [
  ["/laudos", "Laudos técnicos", "work_orders"],
  ["/contratos", "Contratos preventivos", "finance"],
  // As rotas do assistente continuam protegidas pelo plano e pelas RPCs.
  ["/", "Visão geral", "customers"],
  ["/atendimentos", "Atendimentos", "work_orders"],
  ["/orcamentos", "Orçamentos", "work_orders"],
  ["/agenda", "Agenda", "work_orders"],
  ["/objetos", "Cadastros de atendimento", "customers"],
  ["/clientes", "Clientes", "customers"],
  ["/catalogo", "Produtos e serviços", "catalog"],
  ["/estoque", "Estoque", "inventory"],
  ["/localizacao", "Localização e etiquetas", "work_orders"],
  ["/fornecedores", "Fornecedores", "inventory"],
  ["/compras", "Compras", "finance"],
  ["/suprimentos", "Compras", "finance"],
  ["/financeiro", "Financeiro", "finance"],
  ["/relatorios", "Relatórios", "reports"],
  ["/historico", "Histórico", "reports"],
  ["/garantias", "Qualidade e garantia", "work_orders"],
  ["/funcionarios", "Funcionários", "customers"],
  ["/meu-site", "Site e área do cliente", "website"],
  ["/equipe", "Equipe e acesso", "customers"],
  ["/planos", "Meu plano", "customers"],
  ["/configuracoes", "Configurações", "customers"],
  ["/dados-seguranca", "Dados e segurança", "customers"],
  ["/comecar", "Primeiros passos", "customers"],
  ["/historico-importado", "Histórico importado", "customers"],
];
export function LayoutPorRamo() {
  const a = useAcesso();
  const layout =
    !a.oficina?.ramo || a.oficina.ramo === "automotivo" ? (
      <LayoutSistema />
    ) : (
      <LayoutEmpresa key={a.oficina.id} />
    );
  return (
    <ProvedorLembretesFinanceiros key={`${a.demo}:${a.usuario}:${a.oficina?.id}`}>
      {layout}
      {a.oficina && a.permite("ai") && (
        <AcessoAssistente key={`${a.usuario}:${a.oficina.id}`} />
      )}
    </ProvedorLembretesFinanceiros>
  );
}
function LayoutEmpresa() {
  const a = useAcesso(),
    local = useLocation();
  const internos = ["/", "/atendimentos", "/orcamentos", "/agenda", "/objetos"];
  const detalheFinanceiro = local.pathname.startsWith("/financeiro/detalhes/");
  const permitido =
    detalheFinanceiro || modulos.some(([rota]) => rota === local.pathname);
  const recurso = detalheFinanceiro
    ? "finance"
    : modulos.find(([rota]) => rota === local.pathname)?.[2] || "customers";
  const conteudo = (
    <>
      <ProvedorPagamentoAposRegistro>
        <CarregamentoPagina>
          <RecursoProtegido recurso={recurso}>
            {!permitido ? (
              <Navigate to="/" replace />
            ) : local.pathname === "/relatorios" ? (
              <RelatoriosServicos key={local.pathname} inicial="financeiro" />
            ) : internos.includes(local.pathname) ? (
              <Servicos
                key={`${a.oficina?.id}:${local.pathname}`}
                tela={local.pathname}
              />
            ) : (
              <Outlet />
            )}
          </RecursoProtegido>
        </CarregamentoPagina>
      </ProvedorPagamentoAposRegistro>
    </>
  );
  return <EstruturaAssistencia>{conteudo}</EstruturaAssistencia>;
}
