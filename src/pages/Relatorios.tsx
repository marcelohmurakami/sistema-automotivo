import { componenteSobDemanda } from "../lib/componenteSobDemanda";
const RelatoriosGestao = componenteSobDemanda(async () => ({
  default: (await import("../components/RelatoriosGestao")).RelatoriosGestao,
}));
const RankingDevedores = componenteSobDemanda(async () => ({
  default: (await import("../components/RankingDevedores")).RankingDevedores,
}));
const RelatorioOficina = componenteSobDemanda(async () => ({
  default: (await import("../components/RelatorioOficina")).RelatorioOficina,
}));
import { usePeriodoRelatorios } from "../lib/usePeriodoRelatorios";
import { baixarCSV } from "../lib/csv";
import { usePublicarContextoAssistente } from "../lib/contextoAssistente";
import { dinheiro } from "../lib/formatacao";
import { useRef, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Download,
  RefreshCw,
  Wallet,
  Wrench,
} from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { erroPublico } from "../lib/supabase";
import { consultarRelatorioOficina } from "../services/relatorioOficina";

import { linhasOficinaCSV } from "../lib/relatorioOficina";
import {
  PeriodoRelatorios,
  NavegacaoSecoes,
  DetalhesRelatorio,
} from "../components/relatorios/ControlesRelatorios";
import { consultarRelatorios } from "../services/gestao";
import { hoje } from "../services/financeiro";
import { consultarRelatorioFinanceiro } from "../services/relatorioFinanceiro";
import { RelatorioFinanceiro } from "../components/RelatorioFinanceiro";
import { useContasBancarias } from "../lib/useContasBancarias";
import { linhasFinanceirasCSV } from "../lib/exportarRelatorioFinanceiro";

import "./Relatorios.css";
const AnalisesGerenciais = componenteSobDemanda(
  () => import("../components/analises/AnalisesGerenciais"),
);
const dia = (s: string) => s.split("-").reverse().join("/");
const percentual = (n: number, total: number) =>
  total > 0
    ? ((n / total) * 100).toLocaleString("pt-BR", {
        maximumFractionDigits: 1,
      }) + "%"
    : "—";
const abas = [
  { id: "financeiro", nome: "Financeiro", icone: Wallet },
  { id: "oficina", nome: "Oficina", icone: Wrench },
  { id: "producao", nome: "Produção", icone: BarChart3 },
  { id: "estoque", nome: "Estoque e peças", icone: Wrench },
  { id: "qualidade", nome: "Qualidade", icone: CheckCircle2 },
  { id: "analises", nome: "Análises", icone: BarChart3 },
] as const;
type Aba = (typeof abas)[number]["id"];
function Indicador({
  titulo,
  valor,
  detalhe,
  tom = "",
}: {
  titulo: string;
  valor: string | number;
  detalhe: string;
  tom?: string;
}) {
  return (
    <article className={"rel-indicador " + (tom ? "rel-tom--" + tom : "")}>
      <span>{titulo}</span>
      <strong>{valor}</strong>
      <small>{detalhe}</small>
    </article>
  );
}

export function Relatorios() {
  const qc = useQueryClient();
  const { contas: nomesContas } = useContasBancarias();
  const a = useAcesso(),
    gerente = a.oficina?.perfil !== "staff",
    financeiro = a.permite("finance");
  const [params, setParams] = useSearchParams();
  const abaParam = params.get("aba");
  const aba: Aba = abas.some((t) => t.id === abaParam)
    ? (abaParam as Aba)
    : financeiro
      ? "financeiro"
      : "oficina";
  function setAba(v: Aba) {
    setParams(
      (p) => {
        const novos = new URLSearchParams(p);
        novos.set("aba", v);
        return novos;
      },
      { replace: true },
    );
  }
  const { periodo, aplicar, invalido } = usePeriodoRelatorios();
  usePublicarContextoAssistente({ inicio: periodo.inicio, fim: periodo.fim });
  const secao = ["resumo", "caixa", "devedores", "desempenho"].includes(
    params.get("secao") || "",
  )
    ? params.get("secao")!
    : "resumo";
  function setSecao(v: string) {
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.set("secao", v);
        return n;
      },
      { replace: true },
    );
  }
  const [exportando, setExportando] = useState(false);
  const exportacaoEmCurso = useRef(false);
  const [erroExportacao, setErroExportacao] = useState("");
  const q = useQuery({
    queryKey: ["relatorios", a.demo, a.oficina!.id, periodo.inicio, periodo.fim],
    queryFn: ({ signal }) =>
      consultarRelatorios(a.demo, a.oficina!.id, periodo.inicio, periodo.fim, signal),
    enabled: gerente && aba === "producao",
    staleTime: 60000,
    refetchInterval: 60000,
  });
  const oficina = useQuery({
    queryKey: [
      "relatorios-oficina",
      a.demo,
      a.oficina!.id,
      periodo.inicio,
      periodo.fim,
    ],
    queryFn: ({ signal }) =>
      consultarRelatorioOficina(
        a.demo,
        a.oficina!.id,
        periodo.inicio,
        periodo.fim,
        signal,
      ),
    enabled: gerente && aba === "oficina",
    staleTime: 60000,
    refetchInterval: 60000,
  });
  const fin = useQuery({
    queryKey: [
      "financeiro-relatorio",
      a.demo,
      a.oficina!.id,
      periodo.inicio,
      periodo.fim,
    ],
    queryFn: ({ signal }) =>
      consultarRelatorioFinanceiro(
        a.demo,
        a.oficina!.id,
        periodo.inicio,
        periodo.fim,
        signal,
      ),
    enabled: gerente && financeiro && aba === "financeiro",
    staleTime: 60000,
    refetchInterval: 60000,
  });
  const d = q.data,
    r = fin.data?.resumo;
  async function exportar() {
    if (exportacaoEmCurso.current) return;
    exportacaoEmCurso.current = true;
    setExportando(true);
    setErroExportacao("");
    try {
      // A exportação completa carrega também as abas que ainda não foram abertas.
      const [geral, oficinaAtual, financeiroAtual] = await Promise.all([
        q.refetch({ throwOnError: true }),
        oficina.refetch({ throwOnError: true }),
        financeiro ? fin.refetch({ throwOnError: true }) : Promise.resolve(null),
      ]);
      const d = geral.data,
        dadosFinanceiros = financeiroAtual?.data,
        r = dadosFinanceiros?.resumo;
      const custos = r ? r.pecas + r.despesas + r.taxas : 0;
      const resultado = r ? r.receitas - custos : 0;
      const saldo = dadosFinanceiros?.contas.reduce((s, c) => s + c.saldo, 0) ?? 0;
      const linhas: unknown[][] = [
        ["Grupo", "Indicador", "Valor", "Referência"],
        [
          "Consulta",
          "Gerado em",
          new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
          "Horário de Brasília",
        ],
      ];
      const referencia = dia(periodo.inicio) + " a " + dia(periodo.fim);
      const moeda = (v: number) => (v / 100).toFixed(2).replace(".", ",");
      if (r) {
        for (const [nome, valor] of [
          ["Receitas", r.receitas],
          ["Peças consumidas do estoque", r.pecas],
          ["Despesas e peças externas", r.despesas],
          ["Taxas", r.taxas],
          ["Custos totais", custos],
          ["Resultado estimado", resultado],
          ["Entradas líquidas", r.entradas],
          ["Saídas", r.saidas],
          ["Movimento líquido", r.entradas - r.saidas],
        ] as const)
          linhas.push(["Financeiro (R$)", nome, moeda(valor), referencia]);
        linhas.push(
          [
            "Financeiro",
            "Margem estimada",
            percentual(resultado, r.receitas),
            referencia,
          ],
          ["Financeiro", "OS com custos a conferir", r.revisar_custos, referencia],
        );
        for (const [nome, valor] of [
          ["Saldo em caixa e banco", saldo],
          ["A receber", r.receber],
          ["A pagar", r.pagar],
          ["A receber em atraso", r.receber_atrasado],
          ["A pagar em atraso", r.pagar_atrasado],
        ] as const)
          linhas.push(["Saldos atuais (R$)", nome, moeda(valor), hoje()]);
      }
      if (dadosFinanceiros)
        linhas.push(...linhasFinanceirasCSV(dadosFinanceiros, nomesContas));
      if (d) {
        for (const [nome, v, ref] of [
          ["Atual", d.atual, referencia],
          [
            "Anterior",
            d.anterior,
            dia(d.inicio_anterior) + " a " + dia(d.fim_anterior),
          ],
        ] as const) {
          for (const [indicador, valor] of [
            ["OS entregues", v.entregues],
            ["Vendido em OS (R$)", moeda(v.vendido)],
            ["Valor médio por OS (R$)", v.entregues ? moeda(v.ticket) : "Sem entregas"],
            ["Tempo médio (dias corridos)", v.prazo_medio ?? "Sem dados"],
            ["Entregas no prazo", v.no_prazo],
            ["Entregas com prazo informado", v.com_previsao],
          ] as const)
            linhas.push(["Produção " + nome, indicador, valor, ref]);
          if (!a.demo)
            linhas.push(
              ["Produção " + nome, "Orçamentos enviados", v.enviados, ref],
              ["Produção " + nome, "Orçamentos aprovados", v.aprovados, ref],
            );
        }
      }
      if (oficinaAtual.data) linhas.push(...linhasOficinaCSV(oficinaAtual.data));
      baixarCSV(linhas, "relatorio-" + periodo.inicio + "-" + periodo.fim + ".csv");
    } catch (erro) {
      setErroExportacao(erroPublico(erro));
    } finally {
      exportacaoEmCurso.current = false;
      setExportando(false);
    }
  }
  if (!gerente) return <p>Relatórios disponíveis ao proprietário e gerentes.</p>;
  return (
    <div className="rel-pagina">
      <header className="rel-cabecalho">
        <div>
          <h1>Relatórios</h1>
        </div>
        {aba !== "analises" && (
          <div className="rel-acoes">
            <button
              className="botao-secundario"
              disabled={
                q.isFetching || oficina.isFetching || (financeiro && fin.isFetching)
              }
              onClick={() => {
                if (aba === "producao") void q.refetch();
                if (aba === "oficina") void oficina.refetch();
                void qc.invalidateQueries({ queryKey: ["relatorios-gestao"] });
                void qc.invalidateQueries({ queryKey: ["contas-clientes"] });
                if (financeiro && aba === "financeiro") void fin.refetch();
              }}
              aria-label="Atualizar relatórios"
              title="Atualizar relatórios"
            >
              <RefreshCw size={17} />
            </button>
            <button
              className="botao-secundario"
              disabled={exportando}
              onClick={() => void exportar()}
            >
              <Download size={16} />
              {exportando ? "Preparando planilha…" : "Baixar planilha"}
            </button>
          </div>
        )}
      </header>
      {erroExportacao && <p role="alert">{erroExportacao}</p>}
      <label className="rr-menu-mobile">
        Relatório
        <select
          aria-label="Escolher relatório"
          value={aba}
          onChange={(e) => setAba(e.target.value as Aba)}
        >
          {abas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
      </label>
      <div className="rel-abas" role="tablist" aria-label="Tipo de relatório">
        {abas.map((t) => (
          <button
            key={t.id}
            id={"rel-aba-" + t.id}
            role="tab"
            aria-selected={aba === t.id}
            aria-controls={"rel-painel-" + t.id}
            tabIndex={aba === t.id ? 0 : -1}
            onKeyDown={(e) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
              e.preventDefault();
              const atual = abas.findIndex((x) => x.id === t.id);
              const indice =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? abas.length - 1
                    : (atual + (e.key === "ArrowRight" ? 1 : -1) + abas.length) %
                      abas.length;
              setAba(abas[indice].id);
              e.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>("button")
                .item(indice)
                ?.focus();
            }}
            onClick={() => setAba(t.id)}
          >
            <t.icone size={18} />
            {t.nome}
          </button>
        ))}
      </div>
      <PeriodoRelatorios
        key={periodo.inicio + periodo.fim}
        periodo={periodo}
        aplicar={aplicar}
        invalido={invalido}
      />
      <div
        role="tabpanel"
        id={"rel-painel-" + aba}
        aria-labelledby={"rel-aba-" + aba}
        className="rel-conteudo"
      >
        {aba === "analises" && (
          <AnalisesGerenciais
            key={a.oficina!.id + periodo.inicio + periodo.fim}
            inicio={periodo.inicio}
            fim={periodo.fim}
          />
        )}
        {(aba === "estoque" || aba === "qualidade") && (
          <RelatoriosGestao aba={aba} inicio={periodo.inicio} fim={periodo.fim} />
        )}
        {aba === "financeiro" &&
          (!financeiro ? (
            <p className="rel-vazio">
              O financeiro não está disponível no plano desta oficina.
            </p>
          ) : fin.isError ? (
            <p role="alert" className="rel-aviso">
              Não foi possível carregar o financeiro. {erroPublico(fin.error)}
            </p>
          ) : !r ? (
            <p role="status">Carregando financeiro…</p>
          ) : (
            <>
              <NavegacaoSecoes
                valor={secao}
                mudar={setSecao}
                opcoes={[
                  ["resumo", "Resumo"],
                  ["caixa", "Caixa e contas"],
                  ["devedores", "Clientes devendo"],
                  ["desempenho", "Serviços, clientes e equipe"],
                ]}
              />
              {(secao === "resumo" || secao === "caixa") && (
                <RelatorioFinanceiro
                  contas={nomesContas}
                  key={periodo.inicio + periodo.fim + secao}
                  dados={fin.data!}
                  visao={secao}
                />
              )}
              {secao === "devedores" && <RankingDevedores key={a.oficina!.id} />}
              {secao === "desempenho" && (
                <RelatoriosGestao aba={aba} inicio={periodo.inicio} fim={periodo.fim} />
              )}
              <DetalhesRelatorio titulo="Conferir custos, preços e resultado completo">
                <div className="rr-ferramentas">
                  <Link to="/financeiro?aba=resultado">
                    Resultado completo e contabilidade <ArrowUpRight size={16} />
                  </Link>
                  <Link to="/financeiro?aba=custos">
                    Conferir custos e margens <ArrowUpRight size={16} />
                  </Link>
                  <Link to="/financeiro?aba=precos">
                    Calcular preço e hora <ArrowUpRight size={16} />
                  </Link>
                </div>
              </DetalhesRelatorio>
            </>
          ))}
        {aba === "oficina" &&
          (oficina.isError ? (
            <p role="alert" className="rel-aviso">
              Não foi possível carregar os dados da oficina.{" "}
              {erroPublico(oficina.error)}
            </p>
          ) : !oficina.data ? (
            <p role="status">Carregando indicadores da oficina…</p>
          ) : (
            <>
              <RelatorioOficina
                key={periodo.inicio + periodo.fim}
                dados={oficina.data}
              />
              <DetalhesRelatorio titulo="Capacidade, agenda e retorno de clientes">
                <RelatoriosGestao aba={aba} inicio={periodo.inicio} fim={periodo.fim} />
              </DetalhesRelatorio>
            </>
          ))}
        {aba === "producao" && (
          <RelatoriosGestao aba={aba} inicio={periodo.inicio} fim={periodo.fim} />
        )}
        {aba === "producao" &&
          (q.isError ? (
            <p role="alert" className="rel-aviso">
              Não foi possível carregar a produção. {erroPublico(q.error)}
            </p>
          ) : !d ? (
            <p role="status">Carregando indicadores…</p>
          ) : (
            <>
              <section className="rel-indicadores" aria-label="Produção no período">
                <Indicador
                  titulo="OS entregues"
                  valor={d.atual.entregues}
                  detalhe={"Anterior: " + d.anterior.entregues + " OS"}
                />
                <Indicador
                  titulo="Valor médio por OS"
                  valor={d.atual.entregues ? dinheiro(d.atual.ticket) : "—"}
                  detalhe={
                    d.anterior.entregues
                      ? "Anterior: " + dinheiro(d.anterior.ticket)
                      : "Sem entregas no período anterior"
                  }
                />
                <Indicador
                  titulo="Tempo médio na oficina"
                  valor={
                    d.atual.prazo_medio === null
                      ? "—"
                      : d.atual.prazo_medio.toLocaleString("pt-BR") + " dias"
                  }
                  detalhe="Da entrada à entrega, incluindo esperas"
                />
                <Indicador
                  titulo="Entregas no prazo"
                  valor={percentual(d.atual.no_prazo, d.atual.com_previsao)}
                  detalhe={
                    d.atual.com_previsao
                      ? d.atual.no_prazo +
                        " de " +
                        d.atual.com_previsao +
                        " OS com prazo"
                      : "Nenhuma entrega com prazo informado"
                  }
                />
              </section>
              <section className="rel-painel">
                <header>
                  <h2>
                    <BarChart3 size={20} />
                    Comparação com o período anterior
                  </h2>
                </header>
                <p className="rel-nota">
                  Anterior: {dia(d.inicio_anterior)} a {dia(d.fim_anterior)} · mesmo
                  número de dias
                </p>
                <div className="rel-tabela-rolagem">
                  <table className="rel-tabela">
                    <thead>
                      <tr>
                        <th scope="col">Indicador</th>
                        <th scope="col">Anterior</th>
                        <th scope="col">Selecionado</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th scope="row">OS entregues</th>
                        <td>{d.anterior.entregues}</td>
                        <td>{d.atual.entregues}</td>
                      </tr>
                      <tr>
                        <th scope="row">Valor vendido nas OS entregues</th>
                        <td>{dinheiro(d.anterior.vendido)}</td>
                        <td>{dinheiro(d.atual.vendido)}</td>
                      </tr>
                      <tr>
                        <th scope="row">Valor médio por OS</th>
                        <td>
                          {d.anterior.entregues ? dinheiro(d.anterior.ticket) : "—"}
                        </td>
                        <td>{d.atual.entregues ? dinheiro(d.atual.ticket) : "—"}</td>
                      </tr>
                      <tr>
                        <th scope="row">Tempo médio na oficina</th>
                        <td>
                          {d.anterior.prazo_medio === null
                            ? "—"
                            : d.anterior.prazo_medio.toLocaleString("pt-BR") + " dias"}
                        </td>
                        <td>
                          {d.atual.prazo_medio === null
                            ? "—"
                            : d.atual.prazo_medio.toLocaleString("pt-BR") + " dias"}
                        </td>
                      </tr>
                      <tr>
                        <th scope="row">Entregas no prazo</th>
                        <td>
                          {percentual(d.anterior.no_prazo, d.anterior.com_previsao)}
                        </td>
                        <td>{percentual(d.atual.no_prazo, d.atual.com_previsao)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
              {!a.demo && (
                <section className="rel-painel">
                  <header>
                    <h2>
                      <CheckCircle2 size={20} />
                      Aprovação dos orçamentos
                    </h2>
                    <Link to="/orcamentos">
                      Ver orçamentos <ArrowUpRight size={15} />
                    </Link>
                  </header>
                  <div className="rel-aprovacao">
                    <strong>{percentual(d.atual.aprovados, d.atual.enviados)}</strong>
                    <div>
                      <p>
                        {d.atual.aprovados} aprovados de {d.atual.enviados} enviados
                      </p>
                      <meter
                        min={0}
                        max={Math.max(d.atual.enviados, 1)}
                        value={d.atual.aprovados}
                        aria-label="Orçamentos aprovados entre enviados"
                      />
                    </div>
                    <span>{d.atual.recusados} recusados</span>
                  </div>
                  <p className="rel-nota">
                    Situação atual dos orçamentos criados no período; exclui rascunhos e
                    cancelados.
                  </p>
                </section>
              )}
              <details className="rel-metodo">
                <summary>Como medimos a produção?</summary>
                <p>
                  As OS entram no período pela data da entrega. O valor médio é o total
                  vendido nessas OS dividido pela quantidade entregue. O tempo médio usa
                  dias corridos da entrada à entrega, incluindo esperas, e considera
                  somente OS com essas datas.
                </p>
                <p>
                  A pontualidade considera apenas as OS com data prometida;{" "}
                  {d.atual.entregues - d.atual.com_previsao} entrega(s) deste período
                  não têm prazo registrado. “—” significa que não há dados suficientes
                  para calcular.
                </p>
                <p>
                  As vendas incluem serviços e peças. São valores vendidos, que podem
                  ainda não ter sido recebidos.
                </p>
              </details>
            </>
          ))}
      </div>
    </div>
  );
}
