import { componenteSobDemanda } from "../lib/componenteSobDemanda";
const ImportarCadastros = componenteSobDemanda(async () => ({
  default: (await import("../components/ImportarCadastros")).ImportarCadastros,
}));
const TabelaPrecosServicos = componenteSobDemanda(async () => ({
  default: (await import("../components/catalogo/TabelaPrecosServicos"))
    .TabelaPrecosServicos,
}));
const FichaServico = componenteSobDemanda(async () => ({
  default: (await import("../components/catalogo/FichaServico")).FichaServico,
}));
const DetalhesServicoEditor = componenteSobDemanda(async () => ({
  default: (await import("../components/catalogo/FichaServico")).DetalhesServicoEditor,
}));
import { novoId } from "../lib/uuid.ts";
import { dinheiro } from "../lib/formatacao";
import { interfaceRamo } from "../lib/interfaceRamo";

import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Plus,
  Search,
  Star,
  Wrench,
  Archive,
  RotateCcw,
  Pencil,
  Printer,
} from "lucide-react";

import { useAcesso } from "../auth/contexto";
import { Dialogo } from "../components/Dialogo";

import { erroPublico } from "../lib/supabase";
import { type ItemCatalogo } from "../lib/catalogo";
import {
  paginaCatalogo,
  resumoCatalogo,
  salvarCatalogo,
  consultarFichaServico,
  type CursorCatalogo,
} from "../services/catalogo";
import { useBuscaDebounced } from "../lib/useBuscaDebounced";
import { usePaginacaoCursor } from "../lib/usePaginacaoCursor";

import { atualizarIntegracoes } from "../lib/atualizarIntegracoes";
import "./Catalogo.css";
export function Catalogo() {
  const a = useAcesso(),
    oficina = a.oficina!.id,
    qc = useQueryClient();
  const [busca, setBusca] = useState(""),
    [situacao, setSituacao] = useState("ativos"),
    [favoritos, setFavoritos] = useState(false);
  const [tabelaPrecos, setTabelaPrecos] = useState(false);
  const trava = useRef(false);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const termo = useBuscaDebounced(busca);
  const navegacao = usePaginacaoCursor<CursorCatalogo>(
    JSON.stringify([oficina, termo, situacao, favoritos]),
  );
  const setPagina = () => navegacao.reiniciar();
  const [edicao, setEdicao] = useState<{
      item: ItemCatalogo;
      novo: boolean;
    } | null>(null),
    [confirmar, setConfirmar] = useState<ItemCatalogo | null>(null),
    [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState("");
  const consulta = useQuery({
    queryKey: [
      "catalogo",
      a.demo,
      oficina,
      "pagina",
      termo,
      situacao,
      favoritos,
      navegacao.cursor,
    ],
    queryFn: ({ signal }) =>
      paginaCatalogo(
        a.demo,
        oficina,
        termo,
        situacao,
        favoritos,
        navegacao.cursor,
        signal,
      ),
  });
  const resumo = useQuery({
    queryKey: ["catalogo", a.demo, oficina, "resumo"],
    queryFn: ({ signal }) => resumoCatalogo(a.demo, oficina, signal),
    staleTime: 60_000,
  });
  const filtrados = consulta.data?.itens || [],
    paginaAtual = navegacao.pagina;
  function novo() {
    if (trava.current) return;
    setErro("");
    setEdicao({
      novo: true,
      item: {
        id: novoId(),
        tipo: "service",
        descricao: "",
        unidade: "serv",
        preco_padrao_centavos: 0,
        favorito: false,
        arquivado_em: null,
        revisao: 1,
        ficha: { notas: "", duracao_minutos: null, custos: [] },
      },
    });
  }
  async function editar(item: ItemCatalogo) {
    if (trava.current) return;
    trava.current = true;
    setErro("");
    setOcupado(true);
    try {
      const completo = item.ficha
        ? item
        : await qc.fetchQuery({
            queryKey: ["catalogo", a.demo, oficina, "ficha", item.id],
            queryFn: ({ signal }) =>
              consultarFichaServico(a.demo, oficina, item.id, signal),
          });
      setDetalhe(null);
      setEdicao({ item: completo, novo: false });
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  async function executar(item: ItemCatalogo, novo = false) {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    setAviso("");
    try {
      await salvarCatalogo(a.demo, oficina, item, novo);
      await qc.cancelQueries({ queryKey: ["catalogo", a.demo, oficina] });
      navegacao.reiniciar();
      setEdicao(null);
      setConfirmar(null);
      void atualizarIntegracoes(qc, ["catalogo"]).catch(() => {});
      setAviso(
        "Catálogo atualizado. Os valores dos atendimentos anteriores foram preservados.",
      );
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
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
        tipo: "service",
        unidade: String(f.get("unidade")),
        preco_padrao_centavos: Math.round(Number(f.get("preco")) * 100),
        favorito: f.get("favorito") === "on",
        ...(f.has("custo")
          ? {
              custo_centavos:
                f.get("custo") === "" ? null : Math.round(Number(f.get("custo")) * 100),
            }
          : {}),
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
            Serviços<span>.</span>
          </h1>
          <p>Preços organizados. Seus favoritos sempre à mão.</p>
        </div>
        <div className="acoes-titulo">
          <button className="botao-secundario" onClick={() => setTabelaPrecos(true)}>
            <Printer size={18} />
            Imprimir tabela de preços
          </button>
          <ImportarCadastros tipo="catalogo" somenteServicos />
          <button className="botao-primario" onClick={novo}>
            <Plus size={20} />
            Novo serviço
          </button>
        </div>
      </div>
      {tabelaPrecos && (
        <TabelaPrecosServicos
          key={`${a.demo}:${oficina}`}
          fechar={() => setTabelaPrecos(false)}
        />
      )}
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
          <strong>{resumo.data?.ativos ?? "—"}</strong>
          <span>Serviços ativos</span>
        </div>

        <div>
          <Star size={21} />
          <strong>{resumo.data?.favoritos ?? "—"}</strong>
          <span>Favoritos</span>
        </div>
      </div>
      <section className="catalogo-painel" aria-label="Cadastros do catálogo">
        <div className="catalogo-filtros">
          <label className="catalogo-busca">
            <Search size={18} />
            <input
              aria-label="Buscar no catálogo"
              placeholder="Buscar serviço…"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina();
              }}
            />
          </label>

          <label>
            Situação
            <select
              value={situacao}
              onChange={(e) => {
                setSituacao(e.target.value);
                setPagina();
              }}
            >
              <option value="ativos">Ativos</option>
              <option value="arquivados">Arquivados</option>
            </select>
          </label>
          <button
            className={"botao-secundario " + (favoritos ? "catalogo-favorito" : "")}
            aria-pressed={favoritos}
            onClick={() => {
              setFavoritos(!favoritos);
              setPagina();
            }}
          >
            <Star size={17} fill={favoritos ? "currentColor" : "none"} />
            Só favoritos
          </button>
          <button
            className="botao-secundario"
            disabled={consulta.isFetching}
            onClick={() => {
              void consulta.refetch();
              void resumo.refetch();
            }}
          >
            Atualizar
          </button>
        </div>
        {consulta.isFetching && !consulta.isPending && (
          <p role="status">Atualizando serviços…</p>
        )}
        {consulta.isPending ? (
          <p role="status">Carregando catálogo…</p>
        ) : consulta.isError ? (
          <p role="alert" className="erro-formulario">
            {erroPublico(consulta.error)} Use Atualizar para tentar novamente.
          </p>
        ) : (
          <>
            <p className="catalogo-contagem">
              {filtrados.length} cadastro(s) nesta página · Favoritos aparecem primeiro
            </p>
            {!filtrados.length && (
              <div className="estado-lista">
                <Wrench size={30} />
                <h2>
                  {resumo.data?.ativos
                    ? "Nenhum cadastro com estes filtros"
                    : "Vamos organizar seu catálogo?"}
                </h2>
                <p>
                  {resumo.data?.ativos
                    ? "Experimente outro nome ou altere os filtros."
                    : "Cadastre seus serviços para reutilizar descrição e preço."}
                </p>
                <button
                  className="botao-secundario"
                  onClick={() => {
                    setBusca("");
                    setSituacao("ativos");
                    setFavoritos(false);
                    setPagina();
                  }}
                >
                  Limpar filtros
                </button>
              </div>
            )}
            <div className="catalogo-cards">
              {filtrados.map((i) => (
                <article
                  key={i.id}
                  onClick={(e) => {
                    if (
                      consulta.isFetching ||
                      ocupado ||
                      !(e.target instanceof Element) ||
                      e.target.closest("button,a,input,select")
                    )
                      return;
                    setDetalhe(i.id);
                  }}
                  className={
                    "catalogo-card " + (i.arquivado_em ? "catalogo-arquivado" : "")
                  }
                >
                  <div className="catalogo-card-topo">
                    <button
                      className={i.favorito ? "catalogo-favorito" : ""}
                      aria-label={`${i.favorito ? "Remover dos favoritos" : "Favoritar"} ${i.descricao}`}
                      aria-pressed={i.favorito}
                      disabled={ocupado || consulta.isFetching || !!i.arquivado_em}
                      onClick={() => void executar({ ...i, favorito: !i.favorito })}
                    >
                      <Star size={21} fill={i.favorito ? "currentColor" : "none"} />
                    </button>
                  </div>
                  <h2>
                    <button
                      className="catalogo-abrir-ficha"
                      disabled={ocupado || consulta.isFetching}
                      onClick={() => setDetalhe(i.id)}
                    >
                      {i.descricao}
                      <small>Ver detalhes →</small>
                    </button>
                  </h2>
                  <div className="catalogo-preco">
                    <strong>{dinheiro(i.preco_padrao_centavos)}</strong>
                    <span>por {i.unidade}</span>
                  </div>
                  {i.arquivado_em && <p>Arquivado · preservado no histórico</p>}
                  <div className="catalogo-acoes">
                    <button
                      className="botao-secundario"
                      disabled={ocupado || consulta.isFetching}
                      onClick={() => void editar(i)}
                    >
                      <Pencil size={15} />
                      Editar
                    </button>
                    <button
                      className="botao-secundario"
                      disabled={ocupado || consulta.isFetching}
                      onClick={() => {
                        setErro("");
                        setConfirmar(i);
                      }}
                    >
                      {i.arquivado_em ? <RotateCcw size={15} /> : <Archive size={15} />}{" "}
                      {i.arquivado_em ? "Restaurar" : "Arquivar"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <div className="catalogo-paginacao">
              <span>Página {paginaAtual + 1}</span>
              <button
                className="botao-secundario"
                disabled={paginaAtual === 0}
                onClick={navegacao.anterior}
              >
                Anterior
              </button>
              <button
                className="botao-secundario"
                disabled={!consulta.data?.proximo}
                onClick={() =>
                  consulta.data?.proximo && navegacao.proxima(consulta.data.proximo)
                }
              >
                Próxima
              </button>
            </div>
          </>
        )}
      </section>
      <p className="catalogo-nota">
        O preço do catálogo é uma sugestão para novos atendimentos. Alterações não
        recalculam orçamentos ou OS já registrados.{" "}
        {a.permite("inventory") && (
          <Link to="/estoque">Controlar quantidades e compras no estoque →</Link>
        )}
      </p>
      {detalhe && (
        <FichaServico
          id={detalhe}
          fechar={() => setDetalhe(null)}
          editar={(i) => void editar(i)}
        />
      )}
      <Dialogo
        aberto={!!edicao}
        fechar={() => !ocupado && setEdicao(null)}
        titulo={edicao?.novo ? "Novo serviço" : "Editar serviço"}
      >
        {edicao && (
          <form key={edicao.item.id} onSubmit={salvar} className="formulario-cliente">
            {erro && (
              <p role="alert" className="erro-formulario">
                {erro}
              </p>
            )}
            <fieldset disabled={ocupado}>
              <label>
                Descrição
                <input
                  name="descricao"
                  autoFocus
                  defaultValue={edicao.item.descricao}
                  required
                  maxLength={300}
                  placeholder={`Ex.: ${interfaceRamo(a.oficina?.ramo, a.oficina?.especialidade).exemploServico}`}
                />
              </label>
              <div className="dupla-campos">
                <label>
                  Preço de venda (R$)
                  <input
                    name="preco"
                    onFocus={(e) => e.currentTarget.select()}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="1000000"
                    step="0.01"
                    required
                    defaultValue={(edicao.item.preco_padrao_centavos / 100).toFixed(2)}
                    onChange={(e) =>
                      setEdicao({
                        ...edicao,
                        item: {
                          ...edicao.item,
                          preco_padrao_centavos:
                            Math.round(e.target.valueAsNumber * 100) || 0,
                        },
                      })
                    }
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
                A unidade de serviços em uso é preservada.
              </p>
              <DetalhesServicoEditor
                item={edicao.item}
                alterar={(item) => setEdicao({ ...edicao, item })}
                podeCustos={a.oficina?.perfil !== "staff"}
              />
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
        titulo={confirmar?.arquivado_em ? "Restaurar cadastro" : "Arquivar cadastro"}
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
