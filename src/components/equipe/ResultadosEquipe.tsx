import { useBuscaDebounced } from "../../lib/useBuscaDebounced";
import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronRight, Plus } from "lucide-react";
import { Dialogo } from "../Dialogo";
import { dinheiro } from "../../lib/formatacao";
import { novoId } from "../../lib/uuid";
import {
  dataEquipe,
  horarioEquipe,
  distribuirExecucao,
  prepararAtribuicao,
} from "../../lib/produtividadeEquipe";
import {
  operacaoEquipe,
  type DocumentoEquipe,
  type ResumoEquipe,
  type DetalheEquipe,
  type AtribuicaoEquipe,
} from "../../services/produtividadeEquipe";
import {
  PeriodoEquipe,
  MensagemEquipe,
  SeletorFuncionario,
  PaginacaoEquipe,
} from "./ComumEquipe";
import { useEquipe, useAcaoEquipe, usePeriodoEquipe } from "./hooksEquipe";
export default function ResultadosEquipe() {
  const acao = useAcaoEquipe();
  const { w } = useEquipe(),
    [periodo, setPeriodo] = usePeriodoEquipe(),
    [busca, setBusca] = useState(""),
    [pagina, setPagina] = useState(0),
    [situacao, setSituacao] = useState("concluidos"),
    [id, setId] = useState<string | null>(null);
  const resumo = useQuery({
    queryKey: ["equipe", w, "resumo", periodo],
    queryFn: ({ signal }) =>
      operacaoEquipe<ResumoEquipe>(
        w,
        "resumo_contribuicao_equipe",
        { p_inicio: periodo.inicio, p_fim: periodo.fim },
        signal,
      ),
    enabled: !!periodo.inicio && !!periodo.fim,
  });
  const termoBusca = useBuscaDebounced(busca);
  const docs = useQuery({
    queryKey: ["equipe", w, "documentos", periodo, termoBusca, pagina, situacao],
    queryFn: ({ signal }) =>
      operacaoEquipe<DocumentoEquipe[]>(
        w,
        "listar_contribuicoes_equipe",
        {
          p_inicio: periodo.inicio,
          p_fim: periodo.fim,
          p_busca: termoBusca,
          p_pagina: pagina,
          p_situacao: situacao,
        },
        signal,
      ),
    enabled: !!periodo.inicio && !!periodo.fim,
  });
  return (
    <section className="eq-secao">
      <header>
        <h1>Resultados da equipe</h1>
        <p className="eq-ajuda">
          Receita, horas e custos por participante. Período pela data do serviço;
          valores das OS, sem confundir com recebimentos em caixa.
        </p>
      </header>
      <PeriodoEquipe
        valor={periodo}
        mudar={(p) => {
          setPeriodo(p);
          setPagina(0);
        }}
      />
      <MensagemEquipe erro={resumo.error || docs.error} />
      {resumo.isPending && <p role="status">Calculando resultados…</p>}
      {resumo.data && (
        <>
          <div className="eq-resumo">
            <div>
              <small>Serviços prontos ou concluídos</small>
              <strong>{resumo.data.servicos}</strong>
            </div>
            <div>
              <small>Receita desses serviços</small>
              <strong>{dinheiro(resumo.data.receita)}</strong>
            </div>
            <div>
              <small>Precisam de conferência</small>
              <strong>{resumo.data.pendentes}</strong>
            </div>
          </div>
          {resumo.data.pendentes > 0 && (
            <p className="eq-alerta">
              Há serviços sem atribuição ou com custos pendentes. A contribuição ainda é
              provisória. <Link to="/financeiro?aba=custos">Conferir custos</Link>
            </p>
          )}
          <div className="eq-caixa">
            <h2>Contribuição por pessoa</h2>
            {!resumo.data.funcionarios.length ? (
              <p className="eq-vazio">
                Abra um serviço abaixo e atribua os participantes para começar.
              </p>
            ) : (
              resumo.data.funcionarios.map((f) => (
                <div key={f.funcionario_id} className="eq-linha">
                  <div>
                    <strong>{f.nome}</strong>
                    <small>
                      {f.servicos} serviços ·{" "}
                      {(f.minutos / 60).toLocaleString("pt-BR", {
                        maximumFractionDigits: 1,
                      })}{" "}
                      h atribuídas
                    </small>
                    <small>
                      Vendas atribuídas: {dinheiro(f.vendas)} · Comissões:{" "}
                      {dinheiro(f.comissoes)} · Garantias: {dinheiro(f.garantias)}
                    </small>
                  </div>
                  <div className="eq-metricas">
                    <span>
                      <small>Receita de execução</small>
                      <strong>{dinheiro(f.receita)}</strong>
                    </span>
                    <span>
                      <small>Custos</small>
                      <strong>{dinheiro(f.custo)}</strong>
                    </span>
                    <span>
                      <small>Contribuição</small>
                      <strong>{dinheiro(f.contribuicao)}</strong>
                    </span>
                  </div>
                </div>
              ))
            )}
            <p className="eq-ajuda">
              Venda e execução são duas visões da mesma receita; não devem ser somadas.
              Custo atribuído não determina responsabilidade por uma falha.
            </p>
          </div>
        </>
      )}
      <div className="eq-caixa">
        <div className="eq-cabecalho">
          <h2>Conferir por serviço</h2>
          <div className="eq-filtros">
            <label>
              Buscar cliente ou serviço
              <input
                type="search"
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setPagina(0);
                }}
              />
            </label>
            <label>
              Mostrar
              <select
                aria-label="Mostrar"
                value={situacao}
                onChange={(e) => {
                  setSituacao(e.target.value);
                  setPagina(0);
                }}
              >
                <option value="concluidos">Prontos e concluídos</option>
                <option value="todos">Todos os serviços</option>
              </select>
            </label>
          </div>
        </div>
        {docs.isPending ? (
          <p role="status">Carregando serviços…</p>
        ) : !docs.data?.length ? (
          <p className="eq-vazio">Nenhum serviço neste filtro.</p>
        ) : (
          docs.data.slice(0, 50).map((d) => (
            <button
              className="eq-linha eq-linha-button"
              key={d.id}
              onClick={() => setId(d.id)}
            >
              <div>
                <strong>{d.titulo}</strong>
                <small>
                  {d.cliente} · {dataEquipe(d.data)}
                </small>
              </div>
              <span className="eq-badge">
                {d.atribuicao_revisao ? "Atribuído" : "Atribuir participantes"}
              </span>
              <strong>{dinheiro(d.receita)}</strong>
              <ChevronRight size={18} />
            </button>
          ))
        )}
        <PaginacaoEquipe
          pagina={pagina}
          mudar={setPagina}
          mais={(docs.data?.length ?? 0) > 50}
        />
      </div>
      {id && (
        <Dialogo
          aberto
          fechar={() => !acao.ocupado && setId(null)}
          titulo="Quem trabalhou neste serviço?"
          classe="eq-dialogo"
        >
          <FichaContribuicao id={id} acao={acao} />
        </Dialogo>
      )}
    </section>
  );
}
function FichaContribuicao({
  id,
  acao,
}: {
  id: string;
  acao: ReturnType<typeof useAcaoEquipe>;
}) {
  const { w, funcionarios, erroFuncionarios } = useEquipe();
  const q = useQuery({
    queryKey: ["equipe", w, "detalhe", id],
    queryFn: ({ signal }) =>
      operacaoEquipe<DetalheEquipe>(
        w,
        "consultar_contribuicao_equipe",
        {
          p_documento: id,
        },
        signal,
      ),
  });
  if (q.isPending) return <p role="status">Carregando contribuição…</p>;
  if (q.error || erroFuncionarios)
    return <MensagemEquipe erro={q.error || erroFuncionarios} />;
  return q.data ? (
    <EditarContribuicao
      key={`${q.data.atribuicao?.revisao}-${q.data.documento.assinatura}`}
      d={q.data}
      id={id}
      funcionarios={funcionarios}
      acao={acao}
    />
  ) : null;
}
function EditarContribuicao({
  d,
  id,
  funcionarios,
  acao,
}: {
  d: DetalheEquipe;
  id: string;
  funcionarios: ReturnType<typeof useEquipe>["funcionarios"];
  acao: ReturnType<typeof useAcaoEquipe>;
}) {
  const { w } = useEquipe();
  const nomes = useMemo(
    () => new Map(funcionarios.map((f) => [f.id, f.nome])),
    [funcionarios],
  );
  const [dados, setDados] = useState<AtribuicaoEquipe>(() =>
      prepararAtribuicao(
        d.atribuicao?.dados ?? { criterio: "igual", participantes: [], fontes: {} },
        d.fontes,
      ),
    ),
    [novo, setNovo] = useState(""),
    [horas, setHoras] = useState(false),
    [chaveHora, setChaveHora] = useState(novoId),
    [cancelar, setCancelar] = useState<string | null>(null);
  const total = dados.participantes.reduce((s, p) => s + p.execucao_bp, 0),
    vendas = dados.participantes.reduce((s, p) => s + p.venda_bp, 0);
  function participantes(lista: AtribuicaoEquipe["participantes"]) {
    const fontes = Object.fromEntries(
      Object.entries(dados.fontes).filter(
        ([, v]) => v === "rateio" || lista.some((p) => p.funcionario_id === v),
      ),
    );
    setDados({
      ...dados,
      fontes,
      participantes:
        dados.criterio === "igual" && lista.length
          ? distribuirExecucao(lista, "igual", d.fontes, fontes)
          : lista,
    });
  }
  function distribuir(c: "igual" | "horas") {
    try {
      setDados({
        ...dados,
        criterio: c,
        participantes: distribuirExecucao(
          dados.participantes,
          c,
          d.fontes,
          dados.fontes,
        ),
      });
      acao.setErro("");
    } catch (e) {
      acao.setErro((e as Error).message);
    }
  }
  async function salvarHora(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await acao.executar(async () => {
      await operacaoEquipe(w, "registrar_horas_equipe", {
        p_id: chaveHora,
        p_documento: id,
        p_funcionario: f.get("funcionario"),
        p_inicio: new Date(String(f.get("inicio")) + ":00-03:00").toISOString(),
        p_fim: new Date(String(f.get("fim")) + ":00-03:00").toISOString(),
        p_custo_hora: Math.round(Number(f.get("custo")) * 100),
        p_descricao: f.get("descricao"),
      });
      setHoras(false);
      setChaveHora(novoId());
    }, "Tempo produtivo registrado.");
  }
  return (
    <fieldset className="eq-form eq-edicao" disabled={acao.ocupado}>
      <div>
        <h3>{d.documento.titulo}</h3>
        <p>
          {d.documento.cliente} · {dinheiro(d.documento.receita)}
        </p>
        <small>
          {dados.criterio === "igual"
            ? "Adicione quem trabalhou. A divisão é automática e igual para todos."
            : "A divisão personalizada foi mantida. Você pode ajustá-la nas opções abaixo."}
        </small>
      </div>
      <MensagemEquipe erro={acao.erro} aviso={acao.aviso} />
      <div className="eq-filtros">
        <label>
          Adicionar participante
          <SeletorFuncionario
            aria-label="Adicionar participante"
            funcionarios={funcionarios.filter(
              (f) => !dados.participantes.some((p) => p.funcionario_id === f.id),
            )}
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
          />
        </label>
        <button
          className="botao-secundario"
          disabled={!novo || acao.ocupado}
          onClick={() => {
            participantes([
              ...dados.participantes,
              { funcionario_id: novo, execucao_bp: 0, venda_bp: 0 },
            ]);
            setNovo("");
          }}
        >
          <Plus size={16} />
          Adicionar
        </button>
      </div>
      {dados.participantes.map((p) => (
        <div className="eq-linha" key={p.funcionario_id}>
          <div>
            <strong>{nomes.get(p.funcionario_id) || "Funcionário"}</strong>
            <small>{(p.execucao_bp / 100).toLocaleString("pt-BR")}% do serviço</small>
          </div>
          <button
            type="button"
            className="botao-secundario"
            disabled={acao.ocupado}
            onClick={() =>
              participantes(
                dados.participantes.filter(
                  (x) => x.funcionario_id !== p.funcionario_id,
                ),
              )
            }
          >
            Remover
          </button>
        </div>
      ))}
      {!dados.participantes.length && (
        <p className="eq-ajuda">Nenhum participante adicionado.</p>
      )}
      {dados.participantes.length > 0 &&
        (total !== 10000 || ![0, 10000].includes(vendas)) && (
          <div className="eq-acoes">
            <p>Confira a divisão antes de salvar.</p>
            <button
              type="button"
              className="botao-secundario"
              onClick={() =>
                setDados({
                  ...dados,
                  criterio: "igual",
                  participantes: distribuirExecucao(
                    dados.participantes.map((p) => ({ ...p, venda_bp: 0 })),
                    "igual",
                    d.fontes,
                    dados.fontes,
                  ),
                })
              }
            >
              Dividir igualmente
            </button>
          </div>
        )}
      <button
        type="button"
        className="botao-primario"
        disabled={acao.ocupado || total !== 10000 || ![0, 10000].includes(vendas)}
        onClick={() =>
          void acao.executar(
            () =>
              operacaoEquipe(w, "salvar_atribuicao_equipe", {
                p_documento: id,
                p_dados: dados,
                p_assinatura: d.documento.assinatura,
                p_revisao: d.atribuicao?.revisao ?? null,
              }),
            "Participantes salvos.",
          )
        }
      >
        {acao.ocupado ? "Salvando…" : "Salvar participantes"}
      </button>
      <details>
        <summary>Ajustar divisão e participação nas vendas (opcional)</summary>
        {dados.participantes.map((p, i) => (
          <div className="eq-linha" key={p.funcionario_id}>
            <div>
              <strong>{nomes.get(p.funcionario_id) || "Funcionário"}</strong>
            </div>
            <div className="eq-percentuais">
              {(["execucao_bp", "venda_bp"] as const).map((k) => (
                <label key={k}>
                  {k === "execucao_bp" ? "Execução (%)" : "Venda (%)"}
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={p[k] / 100}
                    onBlur={(e) => {
                      e.currentTarget.value = String(Number(e.currentTarget.value));
                    }}
                    onChange={(e) =>
                      setDados({
                        ...dados,
                        criterio: "manual",
                        participantes: dados.participantes.map((x, j) =>
                          j === i
                            ? { ...x, [k]: Math.round(Number(e.target.value) * 100) }
                            : x,
                        ),
                      })
                    }
                  />
                </label>
              ))}
              <button
                type="button"
                className="botao-secundario"
                onClick={() =>
                  setDados({
                    ...dados,
                    criterio: "manual",
                    participantes: dados.participantes.filter(
                      (x) => x.funcionario_id !== p.funcionario_id,
                    ),
                    fontes: Object.fromEntries(
                      Object.entries(dados.fontes).filter(
                        ([, v]) => v !== p.funcionario_id,
                      ),
                    ),
                  })
                }
              >
                Remover
              </button>
            </div>
          </div>
        ))}
        <div className="eq-acoes">
          <button
            className="botao-secundario"
            disabled={!dados.participantes.length}
            onClick={() => distribuir("igual")}
          >
            Dividir execução igualmente
          </button>
          <button
            className="botao-secundario"
            disabled={!dados.participantes.length}
            onClick={() => distribuir("horas")}
          >
            Usar horas atribuídas
          </button>
          <small>
            Execução: {total / 100}% · Venda: {vendas / 100}%
          </small>
        </div>
        <p className="eq-ajuda">
          Execução deve somar 100%. Venda pode ficar sem atribuição ou somar 100%.
        </p>
      </details>
      <details>
        <summary>Custos e horas por participante (opcional)</summary>
        {!d.documento.conferido && (
          <p className="eq-ajuda">
            Custos ainda não conferidos: o resultado é provisório.
          </p>
        )}
        <p className="eq-ajuda">
          Custos sem vínculo são rateados pela execução. Horas só contam para a pessoa à
          qual foram vinculadas.
        </p>
        {d.fontes
          .filter((f) => f.valor || f.minutos || f.pendente)
          .map((f) => (
            <div className="eq-linha" key={f.chave}>
              <div>
                <strong>{f.descricao}</strong>
                <small>
                  {dinheiro(f.valor || 0)} ·{" "}
                  {Number(f.minutos || 0).toLocaleString("pt-BR")} min{" "}
                  {f.pendente ? "· Custo pendente" : ""}
                </small>
              </div>
              <label>
                Atribuir a
                <select
                  value={
                    dados.fontes[f.chave] ??
                    (dados.participantes.some(
                      (p) => p.funcionario_id === f.funcionario_id,
                    )
                      ? f.funcionario_id
                      : "rateio")
                  }
                  onChange={(e) =>
                    setDados({
                      ...dados,
                      criterio: dados.criterio === "horas" ? "manual" : dados.criterio,
                      fontes: { ...dados.fontes, [f.chave]: e.target.value },
                    })
                  }
                >
                  <option value="rateio">Ratear pela execução</option>
                  {dados.participantes.map((p) => (
                    <option key={p.funcionario_id} value={p.funcionario_id}>
                      {nomes.get(p.funcionario_id)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ))}
      </details>
      <details open={horas} onToggle={(e) => setHoras(e.currentTarget.open)}>
        <summary>Registrar tempo produtivo (opcional)</summary>
        <p className="eq-ajuda">
          Registre somente tempo ainda não apontado na OS. Este registro compõe custos;
          não substitui ponto legal.
        </p>
        <form className="eq-form" onSubmit={salvarHora}>
          <div className="eq-campos">
            <label>
              Funcionário
              <SeletorFuncionario
                funcionarios={funcionarios.filter((f) => f.ativo)}
                name="funcionario"
                required
              />
            </label>
            <label>
              Custo por hora (R$)
              <input name="custo" type="number" min="0" step="0.01" required />
            </label>
            <label>
              Início (Brasília)
              <input name="inicio" type="datetime-local" required />
            </label>
            <label>
              Fim (Brasília)
              <input name="fim" type="datetime-local" required />
            </label>
          </div>
          <label>
            O que foi realizado
            <input name="descricao" minLength={3} maxLength={1000} required />
          </label>
          <button className="botao-secundario" disabled={acao.ocupado}>
            Registrar horas
          </button>
        </form>
      </details>
      <details>
        <summary>Histórico de horas e correções (opcional)</summary>
        {d.horas.length === 0 ? (
          <p>Nenhum registro adicional.</p>
        ) : (
          d.horas.map((h) => (
            <div className="eq-linha" key={h.id}>
              <div>
                <strong>
                  {nomes.get(h.funcionario_id)} · {h.descricao}
                </strong>
                <small>
                  {horarioEquipe(h.inicio)} até {horarioEquipe(h.fim)}
                </small>
                {h.cancelado_em && <small>Cancelado: {h.motivo_cancelamento}</small>}
              </div>
              {!h.cancelado_em && (
                <button className="botao-secundario" onClick={() => setCancelar(h.id)}>
                  Corrigir
                </button>
              )}
            </div>
          ))
        )}
      </details>
      {cancelar && (
        <form
          className="eq-form eq-caixa"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void acao.executar(async () => {
              await operacaoEquipe(w, "cancelar_horas_equipe", {
                p_id: cancelar,
                p_motivo: f.get("motivo"),
              });
              setCancelar(null);
            }, "Registro cancelado e preservado no histórico.");
          }}
        >
          <label>
            Motivo da correção
            <input name="motivo" minLength={5} maxLength={1000} required />
          </label>
          <div className="eq-acoes">
            <button
              className="botao-secundario"
              type="button"
              onClick={() => setCancelar(null)}
            >
              Voltar
            </button>
            <button className="botao-primario" disabled={acao.ocupado}>
              Cancelar registro de horas
            </button>
          </div>
        </form>
      )}
    </fieldset>
  );
}
