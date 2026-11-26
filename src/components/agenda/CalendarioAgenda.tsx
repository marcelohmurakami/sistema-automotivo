import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { BuscaOperacao } from "../BuscaOperacao";
import { filtrarBuscaAgenda } from "../../lib/buscaOperacao";
import {
  inicioOcupacao,
  fimOcupacao,
  horarioVisita,
  type VisitaPlanejada,
} from "../../lib/logisticaVisitas";
import {
  diaAgenda,
  horaAgenda,
  diasCalendario,
  moverCalendario,
  agruparAgendaPorDia,
  somarDiasAgenda,
  type VisaoAgenda,
} from "../../lib/calendarioAgenda";
import "./CalendarioAgenda.css";

export type ItemCalendario = VisitaPlanejada & {
  cliente: string;
  identificacao?: string;
  placa?: string;
  servico?: string;
  recurso: string;
  recursoNome?: string;
  profissional?: {cor_agenda?:string;nome?:string};
  detalhes?: string[];
};
export type RecursoCalendario = { id: string; nome: string; ativo?: boolean };

function AgendarNoDia({
  dia,
  recurso,
  nome,
  novo,
}: {
  dia: string;
  recurso: string;
  nome: string;
  novo: (dia: string, hora?: string, recurso?: string) => void;
}) {
  const [hora, setHora] = useState("09:00");
  return (
    <div className="cal-oficina-novo-horario">
      <label>
        Horário
        <input
          type="time"
          aria-label={`Horário para agendar com ${nome}`}
          value={hora}
          onChange={(e) => setHora(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="cal-oficina-adicionar"
        disabled={!hora}
        onClick={() => novo(dia, hora, recurso)}
      >
        <Plus size={15} aria-hidden /> Agendar
      </button>
    </div>
  );
}

const dataExtensa = (dia: string) =>
  new Date(`${dia}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

/** Calendário compartilhado pelas oficinas, assistência, manutenção e limpeza. */
export function CalendarioAgenda({
  agenda,
  dia,
  alterarDia,
  abrir,
  novo,
  situacoes,
  recursos: recursosDisponiveis = [],
  rotuloRecurso = "Box ou responsável",
  rotuloDia = "Dia por responsável",
  exemploBusca = "Cliente, carro ou placa…",
  visao: visaoControlada,
  alterarVisao,
  aposGrade,
  historicoDias,
  fusoHorario,
}: {
  agenda: ItemCalendario[];
  dia: string;
  alterarDia: (dia: string) => void;
  abrir: (id: string) => void;
  novo: (dia: string, hora?: string, recurso?: string) => void;
  situacoes: Record<string, string>;
  recursos?: RecursoCalendario[];
  rotuloRecurso?: string;
  rotuloDia?: string;
  exemploBusca?: string;
  visao?: VisaoAgenda;
  alterarVisao?: (visao: VisaoAgenda) => void;
  aposGrade?: (itens: ItemCalendario[]) => ReactNode;
  historicoDias?: number;
  fusoHorario?: "America/Sao_Paulo";
}) {
  const [visaoLocal, setVisaoLocal] = useState<VisaoAgenda>("semana");
  const visao = visaoControlada ?? visaoLocal;
  const setVisao = alterarVisao ?? setVisaoLocal;
  const [recurso, setRecurso] = useState("");
  const [situacao, setSituacao] = useState("");
  const [busca, setBusca] = useState("");
  const hoje = diaAgenda(new Date(), fusoHorario);
  const dias = useMemo(() => diasCalendario(dia, visao), [dia, visao]);
  const recursos = useMemo(() => {
    const porId = new Map(recursosDisponiveis.map((r) => [r.id, r]));
    for (const x of agenda)
      if (x.recurso && !porId.has(x.recurso))
        porId.set(x.recurso, { id: x.recurso, nome: x.recursoNome || x.recurso });
    return [...porId.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [recursosDisponiveis, agenda]);
  const nomesRecursos = useMemo(
    () => new Map(recursos.map((r) => [r.id, r.nome])),
    [recursos],
  );
  const nomeRecurso = (id: string) => nomesRecursos.get(id) || "Sem responsável";
  const filtrados = useMemo(
    () =>
      filtrarBuscaAgenda(agenda, busca)
        .filter(
          (x) =>
            (!recurso || x.recurso === recurso) &&
            (situacao ? x.situacao === situacao : x.situacao !== "cancelado"),
        )
        .sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio)),
    [agenda, busca, recurso, situacao],
  );
  const { porDia, quantidade: quantidadeNoPeriodo } = useMemo(
    () => agruparAgendaPorDia(filtrados, dias, fusoHorario),
    [filtrados, dias, fusoHorario],
  );
  const selecionados = porDia.get(dia) || [];
  const grupos = recurso
    ? [recurso]
    : [
        ...new Set([
          ...recursosDisponiveis.filter((r) => r.ativo !== false).map((r) => r.id),
          ...selecionados.map((x) => x.recurso || ""),
        ]),
      ];
  const tituloPeriodo =
    visao === "dia"
      ? dataExtensa(dia)
      : visao === "mes"
        ? new Date(`${dia}T12:00:00`).toLocaleDateString("pt-BR", {
            month: "long",
            year: "numeric",
          })
        : `${new Date(`${dias[0]}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} a ${new Date(`${dias[6]}T12:00:00`).toLocaleDateString("pt-BR")}`;
  function evento(x: ItemCalendario) {
    const variasDatas =
      !!x.fim && diaAgenda(x.inicio, fusoHorario) !== diaAgenda(x.fim, fusoHorario);
    const horario = (data: string) =>
      variasDatas
        ? new Date(data).toLocaleString("pt-BR", {
            timeZone: fusoHorario,
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })
        : horaAgenda(data, fusoHorario);
    return (
      <button
        type="button"
        key={x.id}
        className={`cal-oficina-evento cal-oficina-evento--${x.situacao}`}
        style={/^#[0-9a-f]{6}$/i.test(x.profissional?.cor_agenda??'')?{borderLeftColor:x.profissional!.cor_agenda,borderLeftWidth:4}:undefined}
        onClick={() => abrir(x.id)}
        aria-label={`${horaAgenda(x.inicio, fusoHorario)} · ${x.cliente} · ${x.identificacao || x.servico || "Atendimento"} · ${situacoes[x.situacao] || x.situacao}`}
      >
        <strong>
          {horario(x.inicio)}
          {x.fim ? ` – ${horario(x.fim)}` : ""}
        </strong>
        <b>{x.cliente}</b>
        {x.identificacao && <span>{x.identificacao}</span>}
        {x.servico && <small>{x.servico}</small>}
        {x.detalhes?.map((texto, i) => (
          <small key={i}>{texto}</small>
        ))}
        <small>{x.profissional?.nome || nomeRecurso(x.recurso)}</small>
        {x.visita && (
          <small>
            Sair {horarioVisita(inicioOcupacao(x))} · livre{" "}
            {horarioVisita(fimOcupacao(x))}
          </small>
        )}
        <span className="cal-oficina-situacao">
          {situacoes[x.situacao] || x.situacao}
          {x.visita ? " · Visita" : ""}
        </span>
      </button>
    );
  }
  const adicionar = (d: string, r = "") => (
    <button
      type="button"
      className="cal-oficina-adicionar"
      onClick={() => novo(d, "09:00", r)}
      aria-label={`Agendar em ${dataExtensa(d)}${r ? ` com ${nomeRecurso(r)}` : ""}`}
    >
      <Plus size={15} aria-hidden /> Agendar
    </button>
  );
  return (
    <div className="cal-oficina">
      <BuscaOperacao
        rotulo="Buscar na agenda"
        exemplo={exemploBusca}
        valor={busca}
        alterar={setBusca}
      />
      <div className="cal-oficina-barra">
        <div className="cal-oficina-navegacao">
          <button
            type="button"
            aria-label="Período anterior"
            onClick={() => alterarDia(moverCalendario(dia, visao, -1))}
          >
            <ChevronLeft size={18} />
          </button>
          <button type="button" onClick={() => alterarDia(hoje)}>
            Hoje
          </button>
          <button
            type="button"
            aria-label="Próximo período"
            onClick={() => alterarDia(moverCalendario(dia, visao, 1))}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <label>
          Data
          <input
            type="date"
            value={dia}
            onChange={(e) => e.target.value && alterarDia(e.target.value)}
          />
        </label>
        <label>
          Visualização
          <select
            aria-label="Visualização"
            value={visao}
            onChange={(e) => setVisao(e.target.value as VisaoAgenda)}
          >
            <option value="dia" aria-label={rotuloDia}>
              Dia
            </option>
            <option value="semana">Semana</option>
            <option value="mes">Mês</option>
          </select>
        </label>
        <label>
          {rotuloRecurso}
          <select
            aria-label={rotuloRecurso}
            value={recurso}
            onChange={(e) => setRecurso(e.target.value)}
          >
            <option value="">Todos</option>
            {recursos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
                {r.ativo === false ? " (inativo)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Situação
          <select
            aria-label="Situação"
            value={situacao}
            onChange={(e) => setSituacao(e.target.value)}
          >
            <option value="">Ativos e concluídos</option>
            {Object.entries(situacoes).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="cal-oficina-periodo">
        <h3 aria-live="polite">{tituloPeriodo}</h3>
        <span role="status">
          {quantidadeNoPeriodo}{" "}
          {quantidadeNoPeriodo === 1 ? "agendamento" : "agendamentos"}
          {busca.trim()
            ? quantidadeNoPeriodo === 1
              ? " encontrado"
              : " encontrados"
            : ""}
        </span>
      </div>
      {busca.trim() && quantidadeNoPeriodo === 0 && (
        <p className="cal-oficina-vazio" role="status">
          Nenhum agendamento encontrado neste período. Tente outro cliente ou altere a
          data.
        </p>
      )}
      {historicoDias != null && dias[0] <= somarDiasAgenda(hoje, -historicoDias) && (
        <p role="status" className="cal-oficina-aviso">
          O histórico disponível nesta agenda começa nos últimos {historicoDias} dias.
          Datas anteriores podem não mostrar todos os atendimentos.
        </p>
      )}
      {visao === "dia" ? (
        <div className="cal-oficina-responsaveis">
          {(grupos.length ? grupos : [recurso]).map((r) => (
            <section key={r} className="cal-oficina-coluna">
              <h4>{r ? nomeRecurso(r) : "Agenda do dia"}</h4>
              {selecionados.filter((x) => (x.recurso || "") === r).map(evento)}
              {!selecionados.some((x) => (x.recurso || "") === r) && (
                <p className="cal-oficina-vazio">Nenhum agendamento neste dia.</p>
              )}
              <AgendarNoDia
                key={dia + r}
                dia={dia}
                recurso={r}
                nome={nomeRecurso(r)}
                novo={novo}
              />
            </section>
          ))}
        </div>
      ) : (
        <>
          {visao === "mes" && (
            <div className="cal-oficina-semana-labels" aria-hidden>
              {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
          )}
          <div className={`cal-oficina-grade cal-oficina-${visao}`}>
            {dias.map((d) => {
              const eventos = porDia.get(d) || [];
              return (
                <section
                  key={d}
                  data-dia={d}
                  className={`cal-oficina-coluna ${d === hoje ? "cal-oficina-hoje" : ""} ${d === dia ? "cal-oficina-selecionado" : ""} ${visao === "mes" && d.slice(0, 7) !== dia.slice(0, 7) ? "cal-oficina-fora" : ""}`}
                >
                  <button
                    type="button"
                    className="cal-oficina-dia"
                    aria-label={`${dataExtensa(d)} · ${eventos.length} agendamentos`}
                    aria-current={d === hoje ? "date" : undefined}
                    aria-pressed={d === dia}
                    onClick={() => {
                      alterarDia(d);
                      if (visao === "semana") setVisao("dia");
                    }}
                  >
                    <span>
                      {visao === "semana"
                        ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", {
                            weekday: "short",
                            day: "2-digit",
                            month: "2-digit",
                          })
                        : Number(d.slice(-2))}
                    </span>
                    {visao === "mes" && eventos.length > 0 && (
                      <small className="cal-oficina-contagem">
                        {eventos.length}
                        <span className="cal-oficina-contagem-texto"> agend.</span>
                      </small>
                    )}
                  </button>
                  <div className="cal-oficina-eventos">
                    {eventos.map(evento)}
                    {!eventos.length && visao === "semana" && (
                      <p className="cal-oficina-vazio">Sem agendamentos</p>
                    )}
                    {adicionar(d)}
                  </div>
                </section>
              );
            })}
          </div>
          {visao === "mes" && (
            <section
              className="cal-oficina-dia-mobile"
              aria-label="Agendamentos do dia selecionado"
            >
              <h4>{dataExtensa(dia)}</h4>
              {selecionados.map(evento)}
              {!selecionados.length && (
                <p className="cal-oficina-vazio">Nenhum agendamento neste dia.</p>
              )}
              {adicionar(dia)}
            </section>
          )}
        </>
      )}
      {aposGrade?.(filtrados)}
    </div>
  );
}
