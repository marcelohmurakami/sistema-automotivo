import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../../auth/contexto";
import {
  consultarOS,
  operarOS,
  proximasOS,
  situacoesOS,
  type OrdemServico,
} from "../../services/ordensServico";
import { executarAcaoNoMapa } from "../../services/mapaOficina";
import { atualizarIntegracoes } from "../../lib/atualizarIntegracoes";
import {
  devePerguntarPagamentoOS,
  usePagamentoAposRegistro,
} from "../../lib/pagamentoAposRegistro";
import { faltaOrigemPeca } from "../../lib/origemPecas";
import { erroPublico } from "../../lib/supabase";
import { AndamentoOS } from "./AndamentoOS";
import { PecasNaEntrega } from "../PecasNaEntrega";
import { Dialogo } from "../Dialogo";
import "../AtalhoRegistro.css";
import "../EdicaoRapidaMapa.css";

export function SituacaoRapidaOS({
  id,
  numero,
  fechar,
  aoSalvar,
}: {
  id: string;
  numero: number;
  fechar: () => void;
  aoSalvar: (mensagem: string) => void;
}) {
  const a = useAcesso(),
    qc = useQueryClient(),
    oficina = a.oficina!.id;
  const perguntarPagamento = usePagamentoAposRegistro();
  const trava = useRef(false);
  const [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState("");
  const [destino, setDestino] = useState(""),
    [motivo, setMotivo] = useState("");
  const [pecas, setPecas] = useState(false);
  const q = useQuery({
    queryKey: ["os-situacao-rapida", a.demo, oficina, id],
    queryFn: ({ signal }) => consultarOS(a.demo, oficina, id, signal),
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const os = q.data;
  async function executar(fn: () => Promise<unknown>, pagamento = false) {
    if (trava.current) return false;
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      await fn();
      void atualizarIntegracoes(qc, []).catch(() => {});
      aoSalvar(`Situação da OS #${numero} atualizada.`);
      if (pagamento) perguntarPagamento({ tipo: "os", id, contexto: "entrega" });
      return true;
    } catch (e) {
      if (pagamento && faltaOrigemPeca(e)) setPecas(true);
      else setErro(erroPublico(e));
      return false;
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  async function mudar(atual: OrdemServico, situacao: string) {
    await operarOS(a.demo, oficina, atual, "atualizar_mapa_ordem_servico", {
      p_revisao_esperada: atual.revisao,
      p_situacao: situacao,
      p_etapa: atual.etapa_id ?? null,
      p_local: atual.local_id ?? null,
      p_entrega_prevista_em: atual.entrega_prevista_em,
      p_recebido_em: atual.recebido_em ?? null,
      p_motivo_cancelamento: motivo.trim() || null,
    });
  }
  return (
    <>
      <Dialogo
        aberto={!pecas}
        fechar={() => !trava.current && fechar()}
        titulo={`Situação da OS #${numero}`}
        classe="mapa-edicao-dialogo"
      >
        {q.isPending || q.isFetching ? (
          <p role="status">Carregando…</p>
        ) : q.isError ? (
          <p role="alert">{erroPublico(q.error)}</p>
        ) : (
          os && (
            <>
              {os.arquivado_em || ["delivered", "cancelled"].includes(os.situacao) ? (
                <p>Esta OS foi encerrada. O histórico foi preservado.</p>
              ) : (
                <>
                  <AndamentoOS
                    os={os}
                    ocupado={ocupado}
                    erro={erro}
                    limparErro={() => setErro("")}
                    avancar={setDestino}
                    operar={(acao) =>
                      executar(() =>
                        executarAcaoNoMapa(a.demo, oficina, os.id, os.revisao, acao),
                      )
                    }
                  />
                  <label>
                    Alterar situação
                    <select
                      value={destino}
                      disabled={ocupado}
                      onChange={(e) => {
                        setDestino(e.target.value);
                        setErro("");
                      }}
                    >
                      <option value="">Selecione…</option>
                      {(proximasOS[os.situacao] || []).map((s) => (
                        <option key={s} value={s}>
                          {situacoesOS[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {destino === "cancelled" && (
                    <label>
                      Motivo do cancelamento
                      <textarea
                        value={motivo}
                        maxLength={1000}
                        disabled={ocupado}
                        onChange={(e) => setMotivo(e.target.value)}
                      />
                    </label>
                  )}
                  {destino === "delivered" && (
                    <p>
                      A entrega baixa as peças vinculadas ao estoque e abre a
                      conferência do pagamento.
                    </p>
                  )}
                  {destino && (
                    <button
                      className="botao-primario"
                      disabled={ocupado || (destino === "cancelled" && !motivo.trim())}
                      onClick={() =>
                        void executar(
                          () =>
                            destino === "ready"
                              ? executarAcaoNoMapa(a.demo, oficina, id, os.revisao, {
                                  acao: "concluir",
                                })
                              : mudar(os, destino),
                          devePerguntarPagamentoOS(os.situacao, destino),
                        )
                      }
                    >
                      {ocupado
                        ? "Salvando…"
                        : destino === "delivered"
                          ? "Confirmar entrega"
                          : "Salvar situação"}
                    </button>
                  )}
                </>
              )}
            </>
          )
        )}
        {erro && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        {(erro || q.isError) && (
          <button
            className="botao-secundario"
            disabled={ocupado}
            onClick={() => {
              setErro("");
              setDestino("");
              void q.refetch();
            }}
          >
            Atualizar dados
          </button>
        )}
      </Dialogo>
      {pecas && (
        <PecasNaEntrega
          osId={id}
          fechar={() => setPecas(false)}
          continuar={async (atual) => {
            if (atual.situacao !== "ready")
              throw new Error("A situação mudou. Confira a OS antes de entregar.");
            await mudar(atual, "delivered");
            void atualizarIntegracoes(qc, []).catch(() => {});
            aoSalvar(`Entrega da OS #${numero} registrada.`);
            perguntarPagamento({ tipo: "os", id, contexto: "entrega" });
          }}
        />
      )}
    </>
  );
}
