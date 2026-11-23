import { novoId } from "../lib/uuid.ts";
import { dinheiro } from "../lib/formatacao";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Plus, Search, Star, RotateCcw, Check } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { CadastroServicoRapido } from "./CadastroServicoRapido";
import { CustoMargemItem } from "./CustoMargemItem";
import { ListaItensOS } from "./ListaItensOS";
import { CampoDesconto, type PreferenciaDescontoNota } from "./CampoDesconto";
import type { ControleDesconto } from "../lib/useDesconto";
import { QUANTIDADE_MAXIMA_ITEM, quantidadeItemValida } from "../lib/quantidadeItem";
import { type Auxiliares } from "../services/orcamentos";
import type { OrdemServico } from "../services/ordensServico";
import { useCatalogoBusca } from "../lib/useCatalogoBusca";
import { erroPublico } from "../lib/supabase";
import "./EditorItensOS.css";
import { interfaceRamo, vocabularioEstoque } from "../lib/interfaceRamo";
import { especialidades } from "../lib/especialidades";
export type ItemEditorOS = OrdemServico["itens"][number];

export function EditorItensOS({
  itens,
  contexto = "OS",
  detalhesItem,
  rodape,
  alterar,
  catalogo,
  desconto,
  nota,
  anterior,
  aoProcessar,
  aoEditarItem,
  vincularEstoque = true,
  especialidade,
  somenteLocal = false,
}: {
  contexto?: "OS" | "orçamento";
  detalhesItem?: (item: ItemEditorOS, indice: number) => ReactNode;
  rodape?: ReactNode;
  itens: ItemEditorOS[];
  alterar: (itens: ItemEditorOS[]) => void;
  catalogo: Auxiliares["catalogo"];
  desconto: ControleDesconto;
  nota?: PreferenciaDescontoNota;
  anterior?: OrdemServico;
  aoProcessar: (ocupado: boolean) => void;
  aoEditarItem: (editando: boolean) => void;
  vincularEstoque?: boolean;
  especialidade?: string;
  somenteLocal?: boolean;
}) {
  const acesso = useAcesso();
  const ramo = especialidades[especialidade || ""]?.ramo || acesso.oficina?.ramo;
  const linguagem = interfaceRamo(ramo, especialidade || acesso.oficina?.especialidade);
  const estoque = vocabularioEstoque(ramo);
  const nomeItem = estoque.singular[0].toUpperCase() + estoque.singular.slice(1);
  const tituloItens =
    ramo === "automotivo" || ramo === "assistencia_tecnica"
      ? "Peças e serviços"
      : `Serviços e ${estoque.plural}`;
  const itemAvulso = `Serviço ou ${estoque.singular} avuls${estoque.singular === "peça" ? "a" : "o"}`;
  const [busca, setBusca] = useState("");
  const [indiceBusca, setIndiceBusca] = useState(-1);
  const retomarBusca = useRef(false);
  const listaBusca = useRef<HTMLDivElement>(null);
  const consultaCatalogo = useCatalogoBusca(busca, "", !somenteLocal);
  const buscaRef = useRef<HTMLInputElement>(null);
  const [adicionado, setAdicionado] = useState("");
  const [removidos, setRemovidos] = useState<ItemEditorOS[]>([]);
  const [rascunho, setRascunho] = useState<ItemEditorOS | null>(null);
  const [editando, setEditando] = useState(false);
  const [erroItem, setErroItem] = useState("");
  const painel = useRef<HTMLDivElement>(null);
  const painelId = useId();
  useEffect(() => {
    if (!rascunho && retomarBusca.current) {
      retomarBusca.current = false;
      buscaRef.current?.focus();
    }
  }, [rascunho]);
  useEffect(() => {
    if (indiceBusca >= 0)
      listaBusca.current?.children[indiceBusca]?.scrollIntoView({ block: "nearest" });
  }, [indiceBusca]);
  const subtotal = useMemo(
    () =>
      itens.reduce(
        (s, i) => s + (Math.round(i.quantidade * i.preco_unitario_centavos) || 0),
        0,
      ),
    [itens],
  );
  const limite = itens.length >= 100;
  const normalizar = (texto: string) =>
    texto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const encontrados = useMemo(() => {
    const local = acesso.demo || somenteLocal;
    const origem = local
      ? catalogo
      : consultaCatalogo.aguardando
        ? []
        : consultaCatalogo.data || [];
    const pesquisando = !!busca.trim();
    const termo = normalizar(busca);
    const resultado: Auxiliares["catalogo"] = [];
    for (const item of origem) {
      if (
        pesquisando
          ? !local || normalizar(item.descricao).includes(termo)
          : item.favorito
      ) {
        resultado.push(item);
        if (resultado.length === (pesquisando ? 8 : 6)) break;
      }
    }
    return resultado;
  }, [
    acesso.demo,
    somenteLocal,
    catalogo,
    consultaCatalogo.aguardando,
    consultaCatalogo.data,
    busca,
  ]);
  function novoItem(c?: Auxiliares["catalogo"][number]): ItemEditorOS {
    return {
      id: novoId(),
      descricao: c?.descricao ?? busca.trim(),
      tipo: c?.tipo ?? "service",
      unidade: c?.unidade ?? "serv",
      item_catalogo_id: acesso.demo ? null : (c?.id ?? null),
      ...(c ? { custo_unitario_previsto_centavos: c.custo_centavos ?? null } : {}),
      ...(vincularEstoque && c?.tipo === "part" && c.produto_estoque_id
        ? { produto_estoque_id: c.produto_estoque_id, origem_peca: "estoque" }
        : {}),
      quantidade: 1,
      preco_unitario_centavos: c?.preco_padrao_centavos ?? Number.NaN,
      situacao: "pending",
    };
  }
  function adicionar(c: Auxiliares["catalogo"][number]) {
    if (limite || rascunho) return;
    if (Number.isFinite(c.preco_padrao_centavos) && c.preco_padrao_centavos > 0) {
      alterar([...itens, novoItem(c)]);
      setBusca("");
      setIndiceBusca(-1);
      setAdicionado(c.descricao);
      buscaRef.current?.focus();
      return;
    }
    setRascunho(novoItem(c));
    setEditando(false);
    setErroItem("");
    aoEditarItem(true);
    setBusca("");
  }
  function abrirItem(item?: ItemEditorOS) {
    setRascunho(item ? { ...item } : novoItem());
    setEditando(!!item);
    setErroItem("");
    aoEditarItem(true);
  }
  function fecharItem() {
    retomarBusca.current = true;
    setIndiceBusca(-1);
    setRascunho(null);
    setErroItem("");
    aoEditarItem(false);
  }
  function confirmarItem() {
    if (!rascunho || (!editando && limite)) return;
    const campos = painel.current?.querySelectorAll<HTMLInputElement>("input");
    for (const campo of campos ?? []) {
      if (!campo.reportValidity()) return;
    }
    if (!rascunho.descricao.trim()) {
      setErroItem(`Informe o nome do serviço ou ${estoque.doItem}.`);
      return;
    }
    if (!quantidadeItemValida(rascunho.quantidade)) {
      setErroItem("Informe uma quantidade inteira entre 1 e 100.000.");
      return;
    }
    const item = { ...rascunho, descricao: rascunho.descricao.trim() };
    alterar(
      editando ? itens.map((i) => (i.id === item.id ? item : i)) : [...itens, item],
    );
    setBusca("");
    fecharItem();
  }
  const editarAdicionado = useCallback(
    (item: ItemEditorOS) => {
      setRascunho({ ...item });
      setEditando(true);
      setErroItem("");
      aoEditarItem(true);
    },
    [aoEditarItem],
  );
  const removerAdicionado = useCallback(
    (item: ItemEditorOS) => {
      setRemovidos((anteriores) => [...anteriores, item]);
      alterar(itens.filter((i) => i.id !== item.id));
    },
    [itens, alterar],
  );
  const alterarQuantidade = useCallback(
    (id: string, quantidade: number) => {
      alterar(itens.map((item) => (item.id === id ? { ...item, quantidade } : item)));
    },
    [itens, alterar],
  );
  const tipoBloqueado =
    !!rascunho &&
    (!!rascunho.item_catalogo_id ||
      !!anterior?.itens.some((i) => i.id === rascunho.id));
  if (anterior?.orcamento_aguardando_id)
    return (
      <section className="os-editor-itens">
        <h3>{tituloItens}</h3>
        <p className="texto-suave">
          Autorize o orçamento vinculado na OS para liberar a edição dos serviços.
        </p>
        {rodape && <div className="os-editor-complemento">{rodape}</div>}
      </section>
    );
  return (
    <section className="os-editor-itens" aria-label={`${tituloItens}: ${contexto}`}>
      <div className="os-editor-itens-topo">
        <div>
          <h3>{tituloItens}</h3>
        </div>
        <span>
          {itens.length} {itens.length === 1 ? "item" : "itens"}
        </span>
      </div>
      {(somenteLocal || acesso.permite("catalog")) && (
        <>
          <label className="os-editor-busca">
            Buscar no catálogo
            <div>
              <Search size={17} />
              <input
                ref={buscaRef}
                value={busca}
                aria-controls={`${painelId}-busca`}
                aria-description="Use as setas para escolher um resultado e Enter para adicionar."
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    setIndiceBusca((i) =>
                      Math.max(
                        0,
                        Math.min(
                          encontrados.length - 1,
                          i + (e.key === "ArrowDown" ? 1 : -1),
                        ),
                      ),
                    );
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    if (
                      !e.repeat &&
                      !rascunho &&
                      (indiceBusca >= 0 || (busca.trim() && encontrados.length === 1))
                    )
                      if (encontrados[indiceBusca >= 0 ? indiceBusca : 0])
                        adicionar(encontrados[indiceBusca >= 0 ? indiceBusca : 0]);
                  }
                }}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setIndiceBusca(-1);
                }}
                placeholder={`Digite o serviço ou ${estoque.singular === "peça" ? "a" : "o"} ${estoque.singular}…`}
                aria-label={`Buscar serviço ou ${estoque.singular}: ${contexto}`}
                disabled={!!rascunho}
              />
            </div>
          </label>
          {!somenteLocal && consultaCatalogo.aguardando && (
            <p role="status">Buscando…</p>
          )}
          {!somenteLocal && consultaCatalogo.isError && (
            <p role="alert">{erroPublico(consultaCatalogo.error)}</p>
          )}
          {!!encontrados.length && !rascunho && (
            <div
              className="os-editor-catalogo"
              ref={listaBusca}
              id={`${painelId}-busca`}
            >
              {encontrados.map((c, indice) => (
                <button
                  type="button"
                  key={c.id}
                  id={`${painelId}-opcao-${indice}`}
                  className={indiceBusca === indice ? "os-catalogo-ativo" : undefined}
                  aria-current={indiceBusca === indice ? true : undefined}
                  aria-label={
                    "Adicionar " +
                    c.descricao +
                    " por " +
                    dinheiro(c.preco_padrao_centavos)
                  }
                  disabled={limite}
                  onClick={(e) => {
                    if (e.detail < 2) adicionar(c);
                  }}
                >
                  <Plus size={16} />
                  <span>
                    {c.favorito && <Star size={12} />} {c.descricao}
                    <small>
                      {dinheiro(c.preco_padrao_centavos)} ·{" "}
                      {c.tipo === "service" ? "Serviço" : nomeItem}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          )}
          {busca.trim() &&
            !rascunho &&
            !encontrados.length &&
            !consultaCatalogo.aguardando &&
            !consultaCatalogo.isError && (
              <p className="texto-suave">
                Nenhum cadastro encontrado. Você pode incluir um serviço avulso.
              </p>
            )}
        </>
      )}
      {adicionado && (
        <p className="os-item-incluido" role="status">
          <Check size={14} />
          {adicionado} incluído.
        </p>
      )}
      <div className="os-editor-atalhos">
        <button
          type="button"
          className="botao-secundario"
          disabled={limite || !!rascunho}
          aria-expanded={!!rascunho && !editando}
          aria-controls={painelId}
          onClick={() => abrirItem()}
        >
          <Plus size={17} /> {itemAvulso}
        </button>
        {rascunho && (
          <div
            ref={painel}
            id={painelId}
            className="os-editor-painel"
            role="group"
            aria-label={editando ? `Editar item: ${contexto}` : "Novo item avulso"}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.repeat) return;
              if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
                e.preventDefault();
                e.stopPropagation();
                confirmarItem();
              }
            }}
          >
            <strong>
              {editando ? "Editar item" : `Novo serviço ou ${estoque.singular}`}
            </strong>
            <label>
              Nome do serviço ou {estoque.singular}
              <input
                autoFocus
                value={rascunho.descricao}
                maxLength={300}
                required
                placeholder={`Ex.: ${linguagem.exemploServico}`}
                onChange={(e) =>
                  setRascunho({ ...rascunho, descricao: e.target.value })
                }
              />
            </label>
            <div className="os-editor-campos">
              <label>
                Tipo
                <select
                  value={rascunho.tipo}
                  disabled={tipoBloqueado}
                  onChange={(e) =>
                    setRascunho({
                      ...rascunho,
                      tipo: e.target.value as ItemEditorOS["tipo"],
                      unidade: e.target.value === "service" ? "serv" : "un",
                    })
                  }
                >
                  <option value="service">Serviço</option>
                  <option value="part">{nomeItem}</option>
                </select>
              </label>
              <label>
                Quantidade
                <input
                  type="number"
                  min={1}
                  max={QUANTIDADE_MAXIMA_ITEM}
                  step={1}
                  inputMode="numeric"
                  onFocus={(e) => e.currentTarget.select()}
                  required
                  value={
                    Number.isFinite(rascunho.quantidade) ? rascunho.quantidade : ""
                  }
                  onChange={(e) =>
                    setRascunho({
                      ...rascunho,
                      quantidade: e.target.valueAsNumber,
                    })
                  }
                />
              </label>
              <label>
                Preço unitário (R$)
                <input
                  type="number"
                  min="0"
                  max="1000000"
                  step="0.01"
                  required
                  value={
                    Number.isFinite(rascunho.preco_unitario_centavos)
                      ? rascunho.preco_unitario_centavos / 100
                      : ""
                  }
                  onChange={(e) =>
                    setRascunho({
                      ...rascunho,
                      preco_unitario_centavos: Math.round(e.target.valueAsNumber * 100),
                    })
                  }
                />
              </label>
              {contexto === "OS" && (
                <label>
                  Situação
                  <select
                    value={rascunho.situacao}
                    onChange={(e) =>
                      setRascunho({ ...rascunho, situacao: e.target.value })
                    }
                  >
                    <option value="pending">A fazer</option>
                    <option value="in_progress">Em execução</option>
                    <option value="done">Já realizado</option>
                    {rascunho.situacao === "cancelled" && (
                      <option value="cancelled">Cancelado</option>
                    )}
                  </select>
                </label>
              )}
            </div>
            {acesso.oficina?.perfil !== "staff" && (
              <CustoMargemItem
                custo={rascunho.custo_unitario_previsto_centavos}
                preco={rascunho.preco_unitario_centavos}
                quantidade={rascunho.quantidade}
                alterar={(custo_unitario_previsto_centavos) =>
                  setRascunho({
                    ...rascunho,
                    custo_unitario_previsto_centavos,
                    custo_ajustado: custo_unitario_previsto_centavos != null,
                  })
                }
                estoque={rascunho.origem_peca === "estoque"}
              />
            )}
            {erroItem && (
              <p className="erro-formulario" role="alert">
                {erroItem}
              </p>
            )}
            {ramo && ramo !== "automotivo" && (
              <details className="os-editor-complemento">
                <summary>Grupo de aprovação (opcional)</summary>
                <label>
                  Grupo do serviço e dos materiais
                  <input
                    maxLength={100}
                    value={rascunho.grupo_servico || ""}
                    placeholder="Atendimento"
                    onChange={(e) =>
                      setRascunho({ ...rascunho, grupo_servico: e.target.value })
                    }
                  />
                </label>
                <small>
                  Itens do mesmo grupo serão autorizados juntos pelo cliente.
                </small>
              </details>
            )}
            <div className="os-editor-painel-rodape">
              <span>
                Total do item{" "}
                <strong>
                  {dinheiro(
                    Math.round(
                      rascunho.quantidade * rascunho.preco_unitario_centavos,
                    ) || 0,
                  )}
                </strong>
              </span>
              <div className="os-editor-painel-acoes">
                <button type="button" className="botao-secundario" onClick={fecharItem}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="botao-primario"
                  onClick={confirmarItem}
                >
                  {editando ? <Check size={17} /> : <Plus size={17} />}
                  {editando
                    ? "Salvar item"
                    : rascunho.tipo === "service"
                      ? "Adicionar serviço"
                      : `Adicionar ${estoque.singular}`}
                </button>
              </div>
            </div>
          </div>
        )}
        {!rascunho && !somenteLocal && (
          <CadastroServicoRapido
            descricaoInicial={busca.trim()}
            limiteAtingido={limite}
            adicionar={adicionar}
            aoProcessar={aoProcessar}
          />
        )}
      </div>
      {!itens.length && <p className="os-editor-vazio">Nenhum item adicionado.</p>}
      <ListaItensOS
        itens={itens}
        nomeMaterial={nomeItem}
        contexto={contexto}
        desabilitado={!!rascunho}
        editar={editarAdicionado}
        remover={removerAdicionado}
        alterarQuantidade={alterarQuantidade}
        detalhesItem={detalhesItem}
      />
      {!!removidos.length && (
        <div className="os-editor-desfazer">
          <span>
            {removidos.length}{" "}
            {removidos.length === 1 ? "item removido" : "itens removidos"}. A alteração
            será aplicada ao salvar.
          </span>
          <button
            type="button"
            disabled={limite || !!rascunho}
            onClick={() => {
              alterar([...itens, removidos[removidos.length - 1]]);
              setRemovidos(removidos.slice(0, -1));
            }}
          >
            <RotateCcw size={15} /> Desfazer
          </button>
        </div>
      )}
      {limite && <p className="texto-suave">Limite de 100 itens por {contexto}.</p>}
      <div className="os-editor-valores">
        <CampoDesconto
          controle={desconto}
          nota={contexto === "OS" ? nota : undefined}
        />
        <div className="os-editor-total">
          <small>Total {contexto === "OS" ? "da OS" : "do orçamento"}</small>
          <strong>{dinheiro(Math.max(0, subtotal - desconto.centavos) || 0)}</strong>
        </div>
      </div>
      {anterior?.orcamento_origem_id && (
        <p className="texto-suave">
          As alterações valem para esta OS. O orçamento aprovado permanece registrado no
          histórico.
        </p>
      )}
      {anterior?.situacao === "ready" && (
        <p className="texto-suave">
          Ao alterar os itens, a OS pronta volta para Em execução para uma nova
          conferência.
        </p>
      )}
      {rodape && <div className="os-editor-complemento">{rodape}</div>}
    </section>
  );
}
