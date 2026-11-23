import { dinheiro } from "../lib/formatacao";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAcesso } from "../auth/contexto";
import type { Alerta } from "../services/alertas";
import { consultarTituloFinanceiro } from "../services/financeiro";
import { consultarOS, operarOS } from "../services/ordensServico";

import { erroPublico } from "../lib/supabase";
import { atualizarIntegracoes } from "../lib/atualizarIntegracoes";
import { useAgora } from "../lib/useAgora";
import { Dialogo } from "./Dialogo";
import { PagamentosIntegrados } from "./PagamentosIntegrados";
import { EntregaPrometidaOS } from "./EntregaPrometidaOS";
import { ValorRecorrente } from "./ValorRecorrente";

export function AcaoAlerta({
  alerta,
  fechar,
  abrirDestino,
}: {
  alerta: Alerta;
  fechar: () => void;
  abrirDestino: () => void;
}) {
  const a = useAcesso(),
    oficina = a.oficina!.id,
    qc = useQueryClient(),
    agora = useAgora();
  const [acao, setAcao] = useState<"" | "pagar" | "parcial" | "combinar">("");
  const [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [ocupado, setOcupado] = useState(false),
    [confirmarEntrega, setConfirmarEntrega] = useState(false);
  const trava = useRef(false);
  const q = useQuery({
    queryKey: ["acao-alerta", a.demo, oficina, alerta.tipo, alerta.id],
    queryFn: async ({ signal }) =>
      alerta.tipo === "financeiro"
        ? {
            titulo: await consultarTituloFinanceiro(a.demo, oficina, alerta.id, signal),
            os: null,
          }
        : { titulo: null, os: await consultarOS(a.demo, oficina, alerta.id, signal) },
    staleTime: 0,
    gcTime: 0,
  });
  const t = q.data?.titulo,
    o = q.data?.os;
  const encerrada =
    o && (!!o.arquivado_em || ["delivered", "cancelled"].includes(o.situacao));
  async function executar(fn: () => Promise<unknown>) {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      await fn();
      await Promise.all([
        atualizarIntegracoes(qc, ["os", "os-detalhe", "financeiro", "alertas"]),
        q.refetch(),
      ]);
      setConfirmarEntrega(false);
      setAviso("Registrado. Os alertas e os dados foram atualizados.");
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  return (
    <>
      <Dialogo
        aberto={!acao}
        fechar={() => {
          if (!ocupado) fechar();
        }}
        titulo={alerta.tipo === "financeiro" ? "Resolver conta" : "Resolver entrega"}
        classe="dialogo-alertas"
      >
        <h3>{alerta.titulo}</h3>
        {aviso && (
          <p role="status" className="aviso-cliente">
            {aviso}
          </p>
        )}
        {erro && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        {q.isPending && <p role="status">Consultando dados atualizados…</p>}
        {q.isError && (
          <p role="alert">
            {erroPublico(q.error)}{" "}
            <button onClick={() => void q.refetch()}>Tentar novamente</button>
          </p>
        )}
        {!q.isPending &&
          !q.isError &&
          alerta.tipo === "financeiro" &&
          (!t || t.cancelado_em || t.aberto_centavos <= 0) && (
            <p>
              {!t
                ? "Esta conta não está mais disponível."
                : t.cancelado_em
                  ? "Esta conta foi cancelada."
                  : "Conta quitada. Não há saldo pendente."}
            </p>
          )}
        {!q.isError && t && !t.cancelado_em && t.aberto_centavos > 0 && (
          <>
            <p>
              Falta {t.natureza === "pagar" ? "pagar" : "receber"}:{" "}
              <strong>{dinheiro(t.aberto_centavos)}</strong>
            </p>
            {t.baixado_centavos > 0 && (
              <p>{dinheiro(t.baixado_centavos)} já registrados.</p>
            )}
            <ValorRecorrente
              titulo={t}
              aoAtualizar={() => {
                void q.refetch();
              }}
            />
            {t.comissao_id ? (
              <p>
                Esta conta é uma comissão.{" "}
                <Link
                  to="/financeiro?aba=comissoes"
                  reloadDocument
                  onClick={abrirDestino}
                >
                  Abrir comissões para consultar o valor liberado e registrar o
                  pagamento.
                </Link>
              </p>
            ) : (
              <div className="alerta-opcoes">
                <button
                  className="botao-primario"
                  onClick={() => setAcao("pagar")}
                  disabled={!!t.valor_variavel && !t.valor_confirmado_em}
                >
                  {t.natureza === "pagar" ? "Já paguei" : "Já recebi"}
                </button>
                <button
                  className="botao-secundario"
                  onClick={() => setAcao("parcial")}
                  disabled={!!t.valor_variavel && !t.valor_confirmado_em}
                >
                  {t.natureza === "pagar" ? "Paguei uma parte" : "Recebi uma parte"}
                </button>
                <button
                  className="botao-secundario"
                  onClick={() => setAcao("combinar")}
                >
                  Alterar vencimento
                </button>
              </div>
            )}
          </>
        )}
        {!q.isError &&
          o &&
          (encerrada ? (
            <p>Esta OS já foi encerrada ou arquivada.</p>
          ) : (
            <>
              <EntregaPrometidaOS
                os={o}
                agora={agora}
                demo={a.demo}
                oficina={oficina}
                ocupado={ocupado}
                executar={executar}
              />
              {o.situacao === "ready" &&
                (confirmarEntrega ? (
                  <div className="alerta-confirmacao">
                    <p>
                      Confirmar que o cliente retirou o veículo? A entrega finaliza a OS
                      e atualiza estoque e financeiro. O recebimento deve ser registrado
                      separadamente.
                    </p>
                    <div className="alerta-opcoes">
                      <button
                        className="botao-primario"
                        disabled={ocupado}
                        onClick={() =>
                          void executar(() =>
                            operarOS(
                              a.demo,
                              oficina,
                              o,
                              "atualizar_mapa_ordem_servico",
                              {
                                p_revisao_esperada: o.revisao,
                                p_situacao: "delivered",
                                p_etapa: o.etapa_id,
                                p_local: o.local_id,
                                p_entrega_prevista_em: o.entrega_prevista_em,
                                p_recebido_em: o.recebido_em,
                                p_motivo_cancelamento: null,
                              },
                            ),
                          )
                        }
                      >
                        {ocupado ? "Registrando…" : "Confirmar entrega"}
                      </button>
                      <button
                        className="botao-secundario"
                        disabled={ocupado}
                        onClick={() => setConfirmarEntrega(false)}
                      >
                        Voltar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="botao-primario"
                    disabled={ocupado || !o.recebido_em}
                    onClick={() => setConfirmarEntrega(true)}
                  >
                    Já entreguei o veículo
                  </button>
                ))}
              {o.situacao === "ready" && !o.recebido_em && (
                <p>Registre a entrada do veículo na OS antes de confirmar a entrega.</p>
              )}
              {o.situacao !== "ready" && (
                <p>Conclua os serviços e a conferência na OS para liberar a entrega.</p>
              )}
            </>
          ))}
        <div className="alerta-acoes">
          {!ocupado && (
            <Link to={alerta.destino} onClick={abrirDestino}>
              Abrir{" "}
              {alerta.tipo === "financeiro"
                ? "lançamento completo"
                : "ordem de serviço"}
            </Link>
          )}
          <button disabled={ocupado} onClick={fechar}>
            Voltar aos alertas
          </button>
        </div>
      </Dialogo>
      {acao && t && (
        <PagamentosIntegrados
          titulo={t}
          somenteFormulario
          acaoInicial={acao === "combinar" ? "combinar" : "pagar"}
          valorInicial={acao === "parcial" ? "" : undefined}
          aoFechar={() => {
            setAcao("");
            void q.refetch();
          }}
          aoConcluir={() => {
            setAcao("");
            setAviso(
              acao === "combinar"
                ? "Vencimento atualizado."
                : "Pagamento registrado. Se restar saldo, a conta continuará nos alertas.",
            );
            void q.refetch();
          }}
        />
      )}
    </>
  );
}
