import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../../auth/contexto";
import { SelecaoRapida, type OpcaoRapida } from "../SelecaoRapida";
import {
  buscarOpcoesAnalise,
  consultarVinculo,
  salvarVinculo,
  retirarVinculo,
  type TipoAnalise,
  type VinculoAnalitico,
} from "../../services/analisesGerenciais";
import { erroPublico } from "../../lib/supabase";
import { novoId } from "../../lib/uuid";
import { useBuscaDebounced } from "../../lib/useBuscaDebounced";
import { termosAnalise } from "../../lib/analisesGerenciais";

export function BuscaAnalitica({
  oficina,
  tipo,
  rotulo,
  valor,
  selecionar,
}: {
  oficina: string;
  tipo: string;
  rotulo: string;
  valor: string;
  selecionar: (v: string) => void;
}) {
  const [busca, setBusca] = useState(""),
    [fixa, setFixa] = useState<OpcaoRapida | null>(null);
  const consulta = useBuscaDebounced(busca);
  const q = useQuery({
    queryKey: ["opcoes-analiticas", oficina, tipo, consulta],
    queryFn: ({ signal }) => buscarOpcoesAnalise(oficina, tipo, consulta, signal),
    enabled: !!oficina,
    staleTime: 30000,
  });
  const selecionado = useQuery({
    queryKey: ["opcoes-analiticas", oficina, tipo, valor],
    queryFn: ({ signal }) => buscarOpcoesAnalise(oficina, tipo, valor, signal),
    enabled: !!oficina && !!valor && !q.data?.some((o) => o.id === valor),
    staleTime: 30000,
  });
  const opcoes = [...(q.data || [])];
  const atual = selecionado.data?.find((o) => o.id === valor);
  if (atual && !opcoes.some((o) => o.id === valor)) opcoes.push(atual);
  if (fixa && !opcoes.some((o) => o.id === fixa.id)) opcoes.push(fixa);
  if (valor && !opcoes.some((o) => o.id === valor))
    opcoes.push({ id: valor, nome: "Carregando registro vinculado…" });
  return (
    <SelecaoRapida
      rotulo={rotulo}
      valor={valor}
      opcoes={opcoes}
      selecionar={(v) => {
        setFixa(opcoes.find((o) => o.id === v) || null);
        selecionar(v);
      }}
      aoBuscar={setBusca}
      carregando={q.isFetching}
      erro={q.error ? erroPublico(q.error) : undefined}
      placeholder="Buscar pelo nome…"
      obrigatorio
    />
  );
}
const modos: Partial<
  Record<TipoAnalise, { id: string; nome: string; origem: string; rotulo: string }[]>
> = {
  contratos: [
    {
      id: "contrato_documento",
      nome: "Vincular OS coberta",
      origem: "documento",
      rotulo: "Ordem de serviço",
    },
    {
      id: "contrato_despesa",
      nome: "Vincular despesa direta",
      origem: "despesa",
      rotulo: "Despesa sem apropriação em OS",
    },
  ],
  primeira_visita: [
    {
      id: "problema",
      nome: "Acompanhar um problema",
      origem: "documento",
      rotulo: "OS de origem",
    },
    {
      id: "editar_problema",
      nome: "Corrigir um problema acompanhado",
      origem: "problema",
      rotulo: "Problema acompanhado",
    },
    {
      id: "visita",
      nome: "Registrar resultado da visita",
      origem: "visita",
      rotulo: "Visita encerrada",
    },
  ],
  comparacao: [
    {
      id: "comparacao",
      nome: "Preencher a comparação",
      origem: "objeto",
      rotulo: "Equipamento ou veículo",
    },
  ],
  recursos: [
    {
      id: "jornada",
      nome: "Definir disponibilidade",
      origem: "recurso",
      rotulo: "Box ou equipamento",
    },
  ],
  filiais: [
    {
      id: "interna",
      nome: "Vincular operação entre unidades",
      origem: "receita",
      rotulo: "Receita na unidade atual",
    },
  ],
};
const valoresComparacao = [
  ["reparo", "Orçamento de reparo"],
  ["manutencao_atual", "Manutenção mensal após reparar"],
  ["troca", "Compra do substituto"],
  ["instalacao", "Instalação do substituto"],
  ["revenda", "Revenda do ativo atual"],
  ["manutencao_novo", "Manutenção mensal do substituto"],
  ["hora_parada", "Custo estimado por hora sem operar"],
] as const;
export function ConfiguracaoAnalises({
  tipo,
  idInicial = "",
  modoInicial,
}: {
  tipo: TipoAnalise;
  idInicial?: string;
  modoInicial?: string;
}) {
  const a = useAcesso(),
    op = modos[tipo];
  const [escolha, setEscolha] = useState(modoInicial || op?.[0]?.id || ""),
    [id, setId] = useState(idInicial);
  const painel = useRef<HTMLDetailsElement>(null);
  const [visitou, setVisitou] = useState(!!idInicial);
  useEffect(() => {
    if (idInicial)
      painel.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [idInicial]);
  const modo = op?.find((m) => m.id === escolha) || op?.[0];
  const q = useQuery({
    queryKey: ["vinculo-analitico", a.oficina!.id, modo?.id, id],
    queryFn: ({ signal }) =>
      consultarVinculo(
        a.oficina!.id,
        modo!.id === "editar_problema" ? "problema" : modo!.id,
        id,
        signal,
      ),
    enabled: !!id && modo?.id !== "problema",
    refetchOnWindowFocus: false,
  });
  if (!op || !modo) return null;
  if (
    tipo === "filiais" &&
    !a.oficinas.some(
      (o) =>
        o.id !== a.oficina!.id &&
        o.perfil !== "staff" &&
        o.recursos.includes("finance") &&
        o.recursos.includes("reports"),
    )
  )
    return null;
  return (
    <details
      className="an-config"
      ref={painel}
      open={idInicial ? true : undefined}
      onToggle={(e) => {
        if (e.currentTarget.open) setVisitou(true);
      }}
    >
      <summary>Complementar os dados desta análise</summary>
      <p>
        Os vínculos ficam registrados no histórico. Nenhum pagamento é lançado por esta
        tela.
      </p>
      {visitou && (
        <>
          {op.length > 1 && (
            <label>
              O que deseja registrar?
              <select
                value={modo.id}
                onChange={(e) => {
                  setEscolha(e.target.value);
                  setId("");
                }}
              >
                {op.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          <BuscaAnalitica
            key={modo.id}
            oficina={a.oficina!.id}
            tipo={modo.origem}
            rotulo={
              modo.origem === "objeto"
                ? termosAnalise(a.oficina!.ramo).ativo
                : modo.origem === "recurso"
                  ? termosAnalise(a.oficina!.ramo).recurso
                  : modo.rotulo
            }
            valor={id}
            selecionar={setId}
          />
          {id &&
            (q.isPending && modo.id !== "problema" ? (
              <p role="status">Carregando vínculo…</p>
            ) : q.error && !q.data ? (
              <div>
                <p role="alert">{erroPublico(q.error)}</p>
                <button className="botao-secundario" onClick={() => void q.refetch()}>
                  Tentar carregar novamente
                </button>
              </div>
            ) : (
              <FormularioVinculo
                key={modo.id + id + (q.data?.revisao || 0)}
                tipo={modo.id}
                id={id}
                existente={q.data || null}
              />
            ))}
          {id && q.error && q.data && (
            <div>
              <p role="alert">{erroPublico(q.error)} Seus campos foram preservados.</p>
              <button
                type="button"
                className="botao-secundario"
                disabled={q.isFetching}
                onClick={() => void q.refetch()}
              >
                Tentar novamente
              </button>
            </div>
          )}
        </>
      )}
    </details>
  );
}
function FormularioVinculo({
  tipo,
  id,
  existente,
}: {
  tipo: string;
  id: string;
  existente: VinculoAnalitico | null;
}) {
  const a = useAcesso(),
    cache = useQueryClient(),
    w = a.oficina!.id,
    d = existente?.dados || {};
  const [destino, setDestino] = useState(String(d.destino || "")),
    [ligado, setLigado] = useState(
      String(d.contrato_id || d.problema_id || d.despesa_id || ""),
    ),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [busy, setBusy] = useState(false),
    [chave] = useState(novoId),
    [ativo, setAtivo] = useState(existente?.ativo ?? false),
    [motivo, setMotivo] = useState(""),
    [revisao, setRevisao] = useState(existente?.revisao ?? null);
  const tipoPersistido = tipo === "editar_problema" ? "problema" : tipo;
  const idPersistido = tipo === "problema" ? chave : id;
  const trava = useRef(false);
  const [turnos, setTurnos] = useState<{ dia: number; inicio: string; fim: string }[]>(
    (d.turnos as { dia: number; inicio: string; fim: string }[]) ||
      [1, 2, 3, 4, 5].map((dia) => ({ dia, inicio: "08:00", fim: "18:00" })),
  );
  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (trava.current) return;
    trava.current = true;
    setErro("");
    setAviso("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    let dados: Record<string, unknown> = {};
    try {
      if (tipo.startsWith("contrato_")) {
        if (!ligado) throw Error("Selecione o contrato.");
        dados = { contrato_id: ligado };
      }
      if (tipo === "problema")
        dados = { documento_id: id, descricao: f.get("descricao") };
      if (tipo === "editar_problema")
        dados = { documento_id: d.documento_id, descricao: f.get("descricao") };
      if (tipo === "visita") {
        if (!ligado) throw Error("Selecione o problema acompanhado.");
        dados = {
          problema_id: ligado,
          resultado: f.get("resultado"),
          evidencia: f.get("evidencia"),
        };
      }
      if (tipo === "jornada") dados = { turnos };
      if (tipo === "interna") {
        if (!destino || !ligado)
          throw Error("Selecione a unidade e a despesa correspondente.");
        dados = { destino, despesa_id: ligado, motivo: f.get("motivo") };
      }
      if (tipo === "comparacao") {
        dados = { evidencia: f.get("evidencia") };
        for (const [k] of valoresComparacao)
          dados[k] = Math.round(Number(f.get(k)) * 100);
        for (const k of ["meses", "horas_reparo", "horas_troca"])
          dados[k] = Number(f.get(k));
      }
      await salvarVinculo(w, tipoPersistido, idPersistido, dados, revisao);
      const atual = await consultarVinculo(w, tipoPersistido, idPersistido);
      setRevisao(atual?.revisao ?? null);
      setAtivo(atual?.ativo ?? false);
      setAviso("Informações salvas. A análise foi atualizada.");
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["analise-gerencial"] }),
        cache.invalidateQueries({ queryKey: ["opcoes-analiticas"] }),
      ]);
    } catch (error) {
      setErro(erroPublico(error));
    } finally {
      trava.current = false;
      setBusy(false);
    }
  }
  async function retirar() {
    if (revisao === null || trava.current) return;
    trava.current = true;
    setBusy(true);
    setErro("");
    setAviso("");
    try {
      await retirarVinculo(w, tipoPersistido, idPersistido, revisao, motivo);
      const atual = await consultarVinculo(w, tipoPersistido, idPersistido);
      setRevisao(atual?.revisao ?? null);
      setAtivo(false);
      setMotivo("");
      setAviso("Vínculo retirado da análise. O histórico foi preservado.");
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["analise-gerencial"] }),
        cache.invalidateQueries({ queryKey: ["opcoes-analiticas"] }),
      ]);
    } catch (error) {
      setErro(erroPublico(error));
    } finally {
      trava.current = false;
      setBusy(false);
    }
  }
  return (
    <form className="an-form" onSubmit={(e) => void salvar(e)}>
      {tipo.startsWith("contrato_") && (
        <>
          <BuscaAnalitica
            oficina={w}
            tipo="contrato"
            rotulo="Contrato preventivo"
            valor={ligado}
            selecionar={setLigado}
          />
          <p>
            O vínculo considera o valor integral do custo. Cada OS ou despesa direta
            pertence a um contrato.
          </p>
        </>
      )}
      {(tipo === "problema" || tipo === "editar_problema") && (
        <label>
          Qual problema será acompanhado?
          <input
            name="descricao"
            defaultValue={String(d.descricao || "")}
            required
            minLength={3}
            maxLength={500}
            placeholder="Ex.: falha intermitente registrada nesta OS"
          />
        </label>
      )}
      {tipo === "visita" && (
        <>
          <BuscaAnalitica
            oficina={w}
            tipo="problema"
            rotulo="Problema acompanhado"
            valor={ligado}
            selecionar={setLigado}
          />
          <label>
            Resultado
            <select name="resultado" defaultValue={String(d.resultado || "pendente")}>
              <option value="pendente">Ainda não resolvido</option>
              <option value="resolvido">Resolvido nesta visita</option>
              <option value="retorno">Retorno do mesmo problema</option>
            </select>
          </label>
          <label>
            O que foi verificado?
            <textarea
              name="evidencia"
              defaultValue={String(d.evidencia || "")}
              required
              minLength={3}
              maxLength={1000}
            />
          </label>
        </>
      )}
      {tipo === "comparacao" && (
        <>
          <div className="an-campos">
            {valoresComparacao.map(([k, nome]) => (
              <label key={k}>
                {nome} (R$)
                <input
                  name={k}
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  defaultValue={d[k] === undefined ? "" : Number(d[k]) / 100}
                />
              </label>
            ))}
            {[
              ["meses", "Comparar os próximos meses", "12"],
              ["horas_reparo", "Horas sem operar ao reparar", ""],
              ["horas_troca", "Horas sem operar ao substituir", ""],
            ].map(([k, nome, padrao]) => (
              <label key={k}>
                {nome}
                <input
                  name={k}
                  type="number"
                  min={k === "meses" ? 1 : 0}
                  max={k === "meses" ? 120 : 100000}
                  step={k === "meses" ? 1 : 0.1}
                  required
                  defaultValue={String(d[k] ?? padrao)}
                />
              </label>
            ))}
          </div>
          <label>
            Origem das estimativas
            <textarea
              name="evidencia"
              defaultValue={String(d.evidencia || "")}
              required
              minLength={3}
              maxLength={1000}
              placeholder="Cotações, histórico e condições consideradas"
            />
          </label>
        </>
      )}
      {tipo === "jornada" && (
        <>
          <p>
            Cadastre um turno para cada período de funcionamento. Para intervalo de
            almoço, separe manhã e tarde.
          </p>
          {turnos.map((t, i) => (
            <div className="an-turno" key={i}>
              <label>
                Dia
                <select
                  value={t.dia}
                  onChange={(e) =>
                    setTurnos(
                      turnos.map((x, n) =>
                        n === i ? { ...x, dia: Number(e.target.value) } : x,
                      ),
                    )
                  }
                >
                  {[
                    "Domingo",
                    "Segunda",
                    "Terça",
                    "Quarta",
                    "Quinta",
                    "Sexta",
                    "Sábado",
                  ].map((nome, dia) => (
                    <option key={dia} value={dia}>
                      {nome}
                    </option>
                  ))}
                </select>
              </label>
              {(["inicio", "fim"] as const).map((k) => (
                <label key={k}>
                  {k === "inicio" ? "Das" : "Às"}
                  <input
                    type="time"
                    required
                    value={t[k]}
                    onChange={(e) =>
                      setTurnos(
                        turnos.map((x, n) =>
                          n === i ? { ...x, [k]: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </label>
              ))}
              <button
                type="button"
                className="botao-secundario"
                aria-label={"Remover turno " + (i + 1)}
                onClick={() => setTurnos(turnos.filter((_, n) => n !== i))}
              >
                Remover
              </button>
            </div>
          ))}
          <button
            type="button"
            className="botao-secundario"
            disabled={turnos.length >= 28}
            onClick={() =>
              setTurnos([...turnos, { dia: 1, inicio: "08:00", fim: "18:00" }])
            }
          >
            Adicionar turno
          </button>
        </>
      )}
      {tipo === "interna" && (
        <>
          <label>
            Unidade que registrou a despesa
            <select
              value={destino}
              onChange={(e) => {
                setDestino(e.target.value);
                setLigado("");
              }}
              required
            >
              <option value="">Selecione</option>
              {a.oficinas
                .filter(
                  (o) =>
                    o.id !== w &&
                    o.perfil !== "staff" &&
                    o.recursos.includes("finance"),
                )
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome}
                  </option>
                ))}
            </select>
          </label>
          {destino && (
            <BuscaAnalitica
              key={destino}
              oficina={destino}
              tipo="despesa"
              rotulo="Despesa correspondente"
              valor={ligado}
              selecionar={setLigado}
            />
          )}
          <label>
            Motivo da operação
            <input
              name="motivo"
              defaultValue={String(d.motivo || "")}
              required
              minLength={3}
              maxLength={500}
            />
          </label>
          <p>
            Receita e despesa devem ter o mesmo valor e a mesma competência. A
            eliminação acontece somente quando as duas unidades são selecionadas no
            relatório.
          </p>
        </>
      )}
      {erro && (
        <div>
          <p role="alert">{erro}</p>
          <button
            type="button"
            className="botao-secundario"
            onClick={() =>
              void cache.invalidateQueries({ queryKey: ["vinculo-analitico", w] })
            }
          >
            Recarregar informações
          </button>
        </div>
      )}
      {aviso && <p role="status">{aviso}</p>}
      <button className="botao-primario" disabled={busy}>
        {busy ? "Salvando…" : "Salvar informações"}
      </button>
      {ativo && (
        <details className="an-config">
          <summary>Retirar este vínculo da análise</summary>
          <label>
            Motivo da correção
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={500}
            />
          </label>
          <button
            type="button"
            className="botao-secundario"
            disabled={busy || motivo.trim().length < 3}
            onClick={() => void retirar()}
          >
            Retirar vínculo
          </button>
        </details>
      )}
    </form>
  );
}
