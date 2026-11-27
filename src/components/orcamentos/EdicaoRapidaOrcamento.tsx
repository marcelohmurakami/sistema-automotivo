import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../../auth/contexto";
import { erroPublico } from "../../lib/supabase";
import { entregaDoCampo } from "../../lib/entregaPrometida";
import {
  acaoProposta,
  emitirProposta,
  obterProposta,
  rotulosSituacao,
  type Proposta,
} from "../../services/orcamentos";
import { salvarIdentificacaoOrcamento } from "../../services/edicaoRapidaOrcamento";
import type { AlteracaoRapidaMapa } from "../../services/edicaoRapidaMapa";
import { Dialogo } from "../Dialogo";
import { CampoEntregaPrometida } from "../PrazoEntrega";
import { EscolherIconeRapido } from "../EscolherIconeRapido";
import { DesistenciaAtendimento } from "../DesistenciaAtendimento";
import { Link } from "react-router-dom";
import "../AtalhoRegistro.css";
export type EdicaoListaOrcamento = {
  campo: "tipo" | "entrega" | "situacao";
  id: string;
  numero: number;
};
export function EdicaoRapidaOrcamento({
  edicao,
  fechar,
  aoSalvar,
  aprovar,
}: {
  edicao: EdicaoListaOrcamento;
  fechar: () => void;
  aoSalvar: (mensagem: string) => void;
  aprovar: (q: Proposta) => void;
}) {
  const a = useAcesso(),
    qc = useQueryClient(),
    oficina = a.oficina!.id;
  const trava = useRef(false);
  const [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState("");
  const [tipo, setTipo] = useState<string | null>(null);
  const [acao, setAcao] = useState<"emitir" | "revisar" | "cancelar" | "">("");
  const [dias, setDias] = useState(7);
  const consulta = useQuery({
    queryKey: ["orcamento-edicao-rapida", a.demo, oficina, edicao.id],
    queryFn: ({ signal }) =>
      obterProposta(a.demo, oficina, edicao.id, undefined, signal),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const q = consulta.data;
  const titulo = { tipo: "Ícone", entrega: "Entrega", situacao: "Situação" }[
    edicao.campo
  ];
  async function executar(fn: () => Promise<unknown>) {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      await fn();
      void qc.invalidateQueries({ queryKey: ["orcamentos"] }).catch(() => {});
      void qc.invalidateQueries({ queryKey: ["historico-gestao"] }).catch(() => {});
      aoSalvar(`Orçamento #${edicao.numero} atualizado.`);
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  const salvar = (alteracao: AlteracaoRapidaMapa) =>
    q && executar(() => salvarIdentificacaoOrcamento(a.demo, oficina, q, alteracao));
  const bloqueado = !!q?.edicao_bloqueada || !!q?.adicional_aplicado_em;
  return (
    <Dialogo
      aberto
      fechar={() => !trava.current && fechar()}
      titulo={`${titulo} do orçamento #${edicao.numero}`}
      classe="mapa-edicao-dialogo"
    >
      {consulta.isPending || consulta.isFetching ? (
        <p role="status">Carregando…</p>
      ) : consulta.isError ? (
        <p role="alert">{erroPublico(consulta.error)}</p>
      ) : (
        q && (
          <>
            <p className="mapa-edicao-contexto">
              {q.versao.dados_cliente.nome} · {q.versao.dados_veiculo.modelo}
            </p>
            {q.arquivado_em ? (
              <p>Restaure o orçamento antes de alterar.</p>
            ) : bloqueado ? (
              <p>
                Este orçamento já autorizou uma OS.{" "}
                <Link
                  className="botao-secundario"
                  to={`/ordens-servico?os=${q.ordem_servico_id || q.adicional_os_id}`}
                  onClick={fechar}
                >
                  Abrir OS vinculada
                </Link>
              </p>
            ) : edicao.campo === "situacao" ? (
              <>
                <p>
                  Situação atual: <strong>{rotulosSituacao[q.situacao]}</strong>
                </p>
                <div className="situacao-rapida-opcoes">
                  {["draft", "awaiting_approval"].includes(q.situacao) && (
                    <button
                      className="botao-primario"
                      disabled={ocupado}
                      onClick={() => {
                        fechar();
                        aprovar(q);
                      }}
                    >
                      Aprovar orçamento
                    </button>
                  )}
                  {q.situacao === "draft" && (
                    <button
                      className="botao-secundario"
                      disabled={ocupado}
                      onClick={() => setAcao("emitir")}
                    >
                      Aguardar aprovação do cliente
                    </button>
                  )}
                  {q.situacao !== "draft" && (
                    <button
                      className="botao-secundario"
                      disabled={ocupado}
                      onClick={() => setAcao("revisar")}
                    >
                      Reabrir como rascunho
                    </button>
                  )}
                  {!["declined", "cancelled"].includes(q.situacao) && (
                    <DesistenciaAtendimento
                      tipo="orcamento"
                      id={q.id}
                      revisao={q.revisao}
                      aprovado={q.situacao === "approved"}
                      osVinculada={!!q.ordem_servico_id}
                      atualizar={async () => {
                        aoSalvar(`Orçamento #${q.numero} atualizado.`);
                      }}
                    />
                  )}
                  {!["approved", "cancelled"].includes(q.situacao) && (
                    <button
                      className="botao-secundario"
                      disabled={ocupado}
                      onClick={() => setAcao("cancelar")}
                    >
                      Cancelar orçamento
                    </button>
                  )}
                </div>
                {acao && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void executar(() =>
                        acao === "emitir"
                          ? emitirProposta(a.demo, oficina, q, dias)
                          : acaoProposta(a.demo, oficina, q, acao),
                      );
                    }}
                  >
                    {acao === "emitir" ? (
                      <label>
                        Validade da proposta (dias)
                        <input
                          type="number"
                          min={1}
                          max={90}
                          required
                          value={dias}
                          disabled={ocupado}
                          onChange={(e) => setDias(Number(e.target.value))}
                        />
                      </label>
                    ) : (
                      <p>
                        {acao === "revisar"
                          ? "Uma nova versão ficará em rascunho. A versão anterior continuará no histórico e seu link será desativado."
                          : "O orçamento será cancelado e seu histórico será preservado."}
                      </p>
                    )}
                    <button className="botao-primario" disabled={ocupado}>
                      {ocupado ? "Salvando…" : "Confirmar alteração"}
                    </button>
                  </form>
                )}
              </>
            ) : (
              <>
                {q.situacao !== "draft" && (
                  <p className="aviso-cliente">
                    Ao salvar, uma nova versão ficará em rascunho. Confira e envie
                    novamente ao cliente.
                  </p>
                )}
                {edicao.campo === "tipo" ? (
                  <>
                    <EscolherIconeRapido
                      valor={tipo ?? q.versao.tipo_servico}
                      ocupado={ocupado}
                      escolher={(v) => {
                        if (q.situacao === "draft")
                          void salvar({ campo: "tipo", valor: v });
                        else setTipo(v);
                      }}
                    />
                    {tipo !== null && q.situacao !== "draft" && (
                      <button
                        className="botao-primario"
                        disabled={ocupado}
                        onClick={() => void salvar({ campo: "tipo", valor: tipo })}
                      >
                        {ocupado ? "Salvando…" : "Salvar em nova versão"}
                      </button>
                    )}
                  </>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      try {
                        void salvar({
                          campo: "entrega",
                          valor: entregaDoCampo(
                            String(
                              new FormData(e.currentTarget).get(
                                "entrega_prevista_em",
                              ) || "",
                            ),
                          ),
                        });
                      } catch (e) {
                        setErro(erroPublico(e));
                      }
                    }}
                  >
                    <fieldset disabled={ocupado}>
                      <CampoEntregaPrometida
                        inicial={q.versao.entrega_prevista_em}
                        ajuda="Horário de São Paulo. Este prazo acompanha a OS; a validade do orçamento continua separada."
                      />
                      <div className="mapa-edicao-acoes">
                        <button
                          type="button"
                          className="botao-secundario"
                          onClick={fechar}
                        >
                          Cancelar
                        </button>
                        <button className="botao-primario">
                          {ocupado ? "Salvando…" : "Salvar entrega"}
                        </button>
                      </div>
                    </fieldset>
                  </form>
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
      {(erro || consulta.isError) && (
        <button
          className="botao-secundario"
          disabled={ocupado}
          onClick={() => {
            setErro("");
            setAcao("");
            setTipo(null);
            void consulta.refetch();
          }}
        >
          Atualizar dados
        </button>
      )}
    </Dialogo>
  );
}
