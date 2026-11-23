import { usePeriodoRelatorios } from "../lib/usePeriodoRelatorios";
import {
  PeriodoRelatorios,
  NavegacaoSecoes,
  DetalhesRelatorio,
} from "../components/relatorios/ControlesRelatorios";
import { useMemo, useRef, useState } from "react";
import { componenteSobDemanda } from "../lib/componenteSobDemanda";
import { usePublicarContextoAssistente } from "../lib/contextoAssistente";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Printer, ArrowUpRight, CalendarDays } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { consultarRelatoriosServicos } from "../services/relatoriosServicos";
import {
  resumirServicos,
  type Classificacao,
  type ContaAtendimento,
} from "../lib/relatoriosServicos";
import { resultadoAtendimento } from "../lib/calculosAtendimento";
import { indicadoresLimpeza } from "../lib/indicadoresLimpeza";
import { categorias, formas } from "../services/financeiro";
import { dinheiro } from "../lib/formatacao";
import { erroPublico } from "../lib/supabase";
import { diaLocal, estadosServico } from "../services/servicos";
import { especialidades } from "../lib/especialidades";
import { GraficoResultados } from "../components/GraficoResultados";
import { Dialogo } from "../components/Dialogo";
import "./RelatoriosServicos.css";
import "./Relatorios.css";
const AnalisesGerenciais = componenteSobDemanda(
  () => import("../components/analises/AnalisesGerenciais"),
);

const numero = (v: number | null, unidade = "") =>
  v === null
    ? "Sem registros"
    : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}${unidade}`;
const data = (v: string) => v.slice(0, 10).split("-").reverse().join("/");
const nomePerfil = (id: string) => especialidades[id]?.nome || id.replaceAll("_", " ");
function Indicador({
  nome,
  valor,
  nota,
}: {
  nome: string;
  valor: string;
  nota?: string;
}) {
  return (
    <article className="rs-indicador">
      <span>{nome}</span>
      <strong>{valor}</strong>
      {nota && <small>{nota}</small>}
    </article>
  );
}
function Ranking({
  titulo,
  itens,
  formato = dinheiro,
  abrir,
}: {
  titulo: string;
  itens: Classificacao[];
  formato?: (v: number) => string;
  abrir?: (id: string) => void;
}) {
  const max = Math.max(1, ...itens.map((i) => Math.abs(i.valor)));
  return (
    <section className="rs-painel">
      <h3>{titulo}</h3>
      {!itens.length ? (
        <p className="rs-vazio">Nenhum registro neste período.</p>
      ) : (
        <ol className="rs-ranking">
          {itens.slice(0, 10).map((i, j) => (
            <li key={i.id}>
              <span className="rs-posicao">{j + 1}</span>
              <div>
                <div className="rs-ranking-linha">
                  {abrir ? (
                    <button onClick={() => abrir(i.id)}>
                      {i.nome}
                      <ArrowUpRight size={16} />
                    </button>
                  ) : (
                    <span>{i.nome}</span>
                  )}
                  <strong>{formato(i.valor)}</strong>
                </div>
                <div className="rs-trilho">
                  <span
                    className={i.valor < 0 ? "negativo" : ""}
                    style={{ width: `${(Math.abs(i.valor) / max) * 100}%` }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
export function RelatoriosServicos({ inicial = "financeiro" }: { inicial?: string }) {
  const acesso = useAcesso(),
    w = acesso.oficina!,
    hoje = diaLocal(new Date());
  const { periodo, aplicar, invalido } = usePeriodoRelatorios();
  const { inicio, fim } = periodo;
  const [params, setParams] = useSearchParams();
  const setParametro = (nome: string, valor: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (valor) n.set(nome, valor);
        else n.delete(nome);
        return n;
      },
      { replace: true },
    );
  const abaParam = params.get("aba") || inicial;
  const setAba = (v: string) => setParametro("aba", v);
  const secao = ["resumo", "caixa", "desempenho"].includes(params.get("secao") || "")
    ? params.get("secao")!
    : "resumo";
  const setSecao = (v: string) => setParametro("secao", v);
  const subsetor = params.get("subsetor") || "",
    cliente = params.get("cliente") || "",
    funcionario = params.get("funcionario") || "";
  const setSubsetor = (v: string) => setParametro("subsetor", v),
    setCliente = (v: string) => setParametro("cliente", v),
    setFuncionario = (v: string) => setParametro("funcionario", v);
  const [conta, setConta] = useState<string | null>(null);
  usePublicarContextoAssistente({ inicio, fim, ...(cliente ? { cliente } : {}) });
  const equipe = acesso.permite("employee_reports"),
    financeiro = acesso.permite("finance");
  const tabs = [
    ["financeiro", "Resultado"],
    ["operacao", "Operação"],
    ["qualidade", "Qualidade"],
    ["analises", "Análises"],
    ...(financeiro ? [["contas", "Contas a receber"]] : []),
    ...(equipe ? [["equipe", "Equipe"]] : []),
    ...(acesso.permite("inventory") ? [["estoque", "Estoque"]] : []),
  ];
  const aba = tabs.some(([id]) => id === abaParam) ? abaParam : inicial;
  const permitido = w.perfil !== "staff" && acesso.permite("reports");
  const q = useQuery({
    queryKey: ["relatorios-servicos", w.id, inicio, fim, acesso.demo],
    queryFn: ({ signal }) =>
      consultarRelatoriosServicos(acesso.demo, w.id, inicio, fim, signal),
    enabled: permitido && aba !== "analises",
  });
  const resumo = useMemo(
    () =>
      q.data
        ? resumirServicos(q.data, inicio, fim, { subsetor, cliente, funcionario })
        : null,
    [q.data, inicio, fim, subsetor, cliente, funcionario],
  );
  if (!permitido)
    return (
      <section className="rs-painel">
        <h1>Relatórios gerenciais</h1>
        <p>Disponível para gestores nos planos com relatórios.</p>
        <Link to="/planos">Ver meu plano</Link>
      </section>
    );
  const r = q.data,
    s = resumo;
  const perfis = [
    ...new Set(
      r?.detalhes
        .map((d) => d.atendimento.ficha_especialidade?.especialidade)
        .filter((id): id is string => !!id) || [],
    ),
  ];
  const clientes = [
    ...new Map(
      r?.detalhes.map((d) => [d.atendimento.cliente_id, d.cliente.nome]) || [],
    ).entries(),
  ];
  const funcionarios = [
    ...new Map(
      r?.detalhes.flatMap((d) =>
        [...d.equipe, ...(r.custeios?.[d.atendimento.id]?.participantes || [])].map(
          (e) => [e.funcionario_id, e.nome] as const,
        ),
      ) || [],
    ).entries(),
  ];
  const filtrado = !!(subsetor || cliente || funcionario);
  const abertos =
    r?.abertos.filter(
      (a) =>
        (!subsetor || a.ficha_especialidade?.especialidade === subsetor) &&
        (!cliente || a.cliente_id === cliente) &&
        (!funcionario || a.funcionarios.includes(funcionario)),
    ) || [];
  return (
    <div className="relatorios-servicos">
      <header className="rs-cabecalho">
        <div>
          <h1>
            {inicial === "qualidade"
              ? "Garantias e retrabalhos"
              : "Relatórios da empresa"}
          </h1>
          <p>Resultados, produtividade e pontos que precisam de atenção.</p>
        </div>
      </header>
      <label className="rr-menu-mobile">
        Relatório
        <select
          aria-label="Escolher relatório"
          value={aba}
          onChange={(e) => setAba(e.target.value)}
        >
          {tabs.map(([id, nome]) => (
            <option key={id} value={id}>
              {nome}
            </option>
          ))}
        </select>
      </label>
      <nav className="rs-abas" aria-label="Relatórios">
        {tabs.map(([id, nome]) => (
          <button key={id} aria-pressed={aba === id} onClick={() => setAba(id)}>
            {nome}
          </button>
        ))}
      </nav>
      <PeriodoRelatorios
        key={inicio + fim}
        periodo={periodo}
        aplicar={aplicar}
        invalido={invalido}
      />
      {aba === "financeiro" && (
        <NavegacaoSecoes
          valor={secao}
          mudar={setSecao}
          opcoes={[
            ["resumo", "Resumo"],
            ["desempenho", "Serviços e clientes"],
            ...(financeiro ? [["caixa", "Caixa e despesas"] as const] : []),
          ]}
        />
      )}
      {aba === "analises" ? (
        <AnalisesGerenciais key={w.id + inicio + fim} inicio={inicio} fim={fim} />
      ) : q.isPending ? (
        <p role="status">Calculando resultados…</p>
      ) : q.isError && !r ? (
        <p role="alert">
          {erroPublico(q.error)}{" "}
          <button onClick={() => void q.refetch()}>Tentar novamente</button>
        </p>
      ) : (
        r &&
        s && (
          <>
            {q.isError && !conta && (
              <p role="alert">
                Não foi possível atualizar os resultados. Os dados abaixo são da última
                consulta.{" "}
                <button onClick={() => void q.refetch()}>Tentar novamente</button>
              </p>
            )}
            {!["contas", "estoque"].includes(aba) && (
              <details className="rs-filtros">
                <summary>
                  Filtrar atendimentos {filtrado ? "· filtros ativos" : ""}
                </summary>
                <div>
                  <label>
                    Especialidade
                    <select
                      value={subsetor}
                      onChange={(e) => setSubsetor(e.target.value)}
                    >
                      <option value="">Todas</option>
                      {perfis.map((id) => (
                        <option key={id} value={id}>
                          {nomePerfil(id)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Cliente
                    <select
                      value={cliente}
                      onChange={(e) => setCliente(e.target.value)}
                    >
                      <option value="">Todos</option>
                      {clientes.map(([id, nome]) => (
                        <option key={id} value={id}>
                          {nome}
                        </option>
                      ))}
                    </select>
                  </label>
                  {equipe && (
                    <label>
                      Funcionário
                      <select
                        value={funcionario}
                        onChange={(e) => setFuncionario(e.target.value)}
                      >
                        <option value="">Todos</option>
                        {funcionarios.map(([id, nome]) => (
                          <option key={id} value={id}>
                            {nome}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button
                    onClick={() =>
                      setParams(
                        (p) => {
                          const n = new URLSearchParams(p);
                          for (const k of ["subsetor", "cliente", "funcionario"])
                            n.delete(k);
                          return n;
                        },
                        { replace: true },
                      )
                    }
                  >
                    Limpar filtros
                  </button>
                </div>
              </details>
            )}
            {aba === "financeiro" && (
              <>
                {secao === "resumo" && (
                  <>
                    <div className="rs-indicadores">
                      <Indicador
                        nome="Faturamento"
                        valor={dinheiro(s.receita)}
                        nota={`${s.encerrados.length} atendimentos concluídos`}
                      />
                      <Indicador
                        nome="Custos dos atendimentos"
                        valor={dinheiro(s.custo)}
                        nota={`${s.custosPendentes} atendimento(s) com custos a conferir`}
                      />
                      <Indicador
                        nome={
                          s.custosPendentes
                            ? "Margem provisória"
                            : "Margem dos atendimentos"
                        }
                        valor={dinheiro(s.margem)}
                        nota={
                          s.receita
                            ? `${numero((s.margem / s.receita) * 100, "%")} do faturamento`
                            : "Sem faturamento no período"
                        }
                      />
                      <Indicador nome="Ticket médio" valor={dinheiro(s.ticket)} />
                    </div>
                    {s.custosPendentes > 0 && (
                      <p className="rel-aviso">
                        {s.custosPendentes} atendimento(s) com custos a conferir. A
                        margem pode mudar.{" "}
                        <Link to="/financeiro?aba=custos">Conferir custos →</Link>
                      </p>
                    )}
                    <p className="rs-contexto">
                      Atendimentos concluídos com data do serviço entre {data(inicio)} e{" "}
                      {data(fim)}. A margem usa o custeio das OS, incluindo taxas e
                      despesas apropriadas. O caixa considera a data do pagamento.
                    </p>
                    <GraficoResultados
                      id="servicos-resultados"
                      titulo="Resultado por data do serviço"
                      descricao="Toque ou passe o mouse para ver os valores. Use a legenda para comparar."
                      pontos={s.serie}
                      monetario
                      series={[
                        {
                          nome: "Faturamento",
                          cor: "#43a2b0",
                          detalhe: "Total dos atendimentos concluídos.",
                        },
                        {
                          nome: "Margem",
                          cor: "#8aae67",
                          detalhe: "Faturamento menos custos registrados.",
                          saldo: true,
                        },
                      ]}
                    />
                  </>
                )}
                {secao === "desempenho" && (
                  <>
                    <div className="rs-duas-colunas">
                      <Ranking titulo="Serviços que mais faturam" itens={s.servicos} />
                      <Ranking
                        titulo="Materiais que mais faturam"
                        itens={s.materiais}
                      />
                      <Ranking titulo="Materiais por margem" itens={s.lucroMateriais} />
                      <Ranking titulo="Clientes por faturamento" itens={s.clientes} />
                      <Ranking titulo="Clientes por margem" itens={s.margens} />
                    </div>
                    <section className="rs-painel">
                      <h3>Orçado × valor final</h3>
                      <div className="rs-indicadores">
                        <Indicador
                          nome="Orçamento aprovado"
                          valor={dinheiro(s.orcado)}
                        />
                        <Indicador
                          nome="Valor atual desses atendimentos"
                          valor={dinheiro(s.finalOrcado)}
                        />
                        <Indicador
                          nome="Diferença"
                          valor={dinheiro(s.finalOrcado - s.orcado)}
                        />
                      </div>
                      <p>
                        Somente atendimentos com valor registrado na aprovação. A
                        diferença pode incluir acréscimos e descontos.
                      </p>
                    </section>
                  </>
                )}
                {secao === "caixa" && financeiro && (
                  <section className="rs-painel">
                    <h3>Caixa e despesas gerais da empresa</h3>
                    <p>
                      Movimentos financeiros do período, incluindo contas avulsas. Os
                      filtros de atendimento acima não se aplicam a este quadro.
                    </p>
                    <div className="rs-indicadores">
                      <Indicador
                        nome="Entradas líquidas"
                        valor={dinheiro(s.entradas)}
                      />
                      <Indicador nome="Saídas" valor={dinheiro(s.saidas)} />
                      <Indicador
                        nome="Variação do caixa"
                        valor={dinheiro(s.entradas - s.saidas)}
                      />
                    </div>
                    <div className="rs-duas-colunas">
                      <Ranking
                        titulo="Despesas por categoria"
                        itens={s.despesas.map((x) => ({
                          ...x,
                          nome: categorias[x.id] || x.nome,
                        }))}
                      />
                      <Ranking
                        titulo="Formas de recebimento"
                        itens={s.formas.map((x) => ({
                          ...x,
                          nome: formas[x.id] || x.nome,
                        }))}
                      />
                    </div>
                    <Link to="/financeiro">
                      Consultar contas e lançamentos <ArrowUpRight size={16} />
                    </Link>
                  </section>
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
            )}
            {aba === "operacao" && (
              <>
                {w.ramo === "limpeza" &&
                  (() => {
                    const l = indicadoresLimpeza(s.detalhes, r.custeios);
                    return (
                      <section className="rs-painel">
                        <h3>Produção da limpeza no período</h3>
                        <div className="rs-indicadores">
                          <Indicador
                            nome="Área dos serviços concluídos"
                            valor={numero(l.comArea ? l.area : null, " m²")}
                            nota={`${l.comArea} serviços com área informada; cada visita conta separadamente.`}
                          />
                          <Indicador
                            nome="Área por hora de equipe"
                            valor={numero(l.produtividade, " m²/h")}
                            nota={`${l.medidos} serviços com área e horas apontadas. Soma as horas de cada integrante.`}
                          />
                          <Indicador
                            nome="Conferência pendente / recusada"
                            valor={numero(l.pendentes)}
                            nota="Serviços concluídos que ainda precisam de aceite."
                          />
                          <Indicador
                            nome="Aceitos com ressalvas"
                            valor={numero(l.ressalvas)}
                            nota="Confira as pendências antes da próxima visita."
                          />
                        </div>
                      </section>
                    );
                  })()}
                <div className="rs-indicadores">
                  <Indicador
                    nome="Atendimentos no período"
                    valor={numero(s.detalhes.length)}
                  />
                  <Indicador nome="Concluídos" valor={numero(s.encerrados.length)} />
                  <Indicador
                    nome="Concluídos com atraso"
                    valor={numero(s.atrasados.length)}
                  />
                  <Indicador
                    nome="Atraso médio"
                    valor={numero(s.diasAtraso, " dias")}
                  />
                </div>
                <div className="rs-duas-colunas">
                  <Ranking
                    titulo="Tempo até concluir · por especialidade"
                    itens={s.duracoes.map((x) => ({ ...x, nome: nomePerfil(x.id) }))}
                    formato={(v) => numero(v, " dias")}
                  />
                  <Ranking
                    titulo="Tempo médio em cada etapa"
                    itens={s.etapas.map((x) => ({
                      ...x,
                      nome: x.nome.replaceAll("_", " "),
                    }))}
                    formato={(v) => numero(v, " h")}
                  />
                </div>
                <section className="rs-painel">
                  <h3>Fila atual · {abertos.length} atendimentos</h3>
                  <p>
                    Situação de agora, inclusive atendimentos anteriores ao período
                    escolhido.
                  </p>
                  <div className="rs-lista">
                    {abertos.length ? (
                      abertos.map((a) => (
                        <Link key={a.id} to={`/atendimentos?atendimento=${a.id}`}>
                          <span>
                            <strong>
                              #{a.numero} · {a.titulo}
                            </strong>
                            <small>
                              {a.ficha_especialidade?.etapa?.replaceAll("_", " ")}
                            </small>
                          </span>
                          <span>
                            {estadosServico[a.situacao]} <ArrowUpRight size={16} />
                          </span>
                        </Link>
                      ))
                    ) : (
                      <p className="rs-vazio">Nenhum atendimento em aberto.</p>
                    )}
                  </div>
                </section>
                <section className="rs-painel">
                  <h3>
                    <CalendarDays size={20} /> Agenda dos próximos dias
                  </h3>
                  <div className="rs-lista">
                    {r.agenda.length ? (
                      r.agenda.map((g) => (
                        <Link key={g.id} to="/agenda">
                          <span>
                            <strong>{g.titulo}</strong>
                            <small>{g.recurso}</small>
                          </span>
                          <span>
                            {new Date(g.inicio).toLocaleString("pt-BR", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </span>
                        </Link>
                      ))
                    ) : (
                      <p className="rs-vazio">Sem agendamentos nos próximos dias.</p>
                    )}
                  </div>
                </section>
              </>
            )}
            {aba === "qualidade" && (
              <>
                <p className="rs-contexto">
                  Ocorrências abertas entre {data(inicio)} e {data(fim)}. Registre uma
                  ocorrência na ficha do atendimento, em “Garantia e retrabalho”.
                </p>
                <Link
                  className="rr-contexto"
                  to={`/garantias?aba=satisfacao&inicio=${inicio}&fim=${fim}`}
                >
                  Ver pesquisa geral de satisfação e cobertura →
                </Link>
                <div className="rs-indicadores">
                  <Indicador nome="Retornos em garantia" valor={numero(s.garantias)} />
                  <Indicador nome="Retrabalhos" valor={numero(s.retrabalhos)} />
                  <Indicador
                    nome="Custo das ocorrências"
                    valor={dinheiro(s.custoQualidade)}
                  />
                  <Indicador
                    nome="Nota média recebida"
                    valor={numero(s.nota, " / 5")}
                    nota="Somente ocorrências com avaliação"
                  />
                  <Indicador
                    nome="Tempo para resolver"
                    valor={numero(s.diasResolucao, " dias")}
                    nota="Somente ocorrências resolvidas"
                  />
                </div>
                <section className="rs-painel">
                  <h3>Ocorrências</h3>
                  <div className="rs-lista">
                    {s.qualidade.length ? (
                      s.qualidade.map((q) => (
                        <Link
                          key={q.id}
                          to={`/atendimentos?atendimento=${q.atendimento_id}`}
                        >
                          <span>
                            <strong>
                              {q.cliente} · {q.titulo}
                            </strong>
                            <small>
                              {q.tipo} · {q.motivo}
                            </small>
                          </span>
                          <span>
                            <strong>
                              {q.resolvido_em ? "Resolvida" : "Em aberto"}
                            </strong>
                            <small>
                              {dinheiro(q.custo_centavos)} ·{" "}
                              {numero(q.minutos / 60, " h")}
                            </small>
                          </span>
                        </Link>
                      ))
                    ) : (
                      <p className="rs-vazio">
                        Nenhuma ocorrência registrada neste período.
                      </p>
                    )}
                  </div>
                </section>
              </>
            )}
            {aba === "equipe" && equipe && (
              <>
                <p className="rs-contexto">
                  {r.custeios
                    ? `Faturamento conforme a atribuição de cada atendimento. ${s.atribuicoesPendentes} atribuição(ões) a conferir em Resultados da equipe.`
                    : "Faturamento rateado igualmente entre os participantes cadastrados. As horas vêm dos apontamentos."}
                </p>
                <Ranking titulo="Faturamento por funcionário" itens={s.funcionarios} />
                <section className="rs-painel rs-tabela">
                  <table>
                    <caption>Produção e custos da equipe</caption>
                    <thead>
                      <tr>
                        <th>Funcionário</th>
                        <th>Atendimentos</th>
                        <th>Horas</th>
                        <th>Custo de comissões</th>
                        <th>Retornos</th>
                        <th>Custo das ocorrências</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.funcionarios.map((f) => {
                        const qs = s.qualidade.filter((q) => q.funcionario_id === f.id);
                        return (
                          <tr key={f.id}>
                            <th>{f.nome}</th>
                            <td>{f.quantidade}</td>
                            <td>{numero(f.horas)}</td>
                            <td>{dinheiro(f.comissoes)}</td>
                            <td>{qs.length}</td>
                            <td>
                              {dinheiro(qs.reduce((v, q) => v + q.custo_centavos, 0))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!s.funcionarios.length && (
                    <p className="rs-vazio">
                      Vincule funcionários aos atendimentos para acompanhar a produção.
                    </p>
                  )}
                  <Link to="/funcionarios?aba=resultados">
                    Conferir atribuição de receita, horas e custos por participante →
                  </Link>
                </section>
              </>
            )}
            {aba === "estoque" && (
              <>
                <p className="rs-contexto">
                  Saldos e reservas atuais. O consumo corresponde ao período
                  selecionado.
                </p>
                <div className="rs-indicadores">
                  <Indicador
                    nome="Valor em estoque"
                    valor={dinheiro(
                      r.estoque.reduce(
                        (v, p) => v + Math.round(p.saldo * p.custo_centavos),
                        0,
                      ),
                    )}
                  />
                  <Indicador
                    nome="Estoque zerado"
                    valor={numero(r.estoque.filter((p) => p.saldo <= 0).length)}
                  />
                  <Indicador
                    nome="Abaixo do mínimo"
                    valor={numero(
                      r.estoque.filter((p) => p.saldo - p.reservado < p.minimo).length,
                    )}
                    nota="Considera as quantidades reservadas"
                  />
                </div>
                <Ranking
                  titulo="Materiais mais consumidos"
                  itens={r.estoque
                    .filter((p) => p.consumido > 0)
                    .map((p) => ({
                      id: p.id,
                      nome: p.descricao,
                      valor: p.consumido,
                      quantidade: 1,
                    }))
                    .sort((a, b) => b.valor - a.valor)}
                  formato={(v) => numero(v)}
                />
                <section className="rs-painel rs-tabela">
                  <table>
                    <caption>Estoque, reservas e reposição</caption>
                    <thead>
                      <tr>
                        <th>Material</th>
                        <th>Saldo</th>
                        <th>Reservado</th>
                        <th>Disponível</th>
                        <th>Mínimo</th>
                        <th>Último movimento</th>
                        <th>Fornecedor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.estoque.map((p) => (
                        <tr key={p.id}>
                          <th>{p.descricao}</th>
                          <td className={p.saldo <= 0 ? "rs-urgente" : ""}>
                            {numero(p.saldo)}
                          </td>
                          <td>{numero(p.reservado)}</td>
                          <td>{numero(p.saldo - p.reservado)}</td>
                          <td>{numero(p.minimo)}</td>
                          <td>
                            {p.ultima_movimentacao
                              ? data(p.ultima_movimentacao)
                              : "Sem movimento"}
                          </td>
                          <td>{p.fornecedor || "Não informado"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Link to="/estoque">Gerenciar estoque</Link>
                </section>
              </>
            )}
            {aba === "contas" && financeiro && (
              <>
                <p className="rs-contexto">
                  Saldo em aberto de agora, de todos os períodos. Clique no cliente para
                  escolher os atendimentos e gerar a conta em PDF.
                </p>
                <div className="rs-indicadores">
                  <Indicador
                    nome="A receber de atendimentos"
                    valor={dinheiro(r.devedores.reduce((v, c) => v + c.saldo, 0))}
                  />
                  <Indicador
                    nome="Clientes com saldo aberto"
                    valor={numero(s.devedores.length)}
                  />
                  <Indicador
                    nome="Vencido"
                    valor={dinheiro(
                      r.devedores
                        .filter((c) => c.vencimento < hoje)
                        .reduce((v, c) => v + c.saldo, 0),
                    )}
                  />
                </div>
                <Ranking
                  titulo="Maiores saldos em aberto"
                  itens={s.devedores}
                  abrir={setConta}
                />
              </>
            )}
            {conta && (
              <Conta
                key={conta}
                empresa={w.nome}
                contas={r.devedores.filter((c) => c.cliente_id === conta)}
                conferir={async () => {
                  const atual = await q.refetch({ throwOnError: true });
                  return atual.data!.devedores.filter((c) => c.cliente_id === conta);
                }}
                fechar={() => setConta(null)}
              />
            )}
            <details className="rs-filtros">
              <summary>Como os resultados são calculados</summary>
              <p>
                Os custos seguem a apuração da OS: materiais, horas, comissões, taxas,
                ocorrências e despesas apropriadas. Valores não cadastrados ficam fora
                da margem. Os tempos de etapa consideram apenas intervalos com histórico
                registrado. Caixa usa as datas dos recebimentos e pagamentos,
                descontando estornos. Reservas não são baixas de estoque.
              </p>
              <p>
                {
                  s.encerrados.filter(
                    (d) =>
                      (r.custeios?.[d.atendimento.id]?.custo ??
                        resultadoAtendimento(d).custo) === 0,
                  ).length
                }{" "}
                atendimentos concluídos estão sem custos registrados.
              </p>
            </details>
          </>
        )
      )}
    </div>
  );
}
function Conta({
  empresa,
  contas,
  conferir,
  fechar,
}: {
  empresa: string;
  contas: ContaAtendimento[];
  conferir: () => Promise<ContaAtendimento[]>;
  fechar: () => void;
}) {
  const [selecionados, setSelecionados] = useState(
      () => new Set(contas.map((c) => c.titulo_id)),
    ),
    [erro, setErro] = useState(""),
    [ocupado, setOcupado] = useState(false);
  const trava = useRef(false);
  const lista = contas.filter((c) => selecionados.has(c.titulo_id));
  async function imprimir() {
    if (trava.current || !lista.length) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      const [atuais, { gerarPdfContaAtendimento }] = await Promise.all([
        conferir(),
        import("../services/pdfContaAtendimento"),
      ]);
      const porId = new Map(atuais.map((c) => [c.titulo_id, c]));
      if (lista.some((c) => porId.get(c.titulo_id)?.saldo !== c.saldo)) {
        throw new Error(
          "Os saldos mudaram. Confira a lista atualizada antes de gerar o PDF.",
        );
      }
      gerarPdfContaAtendimento(
        empresa,
        lista.map((c) => porId.get(c.titulo_id)!),
      ).save("conta-atendimentos.pdf");
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  return (
    <Dialogo
      aberto
      fechar={() => !trava.current && fechar()}
      titulo={`Conta de ${contas[0]?.cliente || "cliente"}`}
    >
      <p>Selecione os atendimentos que devem entrar no documento.</p>
      <div className="rs-selecao-contas">
        {contas.map((c) => (
          <label key={c.titulo_id}>
            <input
              type="checkbox"
              checked={selecionados.has(c.titulo_id)}
              disabled={ocupado}
              onChange={() =>
                setSelecionados((atual) => {
                  const proximo = new Set(atual);
                  if (proximo.has(c.titulo_id)) proximo.delete(c.titulo_id);
                  else proximo.add(c.titulo_id);
                  return proximo;
                })
              }
            />
            <span>
              <strong>
                #{c.numero} · {c.titulo}
              </strong>
              <small>
                Serviço: {data(c.data_servico)} · Vencimento: {data(c.vencimento)}
              </small>
            </span>
            <strong>{dinheiro(c.saldo)}</strong>
          </label>
        ))}
      </div>
      <p>
        <strong>
          Total selecionado: {dinheiro(lista.reduce((v, c) => v + c.saldo, 0))}
        </strong>
      </p>
      {erro && <p role="alert">{erro}</p>}
      <button
        className="botao-primario"
        disabled={!lista.length || ocupado}
        onClick={() => void imprimir()}
      >
        <Printer size={18} />
        Gerar PDF da conta
      </button>
    </Dialogo>
  );
}
