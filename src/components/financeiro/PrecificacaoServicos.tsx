import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../../auth/contexto";
import { dinheiro } from "../../lib/formatacao";
import { erroPublico } from "../../lib/supabase";
import { novoId } from "../../lib/uuid";
import { hoje } from "../../services/financeiro";
import {
  calcularPrecoServico,
  parametrosIniciais,
  type ParametrosCusteio,
} from "../../lib/precificacao";
import {
  consultarParametros,
  salvarParametros,
  salvarSimulacao,
  listarSimulacoes,
  type ParametrosSalvos,
} from "../../services/custeio";

const monetarios = {
  salarios: "Salários da equipe produtiva",
  beneficios: "Benefícios da equipe",
  prolabore: "Pró-labore ligado à produção",
  indiretos: "Despesas indiretas",
  depreciacao: "Depreciação mensal",
} as const;
const numeros = {
  encargos: "Encargos sobre salários (%)",
  profissionais: "Profissionais produtivos",
  dias: "Dias de trabalho no mês",
  horas: "Horas disponíveis por dia",
  ocupacao: "Ocupação produtiva esperada (%)",
  margem: "Margem desejada sobre a venda (%)",
  impostos: "Impostos sobre a venda (%)",
  taxas: "Taxas médias de recebimento (%)",
} as const;
export function PrecificacaoServicos({ mesInicial }: { mesInicial?: string }) {
  const a = useAcesso(),
    [mes, setMes] = useState(mesInicial || hoje().slice(0, 7));
  const chave = `preco-demo:${a.oficina!.id}:${mes}`;
  const q = useQuery({
    queryKey: ["parametros-custeio", a.oficina!.id, a.demo, mes],
    queryFn: async () =>
      a.demo
        ? (JSON.parse(localStorage.getItem(chave) || "null") as ParametrosSalvos | null)
        : consultarParametros(a.oficina!.id, mes + "-01"),
  });
  return (
    <section className="plano-op fin-ampliado">
      <header className="plano-cabecalho">
        <div>
          <h2>Preço e hora produtiva</h2>
          <p>Quanto custa trabalhar e por quanto vender para atingir sua margem.</p>
        </div>
        <label>
          Mês de referência
          <input
            type="month"
            required
            value={mes}
            onChange={(e) => e.target.value && setMes(e.target.value)}
          />
        </label>
      </header>
      {q.isPending ? (
        <p role="status">Consultando parâmetros…</p>
      ) : q.isError ? (
        <p role="alert">{erroPublico(q.error)}</p>
      ) : (
        <Calculadora
          key={mes + ":" + q.data?.revisao}
          mes={mes}
          salvo={q.data}
          chaveDemo={chave}
        />
      )}
    </section>
  );
}
function Calculadora({
  mes,
  salvo,
  chaveDemo,
}: {
  mes: string;
  salvo: ParametrosSalvos | null;
  chaveDemo: string;
}) {
  const a = useAcesso(),
    qc = useQueryClient(),
    [p, setP] = useState<ParametrosCusteio>(salvo?.dados || parametrosIniciais),
    [entrada, setEntrada] = useState({
      minutos: 60,
      materiais: 0,
      terceiros: 0,
      outros: 0,
    }),
    [nome, setNome] = useState(""),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [busy, setBusy] = useState(false);
  const trava = useRef(false),
    id = useRef(novoId());
  const historico = useQuery({
    queryKey: ["simulacoes-precos", a.oficina!.id],
    queryFn: () => listarSimulacoes(a.oficina!.id),
    enabled: !a.demo,
  });
  const alterado =
    !salvo ||
    Object.keys(p).some(
      (k) =>
        p[k as keyof ParametrosCusteio] !== salvo.dados[k as keyof ParametrosCusteio],
    );
  let calculo: ReturnType<typeof calcularPrecoServico> | null = null,
    invalidacao = "";
  try {
    calculo = calcularPrecoServico(
      p,
      entrada.minutos,
      entrada.materiais,
      entrada.terceiros,
      entrada.outros,
    );
  } catch (e) {
    invalidacao = erroPublico(e);
  }
  async function executar(fn: () => Promise<void>) {
    if (trava.current) return;
    trava.current = true;
    setBusy(true);
    setErro("");
    setAviso("");
    try {
      await fn();
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setBusy(false);
    }
  }
  function gravarParametros(e: FormEvent) {
    e.preventDefault();
    void executar(async () => {
      calcularPrecoServico(p, 0, 0, 0, 0);
      if (a.demo)
        localStorage.setItem(
          chaveDemo,
          JSON.stringify({
            mes: mes + "-01",
            dados: p,
            revisao: (salvo?.revisao || 0) + 1,
          }),
        );
      else
        await salvarParametros(a.oficina!.id, mes + "-01", p, salvo?.revisao ?? null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["parametros-custeio"] }),
        qc.invalidateQueries({ queryKey: ["custeio"] }),
        qc.invalidateQueries({ queryKey: ["apuracao"] }),
      ]);
    });
  }
  function gravarSimulacao(e: FormEvent) {
    e.preventDefault();
    void executar(async () => {
      await salvarSimulacao(a.oficina!.id, {
        id: id.current,
        nome,
        mes: mes + "-01",
        entrada,
      });
      id.current = novoId();
      await qc.invalidateQueries({ queryKey: ["simulacoes-precos"] });
      setAviso("Simulação salva com os parâmetros usados neste cálculo.");
    });
  }
  return (
    <div className="plano-op fin-ampliado">
      <details open={!salvo || undefined} className="custo-config">
        <summary>Parâmetros do mês · equipe, despesas e capacidade</summary>
        <form className="plano-op fin-ampliado" onSubmit={gravarParametros}>
          <fieldset disabled={busy}>
            <p>
              Informe totais mensais. Exclua daqui peças e terceiros cobrados por
              serviço. Não repita salários nas despesas indiretas.
            </p>
            <fieldset className="preco-parametros-grupo">
              <legend>Equipe e despesas mensais</legend>
              <div className="plano-campos">
                {Object.entries(monetarios).map(([key, label]) => {
                  const k = key as keyof typeof monetarios;
                  return (
                    <label key={k}>
                      {label} (R$)
                      <input
                        type="number"
                        min={0}
                        max={100000000}
                        step="0.01"
                        required
                        value={p[k] / 100}
                        onChange={(e) =>
                          setP({ ...p, [k]: Math.round(e.target.valueAsNumber * 100) })
                        }
                      />
                    </label>
                  );
                })}
              </div>
            </fieldset>
            {[
              {
                nome: "Capacidade de atendimento",
                campos: ["profissionais", "dias", "horas", "ocupacao"],
              },
              {
                nome: "Encargos, margem e taxas",
                campos: ["encargos", "margem", "impostos", "taxas"],
              },
            ].map((grupo) => (
              <fieldset className="preco-parametros-grupo" key={grupo.nome}>
                <legend>{grupo.nome}</legend>
                <div className="plano-campos">
                  {Object.entries(numeros)
                    .filter(([key]) => grupo.campos.includes(key))
                    .map(([key, label]) => {
                      const k = key as keyof typeof numeros;
                      return (
                        <label key={k}>
                          {label}
                          <input
                            type="number"
                            min={
                              ["profissionais", "dias", "horas", "ocupacao"].includes(k)
                                ? 0.01
                                : 0
                            }
                            step="0.01"
                            max={
                              k === "encargos"
                                ? 300
                                : k === "profissionais"
                                  ? 10000
                                  : k === "dias"
                                    ? 31
                                    : k === "horas"
                                      ? 24
                                      : 100
                            }
                            required
                            value={p[k]}
                            onChange={(e) =>
                              setP({ ...p, [k]: e.target.valueAsNumber })
                            }
                          />
                        </label>
                      );
                    })}
                </div>
              </fieldset>
            ))}
            <small>
              Ocupação é a parcela de horas que realmente gera serviços. Encargos e
              tributos dependem da sua empresa: confira os percentuais com seu contador.
            </small>
            <label>
              Como distribuir despesas indiretas na margem dos serviços?
              <select
                value={p.rateio}
                onChange={(e) =>
                  setP({ ...p, rateio: e.target.value as ParametrosCusteio["rateio"] })
                }
              >
                <option value="horas">Por horas produtivas de cada serviço</option>
                <option value="receita">
                  Proporcional ao faturamento dos serviços no mês
                </option>
                <option value="nenhum">
                  Sem rateio — analisar somente os custos diretos
                </option>
              </select>
            </label>
            <small>
              A formação de preço sempre considera o custo da hora com despesas
              indiretas. O rateio acima controla a análise dos serviços já realizados.
            </small>
            <button className="botao-primario" disabled={!calculo}>
              Salvar parâmetros do mês
            </button>
          </fieldset>
        </form>
      </details>
      {invalidacao && <p role="alert">{invalidacao}</p>}
      {calculo && (
        <>
          <div className="custo-resumo">
            <span>
              Custo da hora produtiva
              <strong>{dinheiro(Math.round(calculo.hora))}</strong>
              <small>Equipe + estrutura ÷ horas produtivas</small>
            </span>
            <span>
              Horas produtivas no mês
              <strong>
                {calculo.produtivas.toLocaleString("pt-BR", {
                  maximumFractionDigits: 1,
                })}{" "}
                h
              </strong>
              <small>
                {calculo.ociosas.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}{" "}
                h reservadas a ociosidade e atividades não produtivas
              </small>
            </span>
            <span>
              Custo mensal considerado<strong>{dinheiro(calculo.mensal)}</strong>
              <small>Com encargos, benefícios e depreciação</small>
            </span>
          </div>
          <form className="plano-op plano-card" onSubmit={gravarSimulacao}>
            <fieldset disabled={busy}>
              <h3>Calcular preço de um serviço</h3>
              <label>
                Nome do serviço
                <input
                  value={nome}
                  required
                  minLength={3}
                  maxLength={180}
                  placeholder="Serviço que deseja precificar"
                  onChange={(e) => {
                    setNome(e.target.value);
                    id.current = novoId();
                  }}
                />
              </label>
              <div className="plano-campos">
                {Object.entries({
                  minutos: "Tempo produtivo (minutos)",
                  materiais: "Peças e materiais (R$)",
                  terceiros: "Terceiros (R$)",
                  outros: "Outros custos diretos (R$)",
                }).map(([key, label]) => {
                  const k = key as keyof typeof entrada;
                  return (
                    <label key={k}>
                      {label}
                      <input
                        type="number"
                        min={0}
                        max={k === "minutos" ? 1000000 : 100000000}
                        step={k === "minutos" ? 0.1 : 0.01}
                        required
                        value={entrada[k] / (k === "minutos" ? 1 : 100)}
                        onChange={(e) => {
                          setEntrada({
                            ...entrada,
                            [k]:
                              k === "minutos"
                                ? e.target.valueAsNumber
                                : Math.round(e.target.valueAsNumber * 100),
                          });
                          id.current = novoId();
                        }}
                      />
                    </label>
                  );
                })}
              </div>
              <div className="custo-resumo">
                <span>
                  Custo completo<strong>{dinheiro(calculo.custo)}</strong>
                  <small>
                    {dinheiro(calculo.maoObra)} de equipe +{" "}
                    {dinheiro(calculo.indiretos)} de estrutura + custos diretos
                  </small>
                </span>
                <span>
                  Preço mínimo sem lucro<strong>{dinheiro(calculo.piso)}</strong>
                  <small>Cobre os custos, impostos e taxas informados</small>
                </span>
                <span className="preco-destaque">
                  Preço sugerido<strong>{dinheiro(calculo.preco)}</strong>
                  <small>
                    Margem desejada: {p.margem}% · ganho estimado:{" "}
                    {dinheiro(calculo.lucro)}
                  </small>
                </span>
              </div>
              <div className="custo-barra" aria-label="Composição do preço">
                {[
                  { n: "Custos", v: calculo.custo, c: "#d49b59" },
                  {
                    n: "Impostos e taxas",
                    v: calculo.tributos + calculo.taxasVenda,
                    c: "#80a3ce",
                  },
                  { n: "Ganho", v: calculo.lucro, c: "#85b566" },
                ].map((x) => (
                  <span
                    key={x.n}
                    style={{ flex: Math.max(x.v, 0.01), background: x.c }}
                    title={`${x.n}: ${dinheiro(x.v)}`}
                  />
                ))}
              </div>
              <small>
                Composição: custos {dinheiro(calculo.custo)} · impostos e taxas{" "}
                {dinheiro(calculo.tributos + calculo.taxasVenda)} · ganho{" "}
                {dinheiro(calculo.lucro)}.
              </small>
              {alterado && (
                <p className="aviso-cliente">
                  Prévia com parâmetros ainda não salvos. Salve o mês para registrar
                  esta simulação.
                </p>
              )}
              <button className="botao-primario" disabled={alterado || a.demo}>
                Salvar simulação
              </button>
              {a.demo && (
                <small>
                  Na demonstração, o cálculo é local. O histórico de simulações fica
                  disponível na empresa conectada.
                </small>
              )}
            </fieldset>
          </form>
        </>
      )}
      {erro && <p role="alert">{erro}</p>}
      {aviso && <p role="status">{aviso}</p>}
      {historico.data && historico.data.length > 0 && (
        <details>
          <summary>Últimas simulações salvas</summary>
          <div className="plano-lista">
            {historico.data.map((s) => (
              <div className="plano-linha" key={s.id}>
                <span>
                  <strong>{s.nome}</strong>
                  <small className="fin-conta-detalhe">
                    Referência {s.mes.slice(0, 7).split("-").reverse().join("/")}
                  </small>
                </span>
                <span>Custo {dinheiro(s.resultado.custo)}</span>
                <strong>Preço {dinheiro(s.resultado.preco)}</strong>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
