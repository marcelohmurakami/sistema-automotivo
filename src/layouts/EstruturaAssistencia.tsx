import { FaixaLembretesFinanceiros } from "../components/financeiro/FaixaLembretesFinanceiros";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  CalendarDays,
  History,
  ChevronDown,
  CircuitBoard,
  ClipboardList,
  LayoutGrid,
  Menu,
  Moon,
  Package,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Sun,
  Truck,
  Users,
  Wallet,
  Wrench,
  X,
  ChartColumn,
  Globe,
  KeyRound,
  MapPin,
} from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { MarcaEmpresa } from "../components/MarcaEmpresa";
import { Dialogo } from "../components/Dialogo";
import { PerfilConta } from "../components/PerfilConta";
import { AlertasOficina } from "../components/AlertasOficina";
import { definirTema, useTema } from "../lib/tema";
import {
  gruposAssistencia,
  menuAssistencia,
  navegacaoServicos,
} from "../lib/navegacaoAssistencia";
import "./EstruturaAssistencia.css";

const icones = {
  historico: History,
  localizacao: MapPin,
  painel: LayoutGrid,
  ordens: ClipboardList,
  agenda: CalendarDays,
  clientes: Users,
  equipamentos: CircuitBoard,
  estoque: Package,
  financeiro: Wallet,
  servicos: Wrench,
  fornecedores: Truck,
  compras: ShoppingCart,
  relatorios: ChartColumn,
  garantias: ShieldCheck,
  site: Globe,
  acesso: KeyRound,
  configuracoes: Settings2,
};

export function EstruturaAssistencia({ children }: { children: ReactNode }) {
  const a = useAcesso(),
    local = useLocation(),
    tema = useTema();
  const manutencao = a.oficina?.ramo === "manutencao_campo";
  const limpeza = a.oficina?.ramo === "limpeza";
  const grupos = [
    ...gruposAssistencia.slice(0, 3),
    manutencao || limpeza ? "Minha empresa" : "Minha assistência",
  ];
  const [aberto, setAberto] = useState(false),
    [busca, setBusca] = useState("");
  const conteudo = useRef<HTMLElement>(null);
  const pagina = local.pathname.startsWith("/financeiro/detalhes/")
    ? "Histórico financeiro"
    : navegacaoServicos(manutencao, limpeza).find((n) => n.rota === local.pathname)
        ?.nome || "Assistência técnica";
  const itens = menuAssistencia(
    a.permite,
    a.oficina?.perfil,
    busca,
    manutencao,
    limpeza,
  );
  useEffect(() => {
    document.title = `${pagina} · Pátio`;
    conteudo.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [pagina]);
  const fechar = () => {
    setAberto(false);
    setBusca("");
  };
  const links = (grupo?: number) =>
    itens
      .filter((n) => grupo === undefined || n.grupo === grupo)
      .map((n) => {
        const Icone = icones[n.icone];
        return (
          <NavLink key={n.rota} to={n.rota} end onClick={fechar}>
            <Icone size={18} aria-hidden="true" />
            <span>{n.nome}</span>
          </NavLink>
        );
      });
  const menu = (
    <>
      <MarcaEmpresa onClick={fechar} />
      <label className="busca-menu">
        <Search size={16} aria-hidden="true" />
        <input
          aria-label="Encontrar no menu"
          placeholder="Encontrar no menu…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {busca && (
          <button
            type="button"
            className="botao-icone"
            aria-label="Limpar busca do menu"
            onClick={() => setBusca("")}
          >
            <X size={14} />
          </button>
        )}
      </label>
      {busca.trim() ? (
        <nav className="menu-principal" aria-label="Resultados do menu">
          {links()}
          {!itens.length && (
            <p className="menu-sem-resultado">Nenhuma opção encontrada.</p>
          )}
        </nav>
      ) : (
        grupos.map((grupo, i) =>
          !itens.some((n) => n.grupo === i) ? null : i === 0 ? (
            <div key={grupo}>
              <div className="rotulo-menu">DIA A DIA</div>
              <nav className="menu-principal" aria-label={grupo}>
                {links(i)}
              </nav>
            </div>
          ) : (
            <details
              key={grupo + local.pathname}
              className={`grupo-menu ${i === 3 ? "menu-administracao" : ""}`}
              open={
                itens.some((n) => n.grupo === i && n.rota === local.pathname) ||
                undefined
              }
            >
              <summary>
                {grupo}
                <ChevronDown size={16} aria-hidden="true" />
              </summary>
              <nav className="menu-principal" aria-label={grupo}>
                {links(i)}
              </nav>
            </details>
          ),
        )
      )}
    </>
  );
  return (
    <div className="estrutura-sistema assistencia-sistema">
      <a href="#conteudo" className="pular-conteudo">
        Pular para o conteúdo
      </a>
      <aside className="sidebar-desktop">{menu}</aside>
      <Dialogo
        aberto={aberto}
        fechar={fechar}
        titulo={
          limpeza
            ? "Menu da limpeza"
            : manutencao
              ? "Menu da manutenção"
              : "Menu da assistência"
        }
        classe="menu-celular"
      >
        {menu}
      </Dialogo>
      <div className="area-sistema">
        <header className="cabecalho">
          <div className="breadcrumb">
            <button
              className="botao-icone botao-menu"
              onClick={() => setAberto(true)}
              aria-label="Abrir menu"
              aria-expanded={aberto}
            >
              <Menu size={22} />
            </button>
            <strong title={pagina}>{pagina}</strong>
          </div>
          <div className="acoes-cabecalho">
            <AlertasOficina />
            <button
              className="botao-icone"
              aria-label="Alternar tema claro e escuro"
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
        {a.demo && (
          <div className="empresa-demo">
            Demonstração · Dados fictícios neste navegador.{" "}
            <NavLink to="/demonstracao-ramos">Trocar ramo</NavLink>
          </div>
        )}
        <main ref={conteudo} id="conteudo" tabIndex={-1} className="conteudo-pagina">
          <FaixaLembretesFinanceiros />
          {children}
        </main>
        <footer className="rodape-pagina">
          <span>
            <span className="ponto-status" /> Pátio ·{" "}
            {limpeza ? "Limpeza" : manutencao ? "Manutenção" : "Assistência técnica"}
          </span>
          <span>{a.oficina?.nome}</span>
        </footer>
      </div>
      <nav className="navegacao-inferior" aria-label="Atalhos do celular">
        <NavLink to="/" end>
          <LayoutGrid size={21} />
          <span>Painel</span>
        </NavLink>
        {a.permite("work_orders") && (
          <NavLink to="/atendimentos">
            <ClipboardList size={21} />
            <span>{manutencao || limpeza ? "Serviços" : "Reparos"}</span>
          </NavLink>
        )}
        <NavLink to="/clientes">
          <Users size={21} />
          <span>Clientes</span>
        </NavLink>
        <button onClick={() => setAberto(true)} aria-label="Abrir todas as opções">
          <Menu size={21} />
          <span>Mais</span>
        </button>
      </nav>
    </div>
  );
}
