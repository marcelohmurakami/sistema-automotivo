import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ConfiguracaoDistribuicao } from "../ConfiguracaoDistribuicao";
import { hojeEquipe, horarioEquipe } from "../../lib/produtividadeEquipe";
import { novoId } from "../../lib/uuid";
import {
  operacaoEquipe,
  type DemandaEquipe,
  type SugestaoEscala,
} from "../../services/produtividadeEquipe";
import { PeriodoEquipe, MensagemEquipe } from "./ComumEquipe";
import { useEquipe, useAcaoEquipe } from "./hooksEquipe";
export default function EscalaEquipe() {
  const { w } = useEquipe(),
    acao = useAcaoEquipe(),
    [periodo, setPeriodo] = useState(() => ({
      inicio: hojeEquipe(),
      fim: hojeEquipe(),
    })),
    [selecionados, setSelecionados] = useState<string[]>([]),
    [plano, setPlano] = useState<SugestaoEscala[] | null>(null),
    [habilidade, setHabilidade] = useState(""),
    [chave, setChave] = useState(novoId);
  const q = useQuery({
    queryKey: ["equipe", w, "demanda", periodo],
    queryFn: ({ signal }) =>
      operacaoEquipe<DemandaEquipe[]>(
        w,
        "consultar_demanda_equipe",
        { p_inicio: periodo.inicio, p_fim: periodo.fim },
        signal,
      ),
    enabled: !!periodo.inicio && !!periodo.fim,
  });
  const aptos = plano?.filter((p) => p.escolha) ?? [];
  return (
    <section className="eq-secao">
      <header>
        <h1>Escala da equipe</h1>
        <p className="eq-ajuda">
          Distribua os atendimentos da agenda conforme jornada, ausências, aptidões e
          carga de trabalho.
        </p>
      </header>
      <PeriodoEquipe
        valor={periodo}
        desabilitado={acao.ocupado}
        mudar={(p) => {
          setPeriodo(p);
          setSelecionados([]);
          setPlano(null);
        }}
      />
      <MensagemEquipe erro={acao.erro || q.error} aviso={acao.aviso} />
      <div className="eq-caixa">
        <div className="eq-cabecalho">
          <h2>Atendimentos para distribuir</h2>
          <Link to="/agenda" className="botao-secundario">
            Abrir agenda
          </Link>
        </div>
        {q.isPending ? (
          <p role="status">Carregando agenda…</p>
        ) : !q.data?.length ? (
          <p className="eq-vazio">
            Sem atendimentos ativos neste período. Cadastre-os na agenda para distribuir
            a equipe.
          </p>
        ) : (
          <>
            <p className="eq-ajuda">
              Selecione até 50. Término e habilidade são necessários para verificar
              disponibilidade.
            </p>
            {q.data.length > 200 && (
              <p className="eq-alerta">
                Mostrando os primeiros 200. Reduza o período para ver os demais.
              </p>
            )}
            {q.data.slice(0, 200).map((d) => (
              <div className="eq-linha" key={d.id}>
                <label className="eq-check">
                  <input
                    type="checkbox"
                    checked={selecionados.includes(d.id)}
                    disabled={
                      acao.ocupado ||
                      (!selecionados.includes(d.id) && selecionados.length >= 50)
                    }
                    onChange={(e) => {
                      setSelecionados(
                        e.target.checked
                          ? [...selecionados, d.id]
                          : selecionados.filter((x) => x !== d.id),
                      );
                      setPlano(null);
                    }}
                  />
                  {d.servico || "Atendimento"}
                </label>
                <div>
                  <strong>{horarioEquipe(d.inicio)}</strong>
                  <small>
                    {d.fim ? "Até " + horarioEquipe(d.fim) : "Término não informado"}
                    {d.recurso ? " · " + d.recurso : ""}
                  </small>
                </div>
              </div>
            ))}
            <div className="eq-filtros">
              <label>
                Habilidade para agendas sem requisito
                <input
                  placeholder="Ex.: diagnóstico, instalação, higienização"
                  value={habilidade}
                  disabled={acao.ocupado}
                  onChange={(e) => {
                    setHabilidade(e.target.value);
                    setPlano(null);
                  }}
                />
              </label>
              <button
                className="botao-primario"
                disabled={acao.ocupado || !selecionados.length}
                onClick={() =>
                  void acao.executar(async () => {
                    setPlano(
                      await operacaoEquipe<SugestaoEscala[]>(
                        w,
                        "prever_escala_equipe",
                        {
                          p_ids: selecionados,
                          p_habilidades: habilidade.trim()
                            ? habilidade
                                .split(",")
                                .map((x) => x.trim())
                                .filter(Boolean)
                            : null,
                        },
                      ),
                    );
                    setChave(novoId());
                  }, "Sugestão pronta para conferência.")
                }
              >
                {acao.ocupado
                  ? "Verificando…"
                  : `Sugerir escala (${selecionados.length})`}
              </button>
            </div>
          </>
        )}
      </div>
      {plano && (
        <div className="eq-caixa">
          <h2>Confira antes de confirmar</h2>
          <p className="eq-ajuda">
            {aptos.length} de {plano.length} com equipe sugerida. A sugestão prioriza
            disponibilidade e menor carga; você pode alterar a escolha. Conflitos serão
            conferidos novamente ao salvar.
          </p>
          {plano.map((p, i) => (
            <div className="eq-linha" key={p.id}>
              <div>
                <strong>{p.descricao}</strong>
                <small>{horarioEquipe(p.inicio)}</small>
                {!p.escolha && (
                  <p className="eq-alerta">{p.motivo || "Sem equipe escolhida."}</p>
                )}
                <details>
                  <summary>Critérios verificados</summary>
                  {p.candidatos.map((c) => (
                    <p key={c.id}>
                      <strong>{c.nome}</strong>:{" "}
                      {c.apto
                        ? `Disponível · ${c.carga_minutos} min já agendados`
                        : c.motivos.join(" · ")}
                      {c.avisos.length ? " · " + c.avisos.join(" · ") : ""}
                    </p>
                  ))}
                </details>
              </div>
              <label>
                Equipe
                <select
                  value={p.escolha?.id ?? ""}
                  disabled={acao.ocupado}
                  onChange={(e) => {
                    setPlano(
                      plano.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              escolha:
                                p.candidatos.find((c) => c.id === e.target.value) ??
                                null,
                            }
                          : x,
                      ),
                    );
                    setChave(novoId());
                  }}
                >
                  <option value="">Não distribuir agora</option>
                  {p.candidatos
                    .filter((c) => c.apto)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          ))}
          <button
            className="botao-primario"
            disabled={acao.ocupado || !aptos.length}
            onClick={() =>
              void acao.executar(async () => {
                await operacaoEquipe(w, "aplicar_escala_equipe", {
                  p_id: chave,
                  p_propostas: aptos.map((p) => ({
                    id: p.id,
                    revisao: p.revisao,
                    perfil_id: p.escolha!.id,
                    habilidades: p.habilidades,
                  })),
                });
                setPlano(null);
                setSelecionados([]);
              }, "Escala confirmada na agenda.")
            }
          >
            {acao.ocupado ? "Confirmando…" : `Confirmar ${aptos.length} atendimentos`}
          </button>
        </div>
      )}
      <ConfiguracaoDistribuicao />
    </section>
  );
}
