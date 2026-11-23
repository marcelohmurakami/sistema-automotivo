import { AjudaContextual } from "../components/AjudaContextual";
import { useBuscaDebounced } from "../lib/useBuscaDebounced";
import { atualizarCadastro } from "../lib/atualizarCadastro";
import { dinheiro } from "../lib/formatacao";
import { interfaceRamo } from "../lib/interfaceRamo";
import { rpc } from "../lib/rpc";
import { SecaoRecolhivel } from "../components/SecaoRecolhivel";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";

import { listarEstoque } from "../services/estoque";
import { listarClientes } from "../services/clientes";
import { erroPublico } from "../lib/supabase";
import {
  type AdministracaoSite,
  type SiteOficina,
  situacoesPedido,
} from "../services/site";
import "./Documentos.css";
import "./MeuSite.css";
export function MeuSite() {
  const a = useAcesso();
  const q = useQuery({
    queryKey: ["site-admin", a.oficina!.id, a.demo],
    enabled: !a.demo && a.oficina?.perfil !== "staff",
    queryFn: ({ signal }) =>
      rpc<AdministracaoSite>("administrar_site", { p_oficina: a.oficina!.id }, signal),
  });
  return (
    <div className="documentos-pagina meu-site">
      <header className="titulo-pagina">
        <div>
          <div className="sobretitulo">SUA EMPRESA TAMBÉM ONLINE</div>
          <h1>
            Site e área do cliente<span>.</span>
          </h1>
          <p>Site, pedidos e acesso dos clientes.</p>
          <a
            className="botao-secundario"
            href={`/previa-site?ramo=${a.oficina?.ramo || "automotivo"}`}
            target="_blank"
            rel="noreferrer"
          >
            Ver exemplo do mini site
          </a>
        </div>
      </header>
      {a.oficina?.perfil === "staff" ? (
        <p>Somente o responsável pela empresa pode administrar o site.</p>
      ) : a.demo ? (
        <section className="os-painel">
          <h2>O endereço da sua empresa</h2>
          <p>
            Na conta real do Plano Completo você pode publicar seu site, disponibilizar
            produtos e liberar a área dos clientes.
          </p>
        </section>
      ) : q.isError ? (
        <p role="alert">{erroPublico(q.error)}</p>
      ) : q.data ? (
        <EditorSite dados={q.data} key={a.oficina!.id} />
      ) : (
        <p>Carregando…</p>
      )}
    </div>
  );
}
function EditorSite({ dados }: { dados: AdministracaoSite }) {
  const executando = useRef(false);
  const a = useAcesso(),
    cache = useQueryClient();
  const [site, setSite] = useState<SiteOficina>(
      dados.site || {
        identificador_url: "",
        titulo: a.oficina!.nome,
        descricao: "",
        publicado: false,
        portal_habilitado: false,
        pedidos_pecas_habilitados: false,
      },
    ),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [busy, setBusy] = useState(false),
    [busca, setBusca] = useState(""),
    [cliente, setCliente] = useState(""),
    [email, setEmail] = useState("");
  const [buscaPeca, setBuscaPeca] = useState("");
  const [paginaPeca, setPaginaPeca] = useState(0);
  const [produtosAbertos, setProdutosAbertos] = useState(false);
  const [clientesAbertos, setClientesAbertos] = useState(false);
  const produtosPorItem = useMemo(
    () => new Map(dados.produtos.map((p) => [p.item_catalogo_id, p])),
    [dados.produtos],
  );
  const termoConsulta1 = useBuscaDebounced(buscaPeca);
  const itens = useQuery({
    queryKey: ["estoque-site", a.oficina!.id, termoConsulta1, paginaPeca],
    enabled: produtosAbertos,
    queryFn: ({ signal }) =>
      listarEstoque(
        false,
        a.oficina!.id,
        termoConsulta1,
        "controlados",
        paginaPeca,
        signal,
      ),
  });
  const termoConsulta2 = useBuscaDebounced(busca);
  const clientes = useQuery({
    queryKey: ["clientes-site", a.oficina!.id, termoConsulta2],
    enabled: clientesAbertos,
    queryFn: ({ signal }) =>
      listarClientes(false, a.oficina!.id, termoConsulta2, false, 0, signal),
  });
  async function acao(nome: string, args: Record<string, unknown>) {
    if (executando.current) return;
    executando.current = true;
    setBusy(true);
    setErro("");
    setAviso("");
    try {
      await rpc(nome, { p_oficina: a.oficina!.id, ...args });
      await atualizarCadastro(cache, ["site-admin", a.oficina!.id, a.demo]);
      setAviso("Alteração salva.");
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      executando.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      {erro && <p role="alert">{erro}</p>}
      {aviso && <p role="status">{aviso}</p>}
      <section className="os-painel">
        <h2>Site da empresa</h2>
        <AjudaContextual titulo="Como configurar o site e o acesso dos clientes">
          <p>
            1. Personalize a apresentação e salve o site. 2. Habilite a área do cliente.
            3. Libere o e-mail confirmado de cada cliente abaixo.
          </p>
          <p>
            O logo e a cor são os mesmos cadastrados em Configurações. O cliente
            acompanha os serviços reais e vê somente as atualizações compartilhadas pela
            equipe.
          </p>
        </AjudaContextual>
        {dados.site?.publicado && (
          <div className="documentos-form">
            <label>
              Link para compartilhar com seus clientes
              <input
                readOnly
                value={`${window.location.origin}/oficina/${dados.site.identificador_url}#area-cliente`}
                onFocus={(e) => e.currentTarget.select()}
              />
            </label>
            <button
              className="botao-secundario"
              type="button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(
                    `${window.location.origin}/oficina/${dados.site!.identificador_url}#area-cliente`,
                  )
                  .then(() => setAviso("Link da área do cliente copiado."))
                  .catch(() => setErro("Selecione e copie o endereço no campo acima."));
              }}
            >
              Copiar link da área do cliente
            </button>
            {["localhost", "127.0.0.1"].includes(window.location.hostname) && (
              <p>
                Este endereço é local. Para os clientes acessarem de seus celulares, use
                o endereço do sistema após a publicação na internet.
              </p>
            )}
          </div>
        )}
      </section>
      <SecaoRecolhivel
        titulo="Apresentação"
        descricao="Textos do site e opções da área do cliente"
      >
        <form
          className="documentos-form"
          onSubmit={(e) => {
            e.preventDefault();
            void acao("configurar_site", { p_dados: site });
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Endereço do site
              <input
                required
                pattern="[a-z0-9][a-z0-9-]{2,60}[a-z0-9]"
                value={site.identificador_url}
                onChange={(e) =>
                  setSite({ ...site, identificador_url: e.target.value })
                }
                placeholder={interfaceRamo(a.oficina?.ramo).slug}
              />
            </label>
            <small>
              Use letras minúsculas, números e hífens, com 4 a 62 caracteres.
            </small>
            <label>
              Título
              <input
                required
                maxLength={120}
                value={site.titulo}
                onChange={(e) => setSite({ ...site, titulo: e.target.value })}
              />
            </label>
            <label>
              Sobre a {interfaceRamo(a.oficina?.ramo).empresa}
              <textarea
                maxLength={3000}
                value={site.descricao}
                onChange={(e) => setSite({ ...site, descricao: e.target.value })}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={site.publicado}
                onChange={(e) => setSite({ ...site, publicado: e.target.checked })}
              />
              Publicar site
            </label>
            <label>
              <input
                type="checkbox"
                checked={site.portal_habilitado}
                onChange={(e) =>
                  setSite({
                    ...site,
                    portal_habilitado: e.target.checked,
                    pedidos_pecas_habilitados:
                      e.target.checked && site.pedidos_pecas_habilitados,
                  })
                }
              />
              Habilitar área do cliente
            </label>
            <label>
              <input
                type="checkbox"
                disabled={!site.portal_habilitado}
                checked={site.pedidos_pecas_habilitados}
                onChange={(e) =>
                  setSite({
                    ...site,
                    pedidos_pecas_habilitados: e.target.checked,
                  })
                }
              />
              Permitir pedidos de produtos
            </label>
            <button className="botao-primario">Salvar site</button>
            {dados.site?.publicado && (
              <a
                className="botao-secundario"
                target="_blank"
                rel="noreferrer"
                href={`/oficina/${dados.site.identificador_url}`}
              >
                Abrir site publicado
              </a>
            )}
          </fieldset>
        </form>
      </SecaoRecolhivel>
      <SecaoRecolhivel
        titulo="Produtos exibidos no site"
        aoAlternar={setProdutosAbertos}
        descricao="Escolha os produtos que os clientes podem consultar"
      >
        <p>
          Escolha produtos cadastrados no estoque. Ao publicar ou atualizar, o site usa
          o preço de venda atual. Os pedidos dependem de confirmação da equipe.
        </p>
        <label className="site-busca">
          Buscar produto no estoque
          <input
            value={buscaPeca}
            placeholder="Nome ou código"
            onChange={(e) => {
              setBuscaPeca(e.target.value);
              setPaginaPeca(0);
            }}
          />
        </label>
        {itens.isError && <p role="alert">{erroPublico(itens.error)}</p>}
        {itens.isPending && <p role="status">Carregando produtos…</p>}
        {itens.data?.total === 0 && <p>Nenhum produto encontrado no estoque.</p>}
        {itens.data?.itens.map((i) => (
          <div className="site-linha" key={i.id}>
            <span>
              <strong>{i.descricao}</strong>
              <small>
                {i.codigo || "Sem código"} · Venda: {dinheiro(i.preco_padrao_centavos)}
              </small>
            </span>
            <div className="acoes-proposta">
              {produtosPorItem.get(i.id)?.visivel && (
                <button
                  className="botao-secundario"
                  disabled={busy}
                  onClick={() =>
                    void acao("publicar_produto_site", {
                      p_item: i.id,
                      p_visivel: true,
                    })
                  }
                >
                  Atualizar preço e descrição
                </button>
              )}
              <button
                className="botao-secundario"
                disabled={busy || !dados.site}
                onClick={() =>
                  void acao("publicar_produto_site", {
                    p_item: i.id,
                    p_visivel: !produtosPorItem.get(i.id)?.visivel,
                  })
                }
              >
                {produtosPorItem.get(i.id)?.visivel
                  ? "Ocultar do site"
                  : "Publicar produto"}
              </button>
            </div>
          </div>
        ))}
        {!!itens.data && itens.data.total > 24 && (
          <div className="acoes-proposta">
            <button
              className="botao-secundario"
              disabled={paginaPeca === 0}
              onClick={() => setPaginaPeca(paginaPeca - 1)}
            >
              Anterior
            </button>
            <span>
              Página {paginaPeca + 1} de {Math.ceil(itens.data.total / 24)}
            </span>
            <button
              className="botao-secundario"
              disabled={(paginaPeca + 1) * 24 >= itens.data.total}
              onClick={() => setPaginaPeca(paginaPeca + 1)}
            >
              Próxima
            </button>
          </div>
        )}
      </SecaoRecolhivel>
      <SecaoRecolhivel
        titulo="Acesso dos clientes"
        aoAlternar={setClientesAbertos}
        descricao="Libere e acompanhe o acesso de cada cliente"
      >
        <p>
          O cliente cria uma conta no site e confirma seu e-mail. Depois, confira a
          identidade dele e libere o acesso. O e-mail precisa ser o mesmo do cadastro.
        </p>
        {clientes.isError && <p role="alert">{erroPublico(clientes.error)}</p>}
        <form
          className="documentos-form"
          onSubmit={(e) => {
            e.preventDefault();
            void acao("definir_acesso_portal", {
              p_cliente: cliente,
              p_email: email,
              p_revogar: false,
            });
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Buscar cliente
              <input
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setCliente("");
                  setEmail("");
                }}
              />
            </label>
            <label>
              Cliente
              <select
                required
                value={cliente}
                onChange={(e) => {
                  setCliente(e.target.value);
                  setEmail(
                    clientes.data?.itens.find((c) => c.id === e.target.value)?.email ||
                      "",
                  );
                }}
              >
                <option value="">Selecione</option>
                {clientes.data?.itens.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              E-mail confirmado
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button className="botao-primario">
              Liberar acesso ao cliente selecionado
            </button>
          </fieldset>
        </form>
        {dados.acessos
          .filter((a) => !a.revogado_em)
          .map((c) => (
            <div className="site-linha" key={c.cliente_id + c.email}>
              <span>
                {c.nome} · {c.email}
              </span>
              <button
                disabled={busy}
                className="botao-secundario"
                onClick={() =>
                  void acao("definir_acesso_portal", {
                    p_cliente: c.cliente_id,
                    p_email: c.email,
                    p_revogar: true,
                  })
                }
              >
                Revogar acesso
              </button>
            </div>
          ))}
      </SecaoRecolhivel>
      <section className="os-painel">
        <h2>
          {!a.oficina?.ramo ||
          ["automotivo", "assistencia_tecnica"].includes(a.oficina.ramo)
            ? "Pedidos de peças"
            : "Pedidos de produtos"}
        </h2>
        <p>
          Solicitações para combinar com o cliente. Não cobram, não reservam estoque e
          não geram venda automaticamente.
        </p>
        {dados.pedidos.length === 0 && <p>Nenhum pedido recebido.</p>}
        {dados.pedidos.map((p) => (
          <article className="site-pedido" key={p.id}>
            <h3>{p.cliente}</h3>
            <p>{p.itens?.map((i) => `${i.quantidade} × ${i.descricao}`).join(" · ")}</p>
            <p>{p.observacoes}</p>
            <label>
              Situação
              <select
                aria-label={`Situação do pedido ${p.id}`}
                disabled={busy}
                value={p.situacao}
                onChange={(e) =>
                  void acao("atualizar_pedido_site", {
                    p_pedido: p.id,
                    p_situacao: e.target.value,
                  })
                }
              >
                {Object.entries(situacoesPedido).map(([k, v]) => (
                  <option key={k} value={k} disabled={k === "requested"}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </article>
        ))}
      </section>
    </>
  );
}
