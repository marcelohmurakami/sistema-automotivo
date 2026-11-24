import { componenteSobDemanda } from "../lib/componenteSobDemanda";
const DetalhesAtendimento = componenteSobDemanda(async () => ({
  default: (await import("../components/DetalhesAtendimento")).DetalhesAtendimento,
}));
const Agenda = componenteSobDemanda(async () => ({
  default: (await import("../components/servicos/AgendaServicos")).AgendaServicos,
}));
const Formulario = componenteSobDemanda(async () => ({
  default: (await import("../components/servicos/FormularioServico")).FormularioServico,
}));
const PainelAssistencia = componenteSobDemanda(async () => ({
  default: (await import("../components/servicos/PainelAssistencia")).PainelAssistencia,
}));
import { diasCalendario } from "../lib/calendarioAgenda";
import { AtalhoLocalizacao } from "../components/AtalhoLocalizacao";
import { usePagamentoAposRegistro } from "../lib/pagamentoAposRegistro";
import { novoId } from "../lib/uuid.ts";
import { AcoesAgendamento } from "../components/AcoesAgendamento";
import { usePublicarContextoAssistente } from "../lib/contextoAssistente";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  CalendarDays,
  CircuitBoard,
  ClipboardCheck,
  MapPin,
  Plus,
  Users,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAcesso } from "../auth/contexto";

import { Dialogo } from "../components/Dialogo";
import { IndicadoresEspecialidade } from "../components/IndicadoresEspecialidade";
import { etapasEmAndamento } from "../lib/assistenciaTecnica";
import { dinheiro } from "../lib/formatacao";
import {
  ordemSemAutorizacao,
  rotuloSituacaoDocumento,
} from "../lib/apresentacaoDocumentoServico";
import { interfaceRamo } from "../lib/interfaceRamo";
import {
  fichaDoAtendimento,
  resumoOperacao,
  subsetoresDoRamo,
  type FiltroOperacao,
} from "../lib/operacaoServicos";
import { novaFichaEspecialidade, perfilAtendimento } from "../lib/perfisAtendimento";
import { ramos } from "../lib/ramos";
import { erroPublico } from "../lib/supabase";
import { useBuscaDebounced } from "../lib/useBuscaDebounced";
import { atualizarConsultas } from "../lib/atualizarConsultas";
import { usePaginacaoCursor } from "../lib/usePaginacaoCursor";
import {
  consultarPaginaServicos,
  consultarResumoServicos,
  painelVazio,
  type CursorServico,
  type FiltrosServicos,
} from "../services/painelServicos";
import { RecursoProtegido } from "./Entrar";

import {
  diaLocal,
  estadosServico,
  gravarServico,
  somarDias,
} from "../services/servicos";

import type { Editor } from "../components/servicos/tipos";

export function Servicos({ tela }: { tela: string }) {
  const perguntarPagamento = usePagamentoAposRegistro();
  const a = useAcesso(),
    oficina = a.oficina!.id,
    ramo = a.oficina!.ramo || "automotivo",
    config = ramos[ramo],
    linguagem = interfaceRamo(ramo, a.oficina?.especialidade),
    qc = useQueryClient(),
    navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const local = useLocation();
  const [ultimoAtalho, setUltimoAtalho] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [abrirAprovacao, setAbrirAprovacao] = useState(false);
  useEffect(() => {
    const fecharFicha = () => {
      setDetalhe(null);
      setAbrirAprovacao(false);
    };
    window.addEventListener("patio:abrir-registro-assistente", fecharFicha);
    return () =>
      window.removeEventListener("patio:abrir-registro-assistente", fecharFicha);
  }, []);
  const [abrirFotos, setAbrirFotos] = useState(false);
  const [editorLocal, setEditorLocal] = useState<Editor | null>(null),
    [busca, setBusca] = useState(""),
    [estado, setEstado] = useState(""),
    [etapa, setEtapa] = useState(""),
    [subsetor, setSubsetor] = useState(""),
    [foco, setFoco] = useState<FiltroOperacao>(""),
    [aviso, setAviso] = useState("");
  const [agendaDia, setAgendaDia] = useState(diaLocal(new Date()));
  usePublicarContextoAssistente(tela === "/agenda" ? { data: agendaDia } : {});
  const [agendaVisao, setAgendaVisao] = useState<"dia" | "semana" | "mes">("semana");
  const diasDaAgenda = diasCalendario(agendaDia, agendaVisao);
  const primeiroDia = diasDaAgenda[0];
  const termo = useBuscaDebounced(busca);
  const filtros: FiltrosServicos = {
    tela:
      tela === "/objetos" ? "objetos" : tela === "/agenda" ? "agenda" : "atendimentos",
    busca: termo,
    documento: tela === "/orcamentos" ? "orcamento" : "",
    estado,
    etapa,
    subsetor,
    foco: params.has("pendencias") ? "pendencias" : foco,
    cliente: params.get("cliente") || "",
    objeto: params.get("objeto") || "",
    reserva: params.get("reserva") || "",
    inicio: primeiroDia,
    fim: somarDias(diasDaAgenda[diasDaAgenda.length - 1], 1),
  };
  const navegacao = usePaginacaoCursor<CursorServico>(
    JSON.stringify([oficina, filtros]),
  );
  const q = useQuery({
    enabled: !(linguagem.assistencia && tela === "/"),
    queryKey: ["servicos", oficina, a.demo, "pagina", filtros, navegacao.cursor],
    queryFn: ({ signal }) =>
      consultarPaginaServicos(oficina, a.demo, filtros, navegacao.cursor, signal),
    placeholderData: tela === "/agenda" ? keepPreviousData : undefined,
    refetchInterval: 60000,
  });
  const resumo = useQuery({
    queryKey: ["servicos", oficina, a.demo, "resumo", subsetor],
    queryFn: ({ signal }) => consultarResumoServicos(oficina, a.demo, subsetor, signal),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const dados = q.data || painelVazio;
  const clientesPorId = useMemo(
    () => new Map(dados.clientes.map((c) => [c.id, c])),
    [dados.clientes],
  );
  const objetosPorId = useMemo(
    () => new Map(dados.objetos.map((o) => [o.id, o])),
    [dados.objetos],
  );
  const perfil = perfilAtendimento(a.oficina?.especialidade, ramo);
  const etapasDisponiveis = [
    ...new Set([
      ...perfilAtendimento(subsetor || perfil.id, ramo).etapas,
      ...dados.atendimentos.flatMap((t) =>
        t.ficha_especialidade?.etapa ? [t.ficha_especialidade.etapa] : [],
      ),
    ]),
  ];
  const atendimentoLink = params.get("atendimento")
    ? { id: params.get("atendimento")! }
    : undefined;
  const reservaLink = dados.agenda.find((x) => x.id === params.get("reserva"));
  const editor: Editor | null =
    editorLocal || (reservaLink ? { tipo: "agenda", item: reservaLink } : null);
  function setEditor(e: Editor | null) {
    setEditorLocal(e);
    if (
      !e &&
      (params.has("atendimento") || params.has("reserva") || params.has("novo"))
    ) {
      const p = new URLSearchParams(params);
      p.delete("atendimento");
      p.delete("reserva");
      p.delete("novo");
      setParams(p, { replace: true });
    }
  }
  const salvar = useMutation({
    mutationFn: ({
      funcao,
      args,
      pronto,
    }: {
      funcao: string;
      args: Record<string, unknown>;
      fotos?: boolean;
      pronto?: boolean;
    }) => gravarServico(funcao, oficina, args, a.demo, { avisarConclusao: !pronto }),
    onSuccess: async (id, variaveis) => {
      setAbrirFotos(!!variaveis.fotos);
      setEditor(null);
      setAviso(
        variaveis.funcao === "programar_visitas_limpeza"
          ? "Visitas programadas com atendimentos independentes, respeitando o calendário."
          : variaveis.funcao === "programar_agenda_calendario"
            ? "Agendamentos recorrentes criados."
            : "Registro salvo.",
      );

      if (
        ["salvar_atendimento_servico", "criar_atendimento_com_itens"].includes(
          variaveis.funcao,
        ) &&
        typeof id === "string"
      ) {
        if (variaveis.pronto) {
          // Os detalhes são carregados sob demanda; se abrissem agora, poderiam
          // cobrir a pergunta de pagamento ao terminar de carregar.
          perguntarPagamento(
            { tipo: "atendimento", id, contexto: "criacao-pronta" },
            {
              rotulo: "Continuar",
              rotuloAdiar: "Agora não",
              executar: () => setDetalhe(id),
            },
          );
        } else setDetalhe(id);
      }
      await atualizarConsultas(
        qc,
        [
          ["servicos", oficina],
          ["selecao-operacao", oficina],
          ["financeiro"],
          ["alertas"],
          ["series-calendario", oficina],
          ["detalhes-atendimento"],
        ],
        [["servicos", oficina], ["detalhes-atendimento"]],
      );
    },
  });
  const nomeCliente = useCallback(
    (id: string) => clientesPorId.get(id)?.nome || "Cliente",
    [clientesPorId],
  );
  function abrir(e: Editor) {
    salvar.reset();
    setEditor(e);
  }
  function novoObjeto() {
    abrir({
      tipo: "objeto",
      item: {
        id: novoId(),
        cliente_id: params.get("cliente") || "",
        nome: "",
        dados: {},
        arquivado: false,
        revisao: 0,
      },
    });
  }
  function criarEditorAtendimento(): Editor {
    const objeto = dados.objetos.find((o) => o.id === params.get("objeto"));
    return {
      tipo: "atendimento",
      item: {
        id: novoId(),
        cliente_id: objeto?.cliente_id || params.get("cliente") || "",
        objeto_id: objeto?.id || "",
        titulo: "",
        situacao: "orcamento",
        dados: {
          documento: tela === "/orcamentos" ? "orcamento" : "ordem",
          orcamento_enviado: tela === "/orcamentos" ? "sim" : "nao",
        },
        valor_centavos: 0,
        vencimento: diaLocal(new Date()),
        data_servico: diaLocal(new Date()),
        revisao: 0,
        ficha_especialidade: novaFichaEspecialidade(subsetor || perfil.id),
      },
    };
  }
  function novoAtendimento() {
    abrir(criarEditorAtendimento());
  }
  // O atalho da ficha abre o formulário uma vez, preservando a seleção do cliente.
  if (params.get("novo") === "1" && ultimoAtalho !== local.key) {
    setUltimoAtalho(local.key);
    setEditorLocal(criarEditorAtendimento());
  }
  function novaAgenda(
    dia = diaLocal(new Date()),
    hora = "09:00",
    recurso = "",
    atendimento = "",
    recorrente = false,
  ) {
    abrir({
      tipo: "agenda",
      recorrente,
      item: {
        id: novoId(),
        atendimento_id: atendimento,
        recurso_id: recurso,
        inicio: `${dia}T${hora}:00-03:00`,
        fim: `${dia}T${hora}:00-03:00`,
        situacao: "agendado",
        observacoes: "",
        revisao: 0,
      },
    });
  }
  const hoje = diaLocal(new Date());
  const operacao = dados.atendimentos;
  const atalhos: { id: Exclude<FiltroOperacao, "">; nome: string }[] = [
    { id: "espera", nome: "Com pendência" },
    { id: "atrasados", nome: "Serviços atrasados" },
    ramo === "assistencia_tecnica"
      ? { id: "retirada", nome: "Prontos para retirada" }
      : { id: "retornos", nome: "Retornos a agendar" },
    ...(ramo === "manutencao_campo" ||
    ramo === "limpeza" ||
    (resumo.data?.aceite || 0) > 0 ||
    operacao.some(
      (t) => t.ficha_especialidade?.especialidade === "assistencia_eletrodomesticos",
    ) ||
    a.oficina?.especialidade === "assistencia_eletrodomesticos"
      ? [{ id: "aceite" as const, nome: "Aceite no local" }]
      : []),
  ];
  const atendimentos = dados.atendimentos;
  const podeOrdens = a.permite("work_orders");
  return (
    <section className="servicos-pagina">
      <div className="servicos-titulo">
        <div>
          <span className="sobretitulo">
            {config.nome} · {perfil.nome}
          </span>
          <h1>
            {tela === "/agenda"
              ? "Agenda"
              : tela === "/orcamentos"
                ? "Orçamentos"
                : tela === "/objetos"
                  ? config.plural
                  : tela === "/atendimentos"
                    ? linguagem.ordens
                    : "Sua operação, em dia"}
          </h1>
          <p>
            {tela === "/agenda"
              ? linguagem.agendaDescricao
              : tela === "/objetos"
                ? linguagem.assistencia
                  ? "Marca, modelo, número de série e histórico de cada equipamento."
                  : "Cadastros vinculados ao cliente e ao histórico de serviços."
                : !podeOrdens
                  ? "Organize os cadastros de clientes, equipamentos e serviços."
                  : linguagem.operacaoDescricao}
          </p>
        </div>
        {tela === "/objetos" ? (
          <button className="botao-primario" onClick={novoObjeto}>
            <Plus size={18} /> {config.objeto}
          </button>
        ) : tela === "/agenda" && podeOrdens ? (
          <AcoesAgendamento
            novo={() => novaAgenda()}
            recorrente={
              !a.demo && a.oficina!.perfil !== "staff"
                ? () => novaAgenda(agendaDia, "09:00", "", "", true)
                : undefined
            }
          />
        ) : (
          podeOrdens && (
            <button
              className="botao-primario"
              data-preparar-modulo="formularioServico"
              onClick={() => novoAtendimento()}
            >
              <Plus size={18} />
              {tela === "/orcamentos" ? "Novo orçamento" : config.atendimento}
            </button>
          )
        )}
      </div>
      {aviso && <p role="status">{aviso}</p>}
      {(q.isError || resumo.isError) && (
        <p role="alert">
          {erroPublico(q.error || resumo.error)}{" "}
          <button
            onClick={() => {
              void q.refetch();
              void resumo.refetch();
            }}
          >
            Tentar novamente
          </button>
        </p>
      )}
      {q.isLoading ? (
        <p role="status">Carregando operação…</p>
      ) : (
        <>
          {tela === "/" && (
            <>
              <div className="servicos-indicadores">
                {podeOrdens ? (
                  <>
                    <Link to="/atendimentos">
                      <Wrench />
                      <strong>{resumo.data?.abertos ?? "—"}</strong>
                      <span>Atendimentos em aberto</span>
                    </Link>
                    <Link to="/agenda">
                      <CalendarDays />
                      <strong>{resumo.data?.agendamentosHoje ?? "—"}</strong>
                      <span>Agendamentos hoje</span>
                    </Link>
                    <Link to="/?pendencias=1">
                      <ClipboardCheck />
                      <strong>{resumo.data?.pendencias ?? "—"}</strong>
                      <span>Prazos próximos ou vencidos</span>
                    </Link>
                  </>
                ) : (
                  <Link to="/clientes">
                    <Users />
                    <strong>{resumo.data?.clientes ?? "—"}</strong>
                    <span>Clientes cadastrados</span>
                  </Link>
                )}
                <Link to="/objetos">
                  {linguagem.assistencia ? <CircuitBoard /> : <MapPin />}
                  <strong>{resumo.data?.objetos ?? "—"}</strong>
                  <span>{config.plural}</span>
                </Link>
              </div>
              {resumo.data?.objetos === 0 && podeOrdens && (
                <div className="servicos-vazio">
                  <h2>Prepare seu primeiro atendimento</h2>
                  <p>
                    Cadastre o cliente, seu {config.objeto.toLowerCase()} e depois abra
                    o atendimento. Na agenda, cadastre os profissionais ou equipes que
                    receberão os serviços.
                  </p>
                  <div className="servico-acoes">
                    <Link className="botao-primario" to="/clientes">
                      Cadastrar clientes
                    </Link>{" "}
                    <Link className="botao-secundario" to="/objetos">
                      {config.plural}
                    </Link>
                  </div>
                </div>
              )}
            </>
          )}
          {linguagem.assistencia && tela === "/" ? (
            <PainelAssistencia
              abrir={(id, aprovacao) => {
                setAbrirAprovacao(!!aprovacao);
                setDetalhe(id);
              }}
            />
          ) : tela === "/objetos" ? (
            <>
              <Filtro busca={busca} setBusca={setBusca} />
              <div className="servicos-cards">
                {dados.objetos.map((o) => (
                  <article className="servico-card" key={o.id}>
                    <button
                      className="servico-linha-abrir"
                      onClick={() => abrir({ tipo: "objeto", item: o })}
                    >
                      <strong>{o.nome}</strong>
                      <span>
                        {nomeCliente(o.cliente_id)}
                        {o.arquivado ? " · Arquivado" : ""}
                      </span>
                      <small>
                        {o.dados.endereco ||
                          [o.dados.marca, o.dados.modelo, o.dados.serie]
                            .filter(Boolean)
                            .join(" · ")}
                      </small>
                    </button>
                    <div className="servico-linha-resumo">
                      {podeOrdens && (
                        <span>
                          {o.quantidade_atendimentos ??
                            dados.atendimentos.filter((x) => x.objeto_id === o.id)
                              .length}{" "}
                          atendimentos
                        </span>
                      )}
                    </div>
                    <div className="servico-acoes">
                      <AtalhoLocalizacao tipo="objeto" id={o.id} />
                      {podeOrdens && (
                        <Link to={`/atendimentos?objeto=${o.id}`}>Ver histórico</Link>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              {!dados.objetos.length && (
                <p>Nenhum cadastro. Comece pelo botão acima.</p>
              )}
            </>
          ) : tela === "/agenda" ? (
            <RecursoProtegido recurso="work_orders">
              <Agenda
                dados={dados}
                dia={agendaDia}
                setDia={setAgendaDia}
                visao={agendaVisao}
                setVisao={setAgendaVisao}
                abrir={abrir}
                novo={novaAgenda}
                gerencia={a.oficina?.perfil !== "staff"}
                nomeCliente={nomeCliente}
              />
            </RecursoProtegido>
          ) : podeOrdens ? (
            <>
              <div className="subsetor-atalhos" aria-label="Pendências da operação">
                {atalhos.map((atalho) => (
                  <button
                    key={atalho.id}
                    className={`subsetor-atalho ${atalho.id}`}
                    aria-pressed={foco === atalho.id}
                    onClick={() => {
                      setFoco(foco === atalho.id ? "" : atalho.id);
                      setEstado("");
                      setEtapa("");
                    }}
                  >
                    <strong>{resumo.data?.[atalho.id] ?? "—"}</strong>
                    <span>{atalho.nome}</span>
                  </button>
                ))}
              </div>
              <div className="servicos-filtros servicos-filtros-lista">
                <Filtro busca={busca} setBusca={setBusca} />
                <label>
                  Especialidade
                  <select
                    value={subsetor}
                    onChange={(e) => {
                      setSubsetor(e.target.value);
                      setEtapa("");
                    }}
                  >
                    <option value="">Todas as especialidades</option>
                    {subsetoresDoRamo(ramo).map(([id, p]) => (
                      <option key={id} value={id}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Situação
                  <select value={estado} onChange={(e) => setEstado(e.target.value)}>
                    <option value="">Todas</option>
                    {Object.entries(estadosServico).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Etapa técnica
                  <select value={etapa} onChange={(e) => setEtapa(e.target.value)}>
                    <option value="">Todas as etapas</option>
                    <option value="sem_etapa">Sem etapa definida</option>
                    {etapasDisponiveis.map((e) => (
                      <option key={e}>{e}</option>
                    ))}
                  </select>
                </label>
              </div>
              {foco && (
                <button className="botao-secundario" onClick={() => setFoco("")}>
                  Limpar filtro de{" "}
                  {atalhos.find((a) => a.id === foco)?.nome.toLowerCase()}
                </button>
              )}
              <details className="subsetor-cobertura">
                <summary>Conferência das fichas técnicas</summary>
                <IndicadoresEspecialidade
                  destino="atendimentos"
                  nota="Posição atual dos atendimentos exibidos, excluindo cancelamentos."
                  registros={atendimentos
                    .filter((t) => t.situacao !== "cancelado")
                    .map((t) => ({
                      id: t.id,
                      nome: `${t.titulo} · ${nomeCliente(t.cliente_id)}`,
                      ficha: t.ficha_especialidade,
                    }))}
                />
              </details>
              <div className="servicos-cards">
                {atendimentos.map((t) => {
                  const operacional = resumoOperacao(t, hoje, dados.agenda);
                  return (
                    <article className="servico-card" key={t.id}>
                      <button
                        className="servico-linha-abrir"
                        onClick={() => setDetalhe(t.id)}
                      >
                        <small>
                          #{t.numero || t.id.slice(0, 8)} · Serviço em{" "}
                          {(t.data_servico || t.vencimento)
                            .split("-")
                            .reverse()
                            .join("/")}
                        </small>
                        <strong>{t.titulo}</strong>
                        <span>
                          {nomeCliente(t.cliente_id)} ·{" "}
                          {objetosPorId.get(t.objeto_id)?.nome}
                        </span>
                      </button>
                      <div className="servico-linha-resumo">
                        <span className={`servico-status status-${t.situacao}`}>
                          {rotuloSituacaoDocumento(t, estadosServico[t.situacao])}
                        </span>
                        <strong>{dinheiro(t.valor_centavos)}</strong>
                        {operacional.prazo && (
                          <small
                            className={
                              operacional.atrasados ? "subsetor-atrasado" : undefined
                            }
                          >
                            Prazo: {operacional.prazo.split("-").reverse().join("/")}
                          </small>
                        )}
                        {(operacional.espera ||
                          t.ficha_especialidade?.campos.pendencia) && (
                          <small className="subsetor-pendencia">
                            {t.ficha_especialidade?.campos.pendencia ||
                              operacional.pendencia ||
                              "Aguardando resolução de pendência"}
                          </small>
                        )}
                      </div>
                      <div className="servico-linha-controles">
                        <label className="servico-etapa-tecnica">
                          Etapa técnica
                          <select
                            aria-label={`Etapa técnica de ${t.titulo}`}
                            value={t.ficha_especialidade?.etapa || ""}
                            disabled={
                              !podeOrdens ||
                              salvar.isPending ||
                              ["concluido", "cancelado"].includes(t.situacao)
                            }
                            onChange={(e) => {
                              const ficha = fichaDoAtendimento(t, perfil.id);
                              salvar.mutate({
                                funcao: "salvar_atendimento_servico",
                                args: {
                                  p_id: t.id,
                                  p_revisao: t.revisao,
                                  p_dados: {
                                    ...t,
                                    ficha_especialidade: {
                                      ...ficha,
                                      etapa: e.target.value,
                                    },
                                  },
                                },
                              });
                            }}
                          >
                            <option value="">Sem etapa definida</option>
                            {(t.situacao === "concluido"
                              ? perfilAtendimento(
                                  t.ficha_especialidade?.especialidade || perfil.id,
                                ).etapas
                              : etapasEmAndamento(
                                  t.ficha_especialidade?.especialidade || perfil.id,
                                )
                            ).map((e) => (
                              <option key={e}>{e}</option>
                            ))}
                          </select>
                        </label>
                        <div className="servico-acoes">
                          {a.oficina?.perfil !== "staff" &&
                            a.permite("quotes") &&
                            t.situacao === "orcamento" && (
                              <button
                                className="botao-primario"
                                disabled={salvar.isPending}
                                onClick={() => {
                                  setAbrirAprovacao(true);
                                  setDetalhe(t.id);
                                }}
                              >
                                {ordemSemAutorizacao(t)
                                  ? "Registrar autorização"
                                  : "Aprovar e abrir OS"}
                              </button>
                            )}
                          {podeOrdens && t.situacao !== "cancelado" && (
                            <button
                              onClick={() =>
                                novaAgenda(
                                  operacional.proxima && operacional.proxima > hoje
                                    ? operacional.proxima
                                    : hoje,
                                  "09:00",
                                  "",
                                  t.id,
                                )
                              }
                            >
                              <CalendarDays size={16} aria-hidden="true" />{" "}
                              {operacional.retornos
                                ? "Agendar retorno"
                                : linguagem.assistencia
                                  ? "Agendar atendimento"
                                  : "Agendar visita"}
                            </button>
                          )}
                          {a.permite("finance") &&
                            a.oficina?.perfil !== "staff" &&
                            !["orcamento", "cancelado"].includes(t.situacao) &&
                            t.valor_centavos > 0 && (
                              <button
                                disabled={
                                  salvar.isPending ||
                                  ["orcamento", "cancelado"].includes(t.situacao) ||
                                  t.valor_centavos <= 0
                                }
                                onClick={async () => {
                                  try {
                                    const id = await salvar.mutateAsync({
                                      funcao: "faturar_atendimento_servico",
                                      args: { p_atendimento: t.id },
                                    });
                                    navegar(`/financeiro?aba=contas&titulo=${id}`);
                                  } catch {
                                    /* erro abaixo */
                                  }
                                }}
                              >
                                {dados.cobrancas.some((c) => c.atendimento_id === t.id)
                                  ? "Ver cobrança"
                                  : "Gerar cobrança"}
                              </button>
                            )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              {!atendimentos.length && <p>Nenhum atendimento nesse filtro.</p>}
            </>
          ) : null}
        </>
      )}
      {!editor && salvar.isError && <p role="alert">{erroPublico(salvar.error)}</p>}
      {(detalhe || atendimentoLink) && !editor && (
        <DetalhesAtendimento
          key={`${detalhe || atendimentoLink!.id}:${abrirFotos}:${abrirAprovacao}`}
          abaInicial={abrirFotos ? "fotos" : abrirAprovacao ? "aprovacao" : "resumo"}
          id={detalhe || atendimentoLink!.id}
          fechar={() => {
            setAbrirAprovacao(false);
            setAbrirFotos(false);
            setDetalhe(null);
            setEditor(null);
          }}
          editar={(item) => {
            setAbrirAprovacao(false);
            setDetalhe(null);
            setEditor(null);
            abrir({ tipo: "atendimento", item });
          }}
        />
      )}
      {tela !== "/agenda" && (navegacao.pagina > 0 || q.data?.proximo) && (
        <nav className="catalogo-paginacao" aria-label="Páginas dos registros">
          <button
            type="button"
            disabled={navegacao.pagina === 0 || q.isFetching}
            onClick={navegacao.anterior}
          >
            Anterior
          </button>
          <span>Página {navegacao.pagina + 1}</span>
          <button
            type="button"
            disabled={!q.data?.proximo || q.isFetching}
            onClick={() => q.data?.proximo && navegacao.proxima(q.data.proximo)}
          >
            Próxima
          </button>
        </nav>
      )}
      <Dialogo
        aberto={!!editor}
        classe={
          editor?.tipo === "atendimento" ? "dialogo-orcamento" : "dialogo-assistencia"
        }
        fechar={() => {
          if (!salvar.isPending) setEditor(null);
        }}
        titulo={
          editor?.tipo === "objeto"
            ? config.objeto
            : editor?.tipo === "agenda"
              ? editor.item.revisao
                ? "Editar agendamento"
                : editor.recorrente
                  ? "Agendamento recorrente"
                  : "Novo agendamento"
              : editor?.tipo === "recurso"
                ? config.equipe
                : editor?.tipo === "atendimento" &&
                    editor.item.situacao === "orcamento" &&
                    editor.item.dados.documento === "orcamento"
                  ? "Orçamento"
                  : config.atendimento
        }
      >
        {editor && (
          <Formulario
            key={editor.item.id}
            editor={editor}
            ramo={ramo}
            dados={dados}
            ocupado={salvar.isPending}
            erro={salvar.isError ? erroPublico(salvar.error) : ""}
            salvar={(funcao, args, fotos, pronto) =>
              salvar.mutate({
                funcao,
                args,
                fotos,
                pronto,
              })
            }
          />
        )}
      </Dialogo>
    </section>
  );
}
function Filtro({ busca, setBusca }: { busca: string; setBusca: (v: string) => void }) {
  const assistencia = useAcesso().oficina?.ramo === "assistencia_tecnica";
  return (
    <label>
      Buscar
      <input
        type="search"
        placeholder={
          assistencia ? "Cliente, equipamento, série ou reparo" : "Cliente ou descrição"
        }
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />
    </label>
  );
}
