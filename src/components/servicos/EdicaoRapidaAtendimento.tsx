import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../../auth/contexto";
import {
  consultarDetalhesAtendimento,
  operarAtendimento,
} from "../../services/servicosCompletos";
import {
  estadosServico,
  gravarServico,
  type AtendimentoServico,
} from "../../services/servicos";
import { erroPublico } from "../../lib/supabase";
import { interfaceRamo } from "../../lib/interfaceRamo";
import { dadosAtalhoAtendimento } from "../../lib/edicaoRapidaAtendimento";
import { entregaDoCampo } from "../../lib/entregaPrometida";
import {
  concluirReparo,
  apresentacaoEntrega,
  registrarRetirada,
} from "../../lib/assistenciaTecnica";
import { atualizarIntegracoes } from "../../lib/atualizarIntegracoes";
import { usePagamentoAposRegistro } from "../../lib/pagamentoAposRegistro";
import { Dialogo } from "../Dialogo";
import { EscolherIconeRapido } from "../EscolherIconeRapido";
import { CampoEntregaPrometida } from "../PrazoEntrega";
import { AprovacaoAtendimento } from "../AprovacaoAtendimento";
import { AceiteServico } from "../AceiteServico";
import "../EdicaoRapidaMapa.css";

export function EdicaoRapidaAtendimento({
  id,
  campo,
  fechar,
  aoSalvar,
}: {
  id: string;
  campo: "tipo" | "entrega" | "situacao";
  fechar: () => void;
  aoSalvar: (mensagem: string) => void;
}) {
  const acesso = useAcesso(),
    w = acesso.oficina!,
    qc = useQueryClient();
  const linguagem = interfaceRamo(w.ramo, w.especialidade);
  const pagamento = usePagamentoAposRegistro();
  const trava = useRef(false);
  const [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState("");
  const [destino, setDestino] = useState<AtendimentoServico["situacao"] | "">("");
  const q = useQuery({
    queryKey: ["atendimento-edicao-rapida", acesso.demo, w.id, id],
    queryFn: ({ signal }) =>
      consultarDetalhesAtendimento(acesso.demo, w.id, id, signal),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const a = q.data?.atendimento;
  async function executar(
    fn: () => Promise<unknown>,
    receber = false,
    encerrar = true,
  ) {
    if (trava.current) throw new Error("Aguarde a gravação.");
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      const r = await fn();
      void atualizarIntegracoes(qc, []).catch(() => {});
      if (encerrar) aoSalvar("Atendimento atualizado.");
      else await q.refetch();
      if (receber) pagamento({ tipo: "atendimento", id, contexto: "entrega" });
      return r;
    } catch (e) {
      setErro(erroPublico(e));
      throw e;
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  async function salvar(novo: AtendimentoServico, receber = false) {
    await executar(
      () =>
        gravarServico(
          "salvar_atendimento_servico",
          w.id,
          { p_id: id, p_revisao: a!.revisao, p_dados: novo },
          acesso.demo,
        ),
      receber,
    );
  }
  return (
    <Dialogo
      aberto
      fechar={() => !trava.current && fechar()}
      titulo={`${{ tipo: "Ícone", entrega: "Entrega", situacao: "Situação" }[campo]} do atendimento${a?.numero ? ` #${a.numero}` : ""}`}
      classe="mapa-edicao-dialogo"
    >
      {q.isPending || q.isFetching ? (
        <p role="status">Carregando…</p>
      ) : q.isError ? (
        <p role="alert">{erroPublico(q.error)}</p>
      ) : (
        a &&
        q.data && (
          <>
            <p className="mapa-edicao-contexto">
              {q.data.cliente.nome} · {q.data.objeto?.nome || a.titulo}
            </p>
            {a.situacao === "cancelado" ? (
              <p>Atendimento cancelado. O histórico foi preservado.</p>
            ) : campo === "situacao" ? (
              <>
                {a.situacao === "orcamento" ? (
                  <AprovacaoAtendimento
                    d={q.data}
                    ocupado={ocupado}
                    executar={(nome, args) =>
                      executar(
                        () =>
                          operarAtendimento(acesso.demo, w.id, nome, {
                            p_atendimento: id,
                            ...args,
                          }),
                        false,
                        nome === "registrar_autorizacao_atendimento",
                      )
                    }
                  />
                ) : a.situacao !== "concluido" ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!destino) return;
                      void salvar(
                        destino === "concluido" && linguagem.assistencia
                          ? concluirReparo(a, w.especialidade || "assistencia_geral")
                          : { ...a, situacao: destino },
                      ).catch(() => {});
                    }}
                  >
                    <label>
                      Situação
                      <select
                        required
                        value={destino}
                        disabled={ocupado}
                        onChange={(e) =>
                          setDestino(e.target.value as AtendimentoServico["situacao"])
                        }
                      >
                        <option value="">{estadosServico[a.situacao]}</option>
                        {(
                          [
                            "aprovado",
                            "em_execucao",
                            "aguardando",
                            "concluido",
                            "cancelado",
                          ] as const
                        )
                          .filter((s) => s !== a.situacao)
                          .map((s) => (
                            <option key={s} value={s}>
                              {s === "concluido" && linguagem.assistencia
                                ? "Pronto para retirada"
                                : estadosServico[s]}
                            </option>
                          ))}
                      </select>
                    </label>
                    {destino === "cancelado" && (
                      <p>
                        O atendimento será cancelado. Valores já recebidos precisam
                        estar conferidos no financeiro.
                      </p>
                    )}
                    <button className="botao-primario" disabled={ocupado || !destino}>
                      {ocupado ? "Salvando…" : "Salvar situação"}
                    </button>
                  </form>
                ) : (
                  <>
                    {linguagem.assistencia && !apresentacaoEntrega(a).confirmada ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const nome = String(
                            new FormData(e.currentTarget).get("recebedor") || "",
                          );
                          void salvar(
                            registrarRetirada(
                              a,
                              nome,
                              w.especialidade || "assistencia_geral",
                            ),
                            true,
                          ).catch(() => {});
                        }}
                      >
                        <p>{apresentacaoEntrega(a).titulo}</p>
                        <label>
                          {apresentacaoEntrega(a).pessoa}
                          <input
                            name="recebedor"
                            required
                            maxLength={1500}
                            defaultValue={q.data.cliente.nome}
                            disabled={ocupado}
                          />
                        </label>
                        <button className="botao-primario" disabled={ocupado}>
                          {ocupado ? "Salvando…" : apresentacaoEntrega(a).confirmar}
                        </button>
                      </form>
                    ) : (
                      <p>
                        {linguagem.assistencia
                          ? apresentacaoEntrega(a).titulo
                          : "Serviço concluído."}
                      </p>
                    )}
                    <AceiteServico
                      atendimento={a}
                      ocupado={ocupado}
                      salvar={(novo) =>
                        salvar(
                          novo,
                          !!novo.ficha_especialidade?.campos.situacao_aceite?.startsWith(
                            "Aceito",
                          ) &&
                            !a.ficha_especialidade?.campos.situacao_aceite?.startsWith(
                              "Aceito",
                            ),
                        )
                      }
                    />
                  </>
                )}
              </>
            ) : a.situacao === "concluido" ? (
              <p>Atendimento concluído. Os dados foram preservados no histórico.</p>
            ) : campo === "tipo" ? (
              <EscolherIconeRapido
                valor={a.dados.tipo_servico}
                ocupado={ocupado}
                escolher={(valor) =>
                  void salvar(
                    dadosAtalhoAtendimento(a, w.especialidade || "", {
                      campo: "tipo",
                      valor,
                    }),
                  ).catch(() => {})
                }
              />
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  try {
                    const valor = entregaDoCampo(
                      String(
                        new FormData(e.currentTarget).get("entrega_prevista_em") || "",
                      ),
                    );
                    void salvar(
                      dadosAtalhoAtendimento(a, w.especialidade || "", {
                        campo: "entrega",
                        valor,
                      }),
                    ).catch(() => {});
                  } catch (e) {
                    setErro(erroPublico(e));
                  }
                }}
              >
                <fieldset disabled={ocupado}>
                  <CampoEntregaPrometida inicial={a.dados.entrega_prevista_em} />
                  {!a.dados.entrega_prevista_em &&
                    a.ficha_especialidade?.campos.prazo_servico && (
                      <p>
                        Prazo registrado:{" "}
                        {a.ficha_especialidade.campos.prazo_servico
                          .split("-")
                          .reverse()
                          .join("/")}{" "}
                        · sem horário.
                      </p>
                    )}
                  <div className="mapa-edicao-acoes">
                    <button type="button" className="botao-secundario" onClick={fechar}>
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
  );
}
