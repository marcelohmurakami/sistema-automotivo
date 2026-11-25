import { useMemo, useRef, useState } from "react";
import { atualizarConsultas } from "../../lib/atualizarConsultas";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Pause } from "lucide-react";
import { BuscaOperacao } from "../BuscaOperacao";
import { useAcesso } from "../../auth/contexto";
import {
  consultarPaginaServicos,
  type CursorServico,
} from "../../services/painelServicos";
import { gravarServico, type AtendimentoServico } from "../../services/servicos";
import {
  avancarAssistencia,
  acaoCartaoAssistencia,
  etapaPainelAssistencia,
  type EtapaPainelAssistencia,
  colunasAssistencia,
  pararAssistencia,
  motivosParadaAssistencia,
} from "../../lib/fluxoAssistencia";
import { useBuscaDebounced } from "../../lib/useBuscaDebounced";
import { dinheiro } from "../../lib/formatacao";
import { erroPublico } from "../../lib/supabase";
import { Dialogo } from "../Dialogo";
import { orcamentoRecusado } from "../../lib/apresentacaoDocumentoServico";
import "./PainelAssistencia.css";

export function PainelAssistencia({
  abrir,
}: {
  abrir: (id: string, aprovacao?: boolean) => void;
}) {
  const [busca, setBusca] = useState("");
  const termo = useBuscaDebounced(busca);
  return (
    <section className="assistencia-painel" aria-label="Etapas dos reparos">
      <BuscaOperacao
        rotulo="Buscar cliente ou equipamento no painel de reparos"
        exemplo="Cliente, equipamento ou número da OS…"
        valor={busca}
        alterar={setBusca}
      />
      <div className="assistencia-quadro">
        {colunasAssistencia.map((coluna) => (
          <Coluna key={coluna.id} coluna={coluna} busca={termo} abrir={abrir} />
        ))}
      </div>
    </section>
  );
}

function usePaginaColuna(fluxo: EtapaPainelAssistencia, busca: string, enabled = true) {
  const a = useAcesso();
  return useInfiniteQuery({
    queryKey: ["servicos", a.oficina!.id, a.demo, "quadro", fluxo, busca],
    enabled,
    initialPageParam: null as CursorServico | null,
    queryFn: ({ pageParam, signal }) =>
      consultarPaginaServicos(
        a.oficina!.id,
        a.demo,
        { tela: "atendimentos", fluxo, busca },
        pageParam,
        signal,
      ),
    getNextPageParam: (p) => p.proximo || undefined,
    refetchInterval: 60000,
  });
}

function Coluna({
  coluna,
  busca,
  abrir,
}: {
  coluna: (typeof colunasAssistencia)[number];
  busca: string;
  abrir: (id: string, aprovacao?: boolean) => void;
}) {
  const a = useAcesso(),
    oficina = a.oficina!,
    qc = useQueryClient();
  const [parando, setParando] = useState<AtendimentoServico | null>(null);
  const [motivo, setMotivo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erroAcao, setErroAcao] = useState("");
  const trava = useRef(false);
  const q = usePaginaColuna(coluna.id, busca);
  const aprovacao = usePaginaColuna("aprovacao", busca, coluna.id === "parados");
  const consultas = coluna.id === "parados" ? [q, aprovacao] : [q];
  const carregando = consultas.some((c) => c.isPending);
  const falha = consultas.find((c) => c.isError);
  const temMais = consultas.some((c) => c.hasNextPage);
  const salvar = useMutation({
    mutationFn: (dados: AtendimentoServico) =>
      gravarServico(
        "salvar_atendimento_servico",
        oficina.id,
        { p_id: dados.id, p_revisao: dados.revisao, p_dados: dados },
        a.demo,
      ),
    onSuccess: async () => {
      setParando(null);
      setMotivo("");
      await atualizarConsultas(
        qc,
        [
          "servicos",
          "detalhes-atendimento",
          "alertas",
          "estoque",
          "relatorios-servicos",
        ].map((key) => [key]),
        [["servicos"]],
      );
    },
  });
  const unicos = useMemo(() => {
    const paginas = [
      q.data,
      ...(coluna.id === "parados" ? [aprovacao.data] : []),
    ].flatMap((d) => d?.pages ?? []);
    const registros = paginas.flatMap((p) => {
      const clientes = new Map(p.clientes.map((c) => [c.id, c.nome]));
      const objetos = new Map(p.objetos.map((o) => [o.id, o.nome]));
      return p.atendimentos.map((t) => ({
        t,
        cliente: clientes.get(t.cliente_id) || "Cliente",
        equipamento: objetos.get(t.objeto_id) || "Equipamento",
      }));
    });
    return [...new Map(registros.map((r) => [r.t.id, r])).values()];
  }, [q.data, aprovacao.data, coluna.id]);
  function gravar(dados: AtendimentoServico) {
    if (trava.current) return;
    trava.current = true;
    salvar.mutate(dados, {
      onSettled: () => {
        trava.current = false;
      },
    });
  }
  function avancar(t: AtendimentoServico) {
    setErroAcao("");
    if (coluna.id === "prontos" || etapaPainelAssistencia(t) === "aprovacao") {
      abrir(t.id, etapaPainelAssistencia(t) === "aprovacao");
      return;
    }
    try {
      gravar(avancarAssistencia(t, oficina.especialidade || "assistencia_celulares"));
    } catch (e) {
      setErroAcao(erroPublico(e));
    }
  }
  return (
    <section
      className={`assistencia-coluna etapa-${coluna.id}`}
      aria-label={coluna.nome}
    >
      <header>
        <h2>{coluna.nome}</h2>
        <span title="Registros carregados nesta coluna">
          {unicos.length}
          {temMais ? "+" : ""}
        </span>
        <small>{coluna.ajuda}</small>
      </header>
      {carregando && <p role="status">Carregando…</p>}
      {falha && (
        <p role="alert">
          {erroPublico(falha.error)}{" "}
          <button onClick={() => void Promise.all(consultas.map((c) => c.refetch()))}>
            Tentar novamente
          </button>
        </p>
      )}
      {salvar.isError && !parando && <p role="alert">{erroPublico(salvar.error)}</p>}
      {erroAcao && <p role="alert">{erroAcao}</p>}
      {!carregando && !falha && !unicos.length && (
        <p className="assistencia-coluna-vazia">Nenhum atendimento nesta etapa.</p>
      )}
      {unicos.map(({ t, cliente, equipamento }) => (
        <article key={t.id} className="assistencia-reparo">
          <button className="assistencia-reparo-abrir" onClick={() => abrir(t.id)}>
            <small>OS #{t.numero || t.id.slice(0, 8)}</small>
            <strong>{equipamento}</strong>
            <span>{cliente}</span>
          </button>
          <p>{t.titulo}</p>
          <div className="assistencia-reparo-meta">
            <span>{dinheiro(t.valor_centavos)}</span>
            <time>
              {(t.data_servico || t.vencimento).split("-").reverse().join("/")}
            </time>
          </div>
          {coluna.id === "parados" && (
            <p className="assistencia-parada">
              {orcamentoRecusado(t)
                ? "Orçamento recusado pelo cliente"
                : t.ficha_especialidade?.campos.pendencia ||
                  (etapaPainelAssistencia(t) === "aprovacao"
                    ? "Aguardando aprovação do cliente"
                    : "Aguardando resolução da pendência")}
            </p>
          )}
          <div className="assistencia-reparo-acoes">
            {(etapaPainelAssistencia(t) !== "aprovacao" ||
              (oficina.perfil !== "staff" && a.permite("quotes"))) && (
              <button
                className="botao-primario"
                disabled={salvar.isPending}
                onClick={() => avancar(t)}
              >
                {acaoCartaoAssistencia(t)}
                <ArrowRight size={15} />
              </button>
            )}
            {["recebidos", "aprovados", "producao"].includes(coluna.id) && (
              <button
                className="botao-discreto"
                disabled={salvar.isPending}
                onClick={() => {
                  salvar.reset();
                  setParando(t);
                  setMotivo(
                    coluna.id === "recebidos"
                      ? motivosParadaAssistencia[0]
                      : motivosParadaAssistencia[1],
                  );
                  setObservacao("");
                }}
              >
                <Pause size={14} /> Parar serviço
              </button>
            )}
          </div>
        </article>
      ))}
      {temMais && (
        <button
          disabled={consultas.some((c) => c.isFetchingNextPage)}
          onClick={() =>
            void Promise.all(
              consultas.filter((c) => c.hasNextPage).map((c) => c.fetchNextPage()),
            )
          }
        >
          {consultas.some((c) => c.isFetchingNextPage)
            ? "Carregando…"
            : "Carregar mais"}
        </button>
      )}
      <Dialogo
        aberto={!!parando}
        titulo="Parar serviço"
        classe="dialogo-parada-servico"
        fechar={() => {
          if (!salvar.isPending) setParando(null);
        }}
      >
        <form
          className="formulario-cliente parada-servico-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (parando && !salvar.isPending)
              gravar(
                pararAssistencia(
                  parando,
                  oficina.especialidade || "assistencia_celulares",
                  [motivo, observacao.trim()].filter(Boolean).join(" · "),
                ),
              );
          }}
        >
          <p className="parada-servico-identificacao">{parando?.titulo}</p>
          <label>
            Motivo da parada
            <select
              required
              disabled={salvar.isPending}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            >
              {motivosParadaAssistencia.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <details className="os-detalhes">
            <summary>Observações (opcional)</summary>
            <label>
              Detalhe da parada
              <textarea
                maxLength={1200}
                rows={2}
                disabled={salvar.isPending}
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
              />
            </label>
          </details>
          {salvar.isError && <p role="alert">{erroPublico(salvar.error)}</p>}
          <button
            className="botao-primario"
            disabled={salvar.isPending || !motivo.trim()}
          >
            Confirmar parada
          </button>
        </form>
      </Dialogo>
    </section>
  );
}
