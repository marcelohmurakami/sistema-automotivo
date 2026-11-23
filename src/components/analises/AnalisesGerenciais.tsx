import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Download, RefreshCw } from "lucide-react";
import { useAcesso } from "../../auth/contexto";
import { consultarAnalise, type TipoAnalise } from "../../services/analisesGerenciais";
import {
  analises,
  formatarAnalise,
  rotulosAnalise,
  taxaPrimeiraVisita,
  termosAnalise,
} from "../../lib/analisesGerenciais";
import { baixarCSV } from "../../lib/csv";
import { erroPublico } from "../../lib/supabase";
import { ConfiguracaoAnalises, BuscaAnalitica } from "./ConfiguracaoAnalises";
import "./AnalisesGerenciais.css";

export default function AnalisesGerenciais({
  inicio,
  fim,
}: {
  inicio: string;
  fim: string;
}) {
  const a = useAcesso(),
    w = a.oficina!.id;
  const disponiveis = (Object.keys(analises) as TipoAnalise[]).filter(
    (k) => !analises[k].financeiro || a.permite("finance"),
  );
  const [tipo, setTipo] = useState<TipoAnalise>(disponiveis[0] || "tempos"),
    [busca, setBusca] = useState(""),
    [texto, setTexto] = useState(""),
    [pagina, setPagina] = useState(0),
    [objeto, setObjeto] = useState(""),
    [contrato, setContrato] = useState(""),
    [alvo, setAlvo] = useState<{ id: string; modo?: string } | null>(null),
    [unidades, setUnidades] = useState([w]);
  const termos = termosAnalise(a.oficina!.ramo);
  const descricao = {
      ...analises[tipo],
      ...(tipo === "equipamentos" ? { nome: termos.historico } : {}),
      ...(tipo === "recursos" ? { descricao: termos.ocupacao } : {}),
    },
    filtros = {
      busca,
      ...(objeto ? { objeto } : {}),
      ...(contrato ? { contrato } : {}),
      unidades,
    };
  const q = useQuery({
    queryKey: ["analise-gerencial", w, tipo, inicio, fim, filtros, pagina],
    queryFn: ({ signal }) =>
      consultarAnalise(w, tipo, inicio, fim, filtros, pagina, signal),
    enabled: !a.demo,
    staleTime: 30000,
  });
  const d = q.data,
    taxa = d ? taxaPrimeiraVisita(d.resumo) : null;
  function exportar() {
    if (!d) return;
    baixarCSV(
      [
        ["Análise", descricao.nome],
        ["Período", inicio, fim],
        ["Página", pagina + 1, "Registros totais", d.total],
        ["Critérios", d.criterios],
        ["Gerado em", d.gerado_em],
        [],
        ["Nome", ...descricao.colunas.map((k) => rotulosAnalise[k] || k)],
        ...d.linhas.map((l) => [
          l.nome,
          ...descricao.colunas.map((k) => formatarAnalise(k, l[k])),
        ]),
      ],
      "analise-" + tipo + "-" + inicio + "-pagina-" + (pagina + 1) + ".csv",
    );
  }
  const max =
    tipo === "recursos"
      ? 100
      : d && descricao.grafico
        ? Math.max(
            1,
            ...d.linhas.map((l) => Math.abs(Number(l[descricao.grafico!]) || 0)),
          )
        : 1;
  return (
    <section className="an-pagina" aria-label="Análises gerenciais">
      <header className="an-topo">
        <div>
          <h2>Análises para decidir</h2>
          <p>Escolha uma análise.</p>
        </div>
        <div className="an-acoes">
          <button
            type="button"
            className="botao-secundario"
            aria-label="Atualizar análise"
            disabled={q.isFetching || a.demo}
            onClick={() => void q.refetch()}
          >
            <RefreshCw size={17} />
          </button>
          <button
            type="button"
            className="botao-secundario"
            disabled={!d}
            onClick={exportar}
          >
            <Download size={17} />
            Baixar página
          </button>
        </div>
      </header>
      <div className="an-filtros">
        <label>
          Análise
          <select
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value as TipoAnalise);
              setPagina(0);
              setObjeto("");
              setContrato("");
              setBusca("");
              setTexto("");
              setAlvo(null);
            }}
          >
            {disponiveis.map((k) => (
              <option value={k} key={k}>
                {k === "equipamentos" ? termos.historico : analises[k].nome}
              </option>
            ))}
          </select>
        </label>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setBusca(texto);
            setPagina(0);
          }}
        >
          <label>
            Buscar resultado
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={120}
              placeholder="Nome do cliente, serviço ou recurso…"
            />
          </label>
          <button className="botao-secundario">Buscar</button>
        </form>
      </div>
      <p className="an-ajuda">{descricao.descricao}</p>
      {["equipamentos", "comparacao"].includes(tipo) && (
        <details className="an-config">
          <summary>Selecionar: {termos.ativo.toLowerCase()}</summary>
          <BuscaAnalitica
            oficina={w}
            tipo="objeto"
            rotulo={termos.ativo}
            valor={objeto}
            selecionar={(v) => {
              setObjeto(v);
              setPagina(0);
            }}
          />
          {objeto && (
            <button
              className="botao-secundario"
              onClick={() => {
                setObjeto("");
                setPagina(0);
              }}
            >
              Mostrar todos
            </button>
          )}
        </details>
      )}
      {tipo === "contratos" && (
        <details className="an-config">
          <summary>Selecionar um contrato</summary>
          <BuscaAnalitica
            oficina={w}
            tipo="contrato"
            rotulo="Contrato"
            valor={contrato}
            selecionar={(v) => {
              setContrato(v);
              setPagina(0);
            }}
          />
          {contrato && (
            <button
              className="botao-secundario"
              onClick={() => {
                setContrato("");
                setPagina(0);
              }}
            >
              Mostrar todos
            </button>
          )}
        </details>
      )}
      {tipo === "filiais" && (
        <fieldset className="an-unidades">
          <legend>Unidades na consolidação</legend>
          {a.oficinas
            .filter(
              (o) =>
                o.perfil !== "staff" &&
                o.recursos.includes("reports") &&
                o.recursos.includes("finance"),
            )
            .map((o) => (
              <label key={o.id}>
                <input
                  type="checkbox"
                  checked={unidades.includes(o.id)}
                  onChange={(e) => {
                    setUnidades(
                      e.target.checked
                        ? [...unidades, o.id]
                        : unidades.filter((id) => id !== o.id),
                    );
                    setPagina(0);
                  }}
                />
                {o.nome}
              </label>
            ))}
        </fieldset>
      )}
      {a.demo ? (
        <p className="an-vazio">
          Estas análises usam os registros e vínculos da sua empresa. Entre em uma conta
          para conferir os resultados.
        </p>
      ) : q.isPending ? (
        <p role="status" className="an-vazio">
          Calculando a análise…
        </p>
      ) : q.error ? (
        <p role="alert" className="an-aviso">
          {erroPublico(q.error)}{" "}
          <button className="botao-secundario" onClick={() => void q.refetch()}>
            Tentar novamente
          </button>
        </p>
      ) : (
        d && (
          <>
            {(descricao.resumo.length > 0 || tipo === "primeira_visita") && (
              <div className="an-indicadores">
                {tipo === "primeira_visita" && (
                  <article>
                    <span>Resolução na primeira visita</span>
                    <strong>
                      {taxa === null
                        ? "Sem base"
                        : taxa.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) +
                          "%"}
                    </strong>
                    <small>Somente problemas com 30 dias de observação</small>
                  </article>
                )}
                {descricao.resumo.map((k) => (
                  <article key={k}>
                    <span>{rotulosAnalise[k] || k}</span>
                    <strong>{formatarAnalise(k, d.resumo[k] ?? 0)}</strong>
                  </article>
                ))}
              </div>
            )}
            {["clientes", "dados", "contratos", "equipamentos"].includes(tipo) && (
              <p className="an-aviso">
                Valores de margem permanecem estimados enquanto houver custos ou
                serviços a conferir.{" "}
                <Link to="/financeiro?aba=custos">Conferir custos</Link>
              </p>
            )}
            <div className="an-lista">
              {!d.linhas.length ? (
                <p className="an-vazio">
                  Nenhum registro neste recorte. Confira as datas e os filtros ou
                  complemente os vínculos abaixo.
                </p>
              ) : (
                d.linhas.map((l) => {
                  const principal = descricao.grafico
                      ? Number(l[descricao.grafico] || 0)
                      : 0,
                    total =
                      Number(l.trabalho || 0) +
                      Number(l.espera || 0) +
                      Number(l.sem_registro || 0);
                  return (
                    <article className="an-linha" key={l.id}>
                      <div className="an-linha-topo">
                        <h3>{l.nome}</h3>
                        {(tipo === "comparacao" ||
                          tipo === "primeira_visita" ||
                          (tipo === "recursos" && l.tipo !== "Técnico")) && (
                          <button
                            className="botao-secundario"
                            onClick={() =>
                              setAlvo({
                                id: l.id,
                                modo:
                                  tipo === "primeira_visita"
                                    ? "editar_problema"
                                    : undefined,
                              })
                            }
                          >
                            {tipo === "comparacao"
                              ? "Editar comparação"
                              : tipo === "recursos"
                                ? "Definir disponibilidade"
                                : "Corrigir vínculo"}
                          </button>
                        )}
                        {descricao.grafico && (
                          <strong className={principal < 0 ? "an-negativo" : ""}>
                            {formatarAnalise(descricao.grafico, l[descricao.grafico])}
                          </strong>
                        )}
                      </div>
                      {descricao.grafico && (
                        <div
                          className={
                            "an-barra " + (principal < 0 ? "an-barra-negativa" : "")
                          }
                          aria-hidden="true"
                        >
                          <span
                            style={{ width: (100 * Math.abs(principal)) / max + "%" }}
                          />
                        </div>
                      )}
                      {tipo === "tempos" && (
                        <div className="an-tempos" aria-label="Distribuição do tempo">
                          {(["trabalho", "espera", "sem_registro"] as const).map(
                            (k) => (
                              <span
                                key={k}
                                className={"an-tempo-" + k}
                                title={
                                  rotulosAnalise[k] + ": " + formatarAnalise(k, l[k])
                                }
                                style={{
                                  width: total
                                    ? (100 * Number(l[k] || 0)) / total + "%"
                                    : "0%",
                                }}
                              />
                            ),
                          )}
                        </div>
                      )}
                      <dl className="an-valores">
                        {descricao.colunas.slice(0, 4).map((k) => (
                          <div key={k}>
                            <dt data-tempo={tipo === "tempos" ? k : undefined}>
                              {rotulosAnalise[k] || k}
                            </dt>
                            <dd>{formatarAnalise(k, l[k])}</dd>
                          </div>
                        ))}
                      </dl>
                      {descricao.colunas.length > 4 && (
                        <details>
                          <summary>Ver detalhes</summary>
                          <dl className="an-valores">
                            {descricao.colunas.slice(4).map((k) => (
                              <div key={k}>
                                <dt>{rotulosAnalise[k] || k}</dt>
                                <dd>{formatarAnalise(k, l[k])}</dd>
                              </div>
                            ))}
                          </dl>
                          {!!l.premissas && (
                            <p>
                              Fontes das estimativas:{" "}
                              {String(
                                (l.premissas as Record<string, unknown>).evidencia ||
                                  "Não informadas",
                              )}
                            </p>
                          )}
                        </details>
                      )}
                    </article>
                  );
                })
              )}
            </div>
            <nav className="an-paginacao" aria-label="Páginas da análise">
              <button
                className="botao-secundario"
                disabled={!pagina}
                onClick={() => setPagina(pagina - 1)}
              >
                Anterior
              </button>
              <span>
                {d.total} resultados · Página {pagina + 1} de{" "}
                {Math.max(1, Math.ceil(d.total / 25))}
              </span>
              <button
                className="botao-secundario"
                disabled={(pagina + 1) * 25 >= d.total}
                onClick={() => setPagina(pagina + 1)}
              >
                Próxima
              </button>
            </nav>
            <details className="an-config">
              <summary>Como este indicador é calculado</summary>
              <p>{d.criterios}</p>
            </details>
          </>
        )
      )}
      {!a.demo && (
        <ConfiguracaoAnalises
          key={tipo + (alvo?.id || "")}
          tipo={tipo}
          idInicial={alvo?.id}
          modoInicial={alvo?.modo}
        />
      )}
    </section>
  );
}
