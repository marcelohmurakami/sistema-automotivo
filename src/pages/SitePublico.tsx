import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import { rpc, dinheiro } from "../services/orcamentos";
import { supabase, erroPublico } from "../lib/supabase";
import { situacoesOS } from "../services/ordensServico";
import { situacoesPedido, type PedidoSite } from "../services/site";
import type { Identidade } from "../services/documentos";
import "./Documentos.css";
type Publico = {
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
  clientes: { id: string; nome: string }[];
  ordens: {
    id: string;
    numero: number;
    situacao: string;
    veiculo: { modelo: string; placa: string };
    entrega_prevista_em: string | null;
    resumo: string | null;
  }[];
  pedidos: PedidoSite[];
};
export function SitePublico() {
  const { slug } = useParams();
  const q = useQuery({
    queryKey: ["site-publico", slug],
    queryFn: () =>
      rpc<Publico | null>("consultar_site_publicado", {
        p_identificador_url: slug,
      }),
    retry: false,
  });
  return (
    <main className="site-publico">
      {q.isPending ? (
        <p>Carregando oficina…</p>
      ) : q.isError || !q.data ? (
        <section className="os-painel">
          <h1>Site indisponível</h1>
          <p>Confira o endereço ou fale com a oficina.</p>
        </section>
      ) : (
        <ConteudoSite site={q.data} />
      )}
    </main>
  );
}
function ConteudoSite({ site }: { site: Publico }) {
  const a = useAcesso();
  const [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [busy, setBusy] = useState(false),
    [cliente, setCliente] = useState(""),
    [produto, setProduto] = useState(""),
    [quantidade, setQuantidade] = useState(1),
    [obs, setObs] = useState("");
  const chave = useRef(crypto.randomUUID());
  const q = useQuery({
    queryKey: ["meu-portal", site.oficina_id, a.usuario],
    enabled: !!a.usuario && !a.demo && site.portal_habilitado,
    queryFn: () =>
      rpc<Portal>("consultar_meu_portal", { p_oficina: site.oficina_id }),
    refetchInterval: 30000,
    gcTime: 0,
  });
  return (
    <>
      <header
        className="site-capa"
        style={{ borderColor: site.identidade.cor || "#244336" }}
      >
        {site.identidade.logo && (
          <img src={site.identidade.logo} alt={site.titulo} />
        )}
        <span>SEU CARRO EM BOAS MÃOS</span>
        <h1>{site.titulo}</h1>
        <p>{site.descricao}</p>
        {site.telefone && /^\+[1-9]\d{7,14}$/.test(site.telefone) && (
          <a
            className="botao-primario"
            href={`https://wa.me/${site.telefone.slice(1)}`}
            target="_blank"
            rel="noreferrer"
          >
            Fale com a oficina
          </a>
        )}
      </header>
      <section>
        <h2>Peças disponíveis para consulta</h2>
        <div className="documentos-grade">
          {site.produtos.map((p) => (
            <article className="os-painel" key={p.id}>
              <h3>{p.titulo}</h3>
              <p>{p.descricao}</p>
              <strong>
                {p.preco_centavos == null
                  ? "Consulte a oficina"
                  : dinheiro(p.preco_centavos)}
              </strong>
              <p>Consulte aplicação e disponibilidade.</p>
            </article>
          ))}
        </div>
        {!site.produtos.length && (
          <p>Fale com a oficina para consultar peças e serviços.</p>
        )}
      </section>
      {site.portal_habilitado && (
        <section className="os-painel">
          <h2>Área do cliente</h2>
          {a.usuario && !a.demo ? (
            <>
              <p>
                Conectado como {a.email}{" "}
                <button
                  className="botao-secundario"
                  onClick={() => void a.sair()}
                >
                  Sair
                </button>
              </p>
              {q.isError ? (
                <p role="alert">{erroPublico(q.error)}</p>
              ) : !q.data ? (
                <p>Carregando seus atendimentos…</p>
              ) : (
                <>
                  {!q.data.clientes.length ? (
                    <p>
                      Sua conta está conectada. Peça à oficina para liberar seus
                      atendimentos para este e-mail.
                    </p>
                  ) : (
                    <>
                      <h3>Seus serviços</h3>
                      {q.data.ordens.map((o) => (
                        <article className="os-painel" key={o.id}>
                          <small>OS #{o.numero}</small>
                          <h3>
                            {o.veiculo.modelo} · {o.veiculo.placa}
                          </h3>
                          <strong>
                            {situacoesOS[o.situacao] || o.situacao}
                          </strong>
                          <p>
                            {o.resumo ||
                              "A oficina atualizará o acompanhamento por aqui."}
                          </p>
                          {o.entrega_prevista_em && (
                            <p>
                              Entrega prevista:{" "}
                              {new Date(o.entrega_prevista_em).toLocaleString(
                                "pt-BR",
                              )}
                            </p>
                          )}
                          <HistoricoCliente
                            oficina={site.oficina_id}
                            os={o.id}
                          />
                        </article>
                      ))}
                      {!q.data.ordens.length && (
                        <p>Nenhum serviço encontrado.</p>
                      )}
                      {site.pedidos_habilitados && (
                        <form
                          className="documentos-form"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            setBusy(true);
                            setErro("");
                            setAviso("");
                            try {
                              await rpc("solicitar_pecas", {
                                p_oficina: site.oficina_id,
                                p_cliente: cliente || q.data!.clientes[0].id,
                                p_chave: chave.current,
                                p_itens: [
                                  { product_id: produto, quantity: quantidade },
                                ],
                                p_observacoes: obs,
                              });
                              chave.current = crypto.randomUUID();
                              setAviso(
                                "Pedido recebido. A oficina combinará os detalhes com você.",
                              );
                              await q.refetch();
                            } catch (e) {
                              setErro(erroPublico(e));
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          <h3>Solicitar uma peça</h3>
                          <fieldset disabled={busy}>
                            <label>
                              Cliente
                              <select
                                value={cliente || q.data.clientes[0].id}
                                onChange={(e) => setCliente(e.target.value)}
                              >
                                {q.data.clientes.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.nome}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Peça
                              <select
                                required
                                value={produto}
                                onChange={(e) => {
                                  setProduto(e.target.value);
                                  chave.current = crypto.randomUUID();
                                }}
                              >
                                <option value="">Escolha uma peça</option>
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
                                min="1"
                                max="10000"
                                step="1"
                                value={quantidade}
                                onChange={(e) => {
                                  setQuantidade(Number(e.target.value));
                                  chave.current = crypto.randomUUID();
                                }}
                              />
                            </label>
                            <label>
                              Veículo e observações
                              <textarea
                                maxLength={2000}
                                value={obs}
                                onChange={(e) => {
                                  setObs(e.target.value);
                                  chave.current = crypto.randomUUID();
                                }}
                              />
                            </label>
                            <p>
                              É uma solicitação de atendimento, sem cobrança ou
                              reserva automática.
                            </p>
                            <button className="botao-primario">
                              Enviar pedido à oficina
                            </button>
                          </fieldset>
                          {erro && <p role="alert">{erro}</p>}
                          {aviso && <p role="status">{aviso}</p>}
                        </form>
                      )}
                      <h3>Seus pedidos</h3>
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
      <footer>{site.titulo} · Atendimento com Pátio</footer>
    </>
  );
}
function HistoricoCliente({ oficina, os }: { oficina: string; os: string }) {
  const a = useAcesso();
  const [aberto, setAberto] = useState(false);
  const q = useQuery({
    queryKey: ["historico-portal", a.usuario, oficina, os],
    enabled: aberto,
    queryFn: () =>
      rpc<
        {
          description?: string;
          descricao?: string;
          occurred_at?: string;
          ocorrido_em?: string;
        }[]
      >("consultar_meu_historico_os", {
        p_oficina: oficina,
        p_ordem_servico: os,
      }),
    gcTime: 0,
  });
  return (
    <div>
      <button className="botao-secundario" onClick={() => setAberto(!aberto)}>
        {aberto ? "Fechar histórico" : "Ver histórico"}
      </button>
      {aberto &&
        (q.isError ? (
          <p role="alert">Não foi possível consultar o histórico.</p>
        ) : q.data?.length ? (
          q.data.map((h, i) => <p key={i}>{h.descricao || h.description}</p>)
        ) : (
          <p>Sem atualizações compartilhadas.</p>
        ))}
    </div>
  );
}
function LoginCliente() {
  const a = useAcesso();
  const [novo, setNovo] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="documentos-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setErro("");
        setAviso("");
        try {
          const dados = {
            email: String(f.get("email")),
            password: String(f.get("senha")),
          };
          if (novo) {
            const { error } = await supabase!.auth.signUp({
              ...dados,
              options: { emailRedirectTo: window.location.href.split("#")[0] },
            });
            if (error) throw error;
            setAviso(
              "Confira seu e-mail para confirmar a conta. Depois, peça à oficina a liberação do acesso.",
            );
          } else {
            const { error } = await supabase!.auth.signInWithPassword(dados);
            if (error) throw new Error("Confira seu e-mail e senha.");
            a.usarContaReal();
          }
        } catch (e) {
          setErro(erroPublico(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        Entre para acompanhar seus veículos. O acesso aos atendimentos é
        liberado pela oficina.
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
            minLength={8}
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
          onClick={() => setNovo(!novo)}
        >
          {novo ? "Já tenho conta" : "Criar minha conta"}
        </button>
      </fieldset>
      {erro && <p role="alert">{erro}</p>}
      {aviso && <p role="status">{aviso}</p>}
    </form>
  );
}
