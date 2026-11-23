import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { BarChart3, Check, MousePointer2, X } from "lucide-react";
import {
  agruparGrafico,
  agrupamentoInicial,
  escalaGrafico,
  indicesRotulos,
  rotuloGrupo,
  type AgrupamentoGrafico,
  type PontoGrafico,
} from "../lib/graficosRelatorios";
import "./GraficoResultados.css";
import { dinheiro } from "../lib/formatacao";

export type SerieVisual = {
  nome: string;
  cor: string;
  detalhe: string;
  comparar?: boolean;
  somenteTabela?: boolean;
  saldo?: boolean;
  negativo?: string;
  positivo?: string;
};
const formatoNumero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const formatoCompacto = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const formatoCompactoFracao = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 2,
});
const numero = (n: number) => formatoNumero.format(n);
export function GraficoResultados({
  id,
  titulo,
  descricao,
  pontos,
  series,
  monetario = false,
  controles,
}: {
  id: string;
  titulo: string;
  descricao: string;
  pontos: PontoGrafico[];
  series: SerieVisual[];
  monetario?: boolean;
  controles?: ReactNode;
}) {
  const [modo, setModo] = useState<AgrupamentoGrafico | null>(null),
    [serieEscolhida, setSerieEscolhida] = useState<number | null>(null);
  const [dataEscolhida, setDataEscolhida] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<"mouse" | "teclado" | "fixo" | null>(null);
  const [largura, setLargura] = useState(900),
    area = useRef<HTMLDivElement>(null),
    barras = useRef<(SVGGElement | null)[]>([]),
    idDetalhe = useId();
  useEffect(() => {
    const e = area.current;
    if (!e) return;
    const medir = () => setLargura(Math.max(240, e.clientWidth));
    medir();
    const observer = new ResizeObserver(medir);
    observer.observe(e);
    return () => observer.disconnect();
  }, []);
  const agrupamento = modo || agrupamentoInicial(pontos.length);
  const grupos = useMemo(
    () => agruparGrafico(pontos, agrupamento),
    [pontos, agrupamento],
  );
  const totais = useMemo(
    () => series.map((_, j) => pontos.reduce((s, p) => s + (p.valores[j] || 0), 0)),
    [series, pontos],
  );
  const visiveis = useMemo(
    () =>
      series
        .map((s, j) => ({ s, j }))
        .filter(
          ({ s, j }) =>
            !s.somenteTabela &&
            (serieEscolhida === null ? s.comparar !== false : j === serieEscolhida),
        ),
    [series, serieEscolhida],
  );
  const principal =
    visiveis.find(({ j }) => grupos.some((g) => g.valores[j] !== 0))?.j ?? 0;
  const pico = grupos.reduce(
    (best, g, i) =>
      Math.abs(g.valores[principal]) > Math.abs(grupos[best]?.valores[principal] ?? 0)
        ? i
        : best,
    0,
  );
  const indice = grupos.findIndex((g) => g.data === dataEscolhida),
    foco = indice >= 0 ? indice : pico,
    ponto = grupos[foco];
  const formatar = (v: number) => (monetario ? dinheiro(v) : numero(v));
  const compacto = (v: number) =>
    (monetario && Math.abs(v) < 100 ? formatoCompactoFracao : formatoCompacto).format(
      monetario ? v / 100 : v,
    );
  const valores = useMemo(
    () => grupos.flatMap((g) => visiveis.map(({ j }) => g.valores[j])),
    [grupos, visiveis],
  );
  const escala = useMemo(() => escalaGrafico(valores), [valores]),
    esquerda = monetario ? 62 : 36,
    direita = largura - 18,
    topo = 32,
    fundo = 242;
  const passo = (direita - esquerda) / Math.max(1, grupos.length),
    centro = (i: number) => esquerda + (i + 0.5) * passo;
  const y = (v: number) =>
    topo + ((escala.max - v) / (escala.max - escala.min)) * (fundo - topo);
  const larguraGrupo = Math.min(144, passo * 0.7),
    larguraBarra = Math.min(54, (larguraGrupo / visiveis.length) * 0.8);
  const datasEmDuasLinhas = agrupamento === "semana" && largura < 480;
  const recuoRotulo = agrupamento === "semana" && !datasEmDuasLinhas ? 42 : 25;
  const posicaoRotulo = (i: number) =>
    Math.max(esquerda + recuoRotulo, Math.min(direita - recuoRotulo, centro(i)));
  const rotulos = new Set(
    indicesRotulos(
      grupos.length,
      direita - esquerda,
      agrupamento === "semana" && !datasEmDuasLinhas ? 112 : 86,
    ),
  );
  const temDados = valores.some((v) => v !== 0);
  const cor = (s: SerieVisual, v: number) =>
    s.saldo && v < 0 ? "var(--gv-negativo)" : s.cor;
  const nome = (s: SerieVisual, v: number) =>
    s.saldo
      ? v < 0
        ? s.negativo || s.nome
        : v > 0
          ? s.positivo || s.nome
          : s.nome
      : s.nome;
  const escolher = (i: number, tipo: NonNullable<typeof detalhe>) => {
    setDataEscolhida(grupos[i].data);
    setDetalhe(tipo);
  };
  const popupX = Math.max(
    0,
    Math.min(
      largura - 260,
      centro(foco) > largura / 2 ? centro(foco) - 265 : centro(foco) + 20,
    ),
  );
  return (
    <section
      className="rel-painel gv-painel"
      id={id}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setDetalhe(null);
          e.stopPropagation();
        }
      }}
    >
      <header>
        <div>
          <h2>
            <BarChart3 size={21} />
            {titulo}
          </h2>
          <p className="rel-nota">{descricao}</p>
        </div>
        <div className="rel-grafico-controles">
          {controles}
          <label>
            Agrupar
            <select
              aria-label={`Agrupar ${titulo.toLowerCase()}`}
              value={agrupamento}
              onChange={(e) => {
                setModo(e.target.value as AgrupamentoGrafico);
                setDataEscolhida(null);
                setDetalhe(null);
              }}
            >
              <option value="dia">Por dia</option>
              <option value="semana">Por semana</option>
              <option value="mes">Por mês</option>
            </select>
          </label>
        </div>
      </header>
      <div
        className="gv-resumos"
        aria-label="Totais do período; clique para destacar um indicador"
      >
        {series.map(
          (s, j) =>
            !s.somenteTabela && (
              <button
                key={s.nome}
                type="button"
                className={`gv-resumo ${serieEscolhida === j ? "gv-resumo-ativo" : ""} ${s.saldo ? "gv-resumo-saldo" : ""}`}
                style={{ "--gv-cor": cor(s, totais[j]) } as CSSProperties}
                aria-pressed={serieEscolhida === j}
                aria-label={`Mostrar ${s.nome.toLowerCase()} no gráfico`}
                onClick={() => {
                  setSerieEscolhida(serieEscolhida === j ? null : j);
                  setDataEscolhida(null);
                  setDetalhe(null);
                }}
              >
                <span>
                  <i />
                  {nome(s, totais[j])}
                  {serieEscolhida === j && <Check size={16} />}
                </span>
                <strong>{formatar(totais[j])}</strong>
                <small>{s.detalhe}</small>
              </button>
            ),
        )}
      </div>
      <div className="gv-leitura-topo">
        <div className="gv-legenda">
          {visiveis.map(({ s }) => (
            <span key={s.nome}>
              <i style={{ background: s.cor }} />
              {s.nome}
            </span>
          ))}
          {visiveis.some(
            ({ s, j }) => s.saldo && grupos.some((g) => g.valores[j] < 0),
          ) && (
            <span>
              <i style={{ background: "var(--gv-negativo)" }} />
              Negativo
            </span>
          )}
          <span className="gv-unidade">
            {monetario ? "Valores em R$" : "Quantidade de OS"}
          </span>
        </div>
        {serieEscolhida !== null && (
          <button
            type="button"
            className="gv-comparar"
            onClick={() => {
              setSerieEscolhida(null);
              setDataEscolhida(null);
              setDetalhe(null);
            }}
          >
            Comparar indicadores
          </button>
        )}
      </div>
      <div
        ref={area}
        className="gv-area"
        onPointerLeave={() => {
          if (detalhe === "mouse") setDetalhe(null);
        }}
      >
        {!temDados ? (
          <div className="gv-vazio">
            <BarChart3 size={30} />
            <strong>Nenhum movimento neste intervalo</strong>
            <span>Os valores deste indicador estão zerados.</span>
          </div>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${largura} 292`}
              className="gv-grafico"
              role="group"
              aria-label={`${titulo}: ${visiveis.map(({ s }) => s.nome).join(", ")}`}
            >
              {escala.marcas.map((v) => (
                <g key={v}>
                  <line
                    className={v === 0 ? "gv-zero" : "gv-grade"}
                    x1={esquerda}
                    x2={direita}
                    y1={y(v)}
                    y2={y(v)}
                  />
                  <text
                    className="gv-eixo"
                    x={esquerda - 10}
                    y={y(v) + 4}
                    textAnchor="end"
                  >
                    {compacto(v)}
                  </text>
                </g>
              ))}
              {grupos.map((g, i) => (
                <g
                  key={g.data}
                  ref={(el) => {
                    barras.current[i] = el;
                  }}
                  tabIndex={i === foco ? 0 : -1}
                  role="button"
                  aria-label={`${rotuloGrupo(g, agrupamento, true)}: ${series
                    .filter((s) => !s.somenteTabela)
                    .map((s) => `${s.nome} ${formatar(g.valores[series.indexOf(s)])}`)
                    .join(", ")}`}
                  aria-pressed={detalhe === "fixo" && i === foco}
                  aria-describedby={detalhe && i === foco ? idDetalhe : undefined}
                  onFocus={() => escolher(i, "teclado")}
                  onBlur={() => {
                    if (detalhe === "teclado") setDetalhe(null);
                  }}
                  onPointerMove={(e) => {
                    if (
                      e.pointerType !== "touch" &&
                      detalhe !== "fixo" &&
                      (i !== foco || detalhe !== "mouse")
                    )
                      escolher(i, "mouse");
                  }}
                  onClick={() => escolher(i, "fixo")}
                  onKeyDown={(e) => {
                    const proximo =
                      e.key === "ArrowRight"
                        ? Math.min(i + 1, grupos.length - 1)
                        : e.key === "ArrowLeft"
                          ? Math.max(0, i - 1)
                          : e.key === "Home"
                            ? 0
                            : e.key === "End"
                              ? grupos.length - 1
                              : null;
                    if (proximo !== null) {
                      e.preventDefault();
                      barras.current[proximo]?.focus();
                    }
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      escolher(i, "fixo");
                    }
                  }}
                >
                  <rect
                    x={esquerda + i * passo}
                    y={topo - 18}
                    width={passo}
                    height={fundo - topo + 40}
                    fill="currentColor"
                    opacity={i === foco ? 0.045 : 0}
                    pointerEvents="all"
                    rx="5"
                  />
                  {visiveis.map(({ s, j }, n) => {
                    const v = g.valores[j],
                      bx =
                        centro(i) +
                        (n - (visiveis.length - 1) / 2) *
                          (larguraGrupo / visiveis.length) -
                        larguraBarra / 2;
                    return (
                      <g key={s.nome} pointerEvents="none">
                        <rect
                          className="gv-barra"
                          x={bx}
                          y={Math.min(y(0), y(v))}
                          width={larguraBarra}
                          height={Math.abs(y(v) - y(0))}
                          fill={cor(s, v)}
                          rx="3"
                        />
                        {passo / visiveis.length >= 58 && v !== 0 && (
                          <text
                            className="gv-valor-barra"
                            x={bx + larguraBarra / 2}
                            y={v >= 0 ? y(v) - 9 : y(v) + 15}
                            textAnchor="middle"
                          >
                            {compacto(v)}
                          </text>
                        )}
                      </g>
                    );
                  })}
                  {rotulos.has(i) && (
                    <text
                      className="gv-eixo gv-data"
                      x={posicaoRotulo(i)}
                      y={datasEmDuasLinhas ? 264 : 278}
                      textAnchor="middle"
                      pointerEvents="none"
                    >
                      {datasEmDuasLinhas
                        ? rotuloGrupo(g, agrupamento)
                            .split(" a ")
                            .map((data, linha) => (
                              <tspan
                                key={linha}
                                x={posicaoRotulo(i)}
                                dy={linha === 0 ? 0 : 16}
                              >
                                {linha === 0 ? data : `a ${data}`}
                              </tspan>
                            ))
                        : rotuloGrupo(g, agrupamento)}
                    </text>
                  )}
                </g>
              ))}
            </svg>
            {detalhe && ponto && (
              <div className="gv-popup" style={{ left: popupX }}>
                <div role="tooltip" id={idDetalhe}>
                  <strong>{rotuloGrupo(ponto, agrupamento, true)}</strong>
                  {series.map(
                    (s, j) =>
                      !s.somenteTabela && (
                        <div className="gv-popup-linha" key={s.nome}>
                          <span>
                            <i style={{ background: cor(s, ponto.valores[j]) }} />
                            {nome(s, ponto.valores[j])}
                          </span>
                          <b>{formatar(ponto.valores[j])}</b>
                        </div>
                      ),
                  )}
                </div>
                <button
                  type="button"
                  aria-label={`Fechar detalhes de ${titulo.toLowerCase()}`}
                  onClick={() => setDetalhe(null)}
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <div className="gv-orientacao">
        <span>
          <MousePointer2 size={14} /> Toque ou passe o mouse nas barras para ver os
          valores.
        </span>
        {temDados && ponto && (
          <button type="button" onClick={() => escolher(pico, "fixo")}>
            Pico de {series[principal].nome.toLowerCase()}:{" "}
            <b>{formatar(grupos[pico].valores[principal])}</b>
            <span> · {rotuloGrupo(grupos[pico], agrupamento)}</span>
          </button>
        )}
      </div>
      {temDados && ponto && (
        <div className="gv-detalhe">
          <label>
            Conferir intervalo
            <select
              aria-label={`Intervalo de ${titulo.toLowerCase()}`}
              value={ponto.data}
              onChange={(e) => {
                setDataEscolhida(e.target.value);
                setDetalhe("fixo");
              }}
            >
              {grupos.map((g) => (
                <option key={g.data} value={g.data}>
                  {rotuloGrupo(g, agrupamento, true)}
                </option>
              ))}
            </select>
          </label>
          <div aria-live="polite" aria-atomic="true">
            {series.map(
              (s, j) =>
                !s.somenteTabela && (
                  <span key={s.nome}>
                    <small>{nome(s, ponto.valores[j])}</small>
                    <strong
                      style={
                        s.saldo
                          ? {
                              color: `color-mix(in srgb, ${cor(s, ponto.valores[j])} 75%, var(--grafite))`,
                            }
                          : undefined
                      }
                    >
                      {formatar(ponto.valores[j])}
                    </strong>
                  </span>
                ),
            )}
          </div>
        </div>
      )}
      <details className="rel-detalhe-tabela gv-tabela">
        <summary>Ver valores em tabela</summary>
        <div className="rel-tabela-rolagem">
          <table className="rel-tabela">
            <thead>
              <tr>
                <th scope="col">Intervalo</th>
                {series.map((s) => (
                  <th key={s.nome} scope="col">
                    {s.nome}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <tr key={g.data}>
                  <th scope="row">{rotuloGrupo(g, agrupamento, true)}</th>
                  {series.map((s, j) => (
                    <td key={s.nome}>{formatar(g.valores[j])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!grupos.length && (
            <p className="rel-vazio">Sem dados no período escolhido.</p>
          )}
        </div>
      </details>
    </section>
  );
}
