import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Plus,
  Search,
  Star,
  Wrench,
  Package,
  Archive,
  RotateCcw,
  Pencil,
} from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { Dialogo } from "../components/Dialogo";
import { erroPublico } from "../lib/supabase";
import { filtrarCatalogo, type ItemCatalogo } from "../lib/catalogo";
import { listarCatalogo, salvarCatalogo } from "../services/catalogo";
import { dinheiro } from "../services/orcamentos";
import { atualizarIntegracoes } from "../lib/atualizarIntegracoes";
import "./Catalogo.css";
export function Catalogo() {
  const a = useAcesso(),
    oficina = a.oficina!.id,
    qc = useQueryClient();
  const [busca, setBusca] = useState(""),
    [tipo, setTipo] = useState("todos"),
    [situacao, setSituacao] = useState("ativos"),
    [favoritos, setFavoritos] = useState(false),
    [pagina, setPagina] = useState(0);
  const [edicao, setEdicao] = useState<{
      item: ItemCatalogo;
      novo: boolean;
    } | null>(null),
    [confirmar, setConfirmar] = useState<ItemCatalogo | null>(null),
    [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState("");
  const consulta = useQuery({
    queryKey: ["catalogo", a.demo, oficina],
    queryFn: () => listarCatalogo(a.demo, oficina),
    refetchOnWindowFocus: "always",
  });
  const itens = consulta.data ?? [],
    ativos = itens.filter((i) => !i.arquivado_em),
    filtrados = filtrarCatalogo(itens, busca, tipo, situacao, favoritos),
    paginaAtual = Math.min(
      pagina,
      Math.max(0, Math.ceil(filtrados.length / 24) - 1),
    );
  function novo() {
    setErro("");
    setEdicao({
      novo: true,
      item: {
        id: crypto.randomUUID(),
        tipo: tipo === "part" ? "part" : "service",
        descricao: "",
        unidade: tipo === "part" ? "un" : "serv",
        preco_padrao_centavos: 0,
        favorito: false,
        arquivado_em: null,
        revisao: 1,
      },
    });
  }
  async function executar(item: ItemCatalogo, novo = false) {
    setOcupado(true);
    setErro("");
    setAviso("");
    try {
      await salvarCatalogo(a.demo, oficina, item, novo);
      setEdicao(null);
      setConfirmar(null);
      await atualizarIntegracoes(qc);
      setAviso(
        "Catálogo atualizado. Os valores dos atendimentos anteriores foram preservados.",
      );
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      setOcupado(false);
    }
  }
  function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!edicao) return;
    const f = new FormData(e.currentTarget);
    void executar(
      {
        ...edicao.item,
        descricao: String(f.get("descricao")),
        tipo: String(f.get("tipo") ?? edicao.item.tipo) as ItemCatalogo["tipo"],
        unidade: String(f.get("unidade")),
        preco_padrao_centavos: Math.round(Number(f.get("preco")) * 100),
        favorito: f.get("favorito") === "on",
      },
      edicao.novo,
    );
  }
  return (
    <div className="catalogo-real">
      <div className="titulo-pagina">
        <div>
          <div className="sobretitulo">
            <span className="linha-verde" />
            SEU TRABALHO, PRONTO PARA ORÇAR
          </div>
          <h1>
            Peças e serviços<span>.</span>
          </h1>
          <p>Preços organizados. Seus favoritos sempre à mão.</p>
        </div>
        <button className="botao-primario" onClick={novo}>
          <Plus size={20} />
          Novo cadastro
        </button>
      </div>
      {a.demo && (
        <p className="aviso-cliente">
          Demonstração · Cadastros salvos neste navegador.
        </p>
      )}
      {aviso && (
        <p role="status" className="aviso-cliente">
          {aviso}
        </p>
      )}
      {!edicao && !confirmar && erro && (
        <p role="alert" className="erro-formulario">
          {erro}
        </p>
      )}
      <div className="catalogo-resumo">
        <div>
          <Wrench size={21} />
          <strong>{ativos.filter((i) => i.tipo === "service").length}</strong>
          <span>Serviços ativos</span>
        </div>
        <div>
          <Package size={21} />
          <strong>{ativos.filter((i) => i.tipo === "part").length}</strong>
          <span>Produtos ativos</span>
        </div>
        <div>
          <Star size={21} />
          <strong>{ativos.filter((i) => i.favorito).length}</strong>
          <span>Favoritos para agilizar</span>
        </div>
      </div>
      <section className="catalogo-painel" aria-label="Cadastros do catálogo">
        <div className="catalogo-filtros">
          <label className="catalogo-busca">
            <Search size={18} />
            <input
              aria-label="Buscar no catálogo"
              placeholder="Buscar peça ou serviço…"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina(0);
              }}
            />
          </label>
          <label>
            Mostrar
            <select
              value={tipo}
              onChange={(e) => {
                setTipo(e.target.value);
                setPagina(0);
              }}
            >
              <option value="todos">Peças e serviços</option>
              <option value="service">Serviços</option>
              <option value="part">Produtos / peças</option>
            </select>
          </label>
          <label>
            Situação
            <select
              value={situacao}
              onChange={(e) => {
                setSituacao(e.target.value);
                setPagina(0);
              }}
            >
              <option value="ativos">Ativos</option>
              <option value="arquivados">Arquivados</option>
            </select>
          </label>
          <button
            className={
              "botao-secundario " + (favoritos ? "catalogo-favorito" : "")
            }
            aria-pressed={favoritos}
            onClick={() => {
              setFavoritos(!favoritos);
              setPagina(0);
            }}
          >
            <Star size={17} fill={favoritos ? "currentColor" : "none"} />
            Só favoritos
          </button>
          <button
            className="botao-secundario"
            disabled={consulta.isFetching}
            onClick={() => void consulta.refetch()}
          >
            Atualizar
          </button>
        </div>
        {consulta.isPending ? (
          <p role="status">Carregando catálogo…</p>
        ) : consulta.isError ? (
          <p role="alert" className="erro-formulario">
            {erroPublico(consulta.error)} Use Atualizar para tentar novamente.
          </p>
        ) : (
          <>
            <p className="catalogo-contagem">
              {filtrados.length} cadastro(s) · Favoritos aparecem primeiro
            </p>
            {!filtrados.length && (
              <div className="estado-lista">
                <Package size={30} />
                <h2>
                  {itens.length
                    ? "Nenhum cadastro com estes filtros"
                    : "Vamos organizar seu catálogo?"}
                </h2>
                <p>
                  {itens.length
                    ? "Experimente outro nome ou altere os filtros."
                    : "Cadastre seus serviços e produtos para reutilizar descrição e preço."}
                </p>
                <button
                  className="botao-secundario"
                  onClick={() => {
                    setBusca("");
                    setTipo("todos");
                    setSituacao("ativos");
                    setFavoritos(false);
                    setPagina(0);
                  }}
                >
                  Limpar filtros
                </button>
              </div>
            )}
            <div className="catalogo-cards">
              {filtrados
                .slice(paginaAtual * 24, paginaAtual * 24 + 24)
                .map((i) => (
                  <article
                    key={i.id}
                    className={
                      "catalogo-card " +
                      (i.arquivado_em ? "catalogo-arquivado" : "")
                    }
                  >
                    <div className="catalogo-card-topo">
                      <span>
                        {i.tipo === "service" ? (
                          <Wrench size={18} />
                        ) : (
                          <Package size={18} />
                        )}{" "}
                        {i.tipo === "service" ? "Serviço" : "Produto / peça"}
                      </span>
                      <button
                        className={i.favorito ? "catalogo-favorito" : ""}
                        aria-label={`${i.favorito ? "Remover dos favoritos" : "Favoritar"} ${i.descricao}`}
                        aria-pressed={i.favorito}
                        disabled={ocupado || !!i.arquivado_em}
                        onClick={() =>
                          void executar({ ...i, favorito: !i.favorito })
                        }
                      >
                        <Star
                          size={21}
                          fill={i.favorito ? "currentColor" : "none"}
                        />
                      </button>
                    </div>
                    <h2>{i.descricao}</h2>
                    <div className="catalogo-preco">
                      <strong>{dinheiro(i.preco_padrao_centavos)}</strong>
                      <span>por {i.unidade}</span>
                    </div>
                    {i.arquivado_em && (
                      <p>Arquivado · preservado no histórico</p>
                    )}
                    <div className="catalogo-acoes">
                      <button
                        className="botao-secundario"
                        disabled={ocupado}
                        onClick={() => {
                          setErro("");
                          setEdicao({ item: i, novo: false });
                        }}
                      >
                        <Pencil size={15} />
                        Editar
                      </button>
                      <button
                        className="botao-secundario"
                        disabled={ocupado}
                        onClick={() => {
                          setErro("");
                          setConfirmar(i);
                        }}
                      >
                        {i.arquivado_em ? (
                          <RotateCcw size={15} />
                        ) : (
                          <Archive size={15} />
                        )}{" "}
                        {i.arquivado_em ? "Restaurar" : "Arquivar"}
                      </button>
                    </div>
                  </article>
                ))}
            </div>
            <div className="catalogo-paginacao">
              <span>
                Página {paginaAtual + 1} de{" "}
                {Math.max(1, Math.ceil(filtrados.length / 24))}
              </span>
              <button
                className="botao-secundario"
                disabled={paginaAtual === 0}
                onClick={() => setPagina(paginaAtual - 1)}
              >
                Anterior
              </button>
              <button
                className="botao-secundario"
                disabled={(paginaAtual + 1) * 24 >= filtrados.length}
                onClick={() => setPagina(paginaAtual + 1)}
              >
                Próxima
              </button>
            </div>
          </>
        )}
      </section>
      <p className="catalogo-nota">
        O preço do catálogo é uma sugestão para novos atendimentos. Alterações
        não recalculam orçamentos ou OS já registrados.{" "}
        {a.permite("inventory") && (
          <Link to="/estoque">
            Controlar quantidades e compras no estoque →
          </Link>
        )}
      </p>
      <Dialogo
        aberto={!!edicao}
        fechar={() => !ocupado && setEdicao(null)}
        titulo={edicao?.novo ? "Novo produto ou serviço" : "Editar cadastro"}
      >
        {edicao && (
          <form
            key={edicao.item.id}
            onSubmit={salvar}
            className="formulario-cliente"
          >
            {erro && (
              <p role="alert" className="erro-formulario">
                {erro}
              </p>
            )}
            <fieldset disabled={ocupado}>
              <label>
                Tipo
                <select
                  name="tipo"
                  defaultValue={edicao.item.tipo}
                  disabled={!edicao.novo}
                  onChange={(e) => {
                    const campo =
                      e.currentTarget.form?.elements.namedItem("unidade");
                    if (campo instanceof HTMLInputElement)
                      campo.value = e.target.value === "part" ? "un" : "serv";
                  }}
                >
                  <option value="service">Serviço</option>
                  <option value="part">Produto / peça</option>
                </select>
              </label>
              <label>
                Descrição
                <input
                  name="descricao"
                  defaultValue={edicao.item.descricao}
                  required
                  maxLength={300}
                  placeholder="Ex.: alinhamento da direção"
                />
              </label>
              <div className="dupla-campos">
                <label>
                  Preço de venda (R$)
                  <input
                    name="preco"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="1000000"
                    step="0.01"
                    required
                    defaultValue={(
                      edicao.item.preco_padrao_centavos / 100
                    ).toFixed(2)}
                  />
                </label>
                <label>
                  Unidade
                  <input
                    name="unidade"
                    defaultValue={edicao.item.unidade}
                    required
                    maxLength={15}
                    list="unidades-catalogo"
                  />
                  <datalist id="unidades-catalogo">
                    <option value="serv" />
                    <option value="un" />
                    <option value="h" />
                    <option value="L" />
                    <option value="kit" />
                  </datalist>
                </label>
              </div>
              <label className="catalogo-checkbox">
                <input
                  type="checkbox"
                  name="favorito"
                  defaultChecked={edicao.item.favorito}
                />
                Favorito — mostrar primeiro ao montar um orçamento
              </label>
              <p className="catalogo-nota">
                Produtos aparecem também no estoque. Saldo e custo são
                administrados por lá. Tipo e unidade de itens em uso são
                preservados.
              </p>
              <button className="botao-primario" disabled={ocupado}>
                {ocupado ? "Salvando…" : "Salvar cadastro"}
              </button>
            </fieldset>
          </form>
        )}
      </Dialogo>
      <Dialogo
        aberto={!!confirmar}
        fechar={() => !ocupado && setConfirmar(null)}
        titulo={
          confirmar?.arquivado_em ? "Restaurar cadastro" : "Arquivar cadastro"
        }
      >
        {confirmar && (
          <>
            <p>
              <strong>{confirmar.descricao}</strong>
            </p>
            <p>
              {confirmar.arquivado_em
                ? "O item voltará a aparecer para novos atendimentos."
                : "O item sai das próximas seleções. O histórico é preservado e você poderá restaurá-lo. Itens com saldo ou OS abertas vinculadas não podem ser arquivados."}
            </p>
            {erro && (
              <p role="alert" className="erro-formulario">
                {erro}
              </p>
            )}
            <button
              className="botao-primario"
              disabled={ocupado}
              onClick={() =>
                void executar({
                  ...confirmar,
                  arquivado_em: confirmar.arquivado_em
                    ? null
                    : new Date().toISOString(),
                })
              }
            >
              {ocupado ? "Salvando…" : "Confirmar"}
            </button>
          </>
        )}
      </Dialogo>
    </div>
  );
}
