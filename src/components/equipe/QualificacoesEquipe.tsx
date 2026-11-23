import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialogo } from "../Dialogo";
import { ConfiguracaoDistribuicao } from "../ConfiguracaoDistribuicao";
import { MatrizEquipe } from "./MatrizEquipe";
import { novoId } from "../../lib/uuid";
import { dataEquipe, hojeEquipe } from "../../lib/produtividadeEquipe";
import {
  operacaoEquipe,
  type ConsultaQualificacao,
  type QualificacaoEquipe,
  type HabilidadeEquipe,
} from "../../services/produtividadeEquipe";
import { MensagemEquipe, SeletorFuncionario, PaginacaoEquipe } from "./ComumEquipe";
import { useEquipe, useAcaoEquipe } from "./hooksEquipe";
export default function QualificacoesEquipe() {
  const { w, funcionarios, erroFuncionarios } = useEquipe(),
    acao = useAcaoEquipe(),
    [pessoa, setPessoa] = useState(""),
    [visao, setVisao] = useState("matriz"),
    [pagina, setPagina] = useState(0),
    [edicao, setEdicao] = useState<Partial<QualificacaoEquipe> | null>(null),
    [habilidade, setHabilidade] = useState<Partial<HabilidadeEquipe> | null>(null);
  const q = useQuery({
    queryKey: ["equipe", w, "qualificacoes", pessoa, pagina],
    queryFn: ({ signal }) =>
      operacaoEquipe<ConsultaQualificacao>(
        w,
        "consultar_qualificacoes_equipe",
        {
          p_funcionario: pessoa || null,
          p_pagina: pagina,
        },
        signal,
      ),
  });
  function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void acao.executar(async () => {
      await operacaoEquipe(w, "salvar_qualificacao_equipe", {
        p_id: edicao?.id ?? novoId(),
        p_revisao: edicao?.revisao ?? null,
        p_dados: {
          ...Object.fromEntries(f),
          nivel: Number(f.get("nivel")),
          valida_ate: f.get("valida_ate") || null,
        },
      });
      setEdicao(null);
    }, "Qualificação registrada.");
  }
  function salvarHabilidade(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void acao.executar(async () => {
      await operacaoEquipe(w, "salvar_habilidade_equipe", {
        p_revisao: habilidade?.revisao ?? null,
        p_dados: {
          nome: f.get("nome"),
          nivel_minimo: Number(f.get("nivel_minimo")),
          exige_comprovacao: f.get("exige_comprovacao") === "on",
          ativo: true,
        },
      });
      setHabilidade(null);
    }, "Habilidade salva.");
  }
  return (
    <section className="eq-secao">
      <header className="eq-cabecalho">
        <div>
          <h1>Qualificações e treinamentos</h1>
          <p className="eq-ajuda">
            Controle aptidões e validade dos comprovantes usados na distribuição da
            equipe.
          </p>
        </div>
        <button
          className="botao-primario"
          onClick={() => {
            acao.setErro("");
            setEdicao({ id: novoId() });
          }}
        >
          Registrar qualificação
        </button>
      </header>
      <MensagemEquipe
        erro={q.error || erroFuncionarios || (!edicao && !habilidade && acao.erro)}
        aviso={acao.aviso}
      />
      {q.data && q.data.vencendo > 0 && (
        <p className="eq-alerta">
          {q.data.vencendo} comprovantes vencidos ou com vencimento nos próximos 30
          dias. Confira as renovações.
        </p>
      )}
      <div className="eq-caixa">
        <div className="eq-cabecalho">
          <h2>Aptidões da equipe</h2>
          <label>
            Funcionário
            <SeletorFuncionario
              funcionarios={funcionarios}
              value={pessoa}
              onChange={(e) => {
                setPessoa(e.target.value);
                setPagina(0);
              }}
            />
          </label>
        </div>
        <div className="eq-abas">
          <button
            aria-current={visao === "matriz" ? "page" : undefined}
            onClick={() => setVisao("matriz")}
          >
            Matriz de aptidões
          </button>
          <button
            aria-current={visao === "registros" ? "page" : undefined}
            onClick={() => setVisao("registros")}
          >
            Registros e treinamentos
          </button>
        </div>
        {visao === "matriz" ? (
          <MatrizEquipe key={pessoa} w={w} pessoa={pessoa} />
        ) : (
          <>
            {q.isPending ? (
              <p role="status">Carregando qualificações…</p>
            ) : !q.data?.qualificacoes.length ? (
              <p className="eq-vazio">
                Registre um treinamento ou uma qualificação para acompanhar a equipe.
              </p>
            ) : (
              q.data.qualificacoes.slice(0, 50).map((x) => (
                <button
                  className="eq-linha eq-linha-button"
                  key={x.id}
                  onClick={() => {
                    acao.setErro("");
                    setEdicao(x);
                  }}
                >
                  <div>
                    <strong>{x.nome}</strong>
                    <small>
                      {q.data.habilidades.find((h) => h.habilidade === x.habilidade)
                        ?.nome ?? x.habilidade}{" "}
                      · Nível {x.nivel}
                    </small>
                  </div>
                  <span className="eq-badge">
                    {x.situacao === "planejada"
                      ? "Planejada"
                      : x.situacao === "revogada"
                        ? "Revogada"
                        : x.valida_ate && x.valida_ate < hojeEquipe()
                          ? "Vencida"
                          : "Concluída"}
                  </span>
                  <span>
                    <small>
                      {x.valida_ate
                        ? "Validade: " + dataEquipe(x.valida_ate)
                        : "Sem vencimento informado"}
                    </small>
                  </span>
                </button>
              ))
            )}
            <PaginacaoEquipe
              pagina={pagina}
              mudar={setPagina}
              mais={(q.data?.qualificacoes.length ?? 0) > 50}
            />
          </>
        )}
      </div>
      <details className="eq-caixa">
        <summary>Habilidades e exigências da distribuição</summary>
        <p className="eq-ajuda">
          Use o mesmo nome da habilidade no perfil do técnico e na agenda. Quando exigir
          comprovação, a escala verifica nível e validade do funcionário vinculado.
        </p>
        {q.data?.habilidades.map((h) => (
          <button
            className="eq-linha eq-linha-button"
            key={h.habilidade}
            onClick={() => {
              acao.setErro("");
              setHabilidade(h);
            }}
          >
            <div>
              <strong>{h.nome}</strong>
              <small>
                Nível mínimo {h.nivel_minimo} ·{" "}
                {h.exige_comprovacao
                  ? "Exige comprovante válido"
                  : "Aptidão declarada no perfil"}
              </small>
            </div>
            <span>Editar</span>
          </button>
        ))}
        <button
          className="botao-secundario"
          onClick={() => {
            acao.setErro("");
            setHabilidade({});
          }}
        >
          Nova habilidade
        </button>
      </details>
      <ConfiguracaoDistribuicao />
      {edicao && (
        <Dialogo
          aberto
          fechar={() => !acao.ocupado && setEdicao(null)}
          titulo={edicao.revisao ? "Editar qualificação" : "Registrar qualificação"}
          classe="eq-dialogo"
        >
          <form className="eq-form" onSubmit={salvar}>
            <MensagemEquipe erro={acao.erro} />
            <div className="eq-campos">
              <label>
                Funcionário
                <SeletorFuncionario
                  funcionarios={funcionarios}
                  name="funcionario_id"
                  required
                  defaultValue={edicao.funcionario_id ?? pessoa}
                />
              </label>
              <label>
                Habilidade
                <select
                  aria-label="Habilidade"
                  name="habilidade"
                  required
                  defaultValue={edicao.habilidade ?? ""}
                >
                  <option value="">Selecione a habilidade</option>
                  {q.data?.habilidades
                    .filter((h) => h.ativo)
                    .map((h) => (
                      <option key={h.habilidade} value={h.habilidade}>
                        {h.nome}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Nível
                <select
                  aria-label="Nível"
                  name="nivel"
                  defaultValue={edicao.nivel ?? 1}
                >
                  <option value="1">1 · Básico</option>
                  <option value="2">2 · Intermediário</option>
                  <option value="3">3 · Avançado</option>
                </select>
              </label>
              <label>
                Situação
                <select
                  aria-label="Situação"
                  name="situacao"
                  defaultValue={edicao.situacao ?? "concluida"}
                >
                  <option value="planejada">Planejada</option>
                  <option value="concluida">Concluída</option>
                  <option value="revogada">Revogada</option>
                </select>
              </label>
              <label>
                Data de realização
                <input
                  name="realizada_em"
                  type="date"
                  required
                  defaultValue={edicao.realizada_em ?? hojeEquipe()}
                />
              </label>
              <label>
                Validade (opcional)
                <input
                  name="valida_ate"
                  type="date"
                  defaultValue={edicao.valida_ate ?? ""}
                />
              </label>
            </div>
            <label>
              Referência do comprovante
              <input
                name="comprovante"
                defaultValue={edicao.comprovante ?? ""}
                maxLength={2000}
                placeholder="Certificado, entidade emissora e número ou link"
              />
            </label>
            <small>
              Obrigatório para uma qualificação concluída. O gestor confere a
              autenticidade.
            </small>
            <details>
              <summary>Observações (opcional)</summary>
              <label>
                Observações
                <textarea
                  name="observacoes"
                  defaultValue={edicao.observacoes ?? ""}
                  maxLength={2000}
                />
              </label>
            </details>
            <button className="botao-primario" disabled={acao.ocupado}>
              {acao.ocupado ? "Salvando…" : "Salvar qualificação"}
            </button>
          </form>
        </Dialogo>
      )}
      {habilidade && (
        <Dialogo
          aberto
          fechar={() => !acao.ocupado && setHabilidade(null)}
          titulo="Habilidade da equipe"
          classe="eq-dialogo"
        >
          <form className="eq-form" onSubmit={salvarHabilidade}>
            <MensagemEquipe erro={acao.erro} />
            <label>
              Nome
              <input
                name="nome"
                required
                minLength={2}
                maxLength={100}
                readOnly={!!habilidade.habilidade}
                defaultValue={habilidade.nome ?? ""}
              />
            </label>
            <label>
              Nível mínimo
              <select
                aria-label="Nível mínimo"
                name="nivel_minimo"
                defaultValue={habilidade.nivel_minimo ?? 1}
              >
                <option value="1">1 · Básico</option>
                <option value="2">2 · Intermediário</option>
                <option value="3">3 · Avançado</option>
              </select>
            </label>
            <label className="eq-check">
              <input
                type="checkbox"
                name="exige_comprovacao"
                defaultChecked={habilidade.exige_comprovacao ?? true}
              />
              Exigir comprovante válido para distribuir serviços
            </label>
            <button className="botao-primario" disabled={acao.ocupado}>
              Salvar habilidade
            </button>
          </form>
        </Dialogo>
      )}
    </section>
  );
}
