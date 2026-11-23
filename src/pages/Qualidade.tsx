import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { usePeriodoRelatorios } from "../lib/usePeriodoRelatorios";
import { PeriodoRelatorios } from "../components/relatorios/ControlesRelatorios";
import { SecaoRecolhivel } from "../components/SecaoRecolhivel";
import { componenteSobDemanda } from "../lib/componenteSobDemanda";
import {
  ListaQualidade,
  ResumoQualidade,
} from "../components/qualidade/ApresentacaoOcorrencias";
import { tiposOcorrencia } from "../lib/ocorrenciasAtendimento";
import { erroPublico } from "../lib/supabase";
import {
  consultarQualidade,
  novaOcorrencia,
  custoQualidade,
  situacoesQualidade,
  type OcorrenciaQualidade,
} from "../services/qualidade";
import "./Compras.css";

const OcorrenciaAutomotiva = componenteSobDemanda(async () => ({
  default: (await import("../components/qualidade/OcorrenciaAutomotiva"))
    .OcorrenciaAutomotiva,
}));
const normalizar = (s: string) =>
  s
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export function Qualidade() {
  const a = useAcesso(),
    oficina = a.oficina!,
    [params, setParams] = useSearchParams();
  const permitido = oficina.perfil !== "staff";
  const { periodo, aplicar, invalido } = usePeriodoRelatorios();
  const [busca, setBusca] = useState(""),
    [status, setStatus] = useState(""),
    [tipo, setTipo] = useState(""),
    [pagina, setPagina] = useState(0),
    [aviso, setAviso] = useState("");
  const [edicao, setEdicao] = useState<OcorrenciaQualidade | null>(() =>
    params.get("os")
      ? { ...novaOcorrencia(), ordem_original_id: params.get("os")! }
      : null,
  );
  const q = useQuery({
    queryKey: ["qualidade", a.demo, oficina.id, periodo.inicio, periodo.fim],
    queryFn: ({ signal }) =>
      consultarQualidade(a.demo, oficina.id, periodo.inicio, periodo.fim, signal),
    enabled: permitido,
  });
  const fechar = () => {
    setEdicao(null);
    if (params.has("os"))
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          n.delete("os");
          return n;
        },
        { replace: true },
      );
  };
  const { todas, indice, notas, pendentes, abertas, resolvidas, custo } =
    useMemo(() => {
      const todas = q.data?.ocorrencias ?? [];
      const validas = todas.filter((o) => o.situacao !== "cancelada");
      return {
        todas,
        indice: todas.map((o) => ({
          ocorrencia: o,
          busca: normalizar(
            `${o.numero_os} ${o.cliente} ${o.veiculo} ${o.descricao} ${o.funcionario}`,
          ),
        })),
        notas: validas.flatMap((o) => (o.nota_cliente ? [o.nota_cliente] : [])),
        pendentes: validas.filter((o) => !o.custos_conferidos).length,
        abertas: validas.filter((o) => o.situacao !== "resolvida").length,
        resolvidas: validas.filter((o) => o.situacao === "resolvida").length,
        custo: validas.reduce((s, o) => s + custoQualidade(o), 0),
      };
    }, [q.data]);
  const lista = useMemo(() => {
    const termo = normalizar(busca);
    return indice
      .filter(
        ({ ocorrencia: o, busca: texto }) =>
          (!status || o.situacao === status) &&
          (!tipo || o.tipo === tipo) &&
          texto.includes(termo),
      )
      .map((i) => i.ocorrencia)
      .sort(
        (a, b) =>
          Number(["resolvida", "cancelada"].includes(a.situacao)) -
            Number(["resolvida", "cancelada"].includes(b.situacao)) ||
          b.aberto_em.localeCompare(a.aberto_em) ||
          a.id.localeCompare(b.id),
      );
  }, [indice, status, tipo, busca]);
  if (!permitido)
    return <p>O acompanhamento está disponível ao proprietário e aos gerentes.</p>;
  const ultima = Math.max(0, Math.ceil(lista.length / 25) - 1),
    atual = Math.min(pagina, ultima);
  return (
    <section className="qserv" aria-label="Controle de retornos">
      <header className="qserv-cabecalho">
        <div>
          <h2>Ocorrências</h2>
        </div>
        <button
          className="botao-primario"
          onClick={() => {
            setEdicao(novaOcorrencia());
            setAviso("");
          }}
        >
          <Plus size={18} />
          Registrar ocorrência
        </button>
      </header>
      <PeriodoRelatorios
        periodo={periodo}
        aplicar={(p) => {
          setPagina(0);
          aplicar(p);
        }}
        invalido={invalido}
      />
      {aviso && <p role="status">{aviso}</p>}
      {q.isPending ? (
        <p role="status">Carregando ocorrências…</p>
      ) : q.isError ? (
        <div role="alert">
          <p>{erroPublico(q.error)}</p>
          <button onClick={() => q.refetch()}>Tentar novamente</button>
        </div>
      ) : (
        <>
          <ResumoQualidade abertas={abertas} resolvidas={resolvidas} custo={custo} />
          <div className="qserv-filtros">
            <label>
              Buscar ocorrência
              <input
                type="search"
                placeholder="OS, cliente, veículo ou problema"
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setPagina(0);
                }}
              />
            </label>
            <label>
              Situação
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPagina(0);
                }}
              >
                <option value="">Todas</option>
                {Object.entries(situacoesQualidade).map(([v, n]) => (
                  <option key={v} value={v}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tipo
              <select
                value={tipo}
                onChange={(e) => {
                  setTipo(e.target.value);
                  setPagina(0);
                }}
              >
                <option value="">Todos os tipos</option>
                {Object.entries(tiposOcorrencia).map(([v, n]) => (
                  <option key={v} value={v}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <small>
            Ocorrências abertas no período selecionado. Clique na linha para atualizar
            ou resolver.
          </small>
          <ListaQualidade
            itens={lista.slice(atual * 25, atual * 25 + 25).map((o) => ({
              id: o.id,
              tipo: tiposOcorrencia[o.tipo],
              abertura: new Date(o.aberto_em).toLocaleDateString("pt-BR"),
              descricao: o.descricao,
              cliente: o.cliente,
              referencia: [`OS #${o.numero_os}`, o.veiculo].filter(Boolean).join(" · "),
              situacao: situacoesQualidade[o.situacao],
              tom:
                o.situacao === "cancelada"
                  ? "cancelada"
                  : o.situacao === "resolvida"
                    ? "resolvida"
                    : "aberta",
              custo: custoQualidade(o),
              detalheCusto: !o.custos_conferidos
                ? "Custos a conferir"
                : o.horas_retrabalho
                  ? `${Number(o.horas_retrabalho).toLocaleString("pt-BR")} h de retrabalho`
                  : "Custos conferidos",
            }))}
            filtrada={!!busca || !!tipo || !!status}
            abrir={(id) => {
              setEdicao(todas.find((o) => o.id === id)!);
              setAviso("");
            }}
          />
          {lista.length > 25 && (
            <div className="qserv-paginacao">
              <span>
                Página {atual + 1} de {ultima + 1}
              </span>
              <button disabled={!atual} onClick={() => setPagina(atual - 1)}>
                Anterior
              </button>
              <button disabled={atual === ultima} onClick={() => setPagina(atual + 1)}>
                Próxima
              </button>
            </div>
          )}
          <SecaoRecolhivel titulo="Mais indicadores (opcional)">
            <div className="qserv-indicadores-extras">
              <p>
                <strong>{q.data?.abertas ?? 0}</strong> pendentes em todos os períodos
              </p>
              <p>
                <strong>{pendentes}</strong> com custos a conferir no período
              </p>
              <p>
                <strong>
                  {notas.length
                    ? (notas.reduce((s, n) => s + n, 0) / notas.length).toLocaleString(
                        "pt-BR",
                        { minimumFractionDigits: 1, maximumFractionDigits: 1 },
                      ) + " / 5"
                    : "Sem avaliações"}
                </strong>{" "}
                · {notas.length} avaliações de retornos e reclamações
              </p>
            </div>
            <Link to="/relatorios?aba=qualidade">Ver indicadores nos relatórios →</Link>
          </SecaoRecolhivel>
        </>
      )}
      {edicao && (
        <OcorrenciaAutomotiva
          key={edicao.id}
          inicial={edicao}
          fechar={fechar}
          aoSalvar={() => {
            fechar();
            setAviso("Ocorrência salva.");
          }}
        />
      )}
    </section>
  );
}
