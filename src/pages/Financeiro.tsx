import { componenteSobDemanda } from "../lib/componenteSobDemanda";
const CustosServicos = componenteSobDemanda(async () => ({
  default: (await import("../components/financeiro/CustosServicos")).CustosServicos,
}));
const PrecificacaoServicos = componenteSobDemanda(async () => ({
  default: (await import("../components/financeiro/PrecificacaoServicos"))
    .PrecificacaoServicos,
}));
const ApuracaoCompleta = componenteSobDemanda(async () => ({
  default: (await import("../components/financeiro/ApuracaoCompleta")).ApuracaoCompleta,
}));
const ConciliacaoBancaria = componenteSobDemanda(async () => ({
  default: (await import("../components/financeiro/ConciliacaoBancaria"))
    .ConciliacaoBancaria,
}));
const CobrancasContratos = componenteSobDemanda(async () => ({
  default: (await import("../components/financeiro/CobrancasContratos"))
    .CobrancasContratos,
}));
const ContasBancarias = componenteSobDemanda(async () => ({
  default: (await import("../components/financeiro/ContasBancarias")).ContasBancarias,
}));
// Formulários pequenos e usados na ação principal: carregam junto da rota para
// não introduzir uma espera de Suspense entre cadastrar e confirmar a baixa.
import { FormularioBaixaFinanceira } from "../components/financeiro/FormularioBaixaFinanceira";
import { FormularioTituloFinanceiro } from "../components/financeiro/FormularioTituloFinanceiro";
const Comissoes = componenteSobDemanda(async () => ({
  default: (await import("../components/Comissoes")).Comissoes,
}));
const ContasRecorrentes = componenteSobDemanda(async () => ({
  default: (await import("../components/ContasRecorrentes")).ContasRecorrentes,
}));
import {
  dataFinanceiraValida,
  linkIndicadorFinanceiro,
} from "../lib/indicadoresFinanceiro";

import { NavegacaoFinanceiro } from "../components/financeiro/NavegacaoFinanceiro";

import { novoId } from "../lib/uuid.ts";
import { useContasBancarias } from "../lib/useContasBancarias";

import "../components/PlanejamentoOperacional.css";

import { baixarCSV as exportar } from "../lib/csv";
import { dinheiro } from "../lib/formatacao";
import { SecaoRecolhivel } from "../components/SecaoRecolhivel";
import { useBuscaDebounced } from "../lib/useBuscaDebounced";

import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { atualizarIntegracoes } from "../lib/atualizarIntegracoes";
import { ValorRecorrente } from "../components/ValorRecorrente";
import type { ParcelaFinanceira } from "../lib/parcelasFinanceiras";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  Plus,
  Download,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Wrench,
  ReceiptText,
  CalendarDays,
} from "lucide-react";
import { rotuloPeriodoFinanceiro } from "../lib/periodoFinanceiro";
import { useAcesso } from "../auth/contexto";
import { Dialogo } from "../components/Dialogo";
import { erroPublico } from "../lib/supabase";

import {
  estornarTransferencia,
  consultarFinanceiro,
  consultarTituloFinanceiro,
  salvarTitulo,
  salvarContaParcelada,
  baixarTitulo,
  historicoFinanceiro,
  estornarBaixa,
  cancelarTitulo,
  revisarCustos,
  novoTitulo,
  hoje,
  categorias,
  formas,
  type TituloFinanceiro,
  type BaixaFinanceira,
  type FiltrosFinanceiro,
} from "../services/financeiro";
import "./Financeiro.css";
const dataBR = (d: string) => d.slice(0, 10).split("-").reverse().join("/");
const numero = (f: FormData, nome: string) => Math.round(Number(f.get(nome)) * 100);
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

export function Financeiro() {
  const a = useAcesso(),
    oficina = a.oficina!,
    qc = useQueryClient(),
    [params, setParams] = useSearchParams();
  const { contas, ativas } = useContasBancarias();
  const local = useLocation();
  const [mesCusteio, setMesCusteio] = useState(hoje().slice(0, 7));
  const [ultimoAtalho, setUltimoAtalho] = useState<string | null>(null);
  const automotivo = !oficina.ramo || oficina.ramo === "automotivo";
  const [inicio, setInicio] = useState(
      dataFinanceiraValida(params.get("inicio"))
        ? params.get("inicio")!
        : hoje().slice(0, 7) + "-01",
    ),
    [fim, setFim] = useState(
      dataFinanceiraValida(params.get("fim")) ? params.get("fim")! : hoje(),
    ),
    [abaEscolhida, setAba] = useState(
      [
        "os",
        "comissoes",
        "bancos",
        "custos",
        "precos",
        "resultado",
        "recorrencias",
        "conciliacao",
        "contratos",
      ].includes(params.get("aba") || "")
        ? params.get("aba")!
        : params.get("os") || params.get("aba") === "contas"
          ? "contas"
          : "visao",
    ),
    [busca, setBusca] = useState(""),
    [filtro, setFiltro] = useState("abertos"),
    [natureza, setNatureza] = useState(""),
    [paginaEscolhida, setPagina] = useState(0);
  const pagina = params.get("titulo") ? 0 : paginaEscolhida;
  const aba = params.get("titulo")
    ? "contas"
    : !automotivo && ["os", "comissoes"].includes(abaEscolhida)
      ? "contas"
      : automotivo && abaEscolhida === "contratos"
        ? "visao"
        : abaEscolhida;
  const [modal, setModal] = useState(""),
    [titulo, setTitulo] = useState<TituloFinanceiro | null>(null),
    [baixa, setBaixa] = useState<BaixaFinanceira | null>(null),
    [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [chave, setChave] = useState(() => novoId());
  const trava = useRef(false),
    gerente = oficina.perfil === "owner" || oficina.perfil === "manager";
  const [parcelado, setParcelado] = useState(false);
  const [parcelas, setParcelas] = useState<ParcelaFinanceira[]>([]);
  const [totalParcelamento, setTotalParcelamento] = useState(0);
  const [primeiroVencimento, setPrimeiroVencimento] = useState(hoje());
  if (ultimoAtalho !== local.key) {
    setUltimoAtalho(local.key);
    if (gerente && ["receber", "pagar"].includes(params.get("novo") || "")) {
      const novo = novoTitulo(params.get("novo") as "receber" | "pagar");
      setTitulo(novo);
      setModal("novo");
      setErro("");
      setBaixa(null);
      setParcelado(false);
      setParcelas([]);
      setTotalParcelamento(0);
      setPrimeiroVencimento(hoje());
      setChave(novoId());
    }
    if (
      [
        "visao",
        "os",
        "contas",
        "comissoes",
        "bancos",
        "custos",
        "precos",
        "resultado",
        "recorrencias",
        "conciliacao",
        "contratos",
      ].includes(params.get("aba") || "")
    )
      setAba(params.get("aba")!);
  }
  const buscaConsulta = useBuscaDebounced(busca);
  const filtros: FiltrosFinanceiro = {
    titulo: params.get("titulo"),
    inicio,
    fim,
    busca: buscaConsulta,
    filtro,
    natureza,
    pagina,
    os: params.get("os"),
  };
  const q = useQuery({
    queryKey: ["financeiro", a.demo, oficina.id, filtros],
    queryFn: ({ signal }) => consultarFinanceiro(a.demo, oficina.id, filtros, signal),
    placeholderData: (anterior, consultaAnterior) => {
      const anteriores = consultaAnterior?.queryKey[3] as FiltrosFinanceiro | undefined;
      return consultaAnterior?.queryKey[1] === a.demo &&
        consultaAnterior.queryKey[2] === oficina.id &&
        anteriores?.inicio === inicio &&
        anteriores.fim === fim &&
        anteriores.os === filtros.os
        ? anterior
        : undefined;
    },
    enabled: gerente && ["visao", "contas", "os"].includes(aba),
    refetchInterval: 30000,
  });
  const hist = useQuery({
    queryKey: ["financeiro-historico", a.demo, oficina.id, titulo?.id],
    queryFn: ({ signal }) =>
      historicoFinanceiro(a.demo, oficina.id, titulo!.id, signal),
    enabled: gerente && !!titulo && ["detalhe", "estorno", "editar"].includes(modal),
  });
  const idLembrete = params.get("acao") === "registrar" ? params.get("titulo") : null;
  const [lembreteAberto, setLembreteAberto] = useState<string | null>(null);
  const contaLembrete = useQuery({
    // Cada clique confirma o saldo atual; nunca abre uma baixa de um alerta antigo.
    queryKey: ["financeiro-lembrete-titulo", a.demo, oficina.id, local.key, idLembrete],
    queryFn: ({ signal }) =>
      consultarTituloFinanceiro(a.demo, oficina.id, idLembrete!, signal),
    enabled: gerente && !!idLembrete && lembreteAberto !== local.key,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  if (
    idLembrete &&
    lembreteAberto !== local.key &&
    (contaLembrete.isSuccess || contaLembrete.isError)
  ) {
    setLembreteAberto(local.key);
    const conta = contaLembrete.data;
    if (contaLembrete.isError) setErro(erroPublico(contaLembrete.error));
    else if (!conta || conta.cancelado_em || conta.aberto_centavos <= 0)
      setAviso("Esta conta já foi quitada, cancelada ou não está mais disponível.");
    else if (conta.comissao_id) {
      setParams({ aba: "comissoes" });
      setAba("comissoes");
    } else {
      setTitulo(conta);
      setBaixa(null);
      setErro("");
      setChave(novoId());
      setModal(
        conta.valor_variavel && !conta.valor_confirmado_em ? "detalhe" : "baixa",
      );
    }
  }
  if (!gerente)
    return (
      <section className="os-painel">
        <h1>Financeiro reservado à gerência</h1>
        <p>
          O proprietário e os gerentes da empresa podem consultar e movimentar valores.
        </p>
      </section>
    );
  const r = q.data?.resumo,
    resultado = r ? r.receitas - r.despesas - r.pecas - r.taxas : 0,
    custosDespesas = r ? r.despesas + r.pecas + r.taxas : 0,
    saldo = q.data?.contas.reduce((s, c) => s + c.saldo, 0) ?? 0;
  const mesmoMes = inicio.slice(0, 7) === fim.slice(0, 7);
  function abrir(m: string, t?: TituloFinanceiro) {
    if (m === "baixa" && t?.comissao_id) {
      setAba("comissoes");
      setModal("");
      return;
    }
    setTitulo(t ?? null);
    setParcelado(false);
    setParcelas([]);
    setTotalParcelamento(t?.valor_centavos ?? 0);
    setPrimeiroVencimento(t?.vencimento ?? hoje());
    setModal(m);
    setErro("");
    setBaixa(null);
    setChave(novoId());
  }
  async function executar(
    fn: () => Promise<unknown>,
    continuar?: () => void | Promise<void>,
  ) {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      await fn();
      // O painel confirma os saldos visíveis. Históricos e outras telas atualizam
      // em segundo plano, sem segurar uma operação já confirmada pelo servidor.
      await atualizarIntegracoes(qc, ["financeiro"]);
      const atualizacao = qc.getQueryState(["financeiro", a.demo, oficina.id, filtros]);
      setAviso(
        atualizacao?.status === "error"
          ? "Registro salvo. Não foi possível atualizar a consulta; tente atualizar a tela."
          : "Registrado. Os valores foram atualizados.",
      );
      if (continuar) await continuar();
      else setModal("");
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  function enviarTitulo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (modal === "editar" && (hist.isPending || hist.isError)) return;
    const f = new FormData(e.currentTarget);
    const bloqueado =
      titulo!.automatico ||
      !!titulo!.compra_id ||
      !!titulo!.comissao_id ||
      !!hist.data?.length;
    const receberOuPagar =
      modal === "novo" &&
      !parcelado &&
      (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "baixar";
    let consultarConfirmado: Promise<TituloFinanceiro | null> | undefined;
    void executar(
      async () => {
        await (modal === "novo" && parcelado ? salvarContaParcelada : salvarTitulo)(
          a.demo,
          oficina.id,
          {
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
          },
          parcelas,
        );
        if (receberOuPagar) {
          // A gravação terminou. Consulta a conta junto com a atualização do
          // painel; ambas precisam terminar antes da confirmação de pagamento.
          consultarConfirmado = consultarTituloFinanceiro(
            a.demo,
            oficina.id,
            titulo!.id,
          ).catch(() => null);
        }
      },
      receberOuPagar
        ? async () => {
            const confirmado = await consultarConfirmado;
            if (!confirmado) {
              setModal("");
              setParams({ aba: "contas", titulo: titulo!.id });
              setAviso(
                "A conta foi salva, mas não conseguimos abrir o pagamento. Nenhum pagamento foi registrado. Use Receber ou Pagar na conta abaixo para continuar.",
              );
              return;
            }
            setTitulo(confirmado);
            setChave(novoId());
            setModal("baixa");
          }
        : undefined,
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
            <span className="linha-verde" />
            {automotivo
              ? "O DINHEIRO DA OFICINA, SEM COMPLICAÇÃO"
              : "O DINHEIRO DA EMPRESA, SEM COMPLICAÇÃO"}
          </div>
          <h1>
            Financeiro<span>.</span>
          </h1>
        </div>
        {["contas", "os"].includes(aba) && (
          <div className="fin-acoes">
            <button
              className="botao-secundario"
              onClick={() => abrir("novo", novoTitulo("receber"))}
            >
              <Plus size={17} />
              Nova conta a receber
            </button>
            <button
              className="botao-primario"
              onClick={() => abrir("novo", novoTitulo("pagar"))}
            >
              <Plus size={17} />
              Nova conta a pagar
            </button>
          </div>
        )}
      </div>
      {a.demo && (
        <p className="nota-demo">
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
      <NavegacaoFinanceiro
        aba={aba}
        automotivo={automotivo}
        selecionar={(id) => {
          setAba(id);
          const proximos = new URLSearchParams(params);
          proximos.delete("titulo");
          proximos.set("aba", id);
          setParams(proximos);
        }}
      />
      {!["precos", "bancos", "contratos", "recorrencias"].includes(aba) && (
        <div className="fin-periodo">
          <div>
            <strong>Período da consulta</strong>
            <p className="texto-suave">
              {aba === "comissoes"
                ? "Comissões das OS abertas ou entregues neste período."
                : ["resultado", "custos"].includes(aba)
                  ? "Serviços e valores do período escolhido."
                  : aba === "conciliacao"
                    ? "Movimentações do banco e do sistema nas datas escolhidas."
                    : aba === "precos"
                      ? "A formação de preço usa o mês de referência abaixo."
                      : "Saldos e contas em aberto são de hoje."}
            </p>
          </div>
          <label>
            De
            <input
              type="date"
              value={inicio}
              onChange={(e) => {
                setInicio(e.target.value);
                setParams(
                  (p) => {
                    const n = new URLSearchParams(p);
                    n.set("inicio", e.target.value);
                    return n;
                  },
                  { replace: true },
                );
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
                setParams(
                  (p) => {
                    const n = new URLSearchParams(p);
                    n.set("fim", e.target.value);
                    return n;
                  },
                  { replace: true },
                );
                setPagina(0);
              }}
            />
          </label>
        </div>
      )}
      {aba === "comissoes" && (
        <Comissoes
          key={`${inicio}:${fim}:${params.get("os") ?? ""}`}
          inicio={inicio}
          fim={fim}
          os={params.get("os") ?? undefined}
        />
      )}
      {aba === "recorrencias" && <ContasRecorrentes />}
      {aba === "bancos" && <ContasBancarias />}
      {aba === "conciliacao" && (
        <ConciliacaoBancaria key={`${inicio}:${fim}`} inicio={inicio} fim={fim} />
      )}
      {aba === "contratos" && <CobrancasContratos />}
      {aba === "custos" && (
        <CustosServicos
          key={`${inicio}:${fim}`}
          inicio={inicio}
          fim={fim}
          abrirParametros={(mes) => {
            setMesCusteio(mes || inicio.slice(0, 7));
            setAba("precos");
          }}
        />
      )}
      {aba === "precos" && <PrecificacaoServicos mesInicial={mesCusteio} />}
      {aba === "resultado" && (
        <ApuracaoCompleta
          key={`${inicio}:${fim}`}
          inicio={inicio}
          fim={fim}
          abrirCustos={() => setAba("custos")}
        />
      )}
      {params.has("titulo") && (
        <p className="aviso-cliente">
          Exibindo o lançamento selecionado.{" "}
          <button
            onClick={() => {
              const proximos = new URLSearchParams(params);
              proximos.delete("titulo");
              setAba("contas");
              setParams(proximos);
            }}
          >
            Ver todas as contas
          </button>
        </p>
      )}
      {[
        "comissoes",
        "recorrencias",
        "bancos",
        "custos",
        "precos",
        "resultado",
        "conciliacao",
        "contratos",
      ].includes(aba) ? null : q.isPending ? (
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
                <section className="fin-grupo" aria-label="Resultado do período">
                  <header className="fin-referencia-periodo">
                    <CalendarDays size={24} aria-hidden="true" />
                    <div>
                      <span>
                        {automotivo ? "RESULTADOS DA OFICINA" : "RESULTADOS DA EMPRESA"}
                      </span>
                      <h2>{rotuloPeriodoFinanceiro(inicio, fim)}</h2>
                      <p>
                        De {dataBR(inicio)} até {dataBR(fim)}
                      </p>
                    </div>
                    <div className="fin-acoes-contexto">
                      <div className="fin-acoes">
                        <button
                          className="botao-secundario"
                          onClick={() => abrir("novo", novoTitulo("receber"))}
                        >
                          <Plus size={17} />
                          Nova conta a receber
                        </button>
                        <button
                          className="botao-primario"
                          onClick={() => abrir("novo", novoTitulo("pagar"))}
                        >
                          <Plus size={17} />
                          Nova conta a pagar
                        </button>
                      </div>
                      <p>O caixa muda ao registrar o pagamento ou recebimento.</p>
                    </div>
                  </header>
                  <section
                    className="fin-cartoes fin-cartoes-resultado"
                    aria-label={
                      automotivo
                        ? "Lucro, receitas e despesas do período"
                        : "Receitas e despesas registradas no período"
                    }
                  >
                    <article
                      className={
                        resultado < 0
                          ? "fin-prejuizo"
                          : resultado > 0
                            ? "fin-lucro"
                            : "fin-equilibrio"
                      }
                    >
                      {resultado < 0 ? (
                        <TrendingDown size={22} />
                      ) : (
                        <TrendingUp size={22} />
                      )}
                      <span className="fin-indicador-titulo">
                        {!automotivo
                          ? "Saldo das contas registradas"
                          : resultado < 0
                            ? "Prejuízo"
                            : resultado > 0
                              ? "Lucro"
                              : "Sem lucro nem prejuízo"}
                        {automotivo && resultado !== 0
                          ? mesmoMes
                            ? " do mês"
                            : " do período"
                          : ""}
                      </span>
                      <strong>{dinheiro(resultado)}</strong>
                      <small>
                        {!automotivo
                          ? "Receitas menos despesas e taxas. Custos dos atendimentos não entram automaticamente."
                          : resultado < 0
                            ? "Custos e despesas acima das receitas."
                            : "Receitas menos peças, despesas e taxas."}
                      </small>
                      {!automotivo && a.permite("reports") && (
                        <Link className="fin-revisar-lucro" to="/relatorios">
                          Ver margem e custos dos atendimentos →
                        </Link>
                      )}
                      {automotivo && r.revisar_custos > 0 && (
                        <button
                          className="fin-revisar-lucro"
                          onClick={() => setAba("os")}
                        >
                          {r.revisar_custos} OS com custos a conferir →
                        </button>
                      )}
                      <Link
                        className="fin-ver-historico"
                        aria-label="Ver histórico: resultado"
                        to={linkIndicadorFinanceiro("resultado", inicio, fim)}
                      >
                        Ver histórico <ArrowUpRight size={15} />
                      </Link>
                    </article>
                    <article>
                      <Wrench size={22} />
                      <span className="fin-indicador-titulo">
                        Serviços e outras receitas
                      </span>
                      <strong>{dinheiro(r.receitas)}</strong>
                      <small>
                        {automotivo
                          ? "OS entregues e outras vendas, inclusive as ainda não recebidas."
                          : "Atendimentos faturados e outras receitas, inclusive as ainda não recebidas."}
                      </small>
                      <Link
                        className="fin-ver-historico"
                        aria-label="Ver histórico: receitas"
                        to={linkIndicadorFinanceiro("receitas", inicio, fim)}
                      >
                        Ver histórico <ArrowUpRight size={15} />
                      </Link>
                    </article>
                    <article>
                      <ReceiptText size={22} />
                      <span className="fin-indicador-titulo">Custos e despesas</span>
                      <strong>{dinheiro(custosDespesas)}</strong>
                      <small>
                        {automotivo
                          ? "Peças consumidas, despesas e taxas."
                          : "Contas e taxas registradas, mesmo sem pagamento."}
                      </small>
                      <Link
                        className="fin-ver-historico"
                        aria-label="Ver histórico: custos"
                        to={linkIndicadorFinanceiro("custos", inicio, fim)}
                      >
                        Ver histórico <ArrowUpRight size={15} />
                      </Link>
                    </article>
                  </section>
                </section>
                <section className="fin-grupo" aria-label="Movimento do caixa">
                  <div className="fin-titulo-caixa fin-cabecalho-caixa">
                    <div>
                      <h2>Caixa · movimento do dinheiro</h2>
                      <p>
                        O que foi recebido e pago de {dataBR(inicio)} a {dataBR(fim)}.
                      </p>
                    </div>
                    <div className="fin-acoes-contexto">
                      <div className="fin-acoes">
                        {(["receber", "pagar"] as const).map((tipo) => (
                          <button
                            key={tipo}
                            className={
                              tipo === "pagar" ? "botao-primario" : "botao-secundario"
                            }
                            onClick={() => {
                              setParams({ aba: "contas" });
                              setAba("contas");
                              setNatureza(tipo);
                              setFiltro("abertos");
                              setBusca("");
                              setPagina(0);
                            }}
                          >
                            {tipo === "receber" ? (
                              <ArrowDownLeft size={17} />
                            ) : (
                              <ArrowUpRight size={17} />
                            )}
                            {tipo === "receber" ? "Receber" : "Pagar"}
                          </button>
                        ))}
                      </div>
                      <p>Escolha a conta para registrar.</p>
                    </div>
                  </div>
                  <section
                    className="fin-cartoes fin-cartoes-caixa"
                    aria-label="Caixa, entradas e saídas"
                  >
                    <article
                      className={
                        saldo < 0
                          ? "fin-prejuizo"
                          : saldo > 0
                            ? "fin-lucro"
                            : "fin-equilibrio"
                      }
                    >
                      <Wallet size={22} />
                      <span className="fin-indicador-titulo">
                        {saldo < 0 ? "Saldo negativo hoje" : "Dinheiro disponível hoje"}
                      </span>
                      <strong>{dinheiro(saldo)}</strong>
                      <small>Caixa e banco acumulados, de todas as datas.</small>
                      <SecaoRecolhivel titulo="Ver contas e saldo inicial">
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
                      </SecaoRecolhivel>
                      <Link
                        className="fin-ver-historico"
                        aria-label="Ver histórico: saldo"
                        to={linkIndicadorFinanceiro("saldo", inicio, fim)}
                      >
                        Ver histórico <ArrowUpRight size={15} />
                      </Link>
                    </article>
                    <article>
                      <ArrowDownLeft size={22} />
                      <span className="fin-indicador-titulo">
                        Entrou {mesmoMes ? "no mês" : "no período"}
                      </span>
                      <strong className="fin-entrada-valor">
                        {dinheiro(r.entradas)}
                      </strong>
                      <small>Recebido no período, após taxas.</small>
                      <Link
                        className="fin-ver-historico"
                        aria-label="Ver histórico: entradas"
                        to={linkIndicadorFinanceiro("entradas", inicio, fim)}
                      >
                        Ver histórico <ArrowUpRight size={15} />
                      </Link>
                    </article>
                    <article>
                      <ArrowUpRight size={22} />
                      <span className="fin-indicador-titulo">
                        Saiu {mesmoMes ? "no mês" : "no período"}
                      </span>
                      <strong className="fin-saida-valor">{dinheiro(r.saidas)}</strong>
                      <small>Pago no período, incluindo estoque e retiradas.</small>
                      <Link
                        className="fin-ver-historico"
                        aria-label="Ver histórico: saidas"
                        to={linkIndicadorFinanceiro("saidas", inicio, fim)}
                      >
                        Ver histórico <ArrowUpRight size={15} />
                      </Link>
                    </article>
                  </section>
                </section>
                <section className="fin-grupo" aria-label="Contas pendentes">
                  <div className="fin-titulo-caixa">
                    <h2>Contas em aberto · a receber e a pagar</h2>
                    <p>Inclui contas vencidas.</p>
                  </div>
                  <section
                    className="fin-pendencias"
                    aria-label="Contas em aberto hoje"
                  >
                    <Link to={linkIndicadorFinanceiro("receber", inicio, fim)}>
                      <span>
                        A receber · saldo atual{" "}
                        <small>{dinheiro(r.receber_atrasado)} em atraso</small>
                      </span>
                      <strong>
                        {dinheiro(r.receber)} <span aria-hidden="true">→</span>
                      </strong>
                    </Link>
                    <Link to={linkIndicadorFinanceiro("pagar", inicio, fim)}>
                      <span>
                        A pagar · saldo atual{" "}
                        <small>{dinheiro(r.pagar_atrasado)} em atraso</small>
                      </span>
                      <strong>
                        {dinheiro(r.pagar)} <span aria-hidden="true">→</span>
                      </strong>
                    </Link>
                  </section>
                </section>
                <SecaoRecolhivel titulo="Entenda os números e exporte o resumo">
                  <section className="fin-exemplo" aria-labelledby="fin-exemplo-titulo">
                    <h2 id="fin-exemplo-titulo">Lucro e caixa são coisas diferentes</h2>
                    <p>
                      Exemplo ilustrativo com valores fictícios, apenas para explicar. O
                      resumo exportado usa os dados reais da sua empresa.
                    </p>
                    <div className="fin-duas-colunas">
                      <section className="fin-resultado">
                        <h3>1. Quanto o trabalho rendeu?</h3>
                        <dl>
                          <div>
                            <dt>Serviços e vendas realizados</dt>
                            <dd>R$ 10.000,00</dd>
                          </div>
                          <div>
                            <dt>Menos peças utilizadas</dt>
                            <dd>− R$ 2.000,00</dd>
                          </div>
                          <div>
                            <dt>Menos despesas, como aluguel e salários</dt>
                            <dd>− R$ 1.500,00</dd>
                          </div>
                          <div>
                            <dt>Menos taxas de recebimento</dt>
                            <dd>− R$ 100,00</dd>
                          </div>
                          <div className="fin-total">
                            <dt>Lucro do exemplo</dt>
                            <dd>R$ 6.400,00</dd>
                          </div>
                        </dl>
                        <p>
                          Esse é o resultado das vendas menos os custos, mesmo que parte
                          dos clientes ainda não tenha pago.
                        </p>
                      </section>
                      <section className="fin-resultado">
                        <h3>2. Quanto dinheiro ficou disponível?</h3>
                        <dl>
                          <div>
                            <dt>Dinheiro que já estava no caixa</dt>
                            <dd>R$ 1.000,00</dd>
                          </div>
                          <div>
                            <dt>Mais recebimentos, já descontadas as taxas</dt>
                            <dd>+ R$ 5.900,00</dd>
                          </div>
                          <div>
                            <dt>Menos pagamentos feitos</dt>
                            <dd>− R$ 3.000,00</dd>
                          </div>
                          <div className="fin-total">
                            <dt>Dinheiro disponível no exemplo</dt>
                            <dd>R$ 3.900,00</dd>
                          </div>
                        </dl>
                        <p>
                          Entraram R$ 2.900,00 a mais do que saíram. Somando os R$
                          1.000,00 anteriores, o caixa fica com R$ 3.900,00. Vendas
                          ainda não recebidas não entram aqui.
                        </p>
                      </section>
                    </div>
                  </section>
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
                </SecaoRecolhivel>
              </>
            )}
            {aba === "contas" && (
              <section className="os-painel">
                <div
                  className="fin-consultas-rapidas"
                  aria-label="Consultas rápidas de contas"
                >
                  {[
                    ["A receber", "receber", "abertos"],
                    ["A pagar", "pagar", "abertos"],
                    ["Atrasados", "", "atrasados"],
                    ["Todos em aberto", "", "abertos"],
                  ].map(([nome, tipo, situacao]) => (
                    <button
                      type="button"
                      key={nome}
                      aria-pressed={natureza === tipo && filtro === situacao}
                      onClick={() => {
                        setNatureza(tipo);
                        setFiltro(situacao);
                        setPagina(0);
                      }}
                    >
                      {nome}
                    </button>
                  ))}
                </div>
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
                      <option value="abertos">Em aberto · todas as datas</option>
                      <option value="atrasados">Atrasados · todas as datas</option>
                      <option value="vencimentos">Vencimento no período</option>
                      <option value="periodo">Resultado no período</option>
                      <option value="pagos">Quitados · resultado no período</option>
                      <option value="cancelados">
                        Cancelados · resultado no período
                      </option>
                    </select>
                  </label>
                  <button
                    className="botao-secundario"
                    disabled={ocupado || q.isPlaceholderData || busca !== buscaConsulta}
                    onClick={() => void exportarContas()}
                  >
                    <Download size={16} />
                    Exportar lista
                  </button>
                </div>
                {params.get("os") && (
                  <p className="aviso-cliente">
                    Mostrando contas da OS selecionada.{" "}
                    <button onClick={() => setParams({})}>Ver todas as OS</button>
                  </p>
                )}
                <p className="texto-suave">
                  Abra uma conta para registrar ou consultar.
                </p>
                {q.isPlaceholderData && <p role="status">Atualizando contas…</p>}
                {!q.data.itens.length ? (
                  <p className="estado-lista">Nenhum lançamento nesta seleção.</p>
                ) : (
                  <div className="fin-lista" aria-busy={q.isPlaceholderData}>
                    {q.data.itens.map((t) => (
                      <div className="fin-linha-agil" key={t.id}>
                        <button
                          className="fin-lancamento"
                          disabled={q.isPlaceholderData || busca !== buscaConsulta}
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
                            {t.valor_variavel && (
                              <small>
                                {t.valor_confirmado_em
                                  ? "Variável · valor do mês confirmado"
                                  : "Variável · previsão, confirme o valor do mês"}
                              </small>
                            )}
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
                        {!t.cancelado_em &&
                          !t.transferencia_id &&
                          t.aberto_centavos > 0 && (
                            <button
                              type="button"
                              className="fin-baixa-direta"
                              disabled={
                                ocupado ||
                                q.isPlaceholderData ||
                                busca !== buscaConsulta ||
                                (!!t.valor_variavel && !t.valor_confirmado_em)
                              }
                              title={
                                t.valor_variavel && !t.valor_confirmado_em
                                  ? "Confirme o valor do mês nos detalhes antes de pagar"
                                  : undefined
                              }
                              aria-label={
                                (t.comissao_id
                                  ? "Ver comissão"
                                  : t.natureza === "receber"
                                    ? "Receber"
                                    : "Pagar") +
                                " " +
                                t.descricao
                              }
                              onClick={() => abrir("baixa", t)}
                            >
                              {t.comissao_id
                                ? "Ver comissão"
                                : t.natureza === "receber"
                                  ? "Receber"
                                  : "Pagar"}
                              <ArrowUpRight size={16} />
                            </button>
                          )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="fin-paginacao">
                  <span>
                    {q.data.total} lançamentos · Página {pagina + 1}
                  </span>
                  <button
                    disabled={pagina === 0 || q.isPlaceholderData}
                    onClick={() => setPagina((p) => p - 1)}
                  >
                    Anterior
                  </button>
                  <button
                    disabled={(pagina + 1) * 30 >= q.data.total || q.isPlaceholderData}
                    onClick={() => setPagina((p) => p + 1)}
                  >
                    Próxima
                  </button>
                </div>
              </section>
            )}
            {aba === "os" && (
              <section className="os-painel fin-por-servico">
                <h2>Quanto sobrou em cada serviço?</h2>
                <p>
                  Receita menos peças consumidas, despesas vinculadas e taxas. Ainda
                  será preciso pagar as despesas gerais da empresa.
                </p>
                <details className="fin-explica-pecas">
                  <summary>Como as peças entram no lucro do serviço?</summary>
                  <p>
                    <b>Receita:</b> entra o valor total cobrado do cliente, incluindo
                    serviços e peças, já com o desconto da OS.
                  </p>
                  <p>
                    <b>Peças do estoque:</b> o sistema desconta a quantidade consumida ×
                    o custo registrado no estoque no momento da entrega. Uma peça
                    vendida por R$ 150,00 e consumida ao custo de R$ 100,00 deixa R$
                    50,00 no resultado. Não lance esse custo novamente.
                  </p>
                  <p>
                    <b>Peças compradas por fora:</b> registre o valor de compra em
                    “Adicionar custo”. Ele será descontado integralmente do serviço. Se
                    a peça passou pelo estoque, use o consumo do estoque, sem repetir o
                    lançamento como peça externa.
                  </p>
                  <p>
                    <b>Peças trazidas pelo cliente:</b> não são uma despesa sua. Estoque
                    com custo zerado precisa ser conferido para não mostrar uma sobra
                    maior do que a real.
                  </p>
                </details>
                <p className="texto-suave">
                  Até 100 OS mais recentes entregues no período. O resumo geral
                  considera todas. Custos vinculados podem ter sido registrados em
                  outras datas.
                </p>
                {!q.data.ordens.length && (
                  <p className="estado-lista">Nenhuma OS entregue no período.</p>
                )}
                <div className="fin-os-grid">
                  {q.data.ordens.map((o) => {
                    const sobra = o.valor_centavos - o.pecas - o.despesas - o.taxas;
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
                            <dt>Total vendido · serviços e peças</dt>
                            <dd>{dinheiro(o.valor_centavos)}</dd>
                          </div>
                          <div>
                            <dt>
                              Custo das peças do estoque{" "}
                              <small>Consumo automático na entrega da OS</small>
                            </dt>
                            <dd>− {dinheiro(o.pecas)}</dd>
                          </div>
                          <div>
                            <dt>
                              Custos lançados neste serviço{" "}
                              <small>
                                Peças externas, terceiros e despesas vinculadas
                              </small>
                            </dt>
                            <dd>− {dinheiro(o.despesas)}</dd>
                          </div>
                          <div>
                            <dt>Taxas de recebimento</dt>
                            <dd>− {dinheiro(o.taxas)}</dd>
                          </div>
                          <div className="fin-total">
                            <dt>Sobra antes das despesas gerais</dt>
                            <dd className={sobra < 0 ? "fin-negativo" : "fin-positivo"}>
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
                        <div className="fin-acoes fin-os-botoes">
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
          modal === "novo"
            ? titulo?.natureza === "pagar"
              ? "Nova conta a pagar"
              : "Nova conta a receber"
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
        {modal === "editar" && hist.isError && (
          <p role="alert" className="erro-formulario">
            Não foi possível conferir os pagamentos deste lançamento.{" "}
            {erroPublico(hist.error)}{" "}
            <button type="button" onClick={() => void hist.refetch()}>
              Tentar novamente
            </button>
          </p>
        )}
        {titulo && ["novo", "editar"].includes(modal) && (
          <FormularioTituloFinanceiro
            titulo={titulo}
            ocupado={ocupado}
            modal={modal}
            historicoCarregando={hist.isPending || hist.isError}
            temBaixas={!!hist.data?.length}
            parcelado={parcelado}
            setParcelado={setParcelado}
            parcelas={parcelas}
            setParcelas={setParcelas}
            totalParcelamento={totalParcelamento}
            setTotalParcelamento={setTotalParcelamento}
            primeiroVencimento={primeiroVencimento}
            setPrimeiroVencimento={setPrimeiroVencimento}
            enviarTitulo={enviarTitulo}
          />
        )}
        {titulo && modal === "baixa" && (
          <FormularioBaixaFinanceira
            contas={ativas}
            key={titulo.id}
            titulo={titulo}
            ocupado={ocupado}
            enviarBaixa={enviarBaixa}
          />
        )}
        {titulo && modal === "detalhe" && (
          <div className="fin-detalhe">
            <ValorRecorrente titulo={titulo} aoAtualizar={setTitulo} />
            {titulo.compra_id && (
              <Link to={"/compras?compra=" + titulo.compra_id}>
                Abrir compra e itens recebidos →
              </Link>
            )}
            {titulo.provisorio && (
              <p className="aviso-cliente">
                Adiantamento de OS em andamento: pagamentos entram no caixa. A receita
                só entra no resultado na entrega.
              </p>
            )}
            <span className="sobretitulo">{situacao(titulo)}</span>
            <strong className="fin-valor-grande">
              {dinheiro(titulo.valor_centavos)}
            </strong>
            <p>
              {categorias[titulo.categoria]} · {titulo.pessoa || "Pessoa não informada"}
            </p>
            <dl>
              {!!titulo.credito_fornecedor_centavos && (
                <>
                  <div>
                    <dt>Valor original da compra</dt>
                    <dd>
                      {dinheiro(
                        titulo.valor_centavos + titulo.credito_fornecedor_centavos,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Crédito do fornecedor abatido</dt>
                    <dd>{dinheiro(titulo.credito_fornecedor_centavos)}</dd>
                  </div>
                </>
              )}
              <div>
                <dt>Já {titulo.natureza === "receber" ? "recebido" : "pago"}</dt>
                <dd>{dinheiro(titulo.baixado_centavos)}</dd>
              </div>
              <div>
                <dt>Falta {titulo.natureza === "receber" ? "receber" : "pagar"}</dt>
                <dd>{dinheiro(titulo.aberto_centavos)}</dd>
              </div>
              <div>
                <dt>Vencimento</dt>
                <dd>{dataBR(titulo.vencimento)}</dd>
              </div>
            </dl>
            {titulo.observacoes && <p>{titulo.observacoes}</p>}
            {titulo.cancelado_em && <p>Cancelado: {titulo.motivo_cancelamento}</p>}
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
                      disabled={!!titulo.valor_variavel && !titulo.valor_confirmado_em}
                      onClick={() => {
                        setChave(novoId());
                        if (titulo.comissao_id) {
                          setAba("comissoes");
                          setModal("");
                        } else setModal("baixa");
                      }}
                    >
                      {titulo.natureza === "receber" ? "Receber" : "Pagar"} agora
                    </button>
                  )}
                  {!titulo.automatico &&
                    !titulo.comissao_id &&
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
                Nenhum pagamento registrado. A criação da conta não altera o saldo.
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
                  {b.taxa_centavos > 0 && <p>Taxa: {dinheiro(b.taxa_centavos)}</p>}
                  <p>{b.observacao}</p>
                  {!b.estorno_de && !hist.data.some((x) => x.estorno_de === b.id) && (
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
                <textarea name="motivo" minLength={3} maxLength={1000} required />
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
