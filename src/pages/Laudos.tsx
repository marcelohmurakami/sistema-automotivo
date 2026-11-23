import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronRight, FileText, Plus } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { numeroLaudo, situacoesLaudo, type Laudo } from "../lib/laudos";
import { erroPublico } from "../lib/supabase";
import { useBuscaDebounced } from "../lib/useBuscaDebounced";
import { EditorLaudo, DetalheLaudo } from "./DialogosLaudo";
import { atualizarCadastro } from "../lib/atualizarCadastro";
import { consultarLaudo, listarLaudos } from "../services/laudos";
import "./Laudos.css";
const horario = (s: string) =>
  new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
export function Laudos() {
  const a = useAcesso();
  const [params] = useSearchParams();
  return <PaginaLaudos key={`${a.oficina!.id}:${params.get("origem") || ""}`} />;
}
function PaginaLaudos() {
  const a = useAcesso(),
    w = a.oficina!.id,
    qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const origem = params.get("origem") || "";
  const [busca, setBusca] = useState(""),
    termo = useBuscaDebounced(busca);
  const [situacao, setSituacao] = useState(""),
    [pagina, setPagina] = useState(0);
  const [atual, setAtual] = useState<Laudo | null>(null),
    [novo, setNovo] = useState(params.get("novo") === "1");
  const [editando, setEditando] = useState(params.get("novo") === "1"),
    [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const abertura = useRef(0);
  const lendo = useRef(false);
  useEffect(
    () => () => {
      abertura.current++;
    },
    [],
  );
  const lista = useQuery({
    queryKey: ["laudos", w, a.demo, termo, situacao, pagina, origem],
    queryFn: ({ signal }) =>
      listarLaudos(a.demo, w, termo, situacao, pagina, origem, signal),
  });
  useEffect(() => {
    if (params.get("novo") === "1") {
      const p = new URLSearchParams(params);
      p.delete("novo");
      setParams(p, { replace: true });
    }
  }, [params, setParams]);
  function atualizar(l: Laudo) {
    qc.setQueryData(["laudo", w, a.demo, l.id], l);
    setAtual(l);
    setNovo(false);
    setEditando(false);
    void atualizarCadastro(qc, ["laudos", w, a.demo]);
  }
  async function abrir(id: string) {
    if (lendo.current) return;
    lendo.current = true;
    const tentativa = ++abertura.current;
    setErro("");
    setCarregando(true);
    try {
      const queryKey = ["laudo", w, a.demo, id];
      const guardado = qc.getQueryData<Laudo>(queryKey);
      const linha = lista.data?.itens.find((l) => l.id === id);
      const l = await qc.fetchQuery({
        queryKey,
        queryFn: ({ signal }) => consultarLaudo(a.demo, w, id, signal),
        staleTime: guardado?.atualizado_em === linha?.atualizado_em ? 30000 : 0,
      });
      if (abertura.current === tentativa) {
        setAtual(l);
        setEditando(false);
      }
    } catch (e) {
      if (abertura.current === tentativa) setErro(erroPublico(e));
    } finally {
      lendo.current = false;
      if (abertura.current === tentativa) setCarregando(false);
    }
  }
  function fechar() {
    abertura.current++;
    setCarregando(false);
    setAtual(null);
    setNovo(false);
    setEditando(false);
  }
  return (
    <section className="laudos-pagina">
      <header className="laudos-topo">
        <div>
          <h1>Laudos técnicos</h1>
        </div>
        <button
          className="botao-primario"
          disabled={carregando}
          onClick={() => {
            setAtual(null);
            setNovo(true);
            setEditando(true);
          }}
        >
          <Plus size={18} /> Novo laudo
        </button>
      </header>
      {origem && (
        <p className="laudos-filtro-origem">
          Mostrando os laudos deste atendimento. <Link to="/laudos">Ver todos</Link>
        </p>
      )}
      <div className="laudos-lista">
        <div className="laudos-filtros">
          <label>
            Buscar laudo
            <input
              value={busca}
              maxLength={160}
              placeholder="Número, cliente ou equipamento…"
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina(0);
              }}
            />
          </label>
          <label>
            Situação
            <select
              aria-label="Situação"
              value={situacao}
              onChange={(e) => {
                setSituacao(e.target.value);
                setPagina(0);
              }}
            >
              <option value="">Todas</option>
              {Object.entries(situacoesLaudo).map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        {(erro || lista.error) && (
          <p role="alert">{erro || erroPublico(lista.error)}</p>
        )}
        {(lista.isPending || carregando) && (
          <p role="status" className="laudos-vazio">
            Carregando laudos…
          </p>
        )}
        {lista.data?.itens.map((l) => (
          <button
            key={l.id}
            className="laudo-linha"
            onClick={() => void abrir(l.id)}
            disabled={carregando}
          >
            <FileText aria-hidden="true" />
            <span>
              <strong>
                {numeroLaudo(l.numero)} · {l.titulo}
              </strong>
              <span>{l.cliente || "Cliente ainda não informado"}</span>
              <small>{l.bem || "Identificação pendente"}</small>
            </span>
            <span className={`laudo-status laudo-status-${l.situacao}`}>
              {situacoesLaudo[l.situacao]}
            </span>
            <small>{horario(l.atualizado_em)}</small>
            <ChevronRight aria-hidden="true" />
          </button>
        ))}
        {lista.data?.total === 0 && (
          <div className="laudos-vazio">
            <FileText size={32} />
            <strong>
              Nenhum laudo {busca || situacao ? "encontrado" : "registrado"}.
            </strong>
            <p>
              Use “Novo laudo” para começar. Você pode aproveitar os dados de uma OS.
            </p>
          </div>
        )}
        {!!lista.data?.total && (
          <nav className="laudos-paginacao" aria-label="Páginas dos laudos">
            <span>{lista.data.total} laudo(s)</span>
            <button
              className="botao-secundario"
              disabled={pagina === 0}
              onClick={() => setPagina((p) => p - 1)}
            >
              Anterior
            </button>
            <span>Página {pagina + 1}</span>
            <button
              className="botao-secundario"
              disabled={(pagina + 1) * 24 >= lista.data.total}
              onClick={() => setPagina((p) => p + 1)}
            >
              Próxima
            </button>
          </nav>
        )}
      </div>
      {(novo || atual) &&
        (editando ? (
          <EditorLaudo
            key={atual?.id || "novo"}
            laudo={atual}
            origemInicial={
              novo && origem
                ? {
                    id: origem,
                    tipo: params.get("tipo") === "atendimento" ? "atendimento" : "os",
                  }
                : undefined
            }
            salvo={atualizar}
            fechar={fechar}
          />
        ) : (
          atual && (
            <DetalheLaudo
              key={`${atual.id}:${atual.revisao}`}
              laudo={atual}
              atualizar={atualizar}
              editar={() => setEditando(true)}
              fechar={fechar}
            />
          )
        ))}
    </section>
  );
}
