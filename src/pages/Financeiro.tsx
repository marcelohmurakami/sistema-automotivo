import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { atualizarIntegracoes } from "../lib/atualizarIntegracoes";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  Plus,
  Download,
  CircleHelp,
  CheckCircle2,
} from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { Dialogo } from "../components/Dialogo";
import { erroPublico } from "../lib/supabase";
import { dinheiro } from "../services/orcamentos";
import {
  transferirFinanceiro,
  estornarTransferencia,
  consultarFinanceiro,
  salvarTitulo,
  baixarTitulo,
  historicoFinanceiro,
  estornarBaixa,
  cancelarTitulo,
  revisarCustos,
  novoTitulo,
  hoje,
  categorias,
  categoriasReceber,
  categoriasPagar,
  contas,
  formas,
  type TituloFinanceiro,
  type BaixaFinanceira,
  type FiltrosFinanceiro,
} from "../services/financeiro";
import "./Financeiro.css";
const dataBR = (d: string) => d.slice(0, 10).split("-").reverse().join("/");
const numero = (f: FormData, nome: string) =>
  Math.round(Number(f.get(nome)) * 100);
function situacao(t: TituloFinanceiro) {
  return t.cancelado_em
    ? "Cancelado"
    : t.aberto_centavos === 0
      ? "Quitado"
      : t.vencimento < hoje()
        ? "Atrasado"
        : t.baixado_centavos > 0
          ? "Pago em parte"
          : "Em aberto";
}
function exportar(linhas: unknown[][], nome: string) {
  const texto =
    "\ufeff" +
    linhas
      .map((l) =>
        l
          .map(
            (v) =>
              '"' +
              String(v ?? "")
                .replace(/^[\s]*[=+@-]/, "'$&")
                .replaceAll('"', '""') +
              '"',
          )
          .join(";"),
      )
      .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([texto], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Financeiro() {
  const a = useAcesso(),
    oficina = a.oficina!,
    qc = useQueryClient(),
    [params, setParams] = useSearchParams();
  const [inicio, setInicio] = useState(hoje().slice(0, 7) + "-01"),
    [fim, setFim] = useState(hoje()),
    [aba, setAba] = useState(params.get("os") ? "contas" : "visao"),
    [busca, setBusca] = useState(""),
    [filtro, setFiltro] = useState("abertos"),
    [natureza, setNatureza] = useState(""),
    [pagina, setPagina] = useState(0);
  const [modal, setModal] = useState(""),
    [titulo, setTitulo] = useState<TituloFinanceiro | null>(null),
    [baixa, setBaixa] = useState<BaixaFinanceira | null>(null),
    [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [chave, setChave] = useState(() => crypto.randomUUID());
  const trava = useRef(false),
    gerente = oficina.perfil === "owner" || oficina.perfil === "manager";
  const filtros: FiltrosFinanceiro = {
    inicio,
    fim,
    busca,
    filtro,
    natureza,
    pagina,
    os: params.get("os"),
  };
  const q = useQuery({
    queryKey: ["financeiro", a.demo, oficina.id, filtros],
    queryFn: () => consultarFinanceiro(a.demo, oficina.id, filtros),
    enabled: gerente,
    refetchInterval: 30000,
  });
  const hist = useQuery({
    queryKey: ["financeiro-historico", a.demo, oficina.id, titulo?.id],
    queryFn: () => historicoFinanceiro(a.demo, oficina.id, titulo!.id),
    enabled:
      gerente && !!titulo && ["detalhe", "estorno", "editar"].includes(modal),
  });
  if (!gerente)
    return (
      <section className="os-painel">
        <h1>Financeiro reservado à gerência</h1>
        <p>
          O proprietário e os gerentes da oficina podem consultar e movimentar
          valores.
        </p>
      </section>
    );
  const r = q.data?.resumo,
    resultado = r ? r.receitas - r.despesas - r.pecas - r.taxas : 0,
    saldo = q.data?.contas.reduce((s, c) => s + c.saldo, 0) ?? 0;
  function abrir(m: string, t?: TituloFinanceiro) {
    setTitulo(t ?? null);
    setModal(m);
    setErro("");
    setBaixa(null);
    setChave(crypto.randomUUID());
  }
  async function executar(fn: () => Promise<unknown>) {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      await fn();
      await atualizarIntegracoes(qc);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["financeiro"] }),
        qc.invalidateQueries({ queryKey: ["financeiro-historico"] }),
      ]);
      setModal("");
      setAviso("Registrado. Os valores foram atualizados.");
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  function enviarTitulo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const bloqueado =
      titulo!.automatico || !!titulo!.compra_id || !!hist.data?.length;
    void executar(() =>
      salvarTitulo(a.demo, oficina.id, {
        ...titulo!,
        descricao: String(f.get("descricao")),
        pessoa: String(f.get("pessoa")),
        observacoes: String(f.get("observacoes")),
        vencimento: String(f.get("vencimento")),
        ...(!bloqueado
          ? {
              categoria: String(f.get("categoria")),
              valor_centavos: numero(f, "valor"),
              competencia: String(f.get("competencia")),
            }
          : {}),
      }),
    );
  }
  function enviarBaixa(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void executar(() =>
      baixarTitulo(a.demo, oficina.id, titulo!, {
        chave,
        valor_centavos: numero(f, "valor"),
        taxa_centavos: titulo!.natureza === "receber" ? numero(f, "taxa") : 0,
        data: String(f.get("data")),
        conta: String(f.get("conta")),
        forma: String(f.get("forma")),
        observacao: String(f.get("observacao")),
      }),
    );
  }
  async function exportarContas() {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      const itens: TituloFinanceiro[] = [];
      let p = 0;
      for (;;) {
        const d = await consultarFinanceiro(a.demo, oficina.id, {
          ...filtros,
          pagina: p++,
        });
        itens.push(...d.itens);
        if (itens.length >= d.total || !d.itens.length) break;
      }
      exportar(
        [
          [
            "Descrição",
            "Pessoa",
            "Tipo",
            "Categoria",
            "Data do resultado",
            "Vencimento",
            "Valor (R$)",
            "Pago (R$)",
            "Falta (R$)",
            "Situação",
          ],
          ...itens.map((t) => [
            t.descricao,
            t.pessoa,
            t.natureza,
            categorias[t.categoria],
            dataBR(t.competencia),
            dataBR(t.vencimento),
            (t.valor_centavos / 100).toFixed(2).replace(".", ","),
            (t.baixado_centavos / 100).toFixed(2).replace(".", ","),
            (t.aberto_centavos / 100).toFixed(2).replace(".", ","),
            situacao(t),
          ]),
        ],
        `contas-${inicio}-${fim}.csv`,
      );
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  return (
    <>
      <div className="titulo-pagina">
        <div>
          <div className="sobretitulo">
            <span className="linha-verde" />O DINHEIRO DA OFICINA, SEM
            COMPLICAÇÃO
          </div>
          <h1>
            Financeiro<span>.</span>
          </h1>
          <p>Saiba o que entrou, o que falta pagar e o que a oficina ganhou.</p>
        </div>
        <div className="fin-acoes">
          <button
            className="botao-secundario"
            onClick={() => abrir("transferencia")}
          >
            Transferir entre contas
          </button>
          <button
            className="botao-secundario"
            onClick={() => abrir("novo", novoTitulo("receber"))}
          >
            <Plus size={17} />
            Nova receita
          </button>
          <button
            className="botao-primario"
            onClick={() => abrir("novo", novoTitulo("pagar"))}
          >
            <Plus size={17} />
            Nova despesa
          </button>
        </div>
      </div>
      {a.demo && (
        <p className="aviso-cliente">
          Demonstração · Lançamentos fictícios salvos somente neste navegador.
        </p>
      )}
      {aviso && (
        <p className="aviso-cliente" role="status">
          {aviso}
        </p>
      )}
      {!modal && erro && (
        <p role="alert" className="erro-formulario">
          {erro}
        </p>
      )}
      <div className="fin-periodo">
        <div>
          <strong>Período do resultado e das entradas / saídas</strong>
          <p className="texto-suave">
            Contas em aberto e dinheiro disponível mostram a situação atual.
          </p>
        </div>
        <label>
          De
          <input
            type="date"
            value={inicio}
            onChange={(e) => {
              setInicio(e.target.value);
              setPagina(0);
            }}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={fim}
            onChange={(e) => {
              setFim(e.target.value);
              setPagina(0);
            }}
          />
        </label>
      </div>
      <nav className="fin-abas" aria-label="Visões do financeiro">
        {[
          ["visao", "Visão geral"],
          ["contas", "Contas e pagamentos"],
          ["os", "Resultado por OS"],
        ].map(([id, nome]) => (
          <button
            key={id}
            aria-current={aba === id ? "page" : undefined}
            onClick={() => setAba(id)}
          >
            {nome}
          </button>
        ))}
      </nav>
      {q.isPending ? (
        <p role="status" className="estado-lista">
          Carregando financeiro…
        </p>
      ) : q.isError ? (
        <div role="alert" className="erro-formulario">
          {erroPublico(q.error)}{" "}
          <button onClick={() => void q.refetch()}>Tentar novamente</button>
        </div>
      ) : (
        r && (
          <>
            {aba === "visao" && (
              <>
                <section className="fin-cartoes" aria-label="Resumo financeiro">
                  <article className="fin-destaque">
                    <Wallet size={22} />
                    <span>Dinheiro disponível</span>
                    <strong>{dinheiro(saldo)}</strong>
                    <small>
                      Saldo dos lançamentos registrados, em todas as datas.
                    </small>
                    <div>
                      {q.data.contas.map((c) => (
                        <p key={c.conta}>
                          {contas[c.conta]} <b>{dinheiro(c.saldo)}</b>
                        </p>
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        const t = novoTitulo("receber");
                        t.categoria = "saldo_inicial";
                        t.descricao = "Saldo anterior ao sistema";
                        abrir("novo", t);
                      }}
                    >
                      Informar saldo inicial
                    </button>
                  </article>
                  <article>
                    <ArrowDownLeft size={22} />
                    <span>Falta receber</span>
                    <strong>{dinheiro(r.receber)}</strong>
                    <small>{dinheiro(r.receber_atrasado)} em atraso</small>
                    <button
                      onClick={() => {
                        setAba("contas");
                        setNatureza("receber");
                        setFiltro("abertos");
                        setPagina(0);
                      }}
                    >
                      Ver quem precisa pagar →
                    </button>
                  </article>
                  <article>
                    <ArrowUpRight size={22} />
                    <span>Falta pagar</span>
                    <strong>{dinheiro(r.pagar)}</strong>
                    <small>{dinheiro(r.pagar_atrasado)} em atraso</small>
                    <button
                      onClick={() => {
                        setAba("contas");
                        setNatureza("pagar");
                        setFiltro("abertos");
                        setPagina(0);
                      }}
                    >
                      Ver contas da oficina →
                    </button>
                  </article>
                </section>
                <div className="fin-duas-colunas">
                  <section className="os-painel fin-resultado">
                    <div className="sobretitulo">RESULTADO DO PERÍODO</div>
                    <h2
                      className={
                        resultado < 0 ? "fin-negativo" : "fin-positivo"
                      }
                    >
                      {resultado < 0
                        ? "Prejuízo estimado"
                        : resultado > 0
                          ? "Lucro estimado"
                          : "Resultado estimado"}
                    </h2>
                    <strong className="fin-valor-grande">
                      {dinheiro(resultado)}
                    </strong>
                    <p>
                      O que a oficina vendeu, menos os custos e despesas
                      registrados.
                    </p>
                    <dl>
                      <div>
                        <dt>Receitas das OS entregues e outras vendas</dt>
                        <dd>{dinheiro(r.receitas)}</dd>
                      </div>
                      <div>
                        <dt>Peças do estoque usadas nas OS</dt>
                        <dd>− {dinheiro(r.pecas)}</dd>
                      </div>
                      <div>
                        <dt>Despesas da oficina e peças externas</dt>
                        <dd>− {dinheiro(r.despesas)}</dd>
                      </div>
                      <div>
                        <dt>Taxas de recebimento</dt>
                        <dd>− {dinheiro(r.taxas)}</dd>
                      </div>
                    </dl>
                    <p className="fin-nota">
                      <CircleHelp size={17} />
                      Ainda não recebeu do cliente? A venda entra no resultado
                      mesmo assim. Cadastre salários, aluguel, impostos e outros
                      custos para ter um resultado confiável.
                    </p>
                    {r.revisar_custos > 0 && (
                      <button
                        className="fin-alerta"
                        onClick={() => setAba("os")}
                      >
                        {r.revisar_custos} OS com custos para conferir →
                      </button>
                    )}
                  </section>
                  <section className="os-painel fin-resultado">
                    <div className="sobretitulo">MOVIMENTO DO DINHEIRO</div>
                    <h2>Entrou e saiu</h2>
                    <dl>
                      <div>
                        <dt>Entrou de verdade (já sem taxas)</dt>
                        <dd className="fin-positivo">{dinheiro(r.entradas)}</dd>
                      </div>
                      <div>
                        <dt>Saiu de verdade</dt>
                        <dd className="fin-negativo">{dinheiro(r.saidas)}</dd>
                      </div>
                      <div className="fin-total">
                        <dt>Sobra / falta no período</dt>
                        <dd>{dinheiro(r.entradas - r.saidas)}</dd>
                      </div>
                    </dl>
                    <p>
                      Inclui compra de estoque, dinheiro colocado pelo dono e
                      retiradas. Por isso este valor pode ser diferente do
                      lucro.
                    </p>
                    <details>
                      <summary>Como registrar sem contar duas vezes?</summary>
                      <p>
                        Compra de peças para a prateleira: use{" "}
                        <b>Compra para estoque</b>. O custo entra no resultado
                        quando as peças são usadas na OS.
                      </p>
                      <p>
                        Peça comprada especialmente para um serviço, fora do
                        estoque: use <b>Peças compradas para uma OS</b> e
                        vincule à OS em “Resultado por OS”.
                      </p>
                      <p>
                        Entradas de estoque não criam pagamentos: registre a
                        conta do fornecedor aqui. Recebimentos por cartão só
                        devem ser registrados quando o dinheiro entrar no banco.
                      </p>
                    </details>
                    <button
                      className="botao-secundario"
                      onClick={() =>
                        exportar(
                          [
                            ["Indicador", "Valor (R$)"],
                            ...Object.entries({
                              Receitas: r.receitas,
                              "Peças consumidas": r.pecas,
                              Despesas: r.despesas,
                              Taxas: r.taxas,
                              "Resultado estimado": resultado,
                              Entradas: r.entradas,
                              Saídas: r.saidas,
                            }).map(([k, v]) => [
                              k,
                              (v / 100).toFixed(2).replace(".", ","),
                            ]),
                          ],
                          `resultado-${inicio}-${fim}.csv`,
                        )
                      }
                    >
                      <Download size={16} />
                      Exportar resumo
                    </button>
                  </section>
                </div>
              </>
            )}
            {aba === "contas" && (
              <section className="os-painel">
                <div className="fin-filtros">
                  <label>
                    Buscar
                    <input
                      value={busca}
                      placeholder="Descrição ou pessoa"
                      onChange={(e) => {
                        setBusca(e.target.value);
                        setPagina(0);
                      }}
                    />
                  </label>
                  <label>
                    Tipo
                    <select
                      value={natureza}
                      onChange={(e) => {
                        setNatureza(e.target.value);
                        setPagina(0);
                      }}
                    >
                      <option value="">Todos</option>
                      <option value="receber">A receber</option>
                      <option value="pagar">A pagar</option>
                    </select>
                  </label>
                  <label>
                    Mostrar
                    <select
                      value={filtro}
                      onChange={(e) => {
                        setFiltro(e.target.value);
                        setPagina(0);
                      }}
                    >
                      <option value="abertos">
                        Em aberto · todas as datas
                      </option>
                      <option value="atrasados">
                        Atrasados · todas as datas
                      </option>
                      <option value="vencimentos">Vencimento no período</option>
                      <option value="periodo">Resultado no período</option>
                      <option value="pagos">
                        Quitados · resultado no período
                      </option>
                      <option value="cancelados">
                        Cancelados · resultado no período
                      </option>
                    </select>
                  </label>
                  <button
                    className="botao-secundario"
                    disabled={ocupado}
                    onClick={() => void exportarContas()}
                  >
                    <Download size={16} />
                    Exportar lista
                  </button>
                </div>
                {params.get("os") && (
                  <p className="aviso-cliente">
                    Mostrando contas da OS selecionada.{" "}
                    <button onClick={() => setParams({})}>
                      Ver todas as OS
                    </button>
                  </p>
                )}
                <p className="texto-suave">
                  Toque em um lançamento para pagar, receber, editar ou
                  consultar o histórico.
                </p>
                {!q.data.itens.length ? (
                  <p className="estado-lista">
                    Nenhum lançamento nesta seleção.
                  </p>
                ) : (
                  <div className="fin-lista">
                    {q.data.itens.map((t) => (
                      <button
                        className="fin-lancamento"
                        key={t.id}
                        onClick={() => abrir("detalhe", t)}
                      >
                        <span
                          className={`fin-direcao ${t.natureza === "receber" ? "fin-positivo" : "fin-negativo"}`}
                        >
                          {t.natureza === "receber" ? (
                            <ArrowDownLeft />
                          ) : (
                            <ArrowUpRight />
                          )}
                        </span>
                        <span className="fin-descricao">
                          <strong>{t.descricao}</strong>
                          <small>
                            {t.pessoa || categorias[t.categoria]} · Vence{" "}
                            {dataBR(t.vencimento)}
                          </small>
                          <small>
                            {t.provisorio
                              ? "Adiantamento · OS em andamento"
                              : t.compra_id
                                ? "Compra de estoque"
                                : t.automatico
                                  ? "Gerado pela entrega da OS"
                                  : categorias[t.categoria]}
                          </small>
                        </span>
                        <span className="fin-valores">
                          <strong>
                            {dinheiro(t.aberto_centavos || t.valor_centavos)}
                          </strong>
                          <small
                            className={
                              situacao(t) === "Atrasado" ? "fin-negativo" : ""
                            }
                          >
                            {situacao(t)}
                            {t.baixado_centavos > 0 && t.aberto_centavos > 0
                              ? " · valor restante"
                              : ""}
                          </small>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="fin-paginacao">
                  <span>
                    {q.data.total} lançamentos · Página {pagina + 1}
                  </span>
                  <button
                    disabled={pagina === 0}
                    onClick={() => setPagina((p) => p - 1)}
                  >
                    Anterior
                  </button>
                  <button
                    disabled={(pagina + 1) * 30 >= q.data.total}
                    onClick={() => setPagina((p) => p + 1)}
                  >
                    Próxima
                  </button>
                </div>
              </section>
            )}
            {aba === "os" && (
              <section className="os-painel">
                <h2>Quanto sobrou em cada serviço?</h2>
                <p>
                  Receita menos peças consumidas, despesas vinculadas e taxas.
                  Ainda será preciso pagar as despesas gerais da oficina.
                </p>
                <p className="texto-suave">
                  Até 100 OS mais recentes entregues no período. O resumo geral
                  considera todas. Custos vinculados podem ter sido registrados
                  em outras datas.
                </p>
                {!q.data.ordens.length && (
                  <p className="estado-lista">
                    Nenhuma OS entregue no período.
                  </p>
                )}
                <div className="fin-os-grid">
                  {q.data.ordens.map((o) => {
                    const sobra =
                      o.valor_centavos - o.pecas - o.despesas - o.taxas;
                    return (
                      <article key={o.id}>
                        <div className="fin-acoes">
                          <h3>{o.descricao}</h3>
                          <Link to={`/ordens-servico?os=${o.ordem_servico_id}`}>
                            Abrir OS ↗
                          </Link>
                        </div>
                        <p>{o.pessoa}</p>
                        <dl>
                          <div>
                            <dt>Vendido</dt>
                            <dd>{dinheiro(o.valor_centavos)}</dd>
                          </div>
                          <div>
                            <dt>Peças do estoque</dt>
                            <dd>{dinheiro(o.pecas)}</dd>
                          </div>
                          <div>
                            <dt>Outros custos vinculados</dt>
                            <dd>{dinheiro(o.despesas + o.taxas)}</dd>
                          </div>
                          <div className="fin-total">
                            <dt>Sobra antes das despesas gerais</dt>
                            <dd
                              className={
                                sobra < 0 ? "fin-negativo" : "fin-positivo"
                              }
                            >
                              {dinheiro(sobra)}
                            </dd>
                          </div>
                        </dl>
                        <p
                          className={
                            o.custos_revisados ? "texto-suave" : "fin-negativo"
                          }
                        >
                          {o.custos_revisados
                            ? "Custos conferidos pela gerência"
                            : "Confira custos de peças externas, serviços de terceiros e peças com custo zero."}
                        </p>
                        <div className="fin-acoes">
                          <button
                            className="botao-secundario"
                            onClick={() => {
                              const t = novoTitulo("pagar");
                              t.ordem_servico_id = o.ordem_servico_id;
                              t.descricao = `Custo ${o.descricao}`;
                              t.categoria = "pecas_externas";
                              abrir("novo", t);
                            }}
                          >
                            Adicionar custo
                          </button>
                          <button
                            className="botao-secundario"
                            onClick={() => {
                              setParams({ os: o.ordem_servico_id });
                              setAba("contas");
                              setFiltro("periodo");
                              setNatureza("");
                              setPagina(0);
                            }}
                          >
                            Ver contas
                          </button>
                          {!o.custos_revisados && (
                            <button
                              disabled={ocupado}
                              onClick={() =>
                                void executar(() =>
                                  revisarCustos(a.demo, oficina.id, o.id),
                                )
                              }
                            >
                              <CheckCircle2 size={16} />
                              Conferi todos os custos
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )
      )}
      <Dialogo
        aberto={!!modal}
        fechar={() => {
          if (!ocupado) setModal("");
        }}
        titulo={
          modal === "transferencia"
            ? "Transferir entre contas"
            : modal === "novo"
              ? titulo?.natureza === "pagar"
                ? "Nova despesa"
                : "Nova receita"
              : modal === "editar"
                ? "Editar lançamento"
                : modal === "baixa"
                  ? titulo?.natureza === "pagar"
                    ? "Registrar pagamento"
                    : "Registrar recebimento"
                  : modal === "estorno"
                    ? "Estornar pagamento"
                    : modal === "cancelar"
                      ? "Cancelar lançamento"
                      : (titulo?.descricao ?? "Financeiro")
        }
        classe="fin-dialogo"
      >
        {erro && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        {modal === "transferencia" && (
          <form
            className="formulario-cliente"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void executar(() =>
                transferirFinanceiro(
                  a.demo,
                  oficina.id,
                  chave,
                  numero(f, "valor"),
                  String(f.get("data")),
                  String(f.get("origem")),
                  String(f.get("destino")),
                ),
              );
            }}
          >
            <fieldset disabled={ocupado}>
              <p>
                Registre uma movimentação que você já fez entre caixa e banco.
                Não altera o lucro nem envia dinheiro pelo banco.
              </p>
              <label>
                Valor (R$)
                <input
                  name="valor"
                  type="number"
                  min="0.01"
                  max="100000000"
                  step="0.01"
                  required
                />
              </label>
              <label>
                Data
                <input
                  name="data"
                  type="date"
                  max={hoje()}
                  defaultValue={hoje()}
                  required
                />
              </label>
              <label>
                De
                <select name="origem" defaultValue="caixa">
                  {Object.entries(contas).map(([k, n]) => (
                    <option key={k} value={k}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Para
                <select name="destino" defaultValue="banco">
                  {Object.entries(contas).map(([k, n]) => (
                    <option key={k} value={k}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <button className="botao-primario">
                Registrar transferência
              </button>
            </fieldset>
          </form>
        )}
        {titulo && ["novo", "editar"].includes(modal) && (
          <form className="formulario-cliente" onSubmit={enviarTitulo}>
            <fieldset
              disabled={ocupado || (modal === "editar" && hist.isPending)}
            >
              <label>
                Descrição
                <input
                  name="descricao"
                  required
                  minLength={3}
                  maxLength={200}
                  defaultValue={titulo.descricao}
                />
              </label>
              <div className="dupla-campos">
                <label>
                  Categoria
                  <select
                    name="categoria"
                    defaultValue={titulo.categoria}
                    disabled={
                      titulo.automatico ||
                      !!titulo.compra_id ||
                      !!hist.data?.length
                    }
                  >
                    {(titulo.natureza === "receber"
                      ? categoriasReceber
                      : categoriasPagar
                    ).map((c) => (
                      <option key={c} value={c}>
                        {categorias[c]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Valor total (R$)
                  <input
                    name="valor"
                    type="number"
                    min="0.01"
                    max="100000000"
                    step="0.01"
                    required
                    defaultValue={titulo.valor_centavos / 100 || ""}
                    readOnly={
                      titulo.automatico ||
                      !!titulo.compra_id ||
                      !!hist.data?.length
                    }
                  />
                </label>
              </div>
              <div className="dupla-campos">
                <label>
                  Data para o resultado
                  <input
                    type="date"
                    name="competencia"
                    required
                    defaultValue={titulo.competencia}
                    readOnly={
                      titulo.automatico ||
                      !!titulo.compra_id ||
                      !!hist.data?.length
                    }
                  />
                </label>
                <label>
                  Vencimento
                  <input
                    type="date"
                    name="vencimento"
                    required
                    defaultValue={titulo.vencimento}
                  />
                </label>
              </div>
              <p className="texto-suave">
                Data para o resultado: quando a venda ou despesa aconteceu.
                Vencimento: prazo para pagar. Registrar esta conta ainda não
                movimenta dinheiro.
              </p>
              <label>
                {titulo.natureza === "receber"
                  ? "Cliente / pessoa"
                  : "Fornecedor / pessoa"}
                <input
                  name="pessoa"
                  maxLength={200}
                  defaultValue={titulo.pessoa}
                />
              </label>
              <label>
                Observações
                <textarea
                  name="observacoes"
                  maxLength={2000}
                  defaultValue={titulo.observacoes}
                />
              </label>
              {titulo.ordem_servico_id && (
                <p className="aviso-cliente">
                  Este lançamento está vinculado à OS.
                </p>
              )}
              <button className="botao-primario">
                {ocupado ? "Salvando…" : "Salvar lançamento"}
              </button>
            </fieldset>
          </form>
        )}
        {titulo && modal === "baixa" && (
          <form className="formulario-cliente" onSubmit={enviarBaixa}>
            <fieldset disabled={ocupado}>
              <p>
                Falta {titulo.natureza === "receber" ? "receber" : "pagar"}{" "}
                <b>{dinheiro(titulo.aberto_centavos)}</b>. Informe apenas o
                valor que entrou ou saiu agora.
              </p>
              <div className="dupla-campos">
                <label>
                  Valor {titulo.natureza === "receber" ? "recebido" : "pago"}{" "}
                  (R$)
                  <input
                    name="valor"
                    type="number"
                    min="0.01"
                    max={titulo.aberto_centavos / 100}
                    step="0.01"
                    required
                    defaultValue={titulo.aberto_centavos / 100}
                  />
                </label>
                <label>
                  Data
                  <input
                    name="data"
                    type="date"
                    max={hoje()}
                    required
                    defaultValue={hoje()}
                  />
                </label>
              </div>
              <div className="dupla-campos">
                <label>
                  Onde o dinheiro movimentou?
                  <select name="conta">
                    {Object.entries(contas).map(([k, n]) => (
                      <option value={k} key={k}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Forma
                  <select name="forma">
                    {Object.entries(formas).map(([k, n]) => (
                      <option value={k} key={k}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {titulo.natureza === "receber" && (
                <label>
                  Taxa descontada deste recebimento (R$)
                  <input
                    name="taxa"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue="0"
                    required
                  />
                  <small>
                    Exemplo: cliente pagou R$ 100 e o banco ficou com R$ 3.
                    Valor recebido: 100; taxa: 3. Entram R$ 97 no saldo.
                  </small>
                </label>
              )}
              <label>
                Observação
                <textarea name="observacao" maxLength={1000} />
              </label>
              <button className="botao-primario">
                {ocupado ? "Registrando…" : "Confirmar registro"}
              </button>
            </fieldset>
          </form>
        )}
        {titulo && modal === "detalhe" && (
          <div className="fin-detalhe">
            {titulo.compra_id && (
              <Link to={"/compras?compra=" + titulo.compra_id}>
                Abrir compra e peças recebidas →
              </Link>
            )}
            {titulo.provisorio && (
              <p className="aviso-cliente">
                Adiantamento de OS em andamento: pagamentos entram no caixa. A
                receita só entra no resultado na entrega.
              </p>
            )}
            <span className="sobretitulo">{situacao(titulo)}</span>
            <strong className="fin-valor-grande">
              {dinheiro(titulo.valor_centavos)}
            </strong>
            <p>
              {categorias[titulo.categoria]} ·{" "}
              {titulo.pessoa || "Pessoa não informada"}
            </p>
            <dl>
              <div>
                <dt>
                  Já {titulo.natureza === "receber" ? "recebido" : "pago"}
                </dt>
                <dd>{dinheiro(titulo.baixado_centavos)}</dd>
              </div>
              <div>
                <dt>
                  Falta {titulo.natureza === "receber" ? "receber" : "pagar"}
                </dt>
                <dd>{dinheiro(titulo.aberto_centavos)}</dd>
              </div>
              <div>
                <dt>Vencimento</dt>
                <dd>{dataBR(titulo.vencimento)}</dd>
              </div>
            </dl>
            {titulo.observacoes && <p>{titulo.observacoes}</p>}
            {titulo.cancelado_em && (
              <p>Cancelado: {titulo.motivo_cancelamento}</p>
            )}
            {titulo.ordem_servico_id && (
              <Link to={`/ordens-servico?os=${titulo.ordem_servico_id}`}>
                Abrir OS vinculada ↗
              </Link>
            )}
            <div className="fin-acoes">
              {!titulo.cancelado_em && !titulo.transferencia_id && (
                <>
                  <button
                    className="botao-secundario"
                    onClick={() => setModal("editar")}
                  >
                    Editar
                  </button>
                  {titulo.aberto_centavos > 0 && (
                    <button
                      className="botao-primario"
                      onClick={() => {
                        setChave(crypto.randomUUID());
                        setModal("baixa");
                      }}
                    >
                      {titulo.natureza === "receber" ? "Receber" : "Pagar"}{" "}
                      agora
                    </button>
                  )}
                  {!titulo.automatico &&
                    !titulo.compra_id &&
                    titulo.baixado_centavos === 0 && (
                      <button onClick={() => setModal("cancelar")}>
                        Cancelar lançamento
                      </button>
                    )}
                </>
              )}
            </div>
            <h3>Histórico de pagamentos</h3>
            {hist.isPending ? (
              <p>Carregando…</p>
            ) : hist.isError ? (
              <p role="alert">{erroPublico(hist.error)}</p>
            ) : !hist.data?.length ? (
              <p className="texto-suave">
                Nenhum pagamento registrado. A criação da conta não altera o
                saldo.
              </p>
            ) : (
              hist.data.map((b) => (
                <article className="fin-historico" key={b.id}>
                  <strong>
                    {b.estorno_de ? "Estorno" : "Pagamento"} ·{" "}
                    {dinheiro(b.valor_centavos)}
                  </strong>
                  <p>
                    {dataBR(b.data)} · {contas[b.conta]} · {formas[b.forma]}
                  </p>
                  {b.taxa_centavos > 0 && (
                    <p>Taxa: {dinheiro(b.taxa_centavos)}</p>
                  )}
                  <p>{b.observacao}</p>
                  {!b.estorno_de &&
                    !hist.data.some((x) => x.estorno_de === b.id) && (
                      <button
                        className="botao-secundario"
                        onClick={() => {
                          setBaixa(b);
                          setModal("estorno");
                        }}
                      >
                        Estornar este registro
                      </button>
                    )}
                </article>
              ))
            )}
          </div>
        )}
        {["estorno", "cancelar"].includes(modal) && (
          <form
            className="formulario-cliente"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void executar(() =>
                modal === "estorno"
                  ? titulo?.transferencia_id
                    ? estornarTransferencia(
                        a.demo,
                        oficina.id,
                        titulo.transferencia_id,
                        String(f.get("data")),
                        String(f.get("motivo")),
                      )
                    : estornarBaixa(
                        a.demo,
                        oficina.id,
                        baixa!,
                        String(f.get("data")),
                        String(f.get("motivo")),
                      )
                  : cancelarTitulo(
                      a.demo,
                      oficina.id,
                      titulo!,
                      String(f.get("motivo")),
                    ),
              );
            }}
          >
            <fieldset disabled={ocupado}>
              <p>
                {modal === "estorno"
                  ? titulo?.transferencia_id
                    ? "A transferência será desfeita nas duas contas juntas. Os registros continuam no histórico."
                    : "O valor volta a ficar em aberto. O histórico original é mantido; o movimento contrário acontece na data informada."
                  : "O lançamento sai das contas e do resultado, mas continua no histórico de cancelados."}
              </p>
              {modal === "estorno" && (
                <label>
                  Data do estorno
                  <input
                    name="data"
                    type="date"
                    min={baixa?.data}
                    max={hoje()}
                    defaultValue={hoje()}
                    required
                  />
                </label>
              )}
              <label>
                Motivo
                <textarea
                  name="motivo"
                  minLength={3}
                  maxLength={1000}
                  required
                />
              </label>
              <button className="botao-primario">
                {ocupado ? "Registrando…" : "Confirmar"}
              </button>
            </fieldset>
          </form>
        )}
      </Dialogo>
    </>
  );
}
