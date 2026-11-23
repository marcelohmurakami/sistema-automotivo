import { useLembretesFinanceiros } from "./financeiro/contextoLembretes";
import { destinoLembrete, lembreteAdiado } from "../services/lembretesFinanceiros";
import { dinheiro } from "../lib/formatacao";
import { lazy, Suspense, useState } from "react";
import {
  Bell,
  CalendarDays,
  CarFront,
  Wrench,
  MessageCircle,
  Trash2,
  Wallet,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useAcesso } from "../auth/contexto";
import {
  consultarAlertas,
  excluirAlerta,
  excluirTodosAlertas,
  marcarAlertasLidos,
  type Alerta,
} from "../services/alertas";
import { textoPrazo } from "../lib/alertas";

import { erroPublico } from "../lib/supabase";
import { Dialogo } from "./Dialogo";
import "./AlertasOficina.css";
const AcaoAlerta = lazy(() =>
  import("./AcaoAlerta").then((m) => ({ default: m.AcaoAlerta })),
);

export function AlertasOficina() {
  const navegar = useNavigate();
  const lembretes = useLembretesFinanceiros();
  const a = useAcesso(),
    qc = useQueryClient(),
    oficina = a.oficina?.id ?? "demo",
    usuario = a.usuario ?? "demo";
  const [aberto, setAberto] = useState(false),
    [filtro, setFiltro] = useState("todos"),
    [erro, setErro] = useState(""),
    [ocupado, setOcupado] = useState(false);
  const [limpando, setLimpando] = useState(false),
    [aviso, setAviso] = useState("");
  const [selecionado, setSelecionado] = useState<Alerta | null>(null);
  const financeiro = a.permite("finance") && a.oficina?.perfil !== "staff",
    ordens =
      a.permite("work_orders") && (!a.oficina?.ramo || a.oficina.ramo === "automotivo");
  const servicos = a.permite("work_orders") && !ordens;
  const titulo =
    !a.oficina?.ramo || a.oficina.ramo === "automotivo"
      ? "Alertas da oficina"
      : a.oficina.ramo === "assistencia_tecnica"
        ? "Alertas da assistência"
        : "Alertas da empresa";
  function resolver(x: Alerta) {
    if (x.tipo === "financeiro") {
      setAberto(false);
      navegar(
        destinoLembrete({ tipo: x.tipo, id: x.id, valor_pendente: !!x.valor_pendente }),
      );
      return;
    }
    if (
      x.tipo === "servico" ||
      x.tipo === "agenda" ||
      x.tipo === "contato" ||
      x.tipo === "conta_mensal"
    ) {
      setAberto(false);
      navegar(x.destino);
    } else setSelecionado(x);
  }
  const chaveConsulta = [
    "alertas",
    a.demo,
    oficina,
    usuario,
    financeiro,
    ordens,
    servicos,
  ];
  const q = useQuery({
    queryKey: chaveConsulta,
    queryFn: ({ signal }) =>
      consultarAlertas(a.demo, oficina, usuario, financeiro, ordens, servicos, signal),
    enabled: !!a.oficina,
    refetchInterval: 60000,
  });
  const alertas = (q.data ?? []).filter(
      (x) =>
        !lembretes?.dados ||
        !lembreteAdiado(
          lembretes.dados.adiamentos,
          x.tipo,
          x.id,
          x.data,
          lembretes.agora,
        ),
    ),
    novos = alertas.filter((x) => !x.lido).length + (lembretes?.conferencia ? 1 : 0);
  const filtrados = alertas.filter(
    (x) =>
      filtro === "todos" ||
      (filtro === "novos"
        ? !x.lido
        : x.tipo === filtro || (filtro === "financeiro" && x.tipo === "conta_mensal")),
  );
  async function marcar(chaves: string[]) {
    setOcupado(true);
    setErro("");
    try {
      await marcarAlertasLidos(a.demo, oficina, usuario, chaves);
      await qc.invalidateQueries({ queryKey: ["alertas"] });
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      setOcupado(false);
    }
  }
  async function excluir(x: Alerta) {
    setOcupado(true);
    setErro("");
    try {
      await excluirAlerta(a.demo, oficina, usuario, x.chave);
      await qc.invalidateQueries({ queryKey: ["alertas"] });
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      setOcupado(false);
    }
  }
  async function excluirTodos() {
    if (ocupado || !q.data?.length) return;
    const chaves = (q.data ?? []).map((x) => x.chave);
    setOcupado(true);
    setLimpando(true);
    setErro("");
    setAviso("");
    try {
      await excluirTodosAlertas(a.demo, oficina, usuario, chaves);
      qc.setQueryData<Alerta[]>(chaveConsulta, (atual) =>
        atual?.filter((x) => !chaves.includes(x.chave)),
      );
      await qc.invalidateQueries({ queryKey: ["alertas"] });
      setAviso("Avisos excluídos.");
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      setOcupado(false);
      setLimpando(false);
    }
  }
  function renderAlerta(x: Alerta) {
    return (
      <article className={`alerta-item ${x.lido ? "" : "alerta-novo"}`} key={x.chave}>
        {x.tipo === "contato" ? (
          <MessageCircle size={20} />
        ) : x.tipo === "entrega" ? (
          <CarFront size={20} />
        ) : x.tipo === "agenda" ? (
          <CalendarDays size={20} />
        ) : x.tipo === "servico" ? (
          <Wrench size={20} />
        ) : (
          <Wallet size={20} />
        )}
        <div>
          <small>
            {x.tipo === "contato"
              ? "Cliente para contatar"
              : x.tipo === "servico"
                ? "Prazo do atendimento"
                : x.tipo === "agenda"
                  ? "Agendamento"
                  : x.tipo === "entrega"
                    ? "Entrega de veículo"
                    : x.natureza === "pagar"
                      ? "Conta a pagar"
                      : "Conta a receber"}
          </small>
          <button
            className="alerta-titulo"
            onClick={() => resolver(x)}
            aria-label={`Resolver ${x.titulo}`}
          >
            <strong>{x.titulo}</strong>
          </button>
          <p
            className={
              x.horario_passou || (x.dias !== null && x.dias < 0)
                ? "alerta-atrasado"
                : ""
            }
          >
            {x.tipo === "contato"
              ? x.motivo
              : x.tipo === "agenda" && x.inicio
                ? x.horario_passou
                  ? "Horário passou · aguardando recebimento ou cancelamento"
                  : x.dias === 0
                    ? "Agendado para hoje"
                    : x.dias === 1
                      ? "Agendado para amanhã"
                      : `Agendado em ${x.dias} dias`
                : x.dias !== null
                  ? x.tipo === "entrega" && x.dias === 0
                    ? "Entrega prevista hoje"
                    : textoPrazo(x.dias)
                  : "Sem prazo cadastrado"}
            {x.pronto ? " · Pronto para retirada" : ""}
          </p>
          {x.detalhe && <p>{x.detalhe}</p>}
          <small>
            {x.inicio
              ? new Date(x.inicio).toLocaleString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                  dateStyle: "short",
                  timeStyle: "short",
                }) + " · Horário de São Paulo"
              : x.data?.split("-").reverse().join("/")}
            {x.valor_centavos !== null ? ` · ${dinheiro(x.valor_centavos)}` : ""}
          </small>
          {x.valor_pendente && (
            <p className="alerta-atrasado">
              Valor variável: confirme o valor deste mês antes de pagar. O valor exibido
              é uma previsão.
            </p>
          )}
          <div className="alerta-acoes">
            <button
              disabled={ocupado}
              onClick={() => void excluir(x)}
              title="Remove só este aviso, sem apagar a conta ou o serviço"
              aria-label={`Excluir alerta: ${x.titulo}`}
            >
              <Trash2 size={15} aria-hidden="true" /> Excluir alerta
            </button>
            <button onClick={() => resolver(x)}>
              {x.tipo === "contato"
                ? "Ver caso / registrar contato"
                : x.valor_pendente
                  ? "Atualizar valor do mês / resolver"
                  : x.tipo === "servico" || x.tipo === "agenda"
                    ? "Abrir / resolver"
                    : x.tipo === "financeiro"
                      ? "Registrar agora"
                      : "Entrega / alterar prazo"}
            </button>
            {lembretes?.permitido &&
              (x.tipo === "financeiro" || x.tipo === "conta_mensal") && (
                <button
                  onClick={() => {
                    setAberto(false);
                    lembretes.adiar({
                      tipo: x.tipo as "financeiro" | "conta_mensal",
                      id: x.id,
                      vencimento: x.data!,
                      descricao: x.titulo,
                    });
                  }}
                >
                  Lembrar depois
                </button>
              )}
            <Link to={x.destino} onClick={() => setAberto(false)}>
              Abrir{" "}
              {x.tipo === "contato"
                ? "acompanhamento"
                : x.tipo === "agenda"
                  ? "agendamento"
                  : x.tipo === "servico"
                    ? "atendimento"
                    : x.tipo === "entrega"
                      ? "ordem de serviço"
                      : "lançamento"}
            </Link>
            {!x.lido && (
              <button disabled={ocupado} onClick={() => void marcar([x.chave])}>
                Marcar como lido
              </button>
            )}
          </div>
        </div>
      </article>
    );
  }
  return (
    <>
      <button
        className="botao-icone sininho-alertas"
        title={titulo}
        aria-label={`${titulo}${q.isError ? ": falha ao atualizar" : `: ${novos} não lidos`}`}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        onClick={() => {
          setAviso("");
          setAberto(true);
          void q.refetch();
        }}
      >
        <Bell size={20} />
        {(novos > 0 || q.isError) && (
          <span className="contador-alertas">
            {q.isError ? "!" : novos > 99 ? "99+" : novos}
          </span>
        )}
      </button>
      {aberto && (
        <Dialogo
          aberto={aberto && !selecionado}
          fechar={() => setAberto(false)}
          titulo={titulo}
          classe="dialogo-alertas"
        >
          <p className="texto-suave">
            5 e 1 dia antes, no dia e após 1, 5, 10 e 30 dias. Depois, a cada 30 dias de
            atraso. Excluir remove só este aviso para você, sem apagar a conta ou o
            serviço. Novos prazos podem gerar novos alertas.
            {ordens &&
              " Clientes para contatar aparecem quando entram na lista, com um aviso por caso."}
          </p>
          {lembretes?.permitido && (
            <div className="lembrete-acoes">
              <button
                className="botao-secundario"
                onClick={() => {
                  setAberto(false);
                  lembretes.abrir("pendencias");
                }}
              >
                Conferir contas
              </button>
              <button
                className="botao-secundario"
                onClick={() => {
                  setAberto(false);
                  lembretes.abrir("configurar");
                }}
              >
                Configurar lembretes
              </button>
              {lembretes.conferencia && (
                <>
                  <Link
                    className="botao-secundario"
                    to="/financeiro?novo=receber"
                    onClick={() => setAberto(false)}
                  >
                    Recebi
                  </Link>
                  <Link
                    className="botao-secundario"
                    to="/financeiro?novo=pagar"
                    onClick={() => setAberto(false)}
                  >
                    Paguei
                  </Link>
                  <button
                    className="botao-secundario"
                    disabled={lembretes.ocupado}
                    onClick={lembretes.conferir}
                  >
                    Já conferi hoje
                  </button>
                </>
              )}
            </div>
          )}
          <div className="alertas-filtros">
            <label>
              Mostrar
              <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="novos">Não lidos</option>
                {ordens && a.permite("quotes") && (
                  <option value="contato">Clientes para contatar</option>
                )}
                {financeiro && <option value="financeiro">Financeiro</option>}
                {ordens && <option value="entrega">Veículos</option>}
                {ordens && <option value="agenda">Agendamentos</option>}
                {!ordens && a.permite("work_orders") && (
                  <>
                    <option value="servico">Atendimentos</option>
                    <option value="agenda">Agendamentos</option>
                  </>
                )}
              </select>
            </label>
            <div className="alertas-acoes-gerais">
              <button
                className="botao-secundario"
                disabled={!alertas.some((x) => !x.lido) || ocupado}
                onClick={() =>
                  void marcar(alertas.filter((x) => !x.lido).map((x) => x.chave))
                }
              >
                Marcar todos como lidos
              </button>
              <button
                className="botao-secundario"
                disabled={!alertas.length || ocupado || q.isPending || q.isError}
                onClick={() => void excluirTodos()}
                title="Excluir todos os avisos atuais, inclusive os fora do filtro"
              >
                <Trash2 size={16} aria-hidden="true" />
                {limpando ? "Excluindo…" : "Excluir todos"}
              </button>
            </div>
          </div>
          {aviso && <p role="status">{aviso}</p>}
          {(erro || q.isError) && (
            <p role="alert" className="erro-formulario">
              {erro || erroPublico(q.error)}{" "}
              <button onClick={() => void q.refetch()}>Tentar novamente</button>
            </p>
          )}
          {q.isPending && <p role="status">Carregando alertas…</p>}
          {!q.isPending &&
            !q.isError &&
            !alertas.some(
              (x) =>
                filtro === "todos" ||
                (filtro === "novos"
                  ? !x.lido
                  : x.tipo === filtro ||
                    (filtro === "financeiro" && x.tipo === "conta_mensal")),
            ) && <p className="estado-lista">Nenhum alerta nesta seleção.</p>}
          <div className="alertas-lista">
            {(["receber", "pagar"] as const).map((natureza) => {
              const grupo = filtrados.filter(
                (x) =>
                  (x.tipo === "financeiro" || x.tipo === "conta_mensal") &&
                  x.natureza === natureza,
              );
              return (
                grupo.length > 0 && (
                  <details className="alertas-grupo-financeiro" key={natureza}>
                    <summary>
                      {natureza === "receber" ? "Contas a receber" : "Contas a pagar"} (
                      {grupo.length})
                    </summary>
                    {grupo.map(renderAlerta)}
                  </details>
                )
              );
            })}
            {filtrados
              .filter((x) => x.tipo !== "financeiro" && x.tipo !== "conta_mensal")
              .map(renderAlerta)}
          </div>
        </Dialogo>
      )}
      {selecionado && (
        <Suspense
          fallback={
            <Dialogo
              aberto
              fechar={() => setSelecionado(null)}
              titulo="Ações do alerta"
            >
              <p role="status">Carregando…</p>
            </Dialogo>
          }
        >
          <AcaoAlerta
            key={`${selecionado.tipo}:${selecionado.id}`}
            alerta={selecionado}
            fechar={() => setSelecionado(null)}
            abrirDestino={() => {
              setSelecionado(null);
              setAberto(false);
            }}
          />
        </Suspense>
      )}
    </>
  );
}
