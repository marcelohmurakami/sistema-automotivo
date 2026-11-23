import { rpc } from "../lib/rpc";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CarFront, Clock3, History, Search, Check, ChevronDown } from "lucide-react";
import { useAcesso } from "../auth/contexto";

import { situacoesOS } from "../services/ordensServico";

export type ServicoCliente = {
  id: string;
  numero: number;
  situacao: string;
  veiculo: { modelo: string; placa: string };
  entrega_prevista_em: string | null;
  recebido_em?: string | null;
  entregue_em?: string | null;
  resumo: string | null;
};
const encerrada = (o: ServicoCliente) =>
  ["delivered", "cancelled"].includes(o.situacao);
function dataCliente(valor?: string | null) {
  if (!valor) return "Ainda não informada";
  const d = new Date(valor);
  return Number.isNaN(d.getTime())
    ? "Ainda não informada"
    : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
export function ServicosCliente({
  ordens,
  oficina,
  demonstracao = false,
}: {
  ordens: ServicoCliente[];
  oficina: string;
  demonstracao?: boolean;
}) {
  const [aba, setAba] = useState("andamento");
  const [busca, setBusca] = useState("");
  const emAndamento = ordens.filter((o) => !encerrada(o));
  const anteriores = ordens.filter(encerrada);
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const lista = (aba === "andamento" ? emAndamento : anteriores).filter((o) =>
    `${o.numero} ${o.veiculo.modelo || ""} ${o.veiculo.placa || ""}`
      .toLocaleLowerCase("pt-BR")
      .includes(termo),
  );
  return (
    <div className="portal-servicos">
      <div className="portal-resumo">
        <div>
          <CarFront size={22} />
          <strong>{emAndamento.length}</strong>
          <span>Em andamento</span>
        </div>
        <div>
          <History size={22} />
          <strong>{anteriores.length}</strong>
          <span>No histórico</span>
        </div>
        <div>
          <Check size={22} />
          <strong>{emAndamento.filter((o) => o.situacao === "ready").length}</strong>
          <span>Prontos para retirar</span>
        </div>
      </div>
      <div className="portal-filtros">
        <div className="portal-abas" aria-label="Exibição dos serviços">
          <button
            type="button"
            aria-pressed={aba === "andamento"}
            onClick={() => setAba("andamento")}
          >
            Em andamento ({emAndamento.length})
          </button>
          <button
            type="button"
            aria-pressed={aba === "historico"}
            onClick={() => setAba("historico")}
          >
            Histórico ({anteriores.length})
          </button>
        </div>
        <label className="portal-busca">
          <Search size={18} />
          <input
            aria-label="Buscar por veículo, placa ou OS"
            placeholder="Veículo, placa ou número da OS"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </label>
      </div>
      <div className="portal-lista">
        {lista.map((o) => (
          <article className="portal-os" key={o.id}>
            <header>
              <div className="portal-carro">
                <CarFront size={25} />
              </div>
              <div>
                <small>ORDEM DE SERVIÇO #{o.numero}</small>
                <h3>{o.veiculo.modelo || "Veículo"}</h3>
                <span>{o.veiculo.placa || "Placa não informada"}</span>
              </div>
              <span className={`portal-situacao situacao-${o.situacao}`}>
                {situacoesOS[o.situacao] || "Em acompanhamento"}
              </span>
            </header>
            {o.situacao !== "cancelled" && (
              <ol className="portal-etapas" aria-label="Etapas do serviço">
                {["open", "in_progress", "quality_check", "ready", "delivered"].map(
                  (s, i, etapas) => (
                    <li
                      key={s}
                      className={i <= etapas.indexOf(o.situacao) ? "concluida" : ""}
                      aria-current={s === o.situacao ? "step" : undefined}
                    >
                      <span>
                        {i < etapas.indexOf(o.situacao) ? <Check size={12} /> : i + 1}
                      </span>
                      {situacoesOS[s]}
                    </li>
                  ),
                )}
              </ol>
            )}
            <p className="portal-mensagem">
              {o.resumo ||
                "As atualizações compartilhadas pela oficina aparecerão aqui."}
            </p>
            <div className="portal-datas">
              <span>
                <Clock3 size={16} /> Entrada: {dataCliente(o.recebido_em)}
              </span>
              <span>
                {o.situacao === "delivered"
                  ? `Entregue em: ${dataCliente(o.entregue_em)}`
                  : o.situacao === "cancelled"
                    ? "Atendimento cancelado"
                    : `Previsão de entrega: ${dataCliente(o.entrega_prevista_em)}`}
              </span>
            </div>
            {demonstracao ? (
              <details className="portal-historico">
                <summary>Ver atualizações do serviço</summary>
                <p>
                  Exemplo: veículo recebido e avaliação inicial realizada pela equipe.
                </p>
                <p>Exemplo: {o.resumo}</p>
              </details>
            ) : (
              <Historico oficina={oficina} os={o.id} />
            )}
          </article>
        ))}
        {!lista.length && (
          <div className="portal-vazio">
            <CarFront size={32} />
            <h3>
              {termo
                ? "Nenhum serviço encontrado"
                : aba === "andamento"
                  ? "Tudo em dia por aqui"
                  : "Seu histórico começa aqui"}
            </h3>
            <p>
              {termo
                ? "Tente outro veículo, placa ou número da OS."
                : aba === "andamento"
                  ? "Você não tem serviços em andamento. Os atendimentos encerrados ficam no histórico."
                  : "Os serviços entregues e cancelados aparecerão nesta aba."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
function Historico({ oficina, os }: { oficina: string; os: string }) {
  const a = useAcesso();
  const [aberto, setAberto] = useState(false);
  const q = useQuery({
    queryKey: ["historico-portal", a.usuario, oficina, os],
    enabled: aberto && !!a.usuario && !a.demo,
    queryFn: () =>
      rpc<
        {
          id?: string;
          description?: string;
          descricao?: string;
          occurred_at?: string;
          ocorrido_em?: string;
        }[]
      >("consultar_meu_historico_os", {
        p_oficina: oficina,
        p_ordem_servico: os,
      }),
    gcTime: 0,
    refetchInterval: aberto ? 30000 : false,
  });
  return (
    <div className="portal-historico">
      <button type="button" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
        <History size={17} />
        {aberto ? "Ocultar atualizações" : "Ver atualizações do serviço"}
        <ChevronDown size={16} />
      </button>
      {aberto &&
        (q.isPending ? (
          <p role="status">Carregando atualizações…</p>
        ) : q.isError ? (
          <p role="alert">
            Não foi possível carregar.{" "}
            <button onClick={() => void q.refetch()}>Tentar novamente</button>
          </p>
        ) : q.data.length ? (
          <ol>
            {q.data.map((h, i) => (
              <li key={h.id || i}>
                <time>{dataCliente(h.ocorrido_em || h.occurred_at)}</time>
                <p>{h.descricao || h.description}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p>A oficina ainda não compartilhou atualizações deste serviço.</p>
        ))}
    </div>
  );
}
