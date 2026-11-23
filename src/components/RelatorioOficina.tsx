import { DetalhesRelatorio } from "./relatorios/ControlesRelatorios";
import { GraficoResultados } from "./GraficoResultados";
import { memo, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowUpRight,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  PackageCheck,
  PauseCircle,
  Search,
  Users,
  Wrench,
} from "lucide-react";
import {
  nomeEtapaOficina,
  nomeMotivoOficina,
  type RelatorioOficina as Dados,
} from "../lib/relatorioOficina";

const numero = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const dia = (d: string) => d.split("-").reverse().join("/");
const dataHora = (d: string | null) =>
  d
    ? new Date(d).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Sem prazo";
const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export const GraficoAtendimentos = memo(function GraficoAtendimentos({
  dados,
}: {
  dados: Dados["serie"];
}) {
  return (
    <GraficoResultados
      id="ritmo-atendimentos"
      titulo="Ritmo dos atendimentos"
      descricao="Veja quantas OS entraram, ficaram prontas e foram entregues em cada intervalo."
      pontos={dados.map((p) => ({
        data: p.data,
        valores: [p.entradas, p.concluidas, p.entregues, p.canceladas],
      }))}
      series={[
        { nome: "Entradas", cor: "#3797b3", detalhe: "OS abertas no período" },
        {
          nome: "Prontas",
          cor: "#55a878",
          detalhe: "Serviços concluídos no período",
        },
        {
          nome: "Entregues",
          cor: "#d89046",
          detalhe: "Retiradas pelo cliente no período",
        },
        {
          nome: "Canceladas",
          cor: "#d96565",
          detalhe: "Cancelamentos",
          somenteTabela: true,
        },
      ]}
    />
  );
});
function Prazo({ titulo, dados }: { titulo: string; dados: Dados["prazo_entrega"] }) {
  const base = dados.no_prazo + dados.atrasadas;
  return (
    <div className="rel-oficina-prazo">
      <div>
        <span>{titulo}</span>
        <strong>{base ? numero((dados.no_prazo / base) * 100) + "%" : "—"}</strong>
      </div>
      <div className="rel-oficina-barra" aria-hidden="true">
        <i style={{ width: `${base ? (dados.no_prazo / base) * 100 : 0}%` }} />
      </div>
      <p>
        {base
          ? `${dados.no_prazo} no prazo · ${dados.atrasadas} atrasadas`
          : "Sem OS com prazo para avaliar"}
        {dados.sem_prazo > 0 && ` · ${dados.sem_prazo} sem data prometida`}
      </p>
    </div>
  );
}
export function RelatorioOficina({ dados: d }: { dados: Dados }) {
  const [filtro, setFiltro] = useState("abertas"),
    [busca, setBusca] = useState(""),
    [pagina, setPagina] = useState(0),
    [escopo, setEscopo] = useState("periodo");
  const [todosResponsaveis, setTodosResponsaveis] = useState(false),
    [todosServicos, setTodosServicos] = useState(false);
  const mudarFiltro = (valor: string, esc = "periodo") => {
    setFiltro(valor);
    setEscopo(esc);
    setPagina(0);
  };
  const indice = useMemo(
    () =>
      (escopo === "anteriores" ? d.anteriores : d.ordens).map((o) => ({
        ordem: o,
        termo: normalizar(
          `${o.numero} ${o.cliente} ${o.veiculo} ${o.responsavel || ""}`,
        ),
      })),
    [escopo, d.anteriores, d.ordens],
  );
  const lista = useMemo(() => {
    const termo = normalizar(busca.trim());
    return indice
      .filter(({ ordem: o, termo: texto }) => {
        if (filtro === "abertas" && ["delivered", "cancelled"].includes(o.situacao))
          return false;
        if (filtro === "atrasadas" && !o.atrasada) return false;
        if (
          filtro === "sem_previsao" &&
          (o.entrega_prevista_em || ["delivered", "cancelled"].includes(o.situacao))
        )
          return false;
        if (
          filtro === "sem_responsavel" &&
          (o.responsavel?.trim() || ["delivered", "cancelled"].includes(o.situacao))
        )
          return false;
        if (Object.hasOwn(nomeEtapaOficina, filtro) && o.etapa !== filtro) return false;
        return texto.includes(termo);
      })
      .map((x) => x.ordem);
  }, [indice, filtro, busca]);
  const paginas = Math.max(1, Math.ceil(lista.length / 20)),
    paginaAtual = Math.min(pagina, paginas - 1);
  const cards = [
    {
      titulo: "Entradas",
      chave: "entradas",
      detalhe: "Pela data do serviço",
      Icone: ArrowDownToLine,
    },
    {
      titulo: "Serviços concluídos",
      chave: "concluidas",
      detalhe: "Ficaram prontos no período",
      Icone: CheckCircle2,
    },
    {
      titulo: "Entregas ao cliente",
      chave: "entregues",
      detalhe: "Saíram da oficina no período",
      Icone: PackageCheck,
    },
    {
      titulo: "Cancelamentos",
      chave: "canceladas",
      detalhe: "Cancelados no período",
      Icone: PauseCircle,
    },
  ] as const;
  return (
    <>
      <nav className="rel-fin-atalhos" aria-label="Seções do relatório da oficina">
        <a href="#ritmo-atendimentos">Movimento</a>
        <a href="#rel-oficina-prazos">Prazos e tempos</a>
        <a href="#rel-oficina-situacao">Etapas e pendências</a>
        <a href="#rel-oficina-ordens">Ordens de serviço</a>
      </nav>
      <section className="rel-indicadores" aria-label="Movimento da oficina no período">
        {cards.map((c) => (
          <article className="rel-indicador rel-oficina-indicador" key={c.chave}>
            <span>
              <c.Icone size={19} />
              {c.titulo}
            </span>
            <strong>{d.atual[c.chave]}</strong>
            <small>
              {c.detalhe}
              <span className="rel-variacao">Anterior: {d.anterior[c.chave]} OS</span>
            </small>
          </article>
        ))}
      </section>
      <p className="rel-oficina-referencia">
        Comparação: {dia(d.inicio_anterior)} a {dia(d.fim_anterior)} · mesmo número de
        dias.
      </p>
      <GraficoAtendimentos dados={d.serie} />
      <div className="rel-duas-colunas" id="rel-oficina-prazos">
        <section className="rel-painel">
          <header>
            <h2>
              <Clock3 size={20} />
              Quanto tempo leva?
            </h2>
          </header>
          <dl className="rel-dados">
            {[
              { titulo: "Entrada → serviço pronto", valor: d.tempo_conclusao },
              {
                titulo: "Pronto → retirada pelo cliente",
                valor: d.tempo_retirada,
              },
              {
                titulo: "Entrada → entrega ao cliente",
                valor: d.tempo_entrega,
              },
            ].map((t) => (
              <div key={t.titulo}>
                <dt>
                  {t.titulo}
                  <small>{t.valor.amostra} OS com as duas datas registradas</small>
                </dt>
                <dd>{t.valor.dias === null ? "—" : `${numero(t.valor.dias)} dias`}</dd>
              </div>
            ))}
          </dl>
          <p className="rel-nota">
            Médias em dias corridos, incluindo esperas e fins de semana.
          </p>
        </section>
        <section className="rel-painel">
          <header>
            <h2>
              <CalendarCheck2 size={20} />
              Cumprimento do prazo prometido
            </h2>
          </header>
          <Prazo titulo="Serviço ficou pronto no prazo" dados={d.prazo_conclusao} />
          <Prazo titulo="Cliente retirou dentro do prazo" dados={d.prazo_entrega} />
          <p className="rel-nota">
            Só entram no percentual as OS com data prometida. Conclusões e entregas
            ocorridas no período.
          </p>
        </section>
      </div>
      <section className="rel-painel" id="rel-oficina-situacao">
        <header>
          <div>
            <h2>
              <Wrench size={20} />
              Como estão as OS do período?
            </h2>
            <p className="rel-nota">
              Situação atual das {d.situacao.total} OS com data do serviço entre{" "}
              {dia(d.inicio)} e {dia(d.fim)}.
            </p>
          </div>
          <Link to="/">
            Abrir mapa <ArrowUpRight size={16} />
          </Link>
        </header>
        <div className="rel-oficina-etapas">
          {d.etapas.map((e, i) => (
            <a
              key={e.id}
              className={`rel-oficina-etapa rel-oficina-etapa--${e.id}`}
              href="#rel-oficina-ordens"
              onClick={() => mudarFiltro(e.id)}
            >
              <span>
                <i />
                {e.nome}
              </span>
              <strong>{e.quantidade}</strong>
              <meter
                min="0"
                max={Math.max(1, d.situacao.total)}
                value={e.quantidade}
                aria-label={e.nome}
              />
              <small>{i < 5 ? "Em aberto" : "Encerradas"}</small>
            </a>
          ))}
        </div>
        <div className="rel-oficina-alertas">
          {[
            {
              nome: "Entrega atrasada",
              n: d.situacao.atrasadas,
              filtro: "atrasadas",
              tom: "perigo",
            },
            {
              nome: "Sem data prometida",
              n: d.situacao.sem_previsao,
              filtro: "sem_previsao",
              tom: "alerta",
            },
            {
              nome: "Sem responsável",
              n: d.situacao.sem_responsavel,
              filtro: "sem_responsavel",
              tom: "",
            },
          ].map((a) => (
            <a
              key={a.filtro}
              href="#rel-oficina-ordens"
              className={a.n ? `rel-tom--${a.tom}` : ""}
              onClick={() => mudarFiltro(a.filtro)}
            >
              <strong>{a.n}</strong>
              <span>{a.nome}</span>
              <ArrowUpRight size={16} />
            </a>
          ))}
        </div>
        {d.anteriores.length > 0 && (
          <a
            href="#rel-oficina-ordens"
            className="rel-oficina-anteriores"
            onClick={() => mudarFiltro("abertas", "anteriores")}
          >
            <Clock3 size={18} />
            <span>
              <strong>
                {d.anteriores.length} OS de antes desse período continuam em aberto.
              </strong>{" "}
              Conferir pendências anteriores
            </span>
            <ArrowUpRight size={17} />
          </a>
        )}
      </section>
      <DetalhesRelatorio titulo="Paradas, tempo de espera e produção da equipe">
        <div className="rel-duas-colunas" id="rel-oficina-paradas">
          <section className="rel-painel">
            <header>
              <div>
                <h2>
                  <PauseCircle size={20} />O que travou os serviços?
                </h2>
                <p className="rel-nota">
                  {d.paradas.ordens} OS tiveram paradas no período ·{" "}
                  {numero(d.paradas.horas)} horas corridas de espera.
                </p>
              </div>
            </header>
            {d.paradas.motivos.length ? (
              <div className="rel-motivos">
                {d.paradas.motivos.map((m) => (
                  <div key={m.motivo}>
                    <span>{nomeMotivoOficina[m.motivo] || "Outros motivos"}</span>
                    <strong>
                      {m.quantidade} OS · {numero(m.horas)} h
                    </strong>
                    <meter
                      min="0"
                      max={Math.max(1, d.paradas.horas)}
                      value={m.horas}
                      aria-label={nomeMotivoOficina[m.motivo] || m.motivo}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="rel-vazio">Nenhuma parada registrada nesse intervalo.</p>
            )}
            <p className="rel-nota">
              Inclui paradas já resolvidas e OS iniciadas antes do período. Motivos
              podem se sobrepor; o total de horas desconta essas sobreposições por OS.
            </p>
            {d.paradas.sem_data > 0 && (
              <p className="rel-nota">
                {d.paradas.sem_data} registro(s) sem data de início não entram no tempo
                de espera.
              </p>
            )}
          </section>
          <section className="rel-painel">
            <header>
              <h2>
                <Clock3 size={20} />
                Há quanto tempo estão aqui?
              </h2>
            </header>
            <div className="rel-motivos">
              {d.idade.map((i, index) => (
                <div
                  key={i.nome}
                  className={
                    index === 3 && i.quantidade > 0 ? "rel-oficina-idade-alerta" : ""
                  }
                >
                  <span>{i.nome}</span>
                  <strong>{i.quantidade} OS</strong>
                  <meter
                    min="0"
                    max={Math.max(1, d.situacao.abertas)}
                    value={i.quantidade}
                    aria-label={i.nome}
                  />
                </div>
              ))}
            </div>
            <p className="rel-nota">
              OS do período ainda em aberto. Tempo desde a entrada física na oficina.
              {d.situacao.sem_entrada > 0 &&
                ` ${d.situacao.sem_entrada} OS sem entrada registrada ficam fora das faixas.`}
            </p>
          </section>
        </div>
        <div className="rel-duas-colunas">
          <section className="rel-painel">
            <header>
              <h2>
                <Users size={20} />
                Distribuição por responsável
              </h2>
            </header>
            {d.responsaveis.length ? (
              <>
                <div className="rel-tabela-rolagem">
                  <table className="rel-tabela">
                    <thead>
                      <tr>
                        <th>Responsável</th>
                        <th>Abertas</th>
                        <th>Paradas</th>
                        <th>Atrasadas</th>
                        <th>Entregas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.responsaveis
                        .slice(0, todosResponsaveis ? undefined : 8)
                        .map((r) => (
                          <tr key={r.nome}>
                            <th scope="row">{r.nome}</th>
                            <td>{r.abertas}</td>
                            <td>{r.paradas}</td>
                            <td>{r.atrasadas}</td>
                            <td>{r.entregues}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {d.responsaveis.length > 8 && (
                  <button
                    className="rel-link"
                    onClick={() => setTodosResponsaveis(!todosResponsaveis)}
                  >
                    {todosResponsaveis
                      ? "Mostrar menos"
                      : `Ver os ${d.responsaveis.length} responsáveis`}
                  </button>
                )}
              </>
            ) : (
              <p className="rel-vazio">Sem atendimentos para distribuir.</p>
            )}
            <p className="rel-nota">
              Abertas: entradas do período. Entregas: realizadas no período. Usa o
              responsável atualmente registrado na OS.
            </p>
          </section>
          <section className="rel-painel">
            <header>
              <h2>
                <Wrench size={20} />
                Serviços mais realizados
              </h2>
            </header>
            {d.servicos.length ? (
              <>
                <div className="rel-tabela-rolagem">
                  <table className="rel-tabela">
                    <thead>
                      <tr>
                        <th>Serviço</th>
                        <th>OS entregues</th>
                        <th>Quantidade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.servicos.slice(0, todosServicos ? undefined : 8).map((s) => (
                        <tr key={s.nome}>
                          <th scope="row">{s.nome}</th>
                          <td>{s.ordens}</td>
                          <td>{numero(s.quantidade)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {d.servicos.length > 8 && (
                  <button
                    className="rel-link"
                    onClick={() => setTodosServicos(!todosServicos)}
                  >
                    {todosServicos
                      ? "Mostrar menos"
                      : `Ver os ${d.servicos.length} serviços`}
                  </button>
                )}
              </>
            ) : (
              <p className="rel-vazio">
                Nenhum item de serviço nas OS entregues nesse período.
              </p>
            )}
            <p className="rel-nota">
              Itens de serviço das OS entregues no período. Peças e itens cancelados
              ficam fora dessa contagem.
            </p>
          </section>
        </div>
      </DetalhesRelatorio>
      <section className="rel-painel" id="rel-oficina-ordens">
        <header>
          <div>
            <h2>Conferir ordens de serviço</h2>
            <p className="rel-nota">
              {escopo === "anteriores"
                ? `Entradas anteriores a ${dia(d.inicio)} ainda em aberto hoje.`
                : "Entradas no período selecionado, com a situação atual."}
            </p>
          </div>
          <strong>{lista.length} OS</strong>
        </header>
        <div className="rel-oficina-filtros">
          <label className="rel-oficina-busca">
            <span>
              <Search size={15} />
              Buscar OS, cliente, veículo ou responsável
            </span>
            <input
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina(0);
              }}
              placeholder="Nome ou número da OS"
              type="search"
            />
          </label>
          <label>
            Origem
            <select
              value={escopo}
              onChange={(e) => {
                setEscopo(e.target.value);
                setPagina(0);
              }}
            >
              <option value="periodo">Entradas no período</option>
              <option value="anteriores">
                Pendências anteriores ({d.anteriores.length})
              </option>
            </select>
          </label>
          <label>
            Mostrar
            <select
              value={filtro}
              onChange={(e) => mudarFiltro(e.target.value, escopo)}
            >
              <option value="todas">Todas</option>
              <option value="abertas">Em aberto</option>
              <option value="atrasadas">Entrega atrasada</option>
              <option value="sem_previsao">Sem data prometida</option>
              <option value="sem_responsavel">Sem responsável</option>
              {Object.entries(nomeEtapaOficina).map(([id, n]) => (
                <option key={id} value={id}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        {lista.length ? (
          <>
            <div className="rel-tabela-rolagem">
              <table className="rel-tabela rel-oficina-tabela">
                <thead>
                  <tr>
                    <th>OS / cliente</th>
                    <th>Motor, peça ou veículo</th>
                    <th>Situação atual</th>
                    <th>Responsável</th>
                    <th>Prometido</th>
                    <th>Na oficina</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.slice(paginaAtual * 20, (paginaAtual + 1) * 20).map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link to={`/ordens-servico?os=${o.id}`}>
                          <strong>
                            #{o.numero} <ArrowUpRight size={13} />
                          </strong>
                          <span>{o.cliente}</span>
                        </Link>
                        <small>Serviço: {dia(o.data_entrada)}</small>
                      </td>
                      <td>{o.veiculo}</td>
                      <td>
                        <span
                          className={`rel-etiqueta ${o.atrasada ? "rel-etiqueta--perigo" : o.parada ? "rel-etiqueta--alerta" : ""}`}
                        >
                          {nomeEtapaOficina[o.etapa]}
                        </span>
                        {o.atrasada && (
                          <small className="rel-oficina-atraso">Entrega atrasada</small>
                        )}
                        {o.motivos && <small>{o.motivos}</small>}
                        {o.dias_pronta !== null && (
                          <small>Pronta há {numero(o.dias_pronta)} dias</small>
                        )}
                      </td>
                      <td>{o.responsavel || "Sem responsável"}</td>
                      <td>{dataHora(o.entrega_prevista_em)}</td>
                      <td>
                        {o.dias_na_oficina === null
                          ? "—"
                          : `${numero(o.dias_na_oficina)} dias`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rel-oficina-paginacao">
              <span>
                {paginaAtual * 20 + 1}–{Math.min(lista.length, (paginaAtual + 1) * 20)}{" "}
                de {lista.length}
              </span>
              <button
                className="botao-secundario"
                disabled={paginaAtual === 0}
                onClick={() => setPagina(paginaAtual - 1)}
              >
                Anterior
              </button>
              <button
                className="botao-secundario"
                disabled={paginaAtual === paginas - 1}
                onClick={() => setPagina(paginaAtual + 1)}
              >
                Próxima
              </button>
            </div>
          </>
        ) : (
          <p className="rel-vazio">
            <CheckCircle2 size={22} />
            Nenhuma OS corresponde a esse filtro.
          </p>
        )}
      </section>
      <details className="rel-metodo rel-painel">
        <summary>Como ler este relatório</summary>
        <p>
          Entradas usam a data do serviço informada na OS. Registros antigos sem esse
          campo usam a entrada na oficina ou a criação. Conclusões, entregas e
          cancelamentos usam suas próprias datas; por isso uma entrega pode pertencer a
          uma OS de outro mês.
        </p>
        <p>
          Etapas, pendências e lista mostram a situação atual das OS iniciadas no
          período, não uma reconstrução do mapa no passado. Pendências anteriores
          aparecem separadas. OS excluídas não participam do relatório.
        </p>
        <p>
          Tempos usam a entrada física registrada, não a data manual do serviço. São
          médias de dias corridos, não horas trabalhadas. Prazos usam a data prometida
          atualmente salva. OS que voltaram ao atendimento só entram nas conclusões
          quando estiverem novamente prontas ou entregues; vale a última conclusão
          registrada.
        </p>
      </details>
    </>
  );
}
