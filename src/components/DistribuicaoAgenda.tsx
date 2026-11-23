import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { WandSparkles } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { erroPublico } from "../lib/supabase";
import { dadosVisita } from "../lib/logisticaVisitas";
import { SelecaoCatalogo } from "./SelecaoCatalogo";
import {
  listarDistribuicao,
  sugerirTecnico,
  textosDistribuicao,
  type CandidatoTecnico,
  type CriteriosDistribuicao,
  type ResultadoDistribuicao,
} from "../services/distribuicaoTecnicos";
import "./DistribuicaoAgenda.css";

export function DistribuicaoAgenda({
  id,
  inicial,
  aoEscolher,
  aoProcessar,
}: {
  id: string;
  inicial?: Partial<CriteriosDistribuicao>;
  aoEscolher: (c: CandidatoTecnico) => void;
  aoProcessar: (ocupado: boolean) => void;
}) {
  const acesso = useAcesso(),
    oficina = acesso.oficina!.id;
  const ref = useRef<HTMLDivElement>(null);
  const geracao = useRef(0);
  const trava = useRef(false);
  const [aberto, setAberto] = useState(!!inicial?.perfil_id);
  const [criterios, setCriterios] = useState<CriteriosDistribuicao>({
    habilidades: [],
    ferramentas: [],
    regiao: "",
    materiais: [],
    ...inicial,
  });
  const [resultado, setResultado] = useState<ResultadoDistribuicao>();
  const [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState("");
  const [material, setMaterial] = useState(""),
    [nomeMaterial, setNomeMaterial] = useState(""),
    [quantidade, setQuantidade] = useState(1);
  const q = useQuery({
    queryKey: ["distribuicao", oficina],
    queryFn: ({ signal }) => listarDistribuicao(oficina, signal),
    enabled: aberto && !acesso.demo,
    staleTime: 30000,
  });
  useEffect(() => {
    const form = ref.current?.closest("form");
    const cancelar = () => {
      geracao.current++;
    };
    const invalidar = () => {
      geracao.current++;
      setResultado(undefined);
    };
    form?.addEventListener("input", invalidar);
    form?.addEventListener("change", invalidar);
    return () => {
      cancelar();
      form?.removeEventListener("input", invalidar);
      form?.removeEventListener("change", invalidar);
    };
  }, []);
  function alterar(d: Partial<CriteriosDistribuicao>) {
    geracao.current++;
    setResultado(undefined);
    setCriterios((c) => ({ ...c, ...d }));
    setErro("");
  }
  function escolher(c: CandidatoTecnico) {
    setCriterios((p) => ({ ...p, perfil_id: c.id }));
    aoEscolher(c);
  }
  async function distribuir() {
    if (trava.current) return;
    const form = ref.current?.closest("form");
    if (!form) return;
    trava.current = true;
    const dados = new FormData(form),
      atual = ++geracao.current;
    const data = (campo: string) => {
      const valor = String(dados.get(campo) || "");
      return valor ? new Date(`${valor}:00-03:00`).toISOString() : null;
    };
    setOcupado(true);
    aoProcessar(true);
    setErro("");
    setResultado(undefined);
    try {
      const r = await sugerirTecnico(oficina, {
        id,
        inicio: data("inicio"),
        fim: data("fim"),
        atendimento_id: dados.get("atendimento_id") || null,
        ...dadosVisita(dados),
        distribuicao: criterios,
      });
      if (atual !== geracao.current) {
        setErro("Os dados mudaram durante a consulta. Escolha novamente.");
        return;
      }
      setResultado(r);
      const melhor = r.candidatos.find((c) => c.apto);
      if (melhor) escolher(melhor);
      else setCriterios((c) => ({ ...c, perfil_id: undefined }));
    } catch (e) {
      if (atual === geracao.current) setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
      aoProcessar(false);
    }
  }
  return (
    <div className="distribuicao-agenda" ref={ref}>
      <input
        type="hidden"
        name="distribuicao"
        value={JSON.stringify(criterios.perfil_id ? criterios : {})}
      />
      {!aberto ? (
        <button
          type="button"
          className="botao-secundario"
          onClick={() => setAberto(true)}
        >
          <WandSparkles size={17} /> Escolher equipe automaticamente
        </button>
      ) : (
        <>
          <div className="distribuicao-cabecalho">
            <strong>Escolha automática da equipe</strong>
            <button
              type="button"
              onClick={() => {
                geracao.current++;
                setCriterios((c) => ({ ...c, perfil_id: undefined }));
                setAberto(false);
                setResultado(undefined);
              }}
              disabled={ocupado}
            >
              Usar escolha manual
            </button>
          </div>
          {acesso.demo ? (
            <p>
              Entre na empresa conectada para distribuir usando a agenda e o estoque
              reais.
            </p>
          ) : (
            <>
              {q.isError && <p role="alert">{erroPublico(q.error)}</p>}
              {q.isPending && <p role="status">Carregando equipes…</p>}
              {q.data && !q.data.perfis.some((p) => p.ativo) && (
                <p>
                  Configure as habilidades e a jornada em “Distribuição de técnicos”, no
                  fim da agenda.
                </p>
              )}
              <label>
                Habilidades necessárias
                <input
                  aria-label="Habilidades necessárias"
                  maxLength={1000}
                  defaultValue={criterios.habilidades.join("; ")}
                  onChange={(e) =>
                    alterar({ habilidades: textosDistribuicao(e.target.value) })
                  }
                  list={`habilidades-${id}`}
                  placeholder="Escolha uma habilidade cadastrada; separe várias por ponto e vírgula"
                />
              </label>
              <datalist id={`habilidades-${id}`}>
                {[...new Set(q.data?.perfis.flatMap((p) => p.habilidades) || [])].map(
                  (h) => (
                    <option key={h} value={h} />
                  ),
                )}
              </datalist>
              <details>
                <summary>Região, ferramentas e materiais (opcional)</summary>
                <label>
                  Região da visita
                  <input
                    value={criterios.regiao}
                    onChange={(e) => alterar({ regiao: e.target.value })}
                    maxLength={100}
                    placeholder="Bairro, cidade ou região cadastrada"
                    list={`regioes-${id}`}
                  />
                </label>
                <datalist id={`regioes-${id}`}>
                  {[...new Set(q.data?.perfis.flatMap((p) => p.regioes) || [])].map(
                    (r) => (
                      <option key={r} value={r} />
                    ),
                  )}
                </datalist>
                <label>
                  Ferramentas ou equipamentos necessários
                  <input
                    defaultValue={criterios.ferramentas.join("; ")}
                    onChange={(e) =>
                      alterar({ ferramentas: textosDistribuicao(e.target.value) })
                    }
                    maxLength={1000}
                    placeholder="Separe por ponto e vírgula"
                  />
                </label>
                {acesso.oficina!.recursos.includes("inventory") && (
                  <>
                    <p className="texto-apoio">
                      Os materiais de estoque já vinculados ao atendimento são
                      conferidos automaticamente. Inclua outros, se necessário.
                    </p>
                    <SelecaoCatalogo
                      rotulo="Material necessário"
                      tipo="part"
                      valor={material}
                      selecionar={(id, item) => {
                        setMaterial(id);
                        setNomeMaterial(item?.descricao || "");
                      }}
                    />
                    <div className="distribuicao-linha">
                      <label>
                        Quantidade
                        <input
                          type="number"
                          min="0.001"
                          max="1000000"
                          step="0.001"
                          value={quantidade}
                          onChange={(e) => setQuantidade(Number(e.target.value))}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={
                          !material || !Number.isFinite(quantidade) || quantidade <= 0
                        }
                        onClick={() => {
                          alterar({
                            materiais: [
                              ...criterios.materiais.filter(
                                (m) => m.produto_id !== material,
                              ),
                              { produto_id: material, quantidade, nome: nomeMaterial },
                            ],
                          });
                          setMaterial("");
                          setQuantidade(1);
                        }}
                      >
                        Incluir material
                      </button>
                    </div>
                    {criterios.materiais.map((m) => (
                      <div className="distribuicao-linha" key={m.produto_id}>
                        <span>
                          {m.nome || "Material"} · {m.quantidade}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            alterar({
                              materiais: criterios.materiais.filter(
                                (x) => x.produto_id !== m.produto_id,
                              ),
                            })
                          }
                        >
                          Remover
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </details>
              <button
                type="button"
                className="botao-primario"
                onClick={() => void distribuir()}
                disabled={
                  ocupado ||
                  !criterios.habilidades.length ||
                  !q.data?.perfis.some((p) => p.ativo)
                }
              >
                <WandSparkles size={17} />
                {ocupado ? "Conferindo equipes…" : "Escolher automaticamente"}
              </button>
              {erro && <p role="alert">{erro}</p>}
              {resultado && (
                <div role="status">
                  {!resultado.candidatos.some((c) => c.apto) && (
                    <p>
                      <strong>
                        Nenhuma equipe atende aos requisitos nesse horário.
                      </strong>{" "}
                      Ajuste o período ou confira os impedimentos abaixo.
                    </p>
                  )}
                  {resultado.materiais_faltantes.map((m) => (
                    <p className="distribuicao-impedimento" key={m.produto_id}>
                      {m.nome}: precisa de {m.necessario}; disponível {m.disponivel}.
                    </p>
                  ))}
                  {resultado.candidatos
                    .filter((c) => c.apto)
                    .slice(0, 5)
                    .map((c) => (
                      <div
                        className={`distribuicao-candidato ${criterios.perfil_id === c.id ? "escolhido" : ""}`}
                        key={c.id}
                      >
                        <div>
                          <strong>{c.nome}</strong>
                          <span>
                            Habilidade e horário compatíveis
                            {c.distancia_km != null &&
                              ` · ${c.distancia_km.toLocaleString("pt-BR")} km em linha reta`}
                            {` · ${c.carga_minutos} min ocupados no dia`}
                          </span>
                          {c.origem && (
                            <small>Local planejado de saída: {c.origem}</small>
                          )}
                          {c.avisos.map((a) => (
                            <small key={a}>{a}</small>
                          ))}
                        </div>
                        <button
                          type="button"
                          aria-pressed={criterios.perfil_id === c.id}
                          onClick={() => escolher(c)}
                        >
                          {criterios.perfil_id === c.id ? "Selecionada" : "Escolher"}
                        </button>
                      </div>
                    ))}
                  {resultado.candidatos.some((c) => !c.apto) && (
                    <details>
                      <summary>
                        Equipes indisponíveis (
                        {resultado.candidatos.filter((c) => !c.apto).length})
                      </summary>
                      {resultado.candidatos
                        .filter((c) => !c.apto)
                        .map((c) => (
                          <p key={c.id}>
                            <strong>{c.nome}:</strong> {c.motivos.join(" · ")}
                          </p>
                        ))}
                    </details>
                  )}
                </div>
              )}
              {criterios.perfil_id && (
                <p className="texto-apoio">
                  A equipe será conferida novamente ao salvar. Para visitas, confira a
                  origem e calcule o trajeto da equipe escolhida. Materiais são
                  consultados no estoque; esta escolha não dá baixa nem reserva peças.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
