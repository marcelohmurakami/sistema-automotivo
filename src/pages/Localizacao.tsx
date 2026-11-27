import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { atualizarCadastro } from "../lib/atualizarCadastro";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { MapPin, Plus, Printer, ScanLine, ArrowRight, Pencil } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { DialogoLocalizacao as Dialogo } from "../components/localizacao/DialogoLocalizacao";
import { VincularEtiqueta } from "../components/localizacao/VincularEtiqueta";
import { LeitorEtiqueta } from "../components/LeitorEtiqueta";
import { SecaoRecolhivel } from "../components/SecaoRecolhivel";
import {
  CadastroItemFisico,
  GerenciarLocais,
  ImprimirEtiquetas,
  MovimentoFisico,
} from "../components/localizacao/ControlesLocalizacao";
import {
  acoesFisicas,
  categoriasFisicas,
  interpretarEtiqueta,
  ondeEsta,
  situacoesFisicas,
  type ItemFisico,
  type VinculoFisico,
} from "../lib/localizacaoFisica";
import {
  consultarItemFisico,
  historicoItemFisico,
  listarItensFisicos,
  listarLocaisFisicos,
} from "../services/localizacao";
import { erroPublico } from "../lib/supabase";
import type { EtiquetaFisica } from "../services/pdfEtiquetas";
import "./Localizacao.css";

const MoverPorEtiquetas = lazy(() =>
  import("../components/localizacao/MoverPorEtiquetas").then((m) => ({
    default: m.MoverPorEtiquetas,
  })),
);

const etiquetasDosItens = (itens: ItemFisico[]): EtiquetaFisica[] =>
  itens.map((i) => ({
    codigo: i.codigo,
    descricao: i.descricao,
    complemento: categoriasFisicas[i.categoria],
  }));
const horario = (s: string) =>
  new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
export function Localizacao() {
  const a = useAcesso();
  const [params] = useSearchParams();
  return (
    <section className="loc-pagina">
      <header className="loc-cabecalho">
        <div>
          <h1>Localização e etiquetas</h1>
        </div>
      </header>
      <PainelLocalizacao
        key={a.oficina?.id}
        codigoInicial={params.get("codigo") || ""}
      />
    </section>
  );
}
export function PainelLocalizacao({
  vinculo,
  codigoInicial = "",
}: {
  vinculo?: VinculoFisico;
  codigoInicial?: string;
}) {
  const a = useAcesso();
  if (a.demo)
    return (
      <p className="estado-lista">
        O controle de etiquetas e localização fica disponível na conta da empresa, com o
        histórico compartilhado entre a equipe.
      </p>
    );
  return (
    <ControleLocalizacao
      key={`${a.oficina!.id}:${vinculo?.tipo}:${vinculo?.id}:${codigoInicial}`}
      vinculo={vinculo}
      codigoInicial={codigoInicial}
    />
  );
}
function ControleLocalizacao({
  vinculo,
  codigoInicial,
}: {
  vinculo?: VinculoFisico;
  codigoInicial: string;
}) {
  const a = useAcesso(),
    w = a.oficina!.id,
    qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  const [situacao, setSituacao] = useState("");
  const [local, setLocal] = useState("");
  const [codigo, setCodigo] = useState(
    /^PTI-[A-F\d]{16}$/i.test(codigoInicial) ? codigoInicial.toUpperCase() : "",
  );
  const [leitor, setLeitor] = useState(false);
  const [lote, setLote] = useState(false);
  const [novo, setNovo] = useState(false);
  const [vincular, setVincular] = useState(false);
  const [gerenciar, setGerenciar] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [selecionados, setSelecionados] = useState<ItemFisico[]>([]);
  const [selecionarVarios, setSelecionarVarios] = useState(false);
  const [registrados, setRegistrados] = useState<ItemFisico[]>([]);
  const [mover, setMover] = useState<ItemFisico[]>();
  const [imprimir, setImprimir] = useState<EtiquetaFisica[]>();
  const leitura = useRef<AbortController | null>(null);
  useEffect(() => () => leitura.current?.abort(), []);
  useEffect(() => {
    const timer = setTimeout(() => setTermo(busca.trim()), 250);
    return () => clearTimeout(timer);
  }, [busca]);
  const qLocais = useQuery({
    queryKey: ["locais-fisicos", w, ""],
    queryFn: ({ signal }) => listarLocaisFisicos(w, "", false, signal),
    staleTime: 60_000,
  });
  const localInicial = useQuery({
    queryKey: ["locais-fisicos", w, "etiqueta", codigoInicial],
    queryFn: ({ signal }) => listarLocaisFisicos(w, codigoInicial, false, signal),
    enabled: /^PTL-[A-F\d]{16}$/i.test(codigoInicial),
    staleTime: 60_000,
  });
  const [inicialLimpo, setInicialLimpo] = useState(false);
  const localEfetivo =
    local ||
    (!inicialLimpo
      ? localInicial.data?.find((l) => l.codigo === codigoInicial.toUpperCase())?.id ||
        ""
      : "");
  const filtros = { busca: termo, situacao, local: localEfetivo, vinculo };
  const q = useInfiniteQuery({
    queryKey: ["itens-fisicos", w, "lista", filtros],
    initialPageParam: undefined as { id: string; criado_em: string } | undefined,
    queryFn: ({ pageParam, signal }) =>
      listarItensFisicos(w, filtros, pageParam, signal),
    getNextPageParam: (p) => (p.tem_mais ? p.itens.at(-1) : undefined),
    staleTime: 15_000,
  });
  const itens = useMemo(() => q.data?.pages.flatMap((p) => p.itens) || [], [q.data]);
  const idsSelecionados = useMemo(
    () => new Set(selecionados.map((i) => i.id)),
    [selecionados],
  );
  const contexto = q.data?.pages[0]?.vinculo;
  async function atualizar() {
    setSelecionados([]);
    await atualizarCadastro(qc, ["itens-fisicos", w]);
  }
  async function ler(texto: string) {
    leitura.current?.abort();
    const atual = new AbortController();
    leitura.current = atual;
    setLeitor(false);
    setErro("");
    setAviso("");
    setRegistrados([]);
    try {
      const r = interpretarEtiqueta(texto, window.location.origin);
      if (r.tipo === "item") {
        setCodigo(r.codigo);
        return;
      }
      if (r.tipo === "busca") {
        setBusca(r.codigo);
        setTermo(r.codigo);
        return;
      }
      setSelecionados([]);
      setSituacao("");
      setInicialLimpo(true);
      if (r.tipo === "local") {
        const locais = await listarLocaisFisicos(w, r.codigo, false, atual.signal);
        if (atual.signal.aborted) return;
        const l = locais.find((x) => x.codigo === r.codigo);
        if (!l) throw new Error("Local não encontrado ou desativado nesta empresa.");
        setLocal(l.id);
        setBusca("");
        setAviso(`Itens em ${l.nome}`);
      }
    } catch (e) {
      if (!atual.signal.aborted) setErro(erroPublico(e));
    }
  }
  function selecionar(i: ItemFisico, marcado: boolean) {
    setSelecionados((xs) =>
      marcado
        ? xs.length < 50
          ? [...xs.filter((x) => x.id !== i.id), i]
          : xs
        : xs.filter((x) => x.id !== i.id),
    );
  }
  const locais = [...(qLocais.data || [])];
  for (const l of localInicial.data || [])
    if (!locais.some((x) => x.id === l.id)) locais.push(l);
  return (
    <div className="loc-controle">
      {contexto && (
        <p className="loc-contexto">
          <strong>{contexto.titulo}</strong>
          {contexto.cliente && ` · ${contexto.cliente}`}
        </p>
      )}
      <div className="loc-ferramentas">
        <form
          className="loc-busca"
          onSubmit={(e) => {
            e.preventDefault();
            if (busca.trim()) void ler(busca);
          }}
        >
          <label>
            Buscar item
            <input
              value={busca}
              onChange={(e) => {
                leitura.current?.abort();
                setBusca(e.target.value);
                setSelecionados([]);
              }}
              maxLength={2048}
              placeholder="Descrição, etiqueta ou número de série"
            />
          </label>
        </form>
        <button
          className="botao-primario"
          onClick={() => setNovo(true)}
          disabled={!!vinculo && !contexto}
        >
          <Plus size={18} /> Guardar item
        </button>
      </div>
      <div className="loc-atalhos">
        <button className="botao-secundario" onClick={() => setLeitor(true)}>
          <ScanLine size={18} /> Ler etiqueta
        </button>
        <button className="botao-secundario" onClick={() => setLote(true)}>
          <ArrowRight size={18} /> Mover por etiquetas
        </button>
        <button
          className="botao-secundario"
          aria-pressed={selecionarVarios}
          onClick={() => {
            setSelecionarVarios(!selecionarVarios);
            setSelecionados([]);
          }}
        >
          {selecionarVarios ? "Sair da seleção" : "Selecionar vários"}
        </button>
        {a.oficina!.perfil !== "staff" && (
          <button className="botao-texto" onClick={() => setGerenciar(true)}>
            <MapPin size={18} /> Meus locais
          </button>
        )}
        {contexto && (
          <button className="botao-texto" onClick={() => setVincular(true)}>
            Usar etiqueta existente
          </button>
        )}
      </div>
      <div className="loc-painel-filtros">
        <div className="loc-filtros">
          <label>
            Situação
            <select
              value={situacao}
              onChange={(e) => {
                leitura.current?.abort();
                setSituacao(e.target.value);
                setSelecionados([]);
              }}
            >
              <option value="">Todas</option>
              {Object.entries(situacoesFisicas).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
              <option value="sem_local">Sem local informado</option>
            </select>
          </label>
          <label>
            Local
            <select
              value={localEfetivo}
              onChange={(e) => {
                leitura.current?.abort();
                setLocal(e.target.value);
                setInicialLimpo(true);
                setSelecionados([]);
                setAviso("");
              }}
            >
              <option value="">Todos os locais</option>
              {localEfetivo && !locais.some((l) => l.id === localEfetivo) && (
                <option value={localEfetivo}>Local lido na etiqueta</option>
              )}
              {locais.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {(localEfetivo || situacao) && (
        <div className="loc-filtro-ativo">
          <span>
            {[
              localEfetivo &&
                (locais.find((l) => l.id === localEfetivo)?.nome ||
                  "Local selecionado"),
              situacao &&
                (situacoesFisicas[situacao as keyof typeof situacoesFisicas] ||
                  "Sem local informado"),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <button
            type="button"
            className="botao-texto"
            onClick={() => {
              leitura.current?.abort();
              setLocal("");
              setSituacao("");
              setInicialLimpo(true);
              setSelecionados([]);
              setAviso("");
            }}
          >
            Limpar filtros
          </button>
        </div>
      )}

      {erro && (
        <p role="alert" className="erro-formulario">
          {erro}
        </p>
      )}
      {aviso && (
        <p role="status" className="loc-aviso">
          {aviso}
          {!!registrados.length && (
            <button
              type="button"
              className="botao-secundario"
              onClick={() => setImprimir(etiquetasDosItens(registrados))}
            >
              Imprimir etiqueta{registrados.length > 1 ? "s" : ""}
            </button>
          )}
        </p>
      )}
      {localInicial.isSuccess && !localInicial.data.length && !inicialLimpo && (
        <p role="alert">
          Etiqueta de local indisponível nesta empresa. Confira a empresa selecionada ou
          se o local foi desativado.
        </p>
      )}
      {(localInicial.error || qLocais.error) && (
        <p role="alert">{erroPublico(localInicial.error || qLocais.error)}</p>
      )}
      {!!selecionados.length && (
        <div className="loc-selecao">
          <strong>{selecionados.length} selecionado(s)</strong>
          <button className="botao-secundario" onClick={() => setMover(selecionados)}>
            <ArrowRight size={18} /> Mudar local
          </button>
          <button
            className="botao-secundario"
            onClick={() => setImprimir(etiquetasDosItens(selecionados))}
          >
            <Printer size={18} /> Imprimir etiquetas
          </button>
          <button className="botao-texto" onClick={() => setSelecionados([])}>
            Limpar seleção
          </button>
        </div>
      )}
      {selecionados.length === 50 && (
        <small>
          Limite de 50 itens por operação. Conclua esta seleção antes de continuar.
        </small>
      )}
      {(q.isPending || busca.trim() !== termo) && (
        <p className="estado-lista" role="status">
          Buscando itens…
        </p>
      )}
      {q.error && (
        <div className="estado-lista">
          <p role="alert">{erroPublico(q.error)}</p>
          <button className="botao-secundario" onClick={() => void q.refetch()}>
            Tentar novamente
          </button>
        </div>
      )}
      {!q.isPending && !q.error && !itens.length && (
        <div className="loc-vazio">
          <MapPin size={30} />
          <strong>
            {busca || situacao || localEfetivo
              ? "Nenhum item encontrado"
              : "Cada coisa no seu lugar"}
          </strong>
          <p>
            {busca || situacao || localEfetivo
              ? "Confira a busca e os filtros."
              : "Guarde o primeiro item e escolha onde ele ficará. A etiqueta é opcional."}
          </p>
        </div>
      )}
      <ul className="loc-lista">
        {itens.map((i) => (
          <li key={i.id} className="loc-linha">
            {selecionarVarios && (
              <input
                type="checkbox"
                aria-label={`Selecionar ${i.descricao}`}
                checked={idsSelecionados.has(i.id)}
                disabled={selecionados.length >= 50 && !idsSelecionados.has(i.id)}
                onChange={(e) => selecionar(i, e.target.checked)}
              />
            )}
            <button
              className="loc-abrir"
              onClick={() => {
                leitura.current?.abort();
                setCodigo(i.codigo);
              }}
            >
              <div>
                <strong>{i.descricao}</strong>
                <small>
                  {[
                    categoriasFisicas[i.categoria],
                    i.cliente_nome,
                    i.numero && `${i.documento_rotulo || "OS"} #${i.numero}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </div>
              <span className={`loc-posicao loc-${i.situacao}`}>
                <MapPin size={17} />
                {ondeEsta(i)}
              </span>
            </button>
            <div className="loc-acoes-linha">
              <button
                className="botao-secundario"
                aria-label={`${i.situacao === "entregue" ? "Registrar retorno" : "Mudar local"} de ${i.descricao}`}
                onClick={() => setMover([i])}
              >
                <ArrowRight size={16} />{" "}
                {i.situacao === "entregue" ? "Registrar retorno" : "Mudar local"}
              </button>
              <button
                className="botao-secundario"
                aria-label={`Imprimir etiqueta de ${i.descricao}`}
                onClick={() => setImprimir(etiquetasDosItens([i]))}
              >
                <Printer size={16} /> Etiqueta
              </button>
            </div>
          </li>
        ))}
      </ul>
      {q.hasNextPage && (
        <button
          className="botao-secundario"
          disabled={q.isFetchingNextPage}
          onClick={() => void q.fetchNextPage()}
        >
          {q.isFetchingNextPage ? "Carregando…" : "Carregar mais itens"}
        </button>
      )}
      {leitor && (
        <LeitorEtiqueta fechar={() => setLeitor(false)} lido={(c) => void ler(c)} />
      )}
      {gerenciar && <GerenciarLocais fechar={() => setGerenciar(false)} />}
      {vincular && contexto && (
        <VincularEtiqueta
          contexto={contexto}
          fechar={() => setVincular(false)}
          salvo={() => {
            setVincular(false);
            setAviso("Etiqueta vinculada. Histórico preservado.");
            void atualizar();
          }}
        />
      )}
      {novo && (
        <CadastroItemFisico
          contexto={contexto}
          localInicial={localEfetivo}
          fechar={() => setNovo(false)}
          salvo={(r, imprimirAgora) => {
            setNovo(false);
            if (imprimirAgora) setImprimir(etiquetasDosItens(r));
            setRegistrados(r);
            setAviso(
              r.length === 1 ? "Item registrado." : `${r.length} itens registrados.`,
            );
            void atualizar();
          }}
        />
      )}
      {lote && (
        <Suspense fallback={<p role="status">Abrindo leitura de etiquetas…</p>}>
          <MoverPorEtiquetas
            localInicial={localEfetivo}
            fechar={() => setLote(false)}
            salvo={(r) => {
              setLote(false);
              setRegistrados([]);
              setAviso(`${r.length} itens movidos.`);
              void atualizar();
            }}
          />
        </Suspense>
      )}
      {imprimir && (
        <ImprimirEtiquetas itens={imprimir} fechar={() => setImprimir(undefined)} />
      )}
      {mover && (
        <MovimentoFisico
          itens={mover}
          fechar={() => setMover(undefined)}
          salvo={() => {
            setMover(undefined);
            setRegistrados([]);
            setAviso("Movimentação registrada.");
            void atualizar();
          }}
        />
      )}
      {codigo && (
        <DetalheFisico
          key={codigo}
          codigo={codigo}
          fechar={() => setCodigo("")}
          atualizado={atualizar}
        />
      )}
    </div>
  );
}
function DetalheFisico({
  codigo,
  fechar,
  atualizado,
}: {
  codigo: string;
  fechar: () => void;
  atualizado: () => Promise<void>;
}) {
  const w = useAcesso().oficina!.id;
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["itens-fisicos", w, "detalhe", codigo],
    queryFn: ({ signal }) => consultarItemFisico(w, codigo, signal),
    staleTime: 15_000,
  });
  const i = q.data;
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [mover, setMover] = useState<ItemFisico[]>();
  const [imprimir, setImprimir] = useState<EtiquetaFisica[]>();
  const [editar, setEditar] = useState(false);
  const [acessorio, setAcessorio] = useState(false);
  const [verHistorico, setVerHistorico] = useState(false);
  async function aplicarConfirmados(itens: ItemFisico[]) {
    const queryKey = ["itens-fisicos", w, "detalhe", codigo];
    await qc.cancelQueries({ queryKey, exact: true });
    // A resposta já contém a localização confirmada: não exiba o destino
    // anterior enquanto a lista e o histórico são reconsultados.
    const porId = new Map(itens.map((item) => [item.id, item]));
    const confirmado = (item: ItemFisico) => {
      const novo = porId.get(item.id);
      return novo && novo.revisao >= item.revisao ? novo : item;
    };
    qc.setQueryData<Awaited<ReturnType<typeof consultarItemFisico>>>(
      queryKey,
      (anterior) =>
        anterior
          ? {
              ...anterior,
              ...confirmado(anterior),
              relacionados: anterior.relacionados.map(confirmado),
            }
          : anterior,
    );
  }
  const historico = useInfiniteQuery({
    queryKey: ["itens-fisicos", w, "historico", i?.id],
    enabled: !!i && verHistorico,
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam, signal }) =>
      historicoItemFisico(w, i!.id, pageParam, signal),
    getNextPageParam: (p) => (p.tem_mais ? p.eventos.at(-1)?.id : undefined),
  });
  const escolhidos = i
    ? [i, ...i.relacionados.filter((x) => selecionados.includes(x.id))]
    : [];
  return (
    <Dialogo aberto fechar={fechar} titulo="Localização do item">
      <div className="loc-form">
        {q.isPending && <p role="status">Localizando etiqueta…</p>}
        {q.error && <p role="alert">{erroPublico(q.error)}</p>}
        {i && (
          <>
            <div className="loc-destaque">
              <small>{categoriasFisicas[i.categoria]}</small>
              <h2>{i.descricao}</h2>
              <div className={`loc-posicao loc-${i.situacao}`}>
                <MapPin size={22} />
                <strong>{ondeEsta(i)}</strong>
              </div>
              <small>Atualizado em {horario(i.atualizado_em)}</small>
            </div>
            {(i.numero || i.cliente_nome) && (
              <p>
                {i.numero && `${i.documento_rotulo || "OS"} #${i.numero}`}
                {i.cliente_nome && ` · ${i.cliente_nome}`}
              </p>
            )}

            <div className="loc-acoes">
              <button className="botao-primario" onClick={() => setMover(escolhidos)}>
                <ArrowRight size={18} />{" "}
                {i.situacao === "entregue" ? "Registrar retorno" : "Mudar local"}
                {escolhidos.length > 1 ? ` ${escolhidos.length} itens` : ""}
              </button>
              <button
                className="botao-secundario"
                onClick={() => setImprimir(etiquetasDosItens(escolhidos))}
              >
                <Printer size={18} /> Imprimir etiqueta
              </button>
            </div>

            <section className="loc-form">
              <div className="loc-acoes">
                <button className="botao-secundario" onClick={() => setEditar(true)}>
                  <Pencil size={16} /> Identificação
                </button>
                {!i.principal_id && i.situacao !== "entregue" && (
                  <button
                    className="botao-secundario"
                    onClick={() => setAcessorio(true)}
                  >
                    <Plus size={16} /> Acessório
                  </button>
                )}
              </div>

              <section className="loc-form">
                <SecaoRecolhivel titulo="Identificação e observações">
                  <code>{i.codigo}</code>
                  {i.codigo_externo && (
                    <p>
                      Série / código do fabricante: <strong>{i.codigo_externo}</strong>
                    </p>
                  )}
                  {i.observacoes && <p className="loc-observacoes">{i.observacoes}</p>}
                </SecaoRecolhivel>
                {!!i.relacionados.length && (
                  <div className="loc-conjunto">
                    <h3>Itens que acompanham</h3>
                    <p>Marque os que serão movimentados ou impressos junto.</p>
                    <button
                      type="button"
                      className="botao-texto"
                      onClick={() =>
                        setSelecionados(
                          selecionados.length === Math.min(49, i.relacionados.length)
                            ? []
                            : i.relacionados.slice(0, 49).map((x) => x.id),
                        )
                      }
                    >
                      {selecionados.length === Math.min(49, i.relacionados.length)
                        ? "Desmarcar todos"
                        : "Selecionar conjunto"}
                    </button>
                    <ul className="loc-lista">
                      {i.relacionados.map((x) => (
                        <li key={x.id} className="loc-linha">
                          <label className="loc-check">
                            <input
                              type="checkbox"
                              checked={selecionados.includes(x.id)}
                              disabled={
                                selecionados.length >= 49 &&
                                !selecionados.includes(x.id)
                              }
                              onChange={(e) =>
                                setSelecionados((xs) =>
                                  e.target.checked
                                    ? [...xs, x.id]
                                    : xs.filter((id) => id !== x.id),
                                )
                              }
                            />
                            <span>
                              <strong>{x.descricao}</strong>
                              <small>{ondeEsta(x)}</small>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    {i.relacionados.length === 50 && (
                      <small>
                        Exibindo até 50 itens relacionados. Os demais podem ser
                        encontrados na busca.
                      </small>
                    )}
                  </div>
                )}
              </section>
              <details
                className="loc-opcoes"
                onToggle={(e) => setVerHistorico(e.currentTarget.open)}
              >
                <summary>Histórico de localização</summary>
                {historico.isFetching && <p role="status">Carregando histórico…</p>}
                {historico.error && <p role="alert">{erroPublico(historico.error)}</p>}
                {historico.isSuccess && !historico.data.pages[0]?.eventos.length && (
                  <p>Nenhuma movimentação registrada.</p>
                )}
                <ol className="loc-historico">
                  {historico.data?.pages
                    .flatMap((p) => p.eventos)
                    .map((h) => (
                      <li key={h.id}>
                        <div>
                          <strong>{acoesFisicas[h.acao]}</strong>
                          <small>
                            {horario(h.criado_em)} · {h.autor_nome}
                          </small>
                        </div>
                        <p>
                          {h.antes ? `${ondeEsta(h.antes)} → ` : ""}
                          {ondeEsta(h.depois)}
                        </p>
                        {h.observacoes && <p>{h.observacoes}</p>}
                      </li>
                    ))}
                </ol>
                {historico.hasNextPage && (
                  <button
                    className="botao-secundario"
                    disabled={historico.isFetchingNextPage}
                    onClick={() => void historico.fetchNextPage()}
                  >
                    Histórico anterior
                  </button>
                )}
              </details>
            </section>
            {editar && (
              <CadastroItemFisico
                item={i}
                fechar={() => setEditar(false)}
                salvo={async (r) => {
                  await aplicarConfirmados(r);
                  setEditar(false);
                  void atualizado();
                }}
              />
            )}
            {acessorio && (
              <CadastroItemFisico
                principal={i}
                fechar={() => setAcessorio(false)}
                salvo={(r) => {
                  setAcessorio(false);
                  setImprimir(etiquetasDosItens(r));
                  void atualizado();
                }}
              />
            )}
          </>
        )}
        {mover && (
          <MovimentoFisico
            itens={mover}
            fechar={() => setMover(undefined)}
            salvo={async (r) => {
              await aplicarConfirmados(r);
              setMover(undefined);
              setSelecionados([]);
              void atualizado();
            }}
          />
        )}
        {imprimir && (
          <ImprimirEtiquetas itens={imprimir} fechar={() => setImprimir(undefined)} />
        )}
      </div>
    </Dialogo>
  );
}
