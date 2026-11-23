import { useBuscaDebounced } from "../lib/useBuscaDebounced";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, History, RefreshCw, Search } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { OcorrenciaHistorico } from "../components/OcorrenciaHistorico";
import { erroPublico } from "../lib/supabase";
import { dataEvento, nomeModulo, tituloEvento } from "../lib/historico";
import { consultarHistorico, type EventoGestao } from "../services/gestao";
import { hoje } from "../services/financeiro";
import "./Gestao.css";
import "./Historico.css";

export function Historico() {
  const a = useAcesso();
  const [inicio, setInicio] = useState(hoje().slice(0, 7) + "-01"),
    [fim, setFim] = useState(hoje());
  const [tipo, setTipo] = useState(""),
    [busca, setBusca] = useState(""),
    [pagina, setPagina] = useState(0);
  const [selecionado, setSelecionado] = useState<EventoGestao | null>(null);
  const gerente = a.oficina?.perfil !== "staff";
  const termoConsulta1 = useBuscaDebounced(busca);
  const q = useQuery({
    queryKey: [
      "historico-gestao",
      a.demo,
      a.oficina!.id,
      inicio,
      fim,
      tipo,
      termoConsulta1,
      pagina,
    ],
    queryFn: ({ signal }) =>
      consultarHistorico(
        a.demo,
        a.oficina!.id,
        inicio,
        fim,
        tipo,
        termoConsulta1,
        pagina,
        signal,
      ),
    enabled: gerente,
    refetchInterval: 60000,
  });
  if (!gerente)
    return (
      <div className="os-painel">
        Histórico de gestão disponível ao proprietário e gerentes.
      </div>
    );
  return (
    <div className="gestao-pagina historico-pagina">
      <div className="titulo-pagina">
        <div>
          <h1>
            Histórico<span>.</span>
          </h1>
          <p>Clique em uma ocorrência para conferir os detalhes.</p>
        </div>
        <button
          className="botao-secundario"
          onClick={() => void q.refetch()}
          disabled={q.isFetching}
        >
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>
      <section className="os-painel historico-lista" aria-label="Histórico da empresa">
        <div className="historico-filtros">
          <label className="historico-busca">
            Buscar ocorrência
            <div>
              <Search size={18} />
              <input
                placeholder="Descrição ou número da OS"
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setPagina(0);
                }}
              />
            </div>
          </label>
          <label>
            Módulo
            <select
              value={tipo}
              onChange={(e) => {
                setTipo(e.target.value);
                setPagina(0);
              }}
            >
              <option value="">Todos</option>
              <option value="ordem_servico">Atendimentos e OS</option>
              <option value="estoque">Estoque</option>
              <option value="financeiro">Financeiro</option>
              <option value="oficina">Configurações</option>
              <option value="cliente">Clientes</option>
              <option value="orcamento">Orçamentos</option>
            </select>
          </label>
          <label>
            De
            <input
              type="date"
              value={inicio}
              onChange={(e) => {
                setInicio(e.target.value);
                setPagina(0);
              }}
            />
          </label>
          <label>
            Até
            <input
              type="date"
              value={fim}
              onChange={(e) => {
                setFim(e.target.value);
                setPagina(0);
              }}
            />
          </label>
        </div>
        {a.demo && (
          <p className="historico-ajuda">
            Demonstração: registros de OS e estoque salvos neste navegador.
          </p>
        )}
        {q.isPending ? (
          <p role="status">Carregando histórico…</p>
        ) : q.isError ? (
          <p role="alert">{erroPublico(q.error)}</p>
        ) : (
          <>
            <div className="historico-eventos">
              {q.data.itens.map((e) => (
                <button
                  type="button"
                  className="historico-evento"
                  key={e.origem + e.id}
                  onClick={() => setSelecionado(e)}
                  aria-haspopup="dialog"
                >
                  <span className="historico-simbolo">
                    <History size={19} />
                  </span>
                  <span className="historico-evento-texto">
                    <span className="historico-modulo">
                      {nomeModulo(e.tipo)}
                      {e.numero ? ` · #${e.numero}` : ""}
                    </span>
                    <strong>{tituloEvento(e.descricao)}</strong>
                    <small>
                      {e.autor_nome ||
                        (a.demo ? "Demonstração" : "Responsável nos detalhes")}
                    </small>
                  </span>
                  <time dateTime={e.data}>{dataEvento(e.data)}</time>
                  <ChevronRight size={18} />
                </button>
              ))}
            </div>
            {!q.data.itens.length && (
              <p className="gestao-vazio">Nenhuma ocorrência neste período e filtro.</p>
            )}
            <div className="gestao-paginacao">
              <span>
                {q.data.total} ocorrências · Página {pagina + 1}
              </span>
              <button disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
                Anterior
              </button>
              <button
                disabled={(pagina + 1) * 30 >= q.data.total}
                onClick={() => setPagina((p) => p + 1)}
              >
                Próxima
              </button>
            </div>
          </>
        )}
      </section>
      {selecionado && (
        <OcorrenciaHistorico
          key={`${a.oficina!.id}:${selecionado.origem}:${selecionado.id}`}
          evento={selecionado}
          fechar={() => setSelecionado(null)}
        />
      )}
    </div>
  );
}
