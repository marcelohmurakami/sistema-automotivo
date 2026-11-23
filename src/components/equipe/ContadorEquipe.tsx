import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialogo } from "../Dialogo";
import { novoId } from "../../lib/uuid";
import { dinheiro } from "../../lib/formatacao";
import {
  dataEquipe,
  horarioEquipe,
  csvDepartamentoPessoal,
  baixarEquipe,
} from "../../lib/produtividadeEquipe";
import {
  operacaoEquipe,
  type PreparacaoDP,
  type ExportacaoDP,
} from "../../services/produtividadeEquipe";
import { PeriodoEquipe, MensagemEquipe, SeletorFuncionario } from "./ComumEquipe";
import { useEquipe, useAcaoEquipe, usePeriodoEquipe } from "./hooksEquipe";
export default function ContadorEquipe() {
  const { w, funcionarios, erroFuncionarios } = useEquipe(),
    acao = useAcaoEquipe(),
    [periodo, setPeriodo] = usePeriodoEquipe(),
    [novo, setNovo] = useState(false),
    [cancelar, setCancelar] = useState<string | null>(null),
    [exportacao, setExportacao] = useState<ExportacaoDP | null>(null),
    [chave, setChave] = useState(novoId),
    [chaveExportacao, setChaveExportacao] = useState(novoId);
  const nomes = useMemo(
    () => new Map(funcionarios.map((f) => [f.id, f.nome])),
    [funcionarios],
  );
  const q = useQuery({
    queryKey: ["equipe", w, "dp", periodo],
    queryFn: ({ signal }) =>
      operacaoEquipe<PreparacaoDP>(
        w,
        "consultar_departamento_pessoal",
        { p_inicio: periodo.inicio, p_fim: periodo.fim },
        signal,
      ),
    enabled: !!periodo.inicio && !!periodo.fim,
  });
  function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void acao.executar(async () => {
      await operacaoEquipe(w, "lancar_departamento_pessoal", {
        p_id: chave,
        p_dados: {
          ...Object.fromEntries(f),
          valor_centavos: Math.round(Number(f.get("valor")) * 100),
        },
      });
      setNovo(false);
      setChave(novoId());
    }, "Lançamento preparado para conferência.");
  }
  function baixar(ex: ExportacaoDP, tipo: "csv" | "json") {
    baixarEquipe(
      `equipe-contador-${ex.inicio}-${ex.id.slice(0, 8)}.${tipo}`,
      tipo === "csv" ? csvDepartamentoPessoal(ex) : JSON.stringify(ex, null, 2),
      tipo === "csv" ? "text/csv;charset=utf-8" : "application/json",
    );
  }
  return (
    <section className="eq-secao">
      <header className="eq-cabecalho">
        <div>
          <h1>Preparação para o contador</h1>
          <p className="eq-ajuda">
            Cadastros, ocorrências, horas produtivas e lançamentos para conferência.
          </p>
        </div>
        <button
          className="botao-secundario"
          onClick={() => {
            acao.setErro("");
            setChave(novoId());
            setNovo(true);
          }}
        >
          Novo lançamento
        </button>
      </header>
      <PeriodoEquipe
        valor={periodo}
        desabilitado={acao.ocupado}
        mudar={(p) => {
          setPeriodo(p);
          setExportacao(null);
          setChaveExportacao(novoId());
        }}
      />
      <MensagemEquipe
        erro={q.error || erroFuncionarios || (!novo && !cancelar && acao.erro)}
        aviso={acao.aviso}
      />
      <p className="eq-alerta">
        Preparação gerencial. Não calcula folha, encargos ou ponto legal e não transmite
        ao eSocial. A integração com um provedor especializado ainda precisa ser
        configurada e homologada.
      </p>
      {q.isPending ? (
        <p role="status">Preparando dados do período…</p>
      ) : (
        q.data && (
          <>
            <div className="eq-resumo">
              <div>
                <small>Funcionários cadastrados</small>
                <strong>{q.data.funcionarios.length}</strong>
              </div>
              <div>
                <small>Ocorrências no período</small>
                <strong>{q.data.ocorrencias.length}</strong>
              </div>
              <div>
                <small>Lançamentos ativos</small>
                <strong>
                  {q.data.lancamentos.filter((x) => !x.cancelado_em).length}
                </strong>
              </div>
            </div>
            <div className="eq-caixa">
              <div className="eq-cabecalho">
                <h2>Lançamentos para conferência</h2>
                <button
                  className="botao-primario"
                  disabled={acao.ocupado}
                  onClick={() =>
                    void acao.executar(async () => {
                      setExportacao(
                        await operacaoEquipe<ExportacaoDP>(
                          w,
                          "exportar_departamento_pessoal",
                          {
                            p_id: chaveExportacao,
                            p_inicio: periodo.inicio,
                            p_fim: periodo.fim,
                          },
                        ),
                      );
                      setChaveExportacao(novoId());
                    }, "Versão da exportação registrada. Escolha o formato para baixar.")
                  }
                >
                  {acao.ocupado ? "Preparando…" : "Preparar exportação"}
                </button>
              </div>
              {!q.data.lancamentos.length ? (
                <p className="eq-vazio">
                  Sem lançamentos adicionais. Cadastros e ocorrências continuam
                  disponíveis na exportação.
                </p>
              ) : (
                q.data.lancamentos.map((l) => (
                  <div className="eq-linha" key={String(l.id)}>
                    <div>
                      <strong>
                        {nomes.get(String(l.funcionario_id))} · {String(l.rubrica)}
                      </strong>
                      <small>
                        {dataEquipe(String(l.competencia))} · {String(l.natureza)} ·{" "}
                        {l.cancelado_em ? "Cancelado" : String(l.referencia)}
                      </small>
                    </div>
                    <strong>{dinheiro(Number(l.valor_centavos))}</strong>
                    {!l.cancelado_em && (
                      <button
                        className="botao-secundario"
                        onClick={() => {
                          acao.setErro("");
                          setCancelar(String(l.id));
                        }}
                      >
                        Corrigir
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
            {exportacao && (
              <div className="eq-caixa">
                <h2>Arquivo pronto para baixar</h2>
                <p>
                  {dataEquipe(exportacao.inicio)} a {dataEquipe(exportacao.fim)} ·
                  Versão preservada para conferência.
                </p>
                <div className="eq-acoes">
                  <button
                    className="botao-primario"
                    onClick={() => baixar(exportacao, "csv")}
                  >
                    Baixar CSV para o contador
                  </button>
                  <button
                    className="botao-secundario"
                    onClick={() => baixar(exportacao, "json")}
                  >
                    Baixar JSON para integração
                  </button>
                </div>
              </div>
            )}
            <details className="eq-caixa">
              <summary>O que o contador precisa conferir</summary>
              {q.data.pendencias.map((p) => (
                <p key={p}>{p}</p>
              ))}
              <p>
                Valores monetários no arquivo são em centavos. Salário-base é o valor
                atual informado, sem cálculo proporcional. Lançamentos e comissões não
                são pagamentos confirmados.
              </p>
            </details>
            <details className="eq-caixa">
              <summary>Histórico de exportações</summary>
              {q.data.exportacoes.map((e) => (
                <button
                  className="eq-linha eq-linha-button"
                  key={e.id}
                  disabled={acao.ocupado}
                  onClick={() =>
                    void acao.executar(async () => {
                      setExportacao(
                        await operacaoEquipe<ExportacaoDP>(w, "obter_exportacao_dp", {
                          p_id: e.id,
                        }),
                      );
                    }, "Versão original recuperada.")
                  }
                >
                  <div>
                    <strong>
                      {dataEquipe(e.inicio)} a {dataEquipe(e.fim)}
                    </strong>
                    <small>Preparada em {horarioEquipe(e.criado_em)}</small>
                  </div>
                  <span>Recuperar arquivo</span>
                </button>
              ))}
            </details>
          </>
        )
      )}
      {novo && (
        <Dialogo
          aberto
          fechar={() => !acao.ocupado && setNovo(false)}
          titulo="Lançamento para o contador"
          classe="eq-dialogo"
        >
          <form className="eq-form" onSubmit={salvar}>
            <MensagemEquipe erro={acao.erro} />
            <label>
              Funcionário
              <SeletorFuncionario
                funcionarios={funcionarios}
                name="funcionario_id"
                disabled={acao.ocupado}
                required
              />
            </label>
            <div className="eq-campos">
              <label>
                Competência
                <input
                  name="competencia"
                  disabled={acao.ocupado}
                  type="date"
                  required
                  defaultValue={periodo.inicio}
                />
              </label>
              <label>
                Natureza
                <select aria-label="Natureza" name="natureza" disabled={acao.ocupado}>
                  <option value="provento">Provento a conferir</option>
                  <option value="desconto">Desconto a conferir</option>
                  <option value="informativo">Informativo</option>
                </select>
              </label>
              <label>
                Rubrica / descrição
                <input
                  name="rubrica"
                  disabled={acao.ocupado}
                  required
                  minLength={2}
                  maxLength={120}
                  placeholder="Ex.: gratificação a conferir"
                />
              </label>
              <label>
                Valor (R$)
                <input
                  name="valor"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  disabled={acao.ocupado}
                />
              </label>
            </div>
            <label>
              Referência ou autorização
              <input
                name="referencia"
                required
                minLength={3}
                maxLength={1000}
                disabled={acao.ocupado}
              />
            </label>
            <small>Este registro não gera pagamento nem desconto automático.</small>
            <button className="botao-primario" disabled={acao.ocupado}>
              Salvar lançamento
            </button>
          </form>
        </Dialogo>
      )}
      {cancelar && (
        <Dialogo
          aberto
          fechar={() => !acao.ocupado && setCancelar(null)}
          titulo="Corrigir lançamento"
          classe="eq-dialogo"
        >
          <form
            className="eq-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void acao.executar(async () => {
                await operacaoEquipe(w, "cancelar_lancamento_dp", {
                  p_id: cancelar,
                  p_motivo: f.get("motivo"),
                });
                setCancelar(null);
              }, "Lançamento cancelado. O histórico foi preservado.");
            }}
          >
            <MensagemEquipe erro={acao.erro} />
            <label>
              Motivo
              <input
                name="motivo"
                required
                minLength={5}
                maxLength={1000}
                disabled={acao.ocupado}
              />
            </label>
            <button className="botao-primario" disabled={acao.ocupado}>
              Cancelar lançamento
            </button>
          </form>
        </Dialogo>
      )}
    </section>
  );
}
