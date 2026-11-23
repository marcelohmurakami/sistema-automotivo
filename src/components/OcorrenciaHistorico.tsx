import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { Dialogo } from "./Dialogo";
import { erroPublico } from "../lib/supabase";
import {
  compararHistorico,
  camposHistorico,
  dataEvento,
  nomeModulo,
  tituloEvento,
} from "../lib/historico";
import { consultarEventoHistorico, type EventoGestao } from "../services/gestao";
import "../pages/Historico.css";
export function OcorrenciaHistorico({
  evento,
  fechar,
}: {
  evento: EventoGestao;
  fechar: () => void;
}) {
  const a = useAcesso();
  const q = useQuery({
    queryKey: ["historico-detalhe", a.demo, a.oficina!.id, evento.origem, evento.id],
    queryFn: ({ signal }) =>
      consultarEventoHistorico(a.demo, a.oficina!.id, evento, signal),
    staleTime: 30000,
  });
  const { informacoes, alteracoes } = compararHistorico(q.data?.detalhes || {});
  const contexto = q.data?.contexto_atual;
  const destino = evento.entidade
    ? evento.origem === "os"
      ? `/ordens-servico?os=${evento.entidade}`
      : evento.origem === "atendimento"
        ? `/?atendimento=${evento.entidade}`
        : evento.tipo === "cliente"
          ? `/clientes?cliente=${evento.entidade}`
          : evento.tipo === "financeiro" && contexto?.identificacao
            ? `/financeiro?titulo=${evento.entidade}`
            : null
    : null;
  return (
    <Dialogo
      aberto
      fechar={fechar}
      titulo="Detalhes da ocorrência"
      classe="historico-dialogo"
    >
      <div className="historico-detalhe">
        <div className="historico-resumo">
          <span className="historico-modulo">
            {nomeModulo(evento.tipo)}
            {evento.numero ? ` · #${evento.numero}` : ""}
          </span>
          <h3>{tituloEvento(evento.descricao)}</h3>
          <dl className="historico-metadados">
            <div>
              <dt>Quando aconteceu</dt>
              <dd>{dataEvento(evento.data)}</dd>
            </div>
            <div>
              <dt>Registrado por</dt>
              <dd>
                {q.data?.autor_nome ||
                  evento.autor_nome ||
                  (a.demo ? "Demonstração" : "Responsável não informado")}
              </dd>
            </div>
          </dl>
        </div>
        {q.isPending ? (
          <p role="status">Carregando os detalhes…</p>
        ) : q.isError ? (
          <div role="alert">
            <p>{erroPublico(q.error)}</p>
            <button className="botao-secundario" onClick={() => void q.refetch()}>
              Tentar novamente
            </button>
          </div>
        ) : (
          <>
            {!!alteracoes.length && (
              <section aria-label="Alterações registradas">
                <h3>O que mudou</h3>
                <div className="historico-alteracoes">
                  {alteracoes.map((x) => (
                    <div className="historico-alteracao" key={x.rotulo}>
                      <strong>{x.rotulo}</strong>
                      <div>
                        <span>Antes</span>
                        <p>{x.antes}</p>
                      </div>
                      <div>
                        <span>Depois</span>
                        <p>{x.depois}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {!!informacoes.length && (
              <section aria-label="Informações registradas">
                <h3>Informações da ocorrência</h3>
                <dl className="historico-campos">
                  {informacoes.map((x, i) => (
                    <div key={x.rotulo + i}>
                      <dt>{x.rotulo}</dt>
                      <dd>{x.valor}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
            {!alteracoes.length && !informacoes.length && (
              <p className="historico-sem-detalhes">
                Este registro preservou a descrição acima, mas não guardou os valores
                anteriores e posteriores.
              </p>
            )}
            {(contexto?.cliente || contexto?.identificacao) && (
              <section className="historico-contexto">
                <h3>Cadastro vinculado</h3>
                <p className="historico-ajuda">
                  Dados atuais; podem ter mudado após a ocorrência.
                </p>
                <dl className="historico-campos">
                  {contexto.cliente && (
                    <div>
                      <dt>Cliente</dt>
                      <dd>{contexto.cliente}</dd>
                    </div>
                  )}
                  {contexto.identificacao && (
                    <div>
                      <dt>Identificação</dt>
                      <dd>{contexto.identificacao}</dd>
                    </div>
                  )}
                  {camposHistorico(contexto.campos).map((x) => (
                    <div key={x.rotulo}>
                      <dt>{x.rotulo}</dt>
                      <dd>{x.valor}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
            {destino && (
              <Link className="botao-secundario" to={destino} onClick={fechar}>
                {evento.tipo === "cliente"
                  ? "Abrir cliente"
                  : evento.tipo === "financeiro"
                    ? "Abrir conta"
                    : "Abrir atendimento"}
                <ChevronRight size={16} />
              </Link>
            )}
          </>
        )}
      </div>
    </Dialogo>
  );
}
