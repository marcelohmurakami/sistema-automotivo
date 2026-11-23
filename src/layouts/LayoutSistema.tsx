import { FaixaLembretesFinanceiros } from "../components/financeiro/FaixaLembretesFinanceiros";
import { MarcaEmpresa } from "../components/MarcaEmpresa";
import { useAcesso } from "../auth/contexto";
import { termosBuscaCompras } from "../lib/navegacaoCompras";
import { AcessoRapido } from "../components/AcessoRapido";
import { useEffect, useRef, useState } from "react";
import { CarregamentoPagina } from "../components/CarregamentoPagina";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Wallet,
  BarChart3,
  History,
  Moon,
  Sun,
  ArrowUpRight,
  Check,
  ChevronDown,
  ClipboardList,
  FileText,
  LayoutGrid,
  LockKeyhole,
  ShieldCheck,
  Menu,
  Package,
  MapPin,
  Plus,
  Search,
  Settings2,
  Users,
} from "lucide-react";
import { useTema, definirTema } from "../lib/tema";
import { Dialogo } from "../components/Dialogo";
import { PerfilConta } from "../components/PerfilConta";
import { AlertasOficina } from "../components/AlertasOficina";
import { ProvedorPagamentoAposRegistro } from "../components/ProvedorPagamentoAposRegistro";
const navegacao = [
  { rota: "/laudos", nome: "Laudos técnicos", icone: FileText, recurso: "work_orders" },
  {
    rota: "/",
    nome: "Mapa da oficina",
    icone: LayoutGrid,
    recurso: "production_board",
  },
  {
    rota: "/orcamentos",
    nome: "Orçamentos",
    icone: FileText,
    recurso: "quotes",
  },
  {
    rota: "/ordens-servico",
    nome: "Ordens de serviço",
    icone: ClipboardList,
    recurso: "work_orders",
  },
  { rota: "/clientes", nome: "Clientes", icone: Users, recurso: "customers" },
  {
    rota: "/catalogo",
    nome: "Serviços",
    icone: Package,
    recurso: "catalog",
  },
  { rota: "/funcionarios", nome: "Funcionários", icone: Users, recurso: "" },
  {
    rota: "/produtividade",
    nome: "Agenda e revisões",
    icone: ClipboardList,
    recurso: "work_orders",
  },
  {
    rota: "/oportunidades",
    nome: "Clientes para contatar",
    icone: ArrowUpRight,
    recurso: "quotes",
  },
  { rota: "/estoque", nome: "Estoque", icone: Package, recurso: "inventory" },
  {
    rota: "/localizacao",
    nome: "Localização e etiquetas",
    icone: MapPin,
    recurso: "work_orders",
  },
  { rota: "/compras", nome: "Compras", icone: Package, recurso: "inventory" },
  {
    rota: "/fornecedores",
    nome: "Fornecedores",
    icone: Users,
    recurso: "inventory",
  },
  {
    rota: "/financeiro",
    nome: "Financeiro",
    icone: Wallet,
    recurso: "finance",
  },
  {
    rota: "/relatorios",
    nome: "Relatórios",
    icone: BarChart3,
    recurso: "reports",
  },
  {
    rota: "/garantias",
    nome: "Qualidade e garantia",
    icone: ShieldCheck,
    recurso: "work_orders",
  },
  { rota: "/historico", nome: "Histórico", icone: History, recurso: "reports" },
  {
    rota: "/meu-site",
    nome: "Site e clientes online",
    icone: LayoutGrid,
    recurso: "website",
  },
  {
    rota: "/execucao-offline",
    nome: "Trabalhar sem internet",
    icone: FileText,
    recurso: "work_orders",
  },
  {
    rota: "/comecar",
    nome: "Começar por aqui",
    icone: Check,
    recurso: "customers",
  },
];
const paginasAuxiliares: Record<string, string> = {
  "/equipe": "Minha equipe",
  "/planos": "Seu plano",
  "/configuracoes": "Configurações",
  "/documentos": "Impressão de documentos",
  "/notinhas": "Notinhas",
  "/dados-seguranca": "Dados e segurança",
  "/historico-importado": "Histórico importado",
};
export function LayoutSistema() {
  const acesso = useAcesso();
  const tema = useTema();
  const [menuAberto, setMenuAberto] = useState(false);
  const [buscaMenu, setBuscaMenu] = useState("");
  const local = useLocation(),
    navegar = useNavigate(),
    conteudo = useRef<HTMLElement>(null);
  const pagina = local.pathname.startsWith("/financeiro/detalhes/")
    ? "Histórico financeiro"
    : (navegacao.find((n) => n.rota === local.pathname)?.nome ??
      paginasAuxiliares[local.pathname] ??
      "Página não encontrada");
  useEffect(() => {
    document.title = `${pagina} · Pátio`;
    conteudo.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [pagina]);
  const abrirOrcamento = () => {
    if (!acesso.permite("quotes")) {
      navegar("/planos");
      return;
    }
    navegar("/orcamentos?novo=1");
  };
  const normalizarMenu = (v: string) =>
    v
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const rotasPrincipais = [
    ...(acesso.permite("production_board") ? ["/"] : []),
    ...(acesso.permite("quotes") ? ["/orcamentos"] : []),
    ...(acesso.permite("work_orders") ? ["/ordens-servico"] : ["/catalogo"]),
    "/clientes",
    ...(acesso.permite("inventory") ? ["/estoque"] : []),
    ...(acesso.permite("finance") && acesso.oficina?.perfil !== "staff"
      ? ["/financeiro"]
      : []),
  ];
  const gruposMenu = [
    {
      nome: "Cadastros e compras",
      rotas: [
        "/catalogo",
        "/localizacao",
        "/funcionarios",
        "/compras",
        "/suprimentos",
        "/fornecedores",
      ],
    },
    {
      nome: "Gestão e ferramentas",
      rotas: [
        "/laudos",
        "/produtividade",
        "/oportunidades",
        "/relatorios",
        "/garantias",
        "/historico",
        "/meu-site",
        "/execucao-offline",
      ],
    },
  ];
  const opcoesBusca = [
    ...navegacao,
    {
      rota: "/configuracoes",
      nome: "Configurações",
      icone: Settings2,
      recurso: "",
    },
    { rota: "/planos", nome: "Meu plano", icone: ShieldCheck, recurso: "" },
    ...(acesso.oficina?.perfil === "owner"
      ? [{ rota: "/equipe", nome: "Minha equipe", icone: Users, recurso: "" }]
      : []),
  ];
  const fecharMenu = () => {
    setMenuAberto(false);
    setBuscaMenu("");
  };
  const itemMenu = ({
    rota,
    nome,
    icone: Icone,
    recurso,
  }: (typeof navegacao)[number]) => {
    const liberado = !recurso || acesso.permite(recurso);
    return (
      <NavLink
        key={rota}
        to={liberado ? rota : "/planos"}
        end={rota === "/"}
        aria-current={liberado ? "page" : false}
        className={({ isActive }) =>
          !liberado ? "menu-bloqueado" : isActive ? "active" : undefined
        }
        title={!liberado ? "Veja os planos que incluem este recurso" : undefined}
        onClick={fecharMenu}
      >
        <Icone size={18} />
        <span>{nome}</span>
        {!liberado && <LockKeyhole size={14} />}
      </NavLink>
    );
  };
  const sidebar = (
    <>
      <MarcaEmpresa onClick={() => setMenuAberto(false)} />
      <label className="busca-menu">
        <Search size={16} aria-hidden="true" />
        <input
          aria-label="Encontrar no menu"
          placeholder="Encontrar no menu…"
          value={buscaMenu}
          onChange={(e) => setBuscaMenu(e.target.value)}
        />
      </label>
      {buscaMenu.trim() ? (
        <nav aria-label="Resultados do menu" className="menu-principal">
          {opcoesBusca
            .filter((n) =>
              normalizarMenu(termosBuscaCompras(n)).includes(normalizarMenu(buscaMenu)),
            )
            .map(itemMenu)}
          {!opcoesBusca.some((n) =>
            normalizarMenu(termosBuscaCompras(n)).includes(normalizarMenu(buscaMenu)),
          ) && <p className="menu-sem-resultado">Nenhuma opção encontrada.</p>}
        </nav>
      ) : (
        <>
          <div className="rotulo-menu">DIA A DIA</div>
          <nav aria-label="Navegação principal" className="menu-principal">
            {navegacao.filter((n) => rotasPrincipais.includes(n.rota)).map(itemMenu)}
          </nav>
          {gruposMenu.map((grupo) => (
            <details
              className="grupo-menu"
              key={grupo.nome + local.pathname}
              open={grupo.rotas.includes(local.pathname) || undefined}
            >
              <summary>
                {grupo.nome}
                <ChevronDown size={16} aria-hidden="true" />
              </summary>
              <nav className="menu-principal" aria-label={grupo.nome}>
                {navegacao
                  .filter(
                    (n) =>
                      grupo.rotas.includes(n.rota) && !rotasPrincipais.includes(n.rota),
                  )
                  .map(itemMenu)}
              </nav>
            </details>
          ))}
        </>
      )}
      <details
        className="grupo-menu menu-administracao"
        key={"conta" + local.pathname}
        open={
          [
            "/configuracoes",
            "/planos",
            "/equipe",
            "/dados-seguranca",
            "/historico-importado",
          ].includes(local.pathname) || undefined
        }
      >
        <summary>
          Minha oficina
          <ChevronDown size={16} aria-hidden="true" />
        </summary>
        <nav aria-label="Administração" className="menu-principal">
          {["owner", "manager"].includes(acesso.oficina?.perfil || "") && (
            <NavLink to="/historico-importado" onClick={fecharMenu}>
              <History size={18} />
              <span>Histórico importado</span>
            </NavLink>
          )}
          <NavLink to="/configuracoes" onClick={fecharMenu}>
            <Settings2 size={18} />
            <span>Configurações</span>
          </NavLink>
          {acesso.oficina?.perfil === "owner" && (
            <NavLink to="/equipe" onClick={fecharMenu}>
              <Users size={18} />
              <span>Minha equipe</span>
            </NavLink>
          )}
          <NavLink to="/planos" onClick={fecharMenu}>
            <ShieldCheck size={18} />
            <span>Meu plano</span>
          </NavLink>
        </nav>
      </details>
    </>
  );
  return (
    <div className="estrutura-sistema">
      <a href="#conteudo" className="pular-conteudo">
        Pular para o conteúdo
      </a>
      <aside className="sidebar-desktop">{sidebar}</aside>
      <Dialogo
        aberto={menuAberto}
        fechar={() => setMenuAberto(false)}
        titulo="Menu da oficina"
        classe="menu-celular"
      >
        {sidebar}
      </Dialogo>
      <div className="area-sistema">
        <header className="cabecalho">
          <div className="breadcrumb">
            <button
              className="botao-icone botao-menu"
              onClick={() => setMenuAberto(true)}
              aria-label="Abrir menu"
              aria-expanded={menuAberto}
            >
              <Menu size={22} />
            </button>
            <strong title={pagina}>{pagina}</strong>
          </div>
          <div className="acoes-cabecalho">
            <AlertasOficina
              key={`${acesso.demo}:${acesso.oficina?.id}:${acesso.usuario}`}
            />
            <button
              className="botao-icone"
              aria-label="Alternar tema claro e escuro"
              title="Alternar tema"
              onClick={() =>
                definirTema(
                  document.documentElement.dataset.tema === "escuro"
                    ? "claro"
                    : "escuro",
                )
              }
            >
              {tema === "escuro" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <PerfilConta key={local.pathname} />
          </div>
        </header>
        <AcessoRapido key={`${acesso.usuario}:${acesso.oficina?.id}`} />
        <main ref={conteudo} id="conteudo" tabIndex={-1} className="conteudo-pagina">
          <FaixaLembretesFinanceiros />
          <ProvedorPagamentoAposRegistro key={`${acesso.demo}:${acesso.oficina?.id}`}>
            <CarregamentoPagina>
              <Outlet />
            </CarregamentoPagina>
          </ProvedorPagamentoAposRegistro>
        </main>
        <footer className="rodape-pagina">
          <span>
            <span className="ponto-status" /> Pátio · Gestão da oficina
          </span>
          <span>
            {acesso.demo
              ? "Ambiente demonstrativo · Dados fictícios"
              : "Dados da sua oficina"}
          </span>
        </footer>
      </div>
      <nav className="navegacao-inferior" aria-label="Atalhos do celular">
        <NavLink to="/" end>
          <LayoutGrid size={21} />
          <span>Oficina</span>
        </NavLink>
        <NavLink to={acesso.permite("work_orders") ? "/ordens-servico" : "/catalogo"}>
          <ClipboardList size={21} />
          <span>{acesso.permite("work_orders") ? "Serviços" : "Catálogo"}</span>
        </NavLink>
        {acesso.permite("quotes") && (
          <button
            className="atalho-novo"
            onClick={abrirOrcamento}
            aria-label="Novo orçamento"
          >
            <Plus size={23} />
            <span>Orçamento</span>
          </button>
        )}
        <NavLink to="/clientes">
          <Users size={21} />
          <span>Clientes</span>
        </NavLink>
        <button onClick={() => setMenuAberto(true)}>
          <Menu size={21} />
          <span>Mais</span>
        </button>
      </nav>
    </div>
  );
}
