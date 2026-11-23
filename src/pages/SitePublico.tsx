import { novoId } from "../lib/uuid.ts";
import { rpc } from "../lib/rpc";
import { dinheiro } from "../lib/formatacao";
import { ManutencoesCliente } from "../components/ManutencoesCliente";
import { useRef, useState, type CSSProperties } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";

import { supabase, erroPublico } from "../lib/supabase";
import {
  CarFront,
  ArrowUpRight,
  ShieldCheck,
  Clock3,
  Wrench,
  RefreshCw,
  MonitorCog,
  Building2,
  Sparkles,
} from "lucide-react";
import { ServicosCliente, type ServicoCliente } from "../components/ServicosCliente";
import {
  AtendimentosCliente,
  type AtendimentoCliente,
} from "../components/AtendimentosCliente";
import { situacoesPedido, type PedidoSite } from "../services/site";
import type { Identidade } from "../services/documentos";
import { parametroRetorno } from "../lib/retornoPortal";
import "./Documentos.css";
import "./SitePublico.css";
type Publico = {
  ramo?: string;
  oficina_id: string;
  titulo: string;
  descricao: string;
  telefone: string | null;
  identidade: Identidade;
  portal_habilitado: boolean;
  pedidos_habilitados: boolean;
  produtos: {
    id: string;
    titulo: string;
    descricao: string;
    preco_centavos: number | null;
  }[];
};
type Portal = {
  atendimentos?: AtendimentoCliente[];
  clientes: { id: string; nome: string }[];
  ordens: ServicoCliente[];
  pedidos: PedidoSite[];
};
export function SitePublico() {
  const acesso = useAcesso();
  const { slug } = useParams();
  const q = useQuery({
    queryKey: ["site-publico", slug],
    queryFn: ({ signal }) =>
      rpc<Publico | null>(
        "consultar_site_publicado",
        {
          p_identificador_url: slug,
        },
        signal,
      ),
    retry: false,
    refetchInterval: 30000,
  });
  return (
    <main className="site-publico">
      {q.isPending ? (
        <p>Carregando site…</p>
      ) : q.isError || !q.data ? (
        <section className="os-painel">
          <h1>Site indisponível</h1>
          <p>
            {q.isError
              ? "Não foi possível carregar o site. Verifique sua conexão e tente novamente."
              : "Confira o endereço ou fale com a empresa."}
          </p>
          {q.isError && (
            <button
              className="botao-secundario"
              onClick={() => void q.refetch()}
              disabled={q.isFetching}
            >
              Tentar novamente
            </button>
          )}
        </section>
      ) : (
        <ConteudoSite
          site={q.data}
          key={`${q.data.oficina_id}:${acesso.usuario || "visitante"}:${acesso.demo}`}
        />
      )}
    </main>
  );
}
function ConteudoSite({ site, exemplo = false }: { site: Publico; exemplo?: boolean }) {
  const a = useAcesso();
  const automotivo = !site.ramo || site.ramo === "automotivo";
  const pecas = automotivo || site.ramo === "assistencia_tecnica";
  const visual =
    site.ramo === "assistencia_tecnica"
      ? {
          Icone: MonitorCog,
          titulo: "Seu equipamento bem cuidado.",
          cuidado: "Reparos com atenção",
          exemplo: "Reparo de equipamento",
        }
      : site.ramo === "manutencao_campo"
        ? {
            Icone: Building2,
            titulo: "Sua manutenção em dia.",
            cuidado: "Manutenção com planejamento",
            exemplo: "Visita de manutenção",
          }
        : site.ramo === "limpeza"
          ? {
              Icone: Sparkles,
              titulo: "Seu ambiente bem cuidado.",
              cuidado: "Limpeza em cada detalhe",
              exemplo: "Limpeza agendada",
            }
          : {
              Icone: CarFront,
              titulo: "Seu carro bem cuidado.",
              cuidado: "Cuidado com seu veículo",
              exemplo: "Ordem de serviço",
            };
  const [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [busy, setBusy] = useState(false),
    [cliente, setCliente] = useState(""),
    [produto, setProduto] = useState(""),
    [quantidade, setQuantidade] = useState(1),
    [obs, setObs] = useState("");
  const [erroSaida, setErroSaida] = useState("");
  const chave = useRef(novoId());
  const enviando = useRef(false);
  const q = useQuery({
    queryKey: ["meu-portal", site.oficina_id, a.usuario],
    enabled: !exemplo && !!a.usuario && !a.demo && site.portal_habilitado,
    queryFn: ({ signal }) =>
      rpc<Portal>("consultar_meu_portal", { p_oficina: site.oficina_id }, signal),
    refetchInterval: 30000,
    gcTime: 0,
  });
  return (
    <>
      <div
        className="mini-site"
        style={
          {
            "--marca-oficina": /^#[0-9a-f]{6}$/i.test(site.identidade.cor || "")
              ? site.identidade.cor
              : "#215a43",
          } as CSSProperties
        }
      >
        <nav className="mini-nav" aria-label="Navegação do site">
          <a href="#inicio" className="mini-marca">
            {site.identidade.logo ? (
              <img src={site.identidade.logo} alt="" />
            ) : (
              <span>
                <Wrench size={22} />
              </span>
            )}
            <strong>{site.titulo}</strong>
          </a>
          {site.portal_habilitado && (
            <a className="mini-link-cliente" href="#area-cliente">
              Área do cliente <ArrowUpRight size={17} />
            </a>
          )}
        </nav>
        <header className="mini-hero" id="inicio">
          <div>
            <span className="mini-eyebrow">CUIDADO EM CADA DETALHE</span>
            <h1>
              {visual.titulo}
              <br />
              <em>Você bem informado.</em>
            </h1>
            <p>
              {site.descricao ||
                site.titulo + ": fale com nossa equipe e acompanhe seu atendimento."}
            </p>
            <div className="mini-acoes">
              {site.portal_habilitado && (
                <a className="botao-primario" href="#area-cliente">
                  {automotivo ? "Acompanhar meu veículo" : "Acompanhar meu atendimento"}{" "}
                  <ArrowUpRight size={18} />
                </a>
              )}
              {site.telefone && /^\+[1-9]\d{7,14}$/.test(site.telefone) && (
                <a
                  className="botao-secundario"
                  href={"https://wa.me/" + site.telefone.slice(1)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Falar com a equipe
                </a>
              )}
            </div>
            <span className="mini-legenda">
              <ShieldCheck size={16} /> Atendimento próximo, do início à conclusão.
            </span>
          </div>
          <div className="mini-ilustracao" aria-hidden="true">
            <div className="mini-ilustracao-topo">
              <span>DO PEDIDO À CONCLUSÃO</span>
              <i />
            </div>
            <div className="mini-carro">
              <visual.Icone strokeWidth={1} />
            </div>
            <div className="mini-ilustracao-base">
              <span>
                <visual.Icone size={18} /> {visual.cuidado}
              </span>
              <span>
                <Clock3 size={18} /> Acompanhe cada etapa
              </span>
            </div>
          </div>
        </header>
        <div className="mini-beneficios">
          <div>
            <Wrench />
            <span>
              <strong>Contato direto com a equipe</strong>Converse com quem cuida do seu
              atendimento.
            </span>
          </div>
          <div>
            <Clock3 />
            <span>
              <strong>Andamento fácil de consultar</strong>Veja as atualizações
              compartilhadas.
            </span>
          </div>
          <div>
            <ShieldCheck />
            <span>
              <strong>Seu histórico em um só lugar</strong>Acesso individual aos seus
              serviços.
            </span>
          </div>
        </div>
        <section className="mini-catalogo">
          <span className="mini-eyebrow">FALE COM NOSSA EQUIPE</span>
          <h2>{automotivo ? "Peças e atendimento" : "Produtos e atendimento"}</h2>
          <div className="documentos-grade">
            {site.produtos.map((p) => (
              <article className="os-painel" key={p.id}>
                <h3>{p.titulo}</h3>
                <p>{p.descricao}</p>
                <strong>
                  {p.preco_centavos == null
                    ? "Consulte a equipe"
                    : dinheiro(p.preco_centavos)}
                </strong>
                <p>Consulte aplicação e disponibilidade.</p>
              </article>
            ))}
          </div>
          {!site.produtos.length && (
            <p>Fale com nossa equipe para consultar serviços e disponibilidade.</p>
          )}
        </section>
        {site.portal_habilitado && (
          <section className="mini-portal" id="area-cliente">
            <div className="mini-portal-titulo">
              <div>
                <span className="mini-eyebrow">SEU ATENDIMENTO, SEM MISTÉRIO</span>
                <h2>Área do cliente</h2>
                <p>Acompanhe os serviços e consulte seus atendimentos anteriores.</p>
              </div>
              <ShieldCheck size={32} />
            </div>
            {exemplo ? (
              <>
                <p className="portal-demo-aviso">
                  Prévia com dados fictícios. Nenhum atendimento real é exibido.
                </p>
                {automotivo ? (
                  <ServicosCliente
                    oficina="exemplo"
                    ordens={servicosExemplo}
                    demonstracao
                  />
                ) : (
                  <AtendimentosCliente
                    oficina="exemplo"
                    itens={[
                      {
                        id: "exemplo",
                        numero: 1042,
                        titulo: visual.exemplo,
                        situacao: "em_execucao",
                        data_servico: new Date().toLocaleDateString("sv-SE"),
                        concluido_em: null,
                        valor_centavos: 15000,
                        resumo:
                          "Atendimento em andamento. A equipe compartilhará as próximas atualizações por aqui.",
                        revisao: 1,
                        objeto:
                          site.ramo === "limpeza"
                            ? "Local do cliente"
                            : "Equipamento do cliente",
                        itens: [
                          {
                            descricao: visual.exemplo,
                            quantidade: 1,
                            unidade: "serv",
                            preco_centavos: 15000,
                          },
                        ],
                        desconto_centavos: 0,
                      },
                    ]}
                  />
                )}
              </>
            ) : a.usuario && !a.demo ? (
              <>
                <p>
                  Conectado como {a.email}{" "}
                  <button
                    className="botao-secundario"
                    onClick={() => {
                      void a.sair().catch((e) => setErroSaida(erroPublico(e)));
                    }}
                  >
                    Sair
                  </button>
                </p>
                {erroSaida && <p role="alert">{erroSaida}</p>}
                {q.isError ? (
                  <p role="alert">{erroPublico(q.error)}</p>
                ) : !q.data ? (
                  <p>Carregando seus atendimentos…</p>
                ) : (
                  <>
                    {!q.data.clientes.length ? (
                      <p>
                        Sua conta está conectada. Peça à equipe para liberar seus
                        atendimentos para este e-mail.
                      </p>
                    ) : (
                      <>
                        <div className="portal-atualizar">
                          <span>Atualização automática a cada 30 segundos.</span>
                          <button
                            className="botao-secundario"
                            disabled={q.isFetching}
                            onClick={() => void q.refetch()}
                          >
                            <RefreshCw size={15} />{" "}
                            {q.isFetching ? "Atualizando…" : "Atualizar"}
                          </button>
                        </div>
                        {site.ramo && site.ramo !== "automotivo" ? (
                          <AtendimentosCliente
                            oficina={site.oficina_id}
                            itens={q.data.atendimentos || []}
                          />
                        ) : (
                          <>
                            <ServicosCliente
                              oficina={site.oficina_id}
                              ordens={q.data.ordens}
                            />
                            <ManutencoesCliente oficina={site.oficina_id} />
                          </>
                        )}
                        {site.pedidos_habilitados && (
                          <form
                            className="documentos-form"
                            onSubmit={async (e) => {
                              e.preventDefault();
                              if (enviando.current) return;
                              enviando.current = true;
                              setBusy(true);
                              setErro("");
                              setAviso("");
                              try {
                                await rpc("solicitar_pecas", {
                                  p_oficina: site.oficina_id,
                                  p_cliente: cliente || q.data!.clientes[0].id,
                                  p_chave: chave.current,
                                  p_itens: [
                                    {
                                      product_id: produto,
                                      quantity: quantidade,
                                    },
                                  ],
                                  p_observacoes: obs,
                                });
                                chave.current = novoId();
                                setProduto("");
                                setQuantidade(1);
                                setObs("");
                                setAviso(
                                  "Pedido recebido. A equipe combinará os detalhes com você.",
                                );
                                await q.refetch();
                              } catch (e) {
                                setErro(erroPublico(e));
                              } finally {
                                enviando.current = false;
                                setBusy(false);
                              }
                            }}
                          >
                            <h3>
                              {pecas ? "Solicitar uma peça" : "Solicitar um produto"}
                            </h3>
                            <fieldset disabled={busy}>
                              <label>
                                Cliente
                                <select
                                  value={cliente || q.data.clientes[0].id}
                                  onChange={(e) => {
                                    setCliente(e.target.value);
                                    chave.current = novoId();
                                  }}
                                >
                                  {q.data.clientes.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.nome}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                {pecas ? "Peça" : "Produto"}
                                <select
                                  required
                                  value={produto}
                                  onChange={(e) => {
                                    setProduto(e.target.value);
                                    chave.current = novoId();
                                  }}
                                >
                                  <option value="">
                                    {pecas ? "Escolha uma peça" : "Escolha um produto"}
                                  </option>
                                  {site.produtos.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.titulo}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                Quantidade
                                <input
                                  required
                                  type="number"
                                  min="0.001"
                                  max="10000"
                                  step="0.001"
                                  value={quantidade}
                                  onChange={(e) => {
                                    setQuantidade(Number(e.target.value));
                                    chave.current = novoId();
                                  }}
                                />
                              </label>
                              <label>
                                {automotivo
                                  ? "Veículo e observações"
                                  : site.ramo === "limpeza"
                                    ? "Aplicação e observações"
                                    : "Equipamento / aplicação e observações"}
                                <textarea
                                  maxLength={2000}
                                  value={obs}
                                  onChange={(e) => {
                                    setObs(e.target.value);
                                    chave.current = novoId();
                                  }}
                                />
                              </label>
                              <p>
                                É uma solicitação de atendimento, sem cobrança ou
                                reserva automática.
                              </p>
                              <button className="botao-primario">Enviar pedido</button>
                            </fieldset>
                            {erro && <p role="alert">{erro}</p>}
                            {aviso && <p role="status">{aviso}</p>}
                          </form>
                        )}
                        <h3>Seus pedidos</h3>
                        {q.data.pedidos.length === 0 && <p>Nenhum pedido enviado.</p>}
                        {q.data.pedidos.map((p) => (
                          <article key={p.id}>
                            <strong>{situacoesPedido[p.situacao]}</strong>
                            <p>
                              {p.itens
                                ?.map((i) => `${i.quantidade} × ${i.descricao}`)
                                .join(" · ")}
                            </p>
                          </article>
                        ))}
                      </>
                    )}
                  </>
                )}
              </>
            ) : (
              <LoginCliente />
            )}
          </section>
        )}
        <footer>
          <strong>{site.titulo}</strong>
          <span>Atendimento com Pátio · Nossa equipe mais perto de você.</span>
        </footer>
      </div>
    </>
  );
}
function LoginCliente() {
  const a = useAcesso();
  const { pathname } = useLocation();
  const enviando = useRef(false);
  const [novo, setNovo] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="documentos-form portal-login"
      onSubmit={async (e) => {
        e.preventDefault();
        if (enviando.current || !supabase) return;
        enviando.current = true;
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setErro("");
        setAviso("");
        try {
          const dados = {
            email: String(f.get("email")).trim(),
            password: String(f.get("senha")),
          };
          if (novo) {
            const { data, error } = await supabase.auth.signUp({
              ...dados,
              options: { emailRedirectTo: window.location.href.split("#")[0] },
            });
            if (error) throw error;
            if (data.session) a.usarContaReal();
            setAviso(
              "Confira seu e-mail para confirmar a conta. Depois, peça à equipe a liberação do acesso.",
            );
          } else {
            const { error } = await supabase!.auth.signInWithPassword(dados);
            if (error)
              throw new Error(
                error.code === "email_not_confirmed"
                  ? "Confirme seu e-mail antes de entrar. Confira também a caixa de spam."
                  : error.code === "invalid_credentials"
                    ? "Confira seu e-mail e senha."
                    : "Não foi possível entrar agora. Verifique a conexão e tente novamente.",
              );
            a.usarContaReal();
          }
        } catch (e) {
          setErro(erroPublico(e));
        } finally {
          enviando.current = false;
          setBusy(false);
        }
      }}
    >
      <p>
        Entre para acompanhar seus serviços. O acesso aos atendimentos é liberado pela
        equipe.
      </p>
      <fieldset disabled={busy}>
        <label>
          E-mail
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Senha
          <input
            name="senha"
            type="password"
            minLength={novo ? 12 : undefined}
            maxLength={128}
            autoComplete={novo ? "new-password" : "current-password"}
            required
          />
        </label>
        <button className="botao-primario">
          {novo ? "Criar conta do cliente" : "Entrar na área do cliente"}
        </button>
        <button
          className="botao-secundario"
          type="button"
          onClick={() => {
            setNovo(!novo);
            setErro("");
            setAviso("");
          }}
        >
          {novo ? "Já tenho conta" : "Criar minha conta"}
        </button>
      </fieldset>
      {novo && <small>Use pelo menos 12 caracteres na senha.</small>}
      <Link to={"/recuperar-senha" + parametroRetorno(pathname)}>
        Esqueci minha senha
      </Link>
      {erro && <p role="alert">{erro}</p>}
      {aviso && <p role="status">{aviso}</p>}
    </form>
  );
}

const servicosExemplo: ServicoCliente[] = [
  {
    id: "exemplo-1",
    numero: 1042,
    situacao: "in_progress",
    veiculo: { modelo: "Volkswagen Polo", placa: "ABC1D23" },
    entrega_prevista_em: "2026-10-05T17:00:00-03:00",
    recebido_em: "2026-10-03T08:30:00-03:00",
    resumo:
      "Revisão em andamento. A equipe iniciou a troca de óleo e a conferência dos freios.",
  },
  {
    id: "exemplo-2",
    numero: 1038,
    situacao: "ready",
    veiculo: { modelo: "Chevrolet Onix", placa: "DEF4G56" },
    entrega_prevista_em: "2026-10-03T17:00:00-03:00",
    recebido_em: "2026-10-02T09:00:00-03:00",
    resumo:
      "Seu veículo passou pela conferência e está pronto. Fale com a oficina para combinar a retirada.",
  },
  {
    id: "exemplo-3",
    numero: 987,
    situacao: "delivered",
    veiculo: { modelo: "Volkswagen Polo", placa: "ABC1D23" },
    entrega_prevista_em: null,
    recebido_em: "2026-08-20T09:00:00-03:00",
    entregue_em: "2026-08-20T16:30:00-03:00",
    resumo: "Alinhamento e balanceamento concluídos. Veículo entregue ao cliente.",
  },
];
export function PreviaSite() {
  const [params] = useSearchParams();
  const ramo = params.get("ramo") || "automotivo";
  const nome =
    ramo === "assistencia_tecnica"
      ? "Assistência Horizonte"
      : ramo === "manutencao_campo"
        ? "Horizonte Manutenção"
        : ramo === "limpeza"
          ? "Horizonte Limpeza"
          : "Oficina Horizonte";
  return (
    <main className="site-publico">
      <ConteudoSite
        exemplo
        site={{
          ramo,
          oficina_id: "exemplo",
          titulo: nome,
          descricao:
            "Cuidado, atenção e transparência em cada atendimento. Acompanhe o andamento e consulte o histórico dos seus serviços sempre que precisar.",
          telefone: null,
          identidade: { nome: "Oficina Horizonte", cor: "#215a43" },
          portal_habilitado: true,
          pedidos_habilitados: false,
          produtos: [],
        }}
      />
    </main>
  );
}
