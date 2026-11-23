import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { useAcesso } from "../auth/contexto";
import { Dialogo } from "../components/Dialogo";
import { erroPublico } from "../lib/supabase";
import { dinheiro } from "../lib/formatacao";
import { useBuscaDebounced } from "../lib/useBuscaDebounced";
import { buscarCadastro } from "../services/consultasCadastros";
import {
  listarContratos,
  detalheContrato,
  salvarContrato,
  consumirContrato,
  faturarContrato,
  encerrarContrato,
  type RegrasContrato,
  type Fatura,
  type Contrato,
} from "../services/contratos";
import "../components/PlanejamentoOperacional.css";
const hoje = () => new Date().toLocaleDateString("en-CA");
const data = (s: string) => s.split("-").reverse().join("/");
const campos = [
  ["mensalidade", "Mensalidade (R$)", true],
  ["franquia_visitas", "Visitas incluídas por mês", false],
  ["franquia_minutos", "Minutos incluídos por mês", false],
  ["franquia_materiais", "Materiais incluídos por mês (R$)", true],
  ["excedente_visita", "Por visita excedente (R$)", true],
  ["excedente_hora", "Por hora excedente (R$)", true],
  ["participacao_visita", "Participação do cliente por visita (R$)", true],
  ["vencimento_dia", "Dia de vencimento no mês seguinte", false],
] as const;
function CampoRegra({
  campo: [k, titulo, monetario],
  regras,
}: {
  campo: (typeof campos)[number];
  regras?: RegrasContrato;
}) {
  return (
    <label>
      {titulo}
      <input
        name={k}
        type="number"
        required
        min={k === "vencimento_dia" ? 1 : 0}
        max={k === "vencimento_dia" ? 28 : 1000000}
        step={monetario ? ".01" : "1"}
        defaultValue={
          regras ? regras[k] / (monetario ? 100 : 1) : k === "vencimento_dia" ? 10 : 0
        }
      />
    </label>
  );
}
function CamposRegras({ r }: { r?: RegrasContrato }) {
  return (
    <>
      <div className="plano-campos">
        {campos
          .filter(([k]) => ["mensalidade", "vencimento_dia"].includes(k))
          .map((campo) => (
            <CampoRegra key={campo[0]} campo={campo} regras={r} />
          ))}
      </div>
      <label>
        Serviços cobertos · um por linha
        <textarea
          name="servicos"
          required
          maxLength={20000}
          defaultValue={r?.servicos.join("\n")}
          placeholder="Ex.: inspeção preventiva"
        />
      </label>
      <details
        onInvalidCapture={(e) => {
          e.currentTarget.open = true;
        }}
      >
        <summary>Franquias, excedentes e equipamentos (opcional)</summary>
        <div className="plano-op">
          <fieldset>
            <legend>Incluído na mensalidade</legend>
            <div className="plano-campos">
              {campos
                .filter(([k]) => k.startsWith("franquia_"))
                .map((campo) => (
                  <CampoRegra key={campo[0]} campo={campo} regras={r} />
                ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Cobranças adicionais</legend>
            <div className="plano-campos">
              {campos
                .filter(
                  ([k]) => k.startsWith("excedente_") || k === "participacao_visita",
                )
                .map((campo) => (
                  <CampoRegra key={campo[0]} campo={campo} regras={r} />
                ))}
            </div>
          </fieldset>
          <label>
            Equipamentos ou locais cobertos · um por linha (opcional)
            <textarea
              name="equipamentos"
              maxLength={20000}
              defaultValue={r?.equipamentos.join("\n")}
              placeholder="Vazio permite qualquer equipamento ou local deste cliente"
            />
          </label>
          <p className="texto-suave">
            A mensalidade é proporcional aos dias de vigência. As franquias são
            integrais no mês e não acumulam. Excedentes de visitas, horas e materiais
            são somados; use zero nas tarifas que não deseja cobrar.
          </p>
        </div>
      </details>
    </>
  );
}
function lerRegras(f: FormData): RegrasContrato {
  return {
    ...Object.fromEntries(
      campos.map(([k, , m]) => [k, Math.round(Number(f.get(k)) * (m ? 100 : 1))]),
    ),
    servicos: String(f.get("servicos"))
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    equipamentos: String(f.get("equipamentos") || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  } as RegrasContrato;
}
export function Contratos() {
  const a = useAcesso();
  if (!a.oficina?.ramo || a.oficina.ramo === "automotivo")
    return <Navigate to="/" replace />;
  if (a.demo)
    return (
      <p className="estado-lista">Contratos ficam disponíveis na conta da empresa.</p>
    );
  if (a.oficina?.perfil === "staff")
    return <p>A gestão de contratos é reservada aos responsáveis pelo financeiro.</p>;
  return <ListaContratos key={a.oficina!.id} />;
}
function ListaContratos() {
  const trava = useRef(false);
  const a = useAcesso(),
    w = a.oficina!.id,
    [busca, setBusca] = useState(""),
    termo = useBuscaDebounced(busca),
    [pagina, setPagina] = useState(0),
    [atual, setAtual] = useState<Contrato | null>(null),
    [novo, setNovo] = useState(false),
    [clienteBusca, setClienteBusca] = useState(""),
    ct = useBuscaDebounced(clienteBusca),
    [erro, setErro] = useState(""),
    [busy, setBusy] = useState(false),
    [chave, setChave] = useState("");
  const q = useQuery({
      queryKey: ["contratos", w, termo, pagina],
      queryFn: ({ signal }) => listarContratos(w, termo, pagina, signal),
    }),
    clientes = useQuery({
      queryKey: ["clientes-contrato", w, ct],
      queryFn: ({ signal }) => buscarCadastro(w, "clientes", { busca: ct }, signal),
      enabled: novo,
    });
  if (atual)
    return (
      <Detalhe
        key={atual.id}
        contrato={atual}
        voltar={() => {
          setAtual(null);
          void q.refetch();
        }}
      />
    );
  return (
    <section className="plano-op">
      <header className="plano-cabecalho">
        <div>
          <h1>Contratos preventivos</h1>
          <p>Cobertura, consumo e cobrança em um só lugar.</p>
        </div>
        <button
          className="botao-primario"
          onClick={() => {
            setChave(crypto.randomUUID());
            setNovo(true);
            setErro("");
          }}
        >
          Novo contrato
        </button>
      </header>
      <Link className="botao-secundario" to="/financeiro?aba=contratos">
        Cobrar mensalidades do mês →
      </Link>
      <label>
        Buscar cliente ou contrato
        <input
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setPagina(0);
          }}
        />
      </label>
      {q.isError && <p role="alert">{erroPublico(q.error)}</p>}
      {q.isPending && <p>Carregando contratos…</p>}
      <div className="plano-lista">
        {q.data?.itens.map((c) => (
          <button
            className="plano-card plano-cabecalho"
            key={c.id}
            onClick={() => setAtual(c)}
          >
            <span>
              <strong>{c.nome}</strong>
              <br />
              {c.cliente}
            </span>
            <span>{dinheiro(c.regras.mensalidade)} / mês</span>
            <span>{c.encerrado_em ? "Encerrado" : "Ver contrato →"}</span>
          </button>
        ))}
        {q.data?.total === 0 && (
          <p className="estado-lista">
            Nenhum contrato. Cadastre o cliente e defina a cobertura para começar.
          </p>
        )}
      </div>
      <div className="plano-acoes">
        <button disabled={!pagina} onClick={() => setPagina((p) => p - 1)}>
          Anterior
        </button>
        <span>Página {pagina + 1}</span>
        <button
          disabled={!q.data || (pagina + 1) * 30 >= q.data.total}
          onClick={() => setPagina((p) => p + 1)}
        >
          Próxima
        </button>
      </div>
      {novo && (
        <Dialogo
          aberto
          titulo="Novo contrato preventivo"
          fechar={() => {
            if (!busy) setNovo(false);
          }}
        >
          <form
            className="plano-op"
            onSubmit={async (e) => {
              e.preventDefault();
              if (trava.current) return;
              trava.current = true;
              const f = new FormData(e.currentTarget);
              setBusy(true);
              setErro("");
              try {
                await salvarContrato(w, chave, {
                  nome: f.get("nome"),
                  cliente_id: f.get("cliente"),
                  inicio: f.get("inicio"),
                  fim: f.get("fim"),
                  regras: lerRegras(f),
                });
                setNovo(false);
                await q.refetch();
              } catch (err) {
                setErro(erroPublico(err));
              } finally {
                trava.current = false;
                setBusy(false);
              }
            }}
          >
            <fieldset disabled={busy}>
              <label>
                Nome do contrato
                <input name="nome" required minLength={3} maxLength={140} />
              </label>
              <label>
                Pesquisar cliente
                <input
                  value={clienteBusca}
                  onChange={(e) => setClienteBusca(e.target.value)}
                />
              </label>
              <label>
                Cliente
                <select name="cliente" required defaultValue="">
                  <option value="">Selecione o cliente</option>
                  {clientes.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>
              {clientes.isError && <p role="alert">{erroPublico(clientes.error)}</p>}
              <div className="plano-campos">
                <label>
                  Início
                  <input name="inicio" type="date" required defaultValue={hoje()} />
                </label>
                <label>
                  Fim (opcional)
                  <input name="fim" type="date" />
                </label>
              </div>
              <CamposRegras />
              {erro && <p role="alert">{erro}</p>}
              <button className="botao-primario">
                {busy ? "Salvando…" : "Salvar contrato"}
              </button>
            </fieldset>
          </form>
        </Dialogo>
      )}
    </section>
  );
}
function Detalhe({ contrato, voltar }: { contrato: Contrato; voltar: () => void }) {
  const trava = useRef(false);
  const a = useAcesso(),
    w = a.oficina!.id,
    [mes, setMes] = useState(hoje().slice(0, 7)),
    [pagina, setPagina] = useState(0),
    [acao, setAcao] = useState(""),
    [chave, setChave] = useState(""),
    [erro, setErro] = useState(""),
    [busy, setBusy] = useState(false),
    [previa, setPrevia] = useState<Fatura | null>(null);
  const q = useQuery({
      queryKey: ["contrato", w, contrato.id, mes, pagina],
      queryFn: ({ signal }) =>
        detalheContrato(w, contrato.id, mes + "-01", pagina, signal),
    }),
    c = q.data?.contrato || contrato,
    r =
      q.data?.versoes.find((v) => v.desde <= mes + "-01")?.regras ||
      q.data?.versoes.at(-1)?.regras;
  const abrir = (n: string) => {
    setAcao(n);
    setChave(crypto.randomUUID());
    setErro("");
  };
  const executar = async (fn: () => Promise<unknown>) => {
    if (trava.current) return;
    trava.current = true;
    setBusy(true);
    setErro("");
    try {
      await fn();
      await q.refetch();
      setPrevia(null);
      setAcao("");
    } catch (err) {
      setErro(erroPublico(err));
    } finally {
      trava.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="plano-op">
      <button className="botao-secundario" disabled={busy} onClick={voltar}>
        ← Contratos
      </button>
      <header className="plano-cabecalho">
        <div>
          <h1>{c.nome}</h1>
          <p>
            {contrato.cliente} · desde {data(c.inicio)}
            {c.encerrado_em
              ? ` · encerrado em ${data(c.encerrado_em)}`
              : c.fim
                ? ` · até ${data(c.fim)}`
                : ""}
          </p>
        </div>
        <div className="plano-acoes">
          <button
            disabled={busy || !!c.encerrado_em}
            className="botao-primario"
            onClick={() => abrir("consumo")}
          >
            Registrar execução
          </button>
          <button disabled={busy || !!c.encerrado_em} onClick={() => abrir("reajuste")}>
            Reajustar condições
          </button>
        </div>
      </header>
      <label>
        Competência
        <input
          type="month"
          disabled={busy}
          value={mes}
          required
          onChange={(e) => {
            if (e.target.value) {
              setMes(e.target.value);
              setPagina(0);
              setPrevia(null);
            }
          }}
        />
      </label>
      {q.isError && <p role="alert">{erroPublico(q.error)}</p>}
      {q.data?.fatura && (
        <p role="status" className="plano-card">
          Competência fechada.{" "}
          {q.data.fatura.titulo_id ? (
            <Link to={`/financeiro?titulo=${q.data.fatura.titulo_id}`}>
              Consultar cobrança no financeiro
            </Link>
          ) : (
            "Sem valor a cobrar neste mês."
          )}
        </p>
      )}
      {erro && <p role="alert">{erro}</p>}
      {r && (
        <div className="plano-card">
          <strong>{dinheiro(r.mensalidade)} / mês</strong>
          <p>
            {r.franquia_visitas} visitas · {r.franquia_minutos} minutos ·{" "}
            {dinheiro(r.franquia_materiais)} em materiais incluídos
          </p>
          <p>Cobertura: {r.servicos.join(" · ")}</p>
          <p>
            {r.equipamentos.length
              ? "Equipamentos / locais: " + r.equipamentos.join(" · ")
              : "Todos os equipamentos e locais do cliente"}
          </p>
        </div>
      )}
      <div className="plano-cabecalho">
        <h2>Execuções do mês</h2>
        <button
          className="botao-primario"
          disabled={busy}
          onClick={async () => {
            if (trava.current) return;
            trava.current = true;
            setBusy(true);
            setErro("");
            try {
              setPrevia(await faturarContrato(w, c.id, mes + "-01"));
            } catch (err) {
              setErro(erroPublico(err));
            } finally {
              trava.current = false;
              setBusy(false);
            }
          }}
        >
          Ver demonstrativo e cobrança
        </button>
      </div>
      <p>
        Registre aqui as execuções incluídas no contrato. Atendimentos avulsos e
        cobranças de OS continuam separados: não lance o mesmo serviço nos dois
        controles.
      </p>
      {q.data?.consumos.map((x) => (
        <article className="plano-card plano-cabecalho" key={x.id}>
          <div>
            <strong>
              {x.servico}
              {x.cancelado ? " · Cancelado" : ""}
            </strong>
            <p>
              {data(x.data)} · {x.equipamento}
            </p>
            <small>
              {x.visitas} visitas · {x.minutos} min · {dinheiro(x.materiais_centavos)}{" "}
              em materiais
            </small>
            <p>{x.observacoes}</p>
          </div>
          {!x.cancelado && !q.data?.fatura && (
            <button
              disabled={busy}
              onClick={() =>
                void executar(() => consumirContrato(w, c.id, x.id, {}, true))
              }
            >
              Cancelar registro
            </button>
          )}
        </article>
      ))}
      {q.data?.total_consumos === 0 && (
        <p className="estado-lista">Nenhuma execução registrada neste mês.</p>
      )}
      <div className="plano-acoes">
        <button disabled={!pagina} onClick={() => setPagina((p) => p - 1)}>
          Anterior
        </button>
        <span>Página {pagina + 1}</span>
        <button
          disabled={!q.data || (pagina + 1) * 200 >= q.data.total_consumos}
          onClick={() => setPagina((p) => p + 1)}
        >
          Próxima
        </button>
      </div>
      <details>
        <summary>Histórico das condições e encerramento</summary>
        {q.data?.versoes.map((v) => (
          <div className="plano-card" key={v.desde}>
            <strong>
              Desde {data(v.desde)} · {dinheiro(v.regras.mensalidade)} / mês
            </strong>
            <p>{v.motivo}</p>
            <p>{v.regras.servicos.join(" · ")}</p>
            <p>
              Excedentes: {dinheiro(v.regras.excedente_visita)}/visita ·{" "}
              {dinheiro(v.regras.excedente_hora)}/hora · participação{" "}
              {dinheiro(v.regras.participacao_visita)}/visita
            </p>
          </div>
        ))}
        <button disabled={busy || !!c.encerrado_em} onClick={() => abrir("encerrar")}>
          Encerrar contrato
        </button>
      </details>
      {previa && (
        <Dialogo
          aberto
          titulo={`Demonstrativo · ${mes.split("-").reverse().join("/")}`}
          fechar={() => {
            if (!busy) setPrevia(null);
          }}
        >
          <div className="plano-op">
            <p>
              {c.nome} · {contrato.cliente}
            </p>
            <p>
              {data(previa.inicio)} a {data(previa.fim)}
            </p>
            {(
              [
                ["Mensalidade proporcional", previa.mensalidade],
                ["Visitas excedentes", previa.excedente_visitas],
                ["Horas excedentes", previa.excedente_horas],
                ["Materiais excedentes", previa.excedente_materiais],
                ["Participação por visita", previa.participacao],
              ] as [string, number][]
            ).map(([t, v]) => (
              <div className="plano-linha" key={t}>
                <span>{t}</span>
                <strong>{dinheiro(v)}</strong>
              </div>
            ))}
            <h2>Total: {dinheiro(previa.total)}</h2>
            <p>
              Vencimento: {data(previa.vencimento)}.{" "}
              {previa.fechada
                ? "Competência fechada."
                : "Ao fechar, os consumos deste mês ficam bloqueados e o valor entra em contas a receber."}
            </p>
            {erro && <p role="alert">{erro}</p>}
            {previa.fechada ? (
              previa.titulo_id ? (
                <Link to={`/financeiro?titulo=${previa.titulo_id}`}>
                  Consultar no financeiro
                </Link>
              ) : (
                <p>Sem valor a cobrar neste mês.</p>
              )
            ) : (
              <button
                className="botao-primario"
                disabled={busy}
                onClick={() =>
                  void executar(() => faturarContrato(w, c.id, mes + "-01", true))
                }
              >
                {busy ? "Gerando…" : "Fechar mês e gerar cobrança"}
              </button>
            )}
          </div>
        </Dialogo>
      )}
      {acao && r && (
        <Dialogo
          aberto
          titulo={
            acao === "consumo"
              ? "Registrar execução coberta"
              : acao === "reajuste"
                ? "Reajustar contrato"
                : "Encerrar contrato"
          }
          fechar={() => {
            if (!busy) setAcao("");
          }}
        >
          <form
            className="plano-op"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void executar(() =>
                acao === "consumo"
                  ? consumirContrato(w, c.id, chave, {
                      data: f.get("data"),
                      servico: f.get("servico"),
                      equipamento: f.get("equipamento"),
                      visitas: Number(f.get("visitas")),
                      minutos: Number(f.get("minutos")),
                      materiais_centavos: Math.round(Number(f.get("materiais")) * 100),
                      observacoes: f.get("observacoes"),
                    })
                  : acao === "reajuste"
                    ? salvarContrato(
                        w,
                        c.id,
                        {
                          desde: f.get("desde") + "-01",
                          motivo: f.get("motivo"),
                          regras: lerRegras(f),
                        },
                        c.revisao,
                      )
                    : encerrarContrato(w, c.id, c.revisao, String(f.get("data"))),
              );
            }}
          >
            <fieldset disabled={busy}>
              {acao === "consumo" ? (
                <>
                  <label>
                    Data
                    <input
                      name="data"
                      type="date"
                      required
                      defaultValue={mes === hoje().slice(0, 7) ? hoje() : mes + "-01"}
                    />
                  </label>
                  <label>
                    Serviço coberto
                    <select name="servico">
                      {r.servicos.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Equipamento / local
                    {r.equipamentos.length ? (
                      <select name="equipamento">
                        {r.equipamentos.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    ) : (
                      <input name="equipamento" maxLength={200} />
                    )}
                  </label>
                  <div className="plano-campos">
                    <label>
                      Visitas
                      <input
                        name="visitas"
                        type="number"
                        min="0"
                        max="1000"
                        step="1"
                        defaultValue="1"
                        required
                      />
                    </label>
                    <label>
                      Tempo (minutos)
                      <input
                        name="minutos"
                        type="number"
                        min="0"
                        max="100000"
                        step="1"
                        defaultValue="0"
                        required
                      />
                    </label>
                    <label>
                      Materiais (R$)
                      <input
                        name="materiais"
                        type="number"
                        min="0"
                        step=".01"
                        defaultValue="0"
                        required
                      />
                    </label>
                  </div>
                  <label>
                    Registro da execução
                    <textarea name="observacoes" maxLength={2000} />
                  </label>
                </>
              ) : acao === "reajuste" ? (
                <>
                  <label>
                    Aplicar a partir de
                    <input name="desde" type="month" required />
                  </label>
                  <label>
                    Motivo / índice negociado
                    <input
                      name="motivo"
                      minLength={3}
                      maxLength={500}
                      required
                      placeholder="Ex.: reajuste anual de 4,5% acordado com o cliente"
                    />
                  </label>
                  <CamposRegras r={q.data?.versoes[0]?.regras || r} />
                </>
              ) : (
                <>
                  <label>
                    Último dia de cobertura
                    <input
                      name="data"
                      type="date"
                      required
                      min={c.inicio}
                      defaultValue={hoje()}
                    />
                  </label>
                  <p>
                    O histórico será preservado. Não é permitido encerrar antes de
                    consumos ou faturas já registrados.
                  </p>
                </>
              )}
              {erro && <p role="alert">{erro}</p>}
              <button className="botao-primario">
                {busy ? "Salvando…" : "Confirmar"}
              </button>
            </fieldset>
          </form>
        </Dialogo>
      )}
    </section>
  );
}
