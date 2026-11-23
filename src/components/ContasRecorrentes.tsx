import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Bell, Plus, Repeat } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { Dialogo } from "./Dialogo";
import { SecaoRecolhivel } from "./SecaoRecolhivel";
import { novoId } from "../lib/uuid";
import { dinheiro } from "../lib/formatacao";
import { erroPublico } from "../lib/supabase";
import { atualizarIntegracoes } from "../lib/atualizarIntegracoes";
import { categorias, hoje } from "../services/financeiro";
import {
  consultarRecorrencias,
  salvarRecorrencia,
  consultarContasMensaisPendentes,
  informarValorContaMensal,
  consultarPagamentoMensal,
  type ContaRecorrente,
  type ContaMensalPendente,
} from "../services/recorrencias";
import "./ContasRecorrentes.css";

const categoriasRecorrentes = {
  pagar: ["pessoal", "aluguel", "agua_luz", "impostos", "terceiros", "outras_despesas"],
  receber: ["servicos", "outras_receitas"],
};
export function ContasRecorrentes() {
  const a = useAcesso(),
    oficina = a.oficina!.id,
    qc = useQueryClient(),
    navegar = useNavigate();
  const [edicao, setEdicao] = useState<ContaRecorrente | null>(null);
  const [pendente, setPendente] = useState<ContaMensalPendente | null>(null);
  const [pagina, setPagina] = useState(0);
  const [erro, setErro] = useState(""),
    [ocupado, setOcupado] = useState(false),
    [aviso, setAviso] = useState("");
  const trava = useRef(false);
  const q = useQuery({
    queryKey: ["recorrencias", a.demo, oficina],
    queryFn: () => consultarRecorrencias(a.demo, oficina),
  });
  const meses = useQuery({
    queryKey: ["recorrencias", a.demo, oficina, "pendentes", pagina],
    queryFn: () => consultarContasMensaisPendentes(a.demo, oficina, pagina),
    refetchInterval: 60000,
  });
  async function executar(fn: () => Promise<unknown>, mensagem: string) {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    setAviso("");
    try {
      await fn();
      await atualizarIntegracoes(qc, ["recorrencias", "financeiro"]);
      setEdicao(null);
      setPendente(null);
      setAviso(mensagem);
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = {
      ...edicao!,
      descricao: String(f.get("descricao")).trim(),
      valor_centavos: Math.round(Number(f.get("valor")) * 100),
      dia: Number(f.get("dia")),
      inicio: String(f.get("inicio")),
      fim: String(f.get("fim")) || null,
    };
    void executar(
      () => salvarRecorrencia(a.demo, oficina, r),
      "Conta mensal salva. Você receberá o lembrete no sininho.",
    );
  }
  function nova() {
    if (trava.current) return;
    setErro("");
    setEdicao({
      id: novoId(),
      descricao: "",
      natureza: "pagar",
      categoria: "outras_despesas",
      valor_centavos: 0,
      valor_variavel: false,
      dia: Number(hoje().slice(-2)),
      inicio: hoje(),
      fim: null,
      ativa: true,
      revisao: 0,
      proximo_mes: hoje().slice(0, 7) + "-01",
    });
  }
  async function abrirPagamento(r: ContaRecorrente) {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    setAviso("");
    try {
      const conta = await consultarPagamentoMensal(a.demo, oficina, r.id);
      if (conta.titulo)
        navegar(`/financeiro?aba=recorrencias&titulo=${conta.titulo}&acao=registrar`);
      else if (conta.pendente) setPendente(conta.pendente);
      else
        setAviso(
          `Não há lançamento disponível de ${r.descricao} neste mês. As contas são geradas a partir de cinco dias antes do vencimento, dentro do período ativo.`,
        );
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  return (
    <section className="os-painel contas-mensais">
      <header className="mensais-cabecalho">
        <div>
          <h2>
            <Repeat size={22} /> Contas mensais
          </h2>
          <p>Aluguel, água, internet e outras contas mensais.</p>
        </div>
        <button className="botao-primario" onClick={nova} disabled={ocupado}>
          <Plus size={18} /> Nova conta mensal
        </button>
      </header>
      <p className="mensais-lembrete">
        <Bell size={18} /> Lembretes no sininho. Você confirma cada pagamento.
      </p>
      {aviso && (
        <p role="status" className="aviso-cliente">
          {aviso}
        </p>
      )}
      {!edicao && !pendente && erro && (
        <p role="alert" className="erro-formulario">
          {erro}
        </p>
      )}
      {meses.isError && (
        <p role="alert">
          {erroPublico(meses.error)}{" "}
          <button onClick={() => void meses.refetch()}>Tentar novamente</button>
        </p>
      )}
      {!!meses.data?.total && (
        <section className="mensais-pendentes" aria-label="Valores do mês a informar">
          <h3>
            Falta informar o valor <small>({meses.data.total})</small>
          </h3>
          <p>Estas contas ainda não entram nos totais financeiros.</p>
          {meses.data.itens.map((p) => (
            <div className="mensal-linha" key={p.id}>
              <div>
                <strong>{p.descricao}</strong>
                <small>Vencimento {p.vencimento.split("-").reverse().join("/")}</small>
              </div>
              <button
                className="botao-primario"
                disabled={ocupado}
                onClick={() => {
                  if (trava.current) return;
                  setErro("");
                  setPendente(p);
                }}
              >
                Informar valor
              </button>
            </div>
          ))}
          {meses.data.total > 30 && (
            <div className="mensais-acoes">
              <button disabled={!pagina} onClick={() => setPagina(pagina - 1)}>
                Anterior
              </button>
              <span>Página {pagina + 1}</span>
              <button
                disabled={(pagina + 1) * 30 >= meses.data.total}
                onClick={() => setPagina(pagina + 1)}
              >
                Próxima
              </button>
            </div>
          )}
        </section>
      )}
      {q.isPending && <p role="status">Carregando contas mensais…</p>}
      {q.isError && (
        <p role="alert">
          {erroPublico(q.error)}{" "}
          <button onClick={() => void q.refetch()}>Tentar novamente</button>
        </p>
      )}
      {q.data?.length === 0 && (
        <div className="mensais-vazio">
          <Repeat size={28} />
          <strong>Sua primeira conta mensal</strong>
          <p>Cadastre uma vez e acompanhe os vencimentos aqui e no sininho.</p>
        </div>
      )}
      <div className="mensais-lista">
        {q.data?.map((r) => (
          <article className="mensal-linha" key={r.id}>
            <button
              className="mensal-abrir-pagamento"
              disabled={ocupado}
              onClick={() => void abrirPagamento(r)}
              aria-label={`Registrar ${r.natureza === "pagar" ? "pagamento" : "recebimento"} de ${r.descricao} neste mês`}
            >
              <div className="mensal-dia">
                <small>Todo dia</small>
                <strong>{r.dia}</strong>
              </div>
              <div className="mensal-nome">
                <strong>{r.descricao}</strong>
                <small>
                  {!r.ativa
                    ? "Pausada"
                    : r.fim && r.fim < hoje()
                      ? "Encerrada"
                      : r.natureza === "pagar"
                        ? "A pagar"
                        : "A receber"}{" "}
                  · {r.valor_variavel ? "Valor variável" : "Valor fixo"}
                </small>
              </div>
              <div className="mensal-valor">
                <strong>
                  {r.valor_centavos
                    ? dinheiro(r.valor_centavos)
                    : "Informar a cada mês"}
                </strong>
                {r.valor_variavel && r.valor_centavos > 0 && (
                  <small>Estimativa mensal</small>
                )}
              </div>
              <span className="mensal-atalho">
                {r.natureza === "pagar"
                  ? "Registrar pagamento"
                  : "Registrar recebimento"}{" "}
                →
              </span>
            </button>
            <div className="mensais-acoes">
              <button
                className="botao-secundario"
                disabled={ocupado}
                onClick={() => {
                  setErro("");
                  setEdicao(r);
                }}
              >
                Editar
              </button>
              <button
                className="botao-secundario"
                disabled={ocupado}
                onClick={() =>
                  void executar(
                    () => salvarRecorrencia(a.demo, oficina, { ...r, ativa: !r.ativa }),
                    r.ativa
                      ? "Pausada. Contas já geradas permanecem no financeiro."
                      : "Retomada sem gerar cobranças dos meses da pausa.",
                  )
                }
              >
                {r.ativa ? "Pausar" : "Retomar"}
              </button>
            </div>
          </article>
        ))}
      </div>
      <Link to="/financeiro?aba=contas">Ver contas a pagar e a receber →</Link>
      <Dialogo
        aberto={!!edicao}
        fechar={() => !ocupado && setEdicao(null)}
        titulo={edicao?.revisao ? "Editar conta mensal" : "Nova conta mensal"}
        classe="dialogo-conta-mensal"
      >
        {edicao && (
          <form
            className="formulario-cliente mensal-form"
            onSubmit={enviar}
            key={edicao.id}
          >
            <fieldset disabled={ocupado}>
              <label>
                Nome da conta
                <input
                  name="descricao"
                  autoFocus
                  aria-label="Nome da conta"
                  required
                  minLength={3}
                  maxLength={200}
                  defaultValue={edicao.descricao}
                  placeholder="Ex.: aluguel, água ou internet"
                />
              </label>
              <div className="dupla-campos">
                <label>
                  Valor mensal
                  <select
                    aria-label="Valor mensal"
                    value={edicao.valor_variavel ? "variavel" : "fixo"}
                    onChange={(e) =>
                      setEdicao({
                        ...edicao,
                        valor_variavel: e.target.value === "variavel",
                      })
                    }
                  >
                    <option value="fixo">Fixo — mesmo valor</option>
                    <option value="variavel">Variável — muda a cada mês</option>
                  </select>
                </label>
                <label>
                  Dia do vencimento
                  <input
                    name="dia"
                    aria-label="Dia do vencimento"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={31}
                    step={1}
                    required
                    defaultValue={edicao.dia}
                  />
                </label>
              </div>
              <label>
                {edicao.valor_variavel
                  ? "Estimativa mensal (R$) · opcional"
                  : "Valor fixo mensal (R$)"}
                <input
                  name="valor"
                  aria-label={
                    edicao.valor_variavel ? "Estimativa mensal" : "Valor fixo mensal"
                  }
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  max="100000000"
                  step="0.01"
                  required={!edicao.valor_variavel}
                  defaultValue={
                    edicao.valor_centavos ? edicao.valor_centavos / 100 : ""
                  }
                />
              </label>
              <p className="texto-suave">
                {edicao.valor_variavel
                  ? "Valor opcional. O sininho lembra de preenchê-lo no vencimento."
                  : "O valor será repetido todo mês e poderá ser editado depois."}{" "}
                Em meses curtos, vence no último dia.
              </p>
              {edicao.revisao > 0 && (
                <p className="aviso-cliente">
                  Vale para os próximos lançamentos. Edite contas já geradas em A pagar
                  e receber.
                </p>
              )}
              <SecaoRecolhivel titulo="Categoria e período (opcional)">
                <label>
                  Tipo de conta
                  <select
                    aria-label="Tipo de conta"
                    value={edicao.natureza}
                    onChange={(e) =>
                      setEdicao({
                        ...edicao,
                        natureza: e.target.value as "pagar" | "receber",
                        categoria:
                          e.target.value === "pagar"
                            ? "outras_despesas"
                            : "outras_receitas",
                      })
                    }
                  >
                    <option value="pagar">A pagar</option>
                    <option value="receber">A receber</option>
                  </select>
                </label>
                <label>
                  Categoria
                  <select
                    aria-label="Categoria"
                    value={edicao.categoria}
                    onChange={(e) =>
                      setEdicao({ ...edicao, categoria: e.target.value })
                    }
                  >
                    {categoriasRecorrentes[edicao.natureza].map((c) => (
                      <option key={c} value={c}>
                        {categorias[c]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="dupla-campos">
                  <label>
                    Começar em
                    <input
                      name="inicio"
                      type="date"
                      min="2000-01-01"
                      required
                      readOnly={edicao.revisao > 0}
                      defaultValue={edicao.inicio}
                    />
                  </label>
                  <label>
                    Terminar em (opcional)
                    <input
                      name="fim"
                      type="date"
                      min={edicao.inicio}
                      defaultValue={edicao.fim ?? ""}
                    />
                  </label>
                </div>
                <small>
                  Uma data inicial no passado também gera os meses anteriores. Contas
                  são atualizadas ao acessar o sistema.
                </small>
              </SecaoRecolhivel>
              {erro && (
                <p role="alert" className="erro-formulario">
                  {erro}
                </p>
              )}
              <button className="botao-primario" disabled={ocupado}>
                {ocupado ? "Salvando…" : "Salvar conta mensal"}
              </button>
            </fieldset>
          </form>
        )}
      </Dialogo>
      <Dialogo
        aberto={!!pendente}
        fechar={() => !ocupado && setPendente(null)}
        titulo="Informar valor do mês"
        classe="dialogo-conta-mensal"
      >
        {pendente && (
          <form
            className="formulario-cliente"
            key={pendente.id}
            onSubmit={(e) => {
              e.preventDefault();
              const valor = Math.round(
                Number(new FormData(e.currentTarget).get("valor")) * 100,
              );
              void executar(async () => {
                const id = await informarValorContaMensal(
                  a.demo,
                  oficina,
                  pendente.id,
                  valor,
                );
                navegar(`/financeiro?aba=recorrencias&titulo=${id}&acao=registrar`);
              }, "Valor informado. Agora você pode registrar o pagamento.");
            }}
          >
            <strong>{pendente.descricao}</strong>
            <p>Vencimento {pendente.vencimento.split("-").reverse().join("/")}</p>
            <label>
              Valor deste mês (R$)
              <input
                name="valor"
                aria-label="Valor deste mês"
                type="number"
                min="0.01"
                max="100000000"
                step="0.01"
                inputMode="decimal"
                required
                autoFocus
              />
            </label>
            <p className="texto-suave">
              Salva a conta no financeiro. O pagamento será confirmado por você.
            </p>
            {erro && <p role="alert">{erro}</p>}
            <button className="botao-primario" disabled={ocupado}>
              {ocupado ? "Salvando…" : "Salvar valor e registrar"}
            </button>
          </form>
        )}
      </Dialogo>
    </section>
  );
}
