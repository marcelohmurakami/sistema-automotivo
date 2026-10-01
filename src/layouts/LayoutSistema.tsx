import { useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Wallet,
  BarChart3,
  History,
  Moon,
  Sun,
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  BookOpen,
  CarFront,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  FileText,
  LayoutGrid,
  LockKeyhole,
  LogOut,
  ShieldCheck,
  Menu,
  Package,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { useTema, definirTema } from "../lib/tema";
import { Dialogo } from "../components/Dialogo";
import { NovoOrcamento } from "../components/NovoOrcamento";
import {
  etapas,
  moeda,
  orcamentosIniciais,
  veiculosIniciais,
} from "../data/demonstracao";
import type { Orcamento, Veiculo } from "../data/demonstracao";
import { useAcesso } from "../auth/contexto";
import type { ContextoOficina } from "./contexto";

const navegacao = [
  {
    rota: "/automacoes",
    nome: "Assistente e automações",
    icone: Sparkles,
    recurso: "automations",
  },
  {
    rota: "/meu-site",
    nome: "Site e clientes online",
    icone: LayoutGrid,
    recurso: "website",
  },
  {
    rota: "/notinhas",
    nome: "Notinhas",
    icone: FileText,
    recurso: "simple_notes",
  },
  {
    rota: "/fornecedores",
    nome: "Fornecedores",
    icone: Users,
    recurso: "inventory",
  },
  { rota: "/compras", nome: "Compras", icone: Package, recurso: "inventory" },
  {
    rota: "/relatorios",
    nome: "Relatórios",
    icone: BarChart3,
    recurso: "reports",
  },
  { rota: "/historico", nome: "Histórico", icone: History, recurso: "reports" },
  {
    rota: "/financeiro",
    nome: "Financeiro",
    icone: Wallet,
    recurso: "finance",
  },
  { rota: "/estoque", nome: "Estoque", icone: Package, recurso: "inventory" },
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
    nome: "Peças e serviços",
    icone: Package,
    recurso: "catalog",
  },
];
export function LayoutSistema() {
  const acesso = useAcesso();
  const tema = useTema();
  const [menuAberto, setMenuAberto] = useState(false);
  const [modal, setModal] = useState<
    "orcamento" | "notificacoes" | "ajuda" | null
  >(null);
  const [veiculos, setVeiculos] = useState(acesso.demo ? veiculosIniciais : []);
  const [orcamentos, setOrcamentos] = useState(
    acesso.demo ? orcamentosIniciais : [],
  );
  const [selecionado, setSelecionado] = useState<Veiculo | null>(null);
  const [nomeOficina, setNomeOficina] = useState(
    acesso.oficina?.nome ?? "Minha oficina",
  );
  const [aviso, setAviso] = useState("");
  const local = useLocation(),
    navegar = useNavigate(),
    conteudo = useRef<HTMLElement>(null);
  const pagina =
    local.pathname === "/equipe"
      ? "Minha equipe"
      : (navegacao.find((n) => n.rota === local.pathname)?.nome ??
        (local.pathname === "/planos"
          ? "Seu plano"
          : local.pathname === "/configuracoes"
            ? "Configurações"
            : "Página não encontrada"));
  useEffect(() => {
    document.title = `${pagina} · Pátio`;
    conteudo.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [pagina]);
  useEffect(() => {
    if (aviso) {
      const tempo = setTimeout(() => setAviso(""), 6500);
      return () => clearTimeout(tempo);
    }
  }, [aviso]);
  const abrirOrcamento = () => {
    if (!acesso.permite("quotes")) {
      navegar("/planos");
      return;
    }
    navegar("/orcamentos?novo=1");
  };
  const salvar = (dados: Omit<Orcamento, "id">) => {
    setOrcamentos((anteriores) => [
      { ...dados, id: Math.max(...anteriores.map((o) => o.id)) + 1 },
      ...anteriores,
    ]);
    setModal(null);
    setAviso("Rascunho salvo nesta demonstração.");
    navegar("/orcamentos");
  };
  const sidebar = (
    <>
      <Link
        to="/"
        className="marca"
        onClick={() => setMenuAberto(false)}
        aria-label="Pátio, mapa da oficina"
      >
        <span className="simbolo-marca">
          <Wrench size={21} strokeWidth={2.4} />
        </span>
        <span>
          pátio<span className="ponto-marca">.</span>
        </span>
        <small>GESTÃO AUTOMOTIVA</small>
      </Link>
      <button
        className="seletor-oficina"
        onClick={() => {
          setMenuAberto(false);
          navegar("/configuracoes");
        }}
      >
        <span className="avatar-oficina">OM</span>
        <span>
          <strong>{acesso.oficina?.nome ?? nomeOficina}</strong>
          <small>
            {acesso.demo ? "Franca, SP" : "Sua oficina"}{" "}
            <span className="bolinha" /> {acesso.oficina?.nome_plano}
          </small>
        </span>
        <ChevronDown size={15} />
      </button>
      <div className="rotulo-menu">DIA A DIA</div>
      <nav aria-label="Navegação principal" className="menu-principal">
        {navegacao.map(({ rota, nome, icone: Icone, recurso }) => (
          <NavLink
            key={rota}
            to={acesso.permite(recurso) ? rota : "/planos"}
            className={!acesso.permite(recurso) ? "menu-bloqueado" : undefined}
            title={
              !acesso.permite(recurso)
                ? "Recurso indisponível no plano"
                : undefined
            }
            end={rota === "/"}
            onClick={() => setMenuAberto(false)}
          >
            <Icone size={19} />
            <span>{nome}</span>
            {!acesso.permite(recurso) && <LockKeyhole size={14} />}
            {rota === "/orcamentos" &&
              acesso.demo &&
              acesso.permite("quotes") && (
                <small>
                  {
                    orcamentos.filter(
                      (o) => o.situacao === "Aguardando aprovação",
                    ).length
                  }
                </small>
              )}
          </NavLink>
        ))}
      </nav>
      <div className="rotulo-menu gestao-label">SUA OFICINA</div>
      <nav aria-label="Administração" className="menu-principal">
        {acesso.oficina?.perfil === "owner" && (
          <NavLink to="/equipe" onClick={() => setMenuAberto(false)}>
            <Users size={19} />
            <span>Minha equipe</span>
          </NavLink>
        )}
        {!acesso.demo && (
          <NavLink to="/nova-oficina" onClick={() => setMenuAberto(false)}>
            <Plus size={19} />
            <span>Cadastrar outra oficina</span>
          </NavLink>
        )}
        <NavLink to="/planos" onClick={() => setMenuAberto(false)}>
          <ShieldCheck size={19} />
          <span>Meu plano</span>
        </NavLink>
        {acesso.oficinas.length > 1 && (
          <label className="troca-oficina">
            Oficina
            <select
              aria-label="Selecionar oficina"
              value={acesso.oficina?.id}
              onChange={(e) => acesso.selecionarOficina(e.target.value)}
            >
              {acesso.oficinas.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          onClick={() => {
            void acesso
              .sair()
              .catch(() => setAviso("Não foi possível sair. Tente novamente."));
          }}
        >
          <LogOut size={19} />
          <span>{acesso.demo ? "Entrar na minha conta" : "Sair da conta"}</span>
        </button>
        <NavLink to="/configuracoes" onClick={() => setMenuAberto(false)}>
          <Settings2 size={19} />
          <span>Configurações</span>
        </NavLink>
        <button
          onClick={() => {
            setMenuAberto(false);
            setModal("ajuda");
          }}
        >
          <CircleHelp size={19} />
          <span>Central de ajuda</span>
          <ArrowUpRight size={15} />
        </button>
      </nav>
      <div className="sidebar-rodape">
        <div className="dica-sidebar">
          <span>
            <Sparkles size={17} /> Menos papel. Mais oficina.
          </span>
          <p>
            Um orçamento profissional
            <br />
            começa com poucos toques.
          </p>
          <button
            onClick={() => {
              setMenuAberto(false);
              abrirOrcamento();
            }}
          >
            Criar meu orçamento
            <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="assinatura-sidebar">
          <span className="selo-p">P</span>
          <span>
            Feito para quem faz.
            <small>
              Pátio ·{" "}
              {acesso.demo ? "Demonstração" : acesso.oficina?.nome_plano}
            </small>
          </span>
        </div>
      </div>
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
            <span className="breadcrumb-pai">Minha oficina</span>
            <ChevronRight size={14} className="breadcrumb-pai" />
            <strong>{pagina}</strong>
          </div>
          <div className="acoes-cabecalho">
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
            <form
              className="busca-global"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                const termo = String(
                  new FormData(e.currentTarget).get("busca") ?? "",
                );
                navegar(`/ordens-servico?busca=${encodeURIComponent(termo)}`);
              }}
            >
              <Search size={17} />
              <input
                name="busca"
                aria-label="Buscar por placa ou cliente"
                placeholder="Buscar placa ou cliente..."
              />
              <kbd>↵</kbd>
            </form>
            <Link to="/planos" className="selo-demo">
              {acesso.demo ? "Demonstração" : acesso.oficina?.nome_plano}
            </Link>
            <button
              className="botao-icone notificacao"
              aria-label="Ver avisos da oficina"
              onClick={() => setModal("notificacoes")}
            >
              <Bell size={20} />
              <i />
            </button>
            <Link
              className="perfil-cabecalho"
              to="/configuracoes"
              aria-label="Configurações da conta"
            >
              <span className="avatar-usuario">M</span>
              <div>
                <strong>{acesso.demo ? "Marcelo" : "Minha conta"}</strong>
                <small>
                  {acesso.oficina?.perfil === "staff"
                    ? "Colaborador"
                    : "Administrador"}
                </small>
              </div>
              <ChevronDown size={14} />
            </Link>
          </div>
        </header>
        <main
          ref={conteudo}
          id="conteudo"
          tabIndex={-1}
          className="conteudo-pagina"
        >
          <Outlet
            context={
              {
                veiculos,
                orcamentos,
                nomeOficina,
                abrirOrcamento,
                abrirVeiculo: setSelecionado,
                avisar: setAviso,
                definirOficina: setNomeOficina,
              } satisfies ContextoOficina
            }
          />
        </main>
        <footer className="rodape-pagina">
          <span>
            <span className="ponto-status" /> Seu próximo serviço começa com
            organização.
          </span>
          <span>
            {acesso.demo
              ? "Ambiente demonstrativo · Dados fictícios"
              : "Conectado à sua oficina · Supabase"}
          </span>
        </footer>
      </div>
      <nav className="navegacao-inferior" aria-label="Atalhos do celular">
        <NavLink to="/" end>
          <LayoutGrid size={21} />
          <span>Oficina</span>
        </NavLink>
        <NavLink
          to={acesso.permite("work_orders") ? "/ordens-servico" : "/planos"}
        >
          <ClipboardList size={21} />
          <span>Serviços</span>
        </NavLink>
        <button
          className="atalho-novo"
          onClick={abrirOrcamento}
          aria-label="Novo orçamento"
        >
          <Plus size={23} />
          <span>Orçamento</span>
        </button>
        <NavLink to="/clientes">
          <Users size={21} />
          <span>Clientes</span>
        </NavLink>
        <button onClick={() => setMenuAberto(true)}>
          <Menu size={21} />
          <span>Mais</span>
        </button>
      </nav>
      <Dialogo
        aberto={modal === "orcamento"}
        fechar={() => setModal(null)}
        titulo="Novo orçamento"
      >
        {modal === "orcamento" && <NovoOrcamento salvar={salvar} />}
      </Dialogo>
      <Dialogo
        aberto={modal === "notificacoes"}
        fechar={() => setModal(null)}
        titulo="Atenção ao seu dia"
      >
        <p className="texto-suave mb-5">Avisos ilustrativos da oficina.</p>
        {veiculos
          .filter((v) => v.atrasado)
          .map((v) => (
            <button
              key={v.id}
              className="linha-notificacao"
              onClick={() => {
                setModal(null);
                setSelecionado(v);
              }}
            >
              <span className="icone-suave laranja">
                <CarFront size={20} />
              </span>
              <span>
                <strong>{v.modelo}</strong>
                <small>{v.motivo} · Prazo vencido</small>
              </span>
              <ChevronRight size={17} />
            </button>
          ))}
        {!veiculos.some((v) => v.atrasado) && <p>Sem avisos por aqui.</p>}
      </Dialogo>
      <Dialogo
        aberto={modal === "ajuda"}
        fechar={() => setModal(null)}
        titulo="Sua oficina, sem complicação"
      >
        <div className="ajuda-conteudo">
          <BookOpen size={32} />
          <p>
            Este é o esboço interativo do Pátio. Explore as páginas pelo menu e
            toque em um veículo para ver os detalhes.
          </p>
          <p>
            Você pode filtrar o mapa, avançar etapas e montar um orçamento de
            demonstração. As alterações duram até recarregar a página.
          </p>
          <div className="aviso-demo">
            Envio pelo WhatsApp, fotos e conexão com o banco serão integrados
            nas próximas etapas.
          </div>
        </div>
      </Dialogo>
      <Dialogo
        aberto={selecionado !== null}
        fechar={() => setSelecionado(null)}
        titulo={`Ordem de serviço #${selecionado?.id ?? ""}`}
      >
        {selecionado && (
          <>
            <div className="detalhe-veiculo">
              <span className="icone-veiculo">
                <CarFront size={34} />
              </span>
              <div>
                <h3>{selecionado.modelo}</h3>
                <p>{selecionado.versao}</p>
                <span className="placa">{selecionado.placa}</span>
              </div>
            </div>
            <dl className="detalhes-grade">
              <div>
                <dt>Cliente</dt>
                <dd>{selecionado.cliente}</dd>
              </div>
              <div>
                <dt>Responsável</dt>
                <dd>{selecionado.tecnico}</dd>
              </div>
              <div>
                <dt>Entrega prevista</dt>
                <dd>{selecionado.prazo}</dd>
              </div>
              <div>
                <dt>Local na oficina</dt>
                <dd>{selecionado.local}</dd>
              </div>
              <div>
                <dt>Serviço</dt>
                <dd>{selecionado.servico}</dd>
              </div>
              <div>
                <dt>Valor do serviço</dt>
                <dd>{moeda(selecionado.valor)}</dd>
              </div>
            </dl>
            <div className="aviso-demo">
              <ClipboardList size={18} />
              <span>
                Etapa atual:{" "}
                {etapas.find((e) => e.id === selecionado.etapa)?.nome}. Dados de
                demonstração.
              </span>
            </div>
            <button
              className="botao-primario w-full mt-5"
              disabled={selecionado.etapa === "pronto"}
              onClick={() => {
                const novaEtapa =
                  selecionado.etapa === "recepcao"
                    ? "execucao"
                    : selecionado.etapa === "aguardando"
                      ? "execucao"
                      : "pronto";
                setVeiculos((lista) =>
                  lista.map((v) =>
                    v.id === selecionado.id
                      ? { ...v, etapa: novaEtapa, motivo: undefined }
                      : v,
                  ),
                );
                setSelecionado(null);
                setAviso("Etapa atualizada nesta demonstração.");
              }}
            >
              {selecionado.etapa === "pronto" ? (
                <Check size={18} />
              ) : (
                <ArrowDownLeft size={18} />
              )}{" "}
              {selecionado.etapa === "pronto"
                ? "Pronto para entregar"
                : selecionado.etapa === "aguardando"
                  ? "Retomar execução"
                  : "Avançar etapa"}
            </button>
          </>
        )}
      </Dialogo>
      {aviso && (
        <div className="toast" role="status">
          <span className="toast-check">
            <Check size={17} />
          </span>
          {aviso}
          <button
            onClick={() => setAviso("")}
            className="botao-icone"
            aria-label="Fechar aviso"
          >
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}
