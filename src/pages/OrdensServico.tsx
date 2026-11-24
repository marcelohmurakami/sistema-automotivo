import { componenteSobDemanda } from "../lib/componenteSobDemanda";
const FormularioOS = componenteSobDemanda(async () => ({
  default: (await import("../components/ordens-servico/FormularioOS")).FormularioOS,
}));
const ProdutividadeOS = componenteSobDemanda(async () => ({
  default: (await import("../components/ProdutividadeOS")).ProdutividadeOS,
}));
const PdfOS = componenteSobDemanda(async () => ({
  default: (await import("../components/PdfOS")).PdfOS,
}));
const FinanceiroNaOS = componenteSobDemanda(async () => ({
  default: (await import("../components/PagamentosIntegrados")).FinanceiroNaOS,
}));
const LucroServico = componenteSobDemanda(async () => ({
  default: (await import("../components/LucroServico")).LucroServico,
}));
const ComissoesNaOS = componenteSobDemanda(async () => ({
  default: (await import("../components/ComissoesNaOS")).ComissoesNaOS,
}));
const EstoqueNaOS = componenteSobDemanda(async () => ({
  default: (await import("../components/EstoqueNaOS")).EstoqueNaOS,
}));
import { novoId } from "../lib/uuid.ts";
import { FiltrosSituacao } from "../components/FiltrosSituacao";

import { ResumoOS } from "../components/ordens-servico/ResumoOS";
import { AndamentoOS } from "../components/ordens-servico/AndamentoOS";
import { executarAcaoNoMapa, type AcaoRapidaMapa } from "../services/mapaOficina";
import { destinoNoMapa } from "../lib/movimentacaoMapa";
import {
  ConfirmarAutorizacao,
  type ManifestacaoEquipe,
} from "../components/ConfirmarAutorizacao";
import { CobrancaDiagnostico } from "../components/CobrancaDiagnostico";
import { obterProposta } from "../services/orcamentos";
import { abatimentoDiagnostico } from "../lib/diagnosticoOrcamento";
import { ImprimirNotaOS } from "../components/ordens-servico/ImprimirNotaOS";
import { PendenciasFotosOS } from "../components/ordens-servico/PendenciasFotosOS";
import { CompartilharOS } from "../components/ordens-servico/CompartilharOS";
import { FerramentasAtendimento } from "../components/FerramentasAtendimento";
import { ResumoFichaEspecialidade } from "../components/FichaEspecialidade";
import { dinheiro } from "../lib/formatacao";
import { dataServicoDoCampo } from "../lib/dataServico";
import { useBuscaDebounced } from "../lib/useBuscaDebounced";
import { DesistenciaAtendimento } from "../components/DesistenciaAtendimento";
import { IconeTipoServico } from "../components/TipoServico";
import { SecaoRecolhivel } from "../components/SecaoRecolhivel";
import { EtapasExecucao } from "../components/EtapasExecucao";

import { EntregaPrometidaOS } from "../components/EntregaPrometidaOS";
import { IndicadorEntrega, LegendaEntrega } from "../components/PrazoEntrega";
import { classificarEntrega } from "../lib/entregaPrometida";
import { useAgora } from "../lib/useAgora";
import "./OrdensServico.css";
import "../components/ordens-servico/ResumoOS.css";

import { abrirJanelaNotaOS, imprimirNotaOS } from "../services/impressaoNotaOS";
import { dataDocumento } from "../lib/documentoCliente";

import {
  devePerguntarPagamentoOS,
  usePagamentoAposRegistro,
} from "../lib/pagamentoAposRegistro";

import { atualizarIntegracoes } from "../lib/atualizarIntegracoes";

import { PecasNaEntrega } from "../components/PecasNaEntrega";
import { faltaOrigemPeca } from "../lib/origemPecas";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { AssistenteContextual } from "../components/AtalhoAssistente";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  Camera,
  CheckCircle2,
  ArrowRight,
  Car,
  ChevronRight,
  Pencil,
  Trash2,
  RotateCcw,
  Printer,
  CalendarDays,
  X,
} from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { Dialogo } from "../components/Dialogo";
import { erroPublico } from "../lib/supabase";
import { auxiliaresOrcamento } from "../services/orcamentos";
import {
  listarOS,
  autorizarServicoOS,
  excluirOS,
  restaurarOS,
  consultarOS,
  salvarOS,
  operarOS,
  enviarFotoOS,
  urlFotoOS,
  situacoesOS,
  proximasOS,
  type OrdemServico,
} from "../services/ordensServico";
const data = (v: string | null | undefined) =>
  v
    ? new Date(v).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "Não informada";
const fases: Record<string, string> = {
  before: "Antes",
  during: "Durante",
  after: "Depois",
};

function BlocoDetalhesOS({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section className="os-bloco">
      <h3 className="os-bloco-titulo">{titulo}</h3>
      <div className="os-bloco-conteudo">{children}</div>
    </section>
  );
}
function Alteracoes({ metadados }: { metadados?: Record<string, unknown> }) {
  const antes = metadados?.antes as Record<string, unknown> | undefined;
  const depois = metadados?.depois as Record<string, unknown> | undefined;
  if (!antes || !depois) return null;
  const nomes: Record<string, string> = {
    queixa_cliente: "Relato",
    diagnostico: "Diagnóstico",
    observacoes_internas: "Observações internas",
    resumo_cliente: "Resumo",
    responsavel: "Responsável",
    prioridade: "Prioridade",
    data_servico: "Data do serviço",
    quilometragem_entrada: "KM de entrada",
    quilometragem_saida: "KM de saída",
    combustivel_percentual: "Combustível",
    pertences: "Pertences",
    entrega_prevista_em: "Entrega prometida",
    condicoes_garantia: "Garantia",
    garantia_ate: "Garantia até",
    descricao: "Descrição do item",
    quantidade: "Quantidade",
    preco_unitario_centavos: "Preço unitário",
  };
  const campos = Object.keys(nomes).filter(
    (k) => k in depois && String(antes[k] ?? "") !== String(depois[k] ?? ""),
  );
  const formatar = (k: string, v: unknown) =>
    v == null || v === ""
      ? "Não informado"
      : k === "preco_unitario_centavos"
        ? dinheiro(Number(v))
        : k === "entrega_prevista_em"
          ? data(String(v))
          : String(v);
  return campos.length ? (
    <details className="os-detalhes">
      <summary>Ver alterações</summary>
      {campos.map((k) => (
        <p key={k}>
          <strong>{nomes[k]}:</strong> {formatar(k, antes[k])} →{" "}
          {formatar(k, depois[k])}
        </p>
      ))}
    </details>
  ) : null;
}
function Foto({ foto }: { foto: OrdemServico["fotos"][number] }) {
  const consulta = useQuery({
    queryKey: ["foto-os", foto.caminho_arquivo],
    queryFn: () => urlFotoOS(foto.caminho_arquivo),
    staleTime: 180000,
    refetchInterval: 240000,
  });
  return (
    <figure className="os-foto">
      {consulta.data ? (
        <a href={consulta.data} target="_blank" rel="noreferrer">
          <img
            src={consulta.data}
            alt={foto.legenda || `Foto ${fases[foto.fase].toLowerCase()} do serviço`}
            loading="lazy"
          />
        </a>
      ) : (
        <p>
          {consulta.isError ? "Não foi possível carregar a foto." : "Carregando foto…"}
        </p>
      )}
      <figcaption>
        <strong>{fases[foto.fase]}</strong>
        <span>{foto.legenda || "Registro do atendimento"}</span>
        <small>{data(foto.capturado_em)}</small>
      </figcaption>
    </figure>
  );
}

export function OrdensServico() {
  const perguntarPagamento = usePagamentoAposRegistro();
  const agora = useAgora();
  const [parametros, setParametros] = useSearchParams();
  const local = useLocation();
  const [ultimoNovo, setUltimoNovo] = useState<string | null>(null);
  const [autorizacao, setAutorizacao] = useState<{
    os: OrdemServico;
    total: number;
  } | null>(null);
  const acesso = useAcesso(),
    qc = useQueryClient(),
    oficina = acesso.oficina?.id ?? "";
  const [busca, setBusca] = useState(""),
    [filtro, setFiltro] = useState(""),
    [pagina, setPagina] = useState(0);
  const [buscaConfirmada, setBuscaConfirmada] = useState<string | null>(null);
  const emExecucao = useRef(false);
  const id = parametros.get("os");
  const setId = (valor: string | null) => setParametros(valor ? { os: valor } : {});
  const [editor, setEditor] = useState(parametros.get("nova") === "1"),
    [edicao, setEdicao] = useState<OrdemServico | undefined>(),
    [chave, setChave] = useState(() => novoId());
  const [aba, setAba] = useState("atendimento"),
    [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState("");
  const [novaSituacao, setNovaSituacao] = useState(""),
    [motivo, setMotivo] = useState("");
  const [exclusao, setExclusao] = useState<OrdemServico | null>(null),
    [motivoExclusao, setMotivoExclusao] = useState("");
  // Um atalho pode abrir outra OS sem sair desta página.
  if (parametros.get("nova") === "1" && ultimoNovo !== local.key) {
    setUltimoNovo(local.key);
    setEdicao(undefined);
    setChave(novoId());
    setErro("");
    setEditor(true);
  }
  const buscaDebounced = useBuscaDebounced(busca);
  const buscaConsulta = buscaConfirmada === busca ? busca : buscaDebounced;
  const lista = useQuery({
    queryKey: ["os", acesso.demo, oficina, buscaConsulta, filtro, pagina],
    queryFn: ({ signal }) =>
      listarOS(acesso.demo, oficina, buscaConsulta, filtro, pagina, signal),
    refetchInterval: editor || id ? false : 30000,
  });
  const detalhe = useQuery({
    queryKey: ["os-detalhe", acesso.demo, oficina, id],
    queryFn: ({ signal }) => consultarOS(acesso.demo, oficina, id!, signal),
    enabled: !!id,
    staleTime: 5000,
    refetchInterval: editor ? false : 30000,
  });
  const aux = useQuery({
    queryKey: ["aux-orcamento", acesso.demo, oficina],
    queryFn: () => auxiliaresOrcamento(acesso.demo, oficina),
    enabled: editor,
  });
  const o = detalhe.data;
  const [conferirPecas, setConferirPecas] = useState(false);
  const encerrada = !!o && ["delivered", "cancelled"].includes(o.situacao);
  async function executar(fn: () => Promise<unknown>, alterou = true) {
    if (emExecucao.current) return;
    emExecucao.current = true;
    setOcupado(true);
    setErro("");
    setAviso("");
    try {
      await fn();
      if (alterou) await atualizarIntegracoes(qc, ["os-detalhe"]);
    } catch (e) {
      setErro(erroPublico(e));
      const conflito =
        (typeof e === "object" &&
          e !== null &&
          "code" in e &&
          ["PT409", "40001"].includes(String(e.code))) ||
        (acesso.demo &&
          e instanceof Error &&
          /^(?:Esta )?OS (?:foi )?alterada/.test(e.message));
      const idAlterado = editor ? (edicao?.id ?? id) : id;
      if (conflito && idAlterado) {
        // Preserva o formulário digitado. Ao fechar e reabrir, usa a revisão atual,
        // sem esperar a próxima consulta periódica nem sobrescrever outro usuário.
        const queryKey = ["os-detalhe", acesso.demo, oficina, idAlterado];
        await qc.cancelQueries({ queryKey, exact: true });
        await qc
          .fetchQuery({
            queryKey,
            queryFn: ({ signal }) =>
              consultarOS(acesso.demo, oficina, idAlterado, signal),
            staleTime: 0,
          })
          .catch(() => {});
      }
    } finally {
      emExecucao.current = false;
      setOcupado(false);
    }
  }
  function autorizar(os: OrdemServico, manifestacao?: ManifestacaoEquipe) {
    if (!manifestacao) {
      void executar(async () => {
        const q = await obterProposta(acesso.demo, oficina, os.orcamento_pendente!.id);
        setAutorizacao({
          os,
          total:
            q.versao.total_centavos -
            abatimentoDiagnostico(q.versao.taxa_diagnostico, q.versao.total_centavos),
        });
      }, false);
      return;
    }
    void executar(async () => {
      await autorizarServicoOS(acesso.demo, oficina, os, manifestacao);
      setAutorizacao(null);
      await qc.invalidateQueries({ queryKey: ["orcamentos"] });
      setAviso(
        `OS #${os.numero} autorizada. Serviços incluídos e prontos para iniciar.`,
      );
    });
  }
  function botaoAutorizar(os: OrdemServico) {
    return os.orcamento_pendente?.pode_autorizar &&
      !os.arquivado_em &&
      !["cancelled", "delivered"].includes(os.situacao) ? (
      <button
        className="botao-secundario autorizar-os"
        disabled={ocupado}
        aria-label={`Autorizar serviço da OS #${os.numero}`}
        title="Autorizar todos os itens do orçamento pela oficina"
        onClick={() => autorizar(os)}
      >
        <CheckCircle2 size={17} /> {ocupado ? "Aguarde…" : "Autorizar serviço"}
      </button>
    ) : null;
  }
  function abrirEditor(atual?: OrdemServico) {
    setEdicao(atual);
    setChave(novoId());
    setErro("");
    setAviso("");
    setEditor(true);
  }
  async function editarNaLista(idOS: string) {
    await executar(async () => {
      const atual = await consultarOS(acesso.demo, oficina, idOS);
      if (atual.arquivado_em || ["delivered", "cancelled"].includes(atual.situacao))
        throw new Error(
          "OS encerrada: histórico preservado. Consulte os detalhes do atendimento.",
        );
      qc.setQueryData(["os-detalhe", acesso.demo, oficina, atual.id], atual);
      abrirEditor(atual);
    }, false);
  }
  async function operar(acao: string, dados: Record<string, unknown>) {
    if (!o) return;
    await operarOS(acesso.demo, oficina, o, acao, dados);
  }
  async function alterarSituacao(atual: OrdemServico, destino: string) {
    await operarOS(acesso.demo, oficina, atual, "atualizar_mapa_ordem_servico", {
      p_revisao_esperada: atual.revisao,
      p_situacao: destino,
      p_etapa: atual.etapa_id ?? null,
      p_local: atual.local_id ?? null,
      p_entrega_prevista_em: atual.entrega_prevista_em,
      p_recebido_em: atual.recebido_em ?? new Date().toISOString(),
      p_motivo_cancelamento: motivo || null,
    });
    setNovaSituacao("");
    setAviso("Situação atualizada.");
    if (devePerguntarPagamentoOS(atual.situacao, destino))
      perguntarPagamento({ tipo: "os", id: atual.id, contexto: "entrega" });
  }
  async function acaoAndamento(acao: AcaoRapidaMapa) {
    if (!o) return false;
    let salvo = false;
    await executar(async () => {
      await executarAcaoNoMapa(acesso.demo, oficina, o.id, o.revisao, acao);
      salvo = true;
      setAviso(
        acao.acao === "parar"
          ? "Serviço pausado."
          : acao.acao === "retomar"
            ? "Serviço retomado."
            : "Serviço concluído. OS pronta para entrega.",
      );
    });
    return salvo;
  }
  function formulario(
    e: FormEvent<HTMLFormElement>,
    fn: (f: FormData) => Promise<unknown>,
  ) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    void executar(async () => {
      await fn(f);
      form.reset();
      setAviso("Registro salvo.");
    });
  }
  return (
    <>
      <div className="titulo-pagina">
        <div>
          <div className="sobretitulo">
            <span className="linha-verde" />
            CADA SERVIÇO, DO INÍCIO À ENTREGA
          </div>
          <h1>
            Ordens de serviço<span>.</span>
          </h1>
        </div>
        <button
          className="botao-primario"
          data-preparar-modulo="formularioOS"
          onClick={() => abrirEditor()}
        >
          <Plus size={18} />
          Nova OS
        </button>
      </div>
      {acesso.demo && (
        <p className="nota-demo">
          Demonstração · Dados e fotos ficam somente neste navegador.
        </p>
      )}
      {!id && !editor && !exclusao && erro && (
        <p role="alert" className="erro-formulario">
          {erro}
        </p>
      )}
      {!id && !editor && !exclusao && aviso && (
        <p role="status" className="aviso-cliente">
          {aviso}
        </p>
      )}
      <section className="painel-registros painel-listagem-os">
        <div className="registros-cabecalho">
          <div>
            <h2>
              Suas ordens{" "}
              <span className="contagem-total">{lista.data?.total ?? "—"}</span>
            </h2>
          </div>
          <label className="campo-busca">
            <Search size={18} />
            <input
              aria-label="Buscar ordens de serviço"
              placeholder={
                acesso.oficina?.especialidade === "retifica"
                  ? "Cliente, carro, motor ou número"
                  : "Cliente, placa, veículo ou número"
              }
              value={busca}
              maxLength={200}
              onChange={(e) => {
                setBusca(e.target.value);
                setBuscaConfirmada(null);
                setPagina(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  setBuscaConfirmada(busca);
                }
              }}
            />
            {busca && (
              <button
                type="button"
                className="botao-icone"
                aria-label="Limpar busca de ordens de serviço"
                onClick={() => {
                  setBusca("");
                  setBuscaConfirmada("");
                  setPagina(0);
                }}
              >
                <X size={16} />
              </button>
            )}
          </label>
        </div>
        <div className="filtros-propostas filtros-listagem-os">
          <FiltrosSituacao
            rotulo="Filtrar ordens de serviço"
            valor={filtro}
            alterar={(valor) => {
              setFiltro(valor);
              setPagina(0);
            }}
            principais={[
              { valor: "", nome: "Todas" },
              { valor: "open", nome: "Recebidas", tom: "atencao" },
              { valor: "in_progress", nome: "Em execução", tom: "andamento" },
              { valor: "ready", nome: "Prontas", tom: "concluido" },
            ]}
            outras={[
              { valor: "quality_check", nome: "Conferência" },
              { valor: "delivered", nome: "Entregues" },
              { valor: "cancelled", nome: "Canceladas" },
              { valor: "excluidas", nome: "Excluídas" },
            ]}
          />
          <LegendaEntrega />
        </div>
        {lista.isPending ? (
          <p className="estado-lista" role="status">
            Carregando ordens…
          </p>
        ) : lista.isError ? (
          <p className="estado-lista" role="alert">
            {erroPublico(lista.error)}{" "}
            <button onClick={() => void lista.refetch()}>Tentar novamente</button>
          </p>
        ) : !lista.data.itens.length ? (
          <div className="estado-lista">
            <Car size={34} />
            <h2>
              {busca || filtro
                ? "Nenhuma OS encontrada"
                : "Seu próximo atendimento começa aqui"}
            </h2>
            {busca || filtro ? (
              <>
                <p>Tente outro termo ou volte à lista completa.</p>
                <button
                  type="button"
                  className="botao-secundario"
                  onClick={() => {
                    setBusca("");
                    setFiltro("");
                    setPagina(0);
                  }}
                >
                  Limpar filtros
                </button>
              </>
            ) : (
              <>
                <p>
                  Cliente, serviço e valor. O restante você completa quando precisar.
                </p>
                <button
                  type="button"
                  className="botao-primario"
                  onClick={() => abrirEditor()}
                >
                  <Plus size={17} />
                  Criar primeira OS
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="lista-ordens-servico">
            {lista.data.itens.map((w) => {
              const dataServico = dataServicoDoCampo(w);
              const dataServicoFormatada = dataDocumento(dataServico, false);
              return (
                <article className="registro-os" key={w.id}>
                  <button
                    className="linha-ordem-servico"
                    aria-label={`Abrir OS #${w.numero} de ${w.dados_cliente.nome}, data do serviço ${dataServicoFormatada}`}
                    data-prazo={
                      classificarEntrega(w.entrega_prevista_em, w.situacao, agora).tipo
                    }
                    onClick={() => {
                      setId(w.id);
                      setAba("atendimento");
                      setErro("");
                      setAviso("");
                    }}
                  >
                    <span className="os-lista-numero" aria-hidden="true">
                      <small>OS</small>
                      <strong>#{String(w.numero).padStart(4, "0")}</strong>
                    </span>
                    <span className="os-lista-identificacao">
                      <IconeTipoServico tipo={w.tipo_servico} />{" "}
                      <strong>{w.dados_veiculo.modelo}</strong>
                      <small>
                        {w.dados_cliente.nome}
                        {acesso.oficina?.especialidade === "retifica"
                          ? w.dados_veiculo.motor
                            ? ` · ${w.dados_veiculo.motor}`
                            : ""
                          : w.dados_veiculo.placa
                            ? ` · ${w.dados_veiculo.placa}`
                            : ""}
                      </small>
                      <span className="os-lista-data-servico">
                        <CalendarDays size={14} aria-hidden="true" />
                        <span>
                          Data do serviço:{" "}
                          <time dateTime={dataServico}>{dataServicoFormatada}</time>
                        </span>
                      </span>
                    </span>
                    <span className="os-lista-situacao">
                      <span className={"os-status " + w.situacao}>
                        {w.arquivado_em ? "Excluída" : situacoesOS[w.situacao]}
                      </span>
                      {!w.arquivado_em &&
                        (w.paradas_abertas ??
                          w.paradas?.filter((p) => !p.encerrado_em).length) > 0 && (
                          <span className="os-parada">Serviço parado</span>
                        )}
                    </span>
                    <span className="os-lista-entrega">
                      <IndicadorEntrega
                        prazo={classificarEntrega(
                          w.entrega_prevista_em,
                          w.situacao,
                          agora,
                        )}
                      />
                    </span>
                    <strong className="os-lista-total">
                      {dinheiro(w.total_centavos)}
                    </strong>
                    <ChevronRight
                      className="os-lista-seta"
                      size={18}
                      aria-hidden="true"
                    />
                  </button>
                  <div className="acoes-linha-os">
                    <Link
                      className="botao-icone"
                      to={`/documentos?tipo=os&id=${w.id}&origem=os`}
                      title="Baixar ou imprimir a OS"
                      aria-label={`Imprimir ou baixar PDF da OS #${w.numero}`}
                    >
                      <Printer size={18} />
                    </Link>
                    {w.arquivado_em ? (
                      <button
                        className="botao-icone"
                        title="Restaurar OS"
                        aria-label={`Restaurar OS #${w.numero}`}
                        disabled={ocupado}
                        onClick={() =>
                          void executar(async () => {
                            await restaurarOS(acesso.demo, oficina, w);
                            setAviso(
                              `OS #${w.numero} restaurada como ${situacoesOS[w.situacao].toLowerCase()}.`,
                            );
                            setPagina(0);
                          })
                        }
                      >
                        <RotateCcw size={18} />
                      </button>
                    ) : (
                      <>
                        <button
                          className="botao-icone"
                          title={
                            ["delivered", "cancelled"].includes(w.situacao)
                              ? "OS encerrada: histórico preservado"
                              : "Editar OS"
                          }
                          aria-label={`Editar OS #${w.numero}`}
                          disabled={
                            ocupado || ["delivered", "cancelled"].includes(w.situacao)
                          }
                          onClick={() => void editarNaLista(w.id)}
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          className="botao-icone excluir-os"
                          title="Excluir OS"
                          aria-label={`Excluir OS #${w.numero}`}
                          disabled={ocupado}
                          onClick={() => {
                            setExclusao(w);
                            setMotivoExclusao("");
                            setErro("");
                            setAviso("");
                          }}
                        >
                          <Trash2 size={18} />
                        </button>
                      </>
                    )}
                  </div>
                  {!w.arquivado_em &&
                    w.orcamento_aguardando_id &&
                    w.situacao !== "cancelled" && (
                      <div className="autorizacao-linha-os">
                        <span>
                          Aguardando aprovação
                          {w.orcamento_pendente && (
                            <>
                              {" "}
                              · Orçamento #{w.orcamento_pendente.numero} ·{" "}
                              <strong>
                                {dinheiro(w.orcamento_pendente.total_centavos)}
                              </strong>
                            </>
                          )}
                        </span>
                        {botaoAutorizar(w)}
                      </div>
                    )}
                  {w.arquivado_em && (
                    <p className="motivo-exclusao-os">Motivo: {w.motivo_exclusao}</p>
                  )}
                </article>
              );
            })}
          </div>
        )}
        <div className="paginacao-clientes">
          <span>
            {lista.data?.total ?? 0} OS · Página {pagina + 1}
          </span>
          <div>
            <button
              className="botao-secundario"
              disabled={!pagina}
              onClick={() => setPagina((p) => p - 1)}
            >
              Anterior
            </button>
            <button
              className="botao-secundario"
              disabled={(pagina + 1) * 24 >= (lista.data?.total ?? 0)}
              onClick={() => setPagina((p) => p + 1)}
            >
              Próxima
            </button>
          </div>
        </div>
      </section>
      <Dialogo
        aberto={!!exclusao}
        titulo={`Excluir OS #${exclusao?.numero ?? ""}?`}
        fechar={() => {
          if (!ocupado) {
            setExclusao(null);
            setErro("");
          }
        }}
      >
        <form
          className="formulario-cliente"
          onSubmit={(e) => {
            e.preventDefault();
            if (!exclusao) return;
            void executar(async () => {
              await excluirOS(acesso.demo, oficina, exclusao, motivoExclusao);
              setAviso(
                `OS #${exclusao.numero} excluída. Você pode restaurá-la em Mais situações → Excluídas.`,
              );
              setExclusao(null);
              setPagina(0);
            });
          }}
        >
          <p className="texto-suave">
            A OS sairá da lista. Itens, fotos, histórico e lançamentos já realizados
            serão preservados.
            {exclusao && !["delivered", "cancelled"].includes(exclusao.situacao)
              ? " O atendimento em andamento será cancelado. Se houver valores recebidos, será necessário estorná-los antes. Ao restaurar, a OS continuará cancelada."
              : " Ao restaurar, a situação atual será mantida."}
          </p>
          <label>
            Motivo da exclusão
            <textarea
              required
              minLength={3}
              maxLength={1000}
              rows={3}
              value={motivoExclusao}
              disabled={ocupado}
              placeholder="Ex.: OS duplicada ou atendimento aberto por engano"
              onChange={(e) => setMotivoExclusao(e.target.value)}
            />
          </label>
          {erro && (
            <p className="erro-formulario" role="alert">
              {erro}
            </p>
          )}
          <div className="acoes-formulario">
            <button
              type="button"
              className="botao-secundario"
              disabled={ocupado}
              onClick={() => {
                setExclusao(null);
                setErro("");
              }}
            >
              Voltar
            </button>
            <button
              className="botao-perigo"
              disabled={ocupado || motivoExclusao.trim().length < 3}
            >
              {ocupado ? "Excluindo…" : "Excluir OS"}
            </button>
          </div>
        </form>
      </Dialogo>
      <Dialogo
        aberto={editor}
        fechar={() => {
          if (!ocupado) {
            setEditor(false);
            if (parametros.has("nova")) setParametros({});
          }
        }}
        titulo={edicao ? `Editar OS #${edicao.numero}` : "Nova ordem de serviço"}
        classe="dialogo-orcamento"
      >
        {erro && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        {aux.isError ? (
          <p role="alert">{erroPublico(aux.error)}</p>
        ) : aux.data && editor ? (
          <FormularioOS
            key={chave}
            clienteInicial={parametros.get("cliente") || ""}
            aux={aux.data}
            anterior={edicao}
            ocupado={ocupado}
            salvar={(d, fotos) => {
              if (emExecucao.current) return;
              const prontoNaCriacao = !edicao && d.servico_pronto === true;
              // Reserva a impressão no clique para não ser bloqueada pelo navegador.
              // O pagamento será conferido na entrega, não ao deixar a OS pronta.
              const janela = prontoNaCriacao ? abrirJanelaNotaOS() : undefined;
              void executar(async () => {
                let salvo: OrdemServico;
                let avisoFotos = "";
                try {
                  salvo = await salvarOS(acesso.demo, oficina, d, chave, edicao);
                } catch (e) {
                  janela?.close();
                  throw e;
                }
                if (fotos.length) {
                  const { guardarFotosCriacaoOS, enviarFotosCriacaoOS } =
                    await import("../services/fotosCriacaoOS");
                  let rascunho;
                  if (!acesso.demo) {
                    try {
                      rascunho = await guardarFotosCriacaoOS(
                        acesso.usuario!,
                        oficina,
                        salvo,
                        fotos,
                      );
                    } catch (e) {
                      // A OS já existe: uma nova tentativa deve editar a mesma OS.
                      setEdicao(salvo);
                      janela?.close();
                      throw new Error(
                        `OS #${salvo.numero} salva. Não feche esta tela: não foi possível guardar as fotos no aparelho. ${erroPublico(e)}`,
                        { cause: e },
                      );
                    }
                  }
                  try {
                    salvo = await enviarFotosCriacaoOS(
                      acesso.demo,
                      acesso.usuario!,
                      oficina,
                      salvo,
                      fotos,
                      rascunho,
                    );
                  } catch (e) {
                    if (acesso.demo) {
                      setEdicao(salvo);
                      janela?.close();
                      throw e;
                    }
                    avisoFotos =
                      " Fotos aguardando envio; os arquivos estão guardados neste aparelho. Use Tentar enviar fotos novamente.";
                  }
                  void qc.invalidateQueries({
                    queryKey: ["fotos-os-pendentes", acesso.usuario, oficina, salvo.id],
                  });
                }
                // A RPC já devolve a ficha completa e a revisão confirmada.
                await qc.cancelQueries({
                  queryKey: ["os-detalhe", acesso.demo, oficina, salvo.id],
                  exact: true,
                });
                qc.setQueryData(["os-detalhe", acesso.demo, oficina, salvo.id], salvo);
                void atualizarIntegracoes(
                  qc,
                  [],
                  [["os-detalhe", acesso.demo, oficina, salvo.id]],
                ).catch(() => {});
                setEditor(false);
                setId(salvo.id);
                setAba("atendimento");
                setAviso(
                  (d.servico_pronto
                    ? "OS salva como pronta para entrega."
                    : "Atendimento salvo.") + avisoFotos,
                );
                if (prontoNaCriacao) {
                  void imprimirNotaOS(acesso.demo, oficina, salvo.id, janela).catch(
                    () =>
                      setAviso(
                        "OS salva como pronta. Não foi possível abrir a impressão; use Imprimir nota da OS ou Visualizar / PDF.",
                      ),
                  );
                }
              }, false);
            }}
          />
        ) : (
          <p>Carregando clientes e veículos…</p>
        )}
      </Dialogo>
      <Dialogo
        aberto={!!id && !editor}
        fechar={() => {
          if (!ocupado) {
            setId(null);
            setParametros({});
          }
        }}
        titulo={o ? `Ordem de serviço #${o.numero}` : "Ordem de serviço"}
        acoesCabecalho={
          o && (
            <AssistenteContextual
              contexto={{
                os: o.id,
                cliente: o.cliente_id || undefined,
                titulo: `OS #${o.numero} · ${o.dados_cliente.nome}`,
              }}
            />
          )
        }
        classe="dialogo-orcamento dialogo-detalhes-os"
        complementoCabecalho={
          o &&
          !encerrada &&
          !o.arquivado_em && (
            <AndamentoOS
              key={o.id}
              os={o}
              ocupado={ocupado}
              erro={erro}
              limparErro={() => setErro("")}
              operar={acaoAndamento}
              avancar={(destino) => {
                if (destino === "delivered") {
                  setNovaSituacao(destino);
                  setMotivo("");
                  setErro("");
                } else void executar(() => alterarSituacao(o, destino));
              }}
            />
          )
        }
      >
        {erro && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        {aviso && (
          <p role="status" className="aviso-cliente">
            {aviso}
          </p>
        )}
        {detalhe.isError ? (
          <p role="alert">{erroPublico(detalhe.error)}</p>
        ) : !o ? (
          <p>Carregando atendimento…</p>
        ) : (
          <>
            <PendenciasFotosOS key={o.id} osId={o.id} />
            <div className="os-cabecalho os-cabecalho-resumo">
              <div className="os-identificacao-principal">
                <span className={"os-status " + o.situacao}>
                  {situacoesOS[o.situacao]}
                </span>
                <span className="os-resumo-rotulo">Cliente</span>
                <h2>{o.dados_cliente.nome}</h2>
                <p>
                  {o.tipo_servico && <IconeTipoServico tipo={o.tipo_servico} />}
                  {o.dados_veiculo.modelo}
                  {(acesso.oficina?.especialidade === "retifica"
                    ? o.dados_veiculo.motor
                    : o.dados_veiculo.placa) && (
                    <span>
                      {" "}
                      ·{" "}
                      {acesso.oficina?.especialidade === "retifica"
                        ? o.dados_veiculo.motor
                        : o.dados_veiculo.placa}
                    </span>
                  )}
                </p>
              </div>
              <div className="os-data-principal">
                <CalendarDays size={20} aria-hidden="true" />
                <div>
                  <span>Data do serviço</span>
                  <time dateTime={dataServicoDoCampo(o)}>
                    {dataDocumento(dataServicoDoCampo(o), false)}
                  </time>
                </div>
              </div>
              <div className="os-cabecalho-acoes">
                <ImprimirNotaOS key={o.id} osId={o.id} />
                <CompartilharOS key={`compartilhar-${o.id}`} os={o} />
                {!encerrada && !o.arquivado_em && (
                  <button
                    className="botao-secundario os-editar-rapido"
                    disabled={ocupado}
                    onClick={() => abrirEditor(o)}
                  >
                    <Pencil size={16} /> Editar OS
                  </button>
                )}
              </div>
            </div>
            <FerramentasAtendimento
              tipo="os"
              id={o.id}
              atualizar={() => void detalhe.refetch()}
            />
            {o.situacao === "cancelled" && o.motivo_cancelamento && (
              <p className="aviso-cliente">{o.motivo_cancelamento}</p>
            )}
            {o.arquivado_em && (
              <p className="aviso-cliente">OS excluída. Motivo: {o.motivo_exclusao}</p>
            )}
            {!o.arquivado_em && o.orcamento_aguardando_id && !encerrada && (
              <div className="autorizacao-detalhe-os">
                <div>
                  <strong>Aguardando aprovação</strong>
                  <p>
                    {o.orcamento_pendente
                      ? `Orçamento #${o.orcamento_pendente.numero} · ${dinheiro(o.orcamento_pendente.total_centavos)}`
                      : "Confira o orçamento vinculado."}
                  </p>
                  <Link to={`/orcamentos?orcamento=${o.orcamento_aguardando_id}`}>
                    Conferir orçamento
                  </Link>
                </div>
                {botaoAutorizar(o)}
              </div>
            )}
            <nav
              className="os-abas os-abas-simples"
              aria-label="Seções da ordem de serviço"
            >
              {[
                ["atendimento", "Resumo"],
                ["execucao", "Serviços"],
                ["fotos", "Fotos"],
                ...(acesso.permite("finance") && acesso.oficina?.perfil !== "staff"
                  ? [["lucro", "Lucro e custos"]]
                  : []),
              ].map(([k, v]) => (
                <button
                  key={k}
                  aria-current={aba === k ? "page" : undefined}
                  onClick={() => setAba(k)}
                >
                  {v}
                </button>
              ))}
              <label className="os-mais-secoes">
                <span className="sr-only">Mais seções da OS</span>
                <select
                  aria-label="Mais seções da OS"
                  value={
                    ["atendimento", "execucao", "fotos", "lucro"].includes(aba)
                      ? ""
                      : aba
                  }
                  onChange={(e) => e.target.value && setAba(e.target.value)}
                >
                  <option value="" disabled>
                    Mais opções
                  </option>
                  <option value="detalhes">Dados do atendimento</option>
                  {acesso.permite("finance") && acesso.oficina?.perfil !== "staff" && (
                    <>
                      <option value="pagamento">Pagamento</option>
                      <option value="comissoes">Comissões</option>
                    </>
                  )}
                  <option value="documentos">Imprimir / PDF</option>
                  <option value="historico">Histórico</option>
                  <option value="produtividade">Vistoria e ferramentas</option>
                  <option value="etapas">Etapas e terceiros</option>
                </select>
              </label>
            </nav>
            <div className="os-conteudo-aba">
              {aba === "lucro" &&
                acesso.permite("finance") &&
                acesso.oficina?.perfil !== "staff" && <LucroServico id={o.id} />}
              {aba === "pagamento" &&
                acesso.permite("finance") &&
                acesso.oficina?.perfil !== "staff" && <FinanceiroNaOS os={o} />}
              {aba === "comissoes" && <ComissoesNaOS key={o.id} os={o} />}
              {aba === "documentos" && (
                <BlocoDetalhesOS titulo="Documento para o cliente">
                  <p>
                    Confira a OS com a identidade da oficina antes de imprimir ou
                    baixar.
                  </p>
                  <PdfOS os={o} />
                </BlocoDetalhesOS>
              )}
              {aba === "etapas" && (
                <EtapasExecucao
                  key={o.id}
                  os={o}
                  atualizar={() => void detalhe.refetch()}
                />
              )}
              {aba === "produtividade" && (
                <ProdutividadeOS
                  key={o.id}
                  os={o}
                  atualizar={() => void detalhe.refetch()}
                />
              )}
              {aba === "atendimento" && (
                <ResumoOS
                  os={o}
                  verSecao={setAba}
                  permitePagamento={
                    acesso.permite("finance") && acesso.oficina?.perfil !== "staff"
                  }
                />
              )}
              {aba === "atendimento" &&
                (o.orcamento_origem_id || o.orcamento_aguardando_id) && (
                  <CobrancaDiagnostico
                    documento={(o.orcamento_origem_id || o.orcamento_aguardando_id)!}
                    tipo="automotivo"
                  />
                )}
              {aba === "detalhes" && (
                <div className="os-secao">
                  <div className="os-resumo-operacao">
                    {!encerrada && !o.arquivado_em && (
                      <BlocoDetalhesOS titulo="Outras alterações de situação">
                        <div className="os-proximos">
                          {proximasOS[o.situacao]
                            .filter((s) => s !== destinoNoMapa(o.situacao, "avancar"))
                            .map((s) => (
                              <button
                                className={
                                  s === "cancelled" ||
                                  s === "open" ||
                                  (s === "quality_check" && o.situacao === "ready") ||
                                  (s === "in_progress" && o.situacao !== "open")
                                    ? "botao-secundario"
                                    : "botao-primario"
                                }
                                key={s}
                                disabled={
                                  ocupado ||
                                  (!!o.orcamento_aguardando_id && s !== "cancelled")
                                }
                                onClick={() => {
                                  setNovaSituacao(s);
                                  setMotivo("");
                                  setErro("");
                                }}
                              >
                                {s === "cancelled"
                                  ? "Cancelar OS"
                                  : (
                                      {
                                        open: "Voltar à recepção",
                                        in_progress:
                                          o.situacao === "open"
                                            ? "Iniciar serviço"
                                            : "Retomar serviço",
                                        quality_check:
                                          o.situacao === "ready"
                                            ? "Voltar à conferência"
                                            : "Conferir serviço",
                                        ready: "Pronto para entrega",
                                        delivered: "Registrar entrega",
                                      } as Record<string, string>
                                    )[s] || situacoesOS[s]}
                                <ArrowRight size={16} />
                              </button>
                            ))}
                        </div>
                      </BlocoDetalhesOS>
                    )}
                    <EntregaPrometidaOS
                      key={o.id}
                      os={o}
                      agora={agora}
                      demo={acesso.demo}
                      oficina={oficina}
                      ocupado={ocupado}
                      executar={executar}
                    />
                  </div>
                  <div className="os-resumo">
                    <div>
                      <small>RESPONSÁVEL</small>
                      <strong>{o.responsavel || "Não definido"}</strong>
                    </div>
                    <div>
                      <small>VALOR DA OS</small>
                      <strong>{dinheiro(o.total_centavos)}</strong>
                      {acesso.permite("finance") &&
                        acesso.oficina?.perfil !== "staff" && (
                          <button
                            className="link-pagamento-os"
                            onClick={() => setAba("pagamento")}
                          >
                            Ver pagamento →
                          </button>
                        )}
                    </div>
                    <div>
                      <small>ENTRADA</small>
                      <strong>{data(o.recebido_em)}</strong>
                    </div>
                  </div>
                  <ResumoFichaEspecialidade ficha={o.ficha_especialidade} />
                  <div className="os-relatos">
                    <BlocoDetalhesOS titulo="Relato do cliente">
                      <p className="os-texto">{o.queixa_cliente || "Não informado"}</p>
                    </BlocoDetalhesOS>
                    <BlocoDetalhesOS titulo="Detalhes do tipo de serviço">
                      <p className="os-texto">
                        {o.detalhes_especialidade || "Não informado"}
                      </p>
                    </BlocoDetalhesOS>
                    <BlocoDetalhesOS titulo="Diagnóstico">
                      <p className="os-texto">
                        {o.diagnostico || "Diagnóstico não registrado neste campo"}
                        {o.pecas_a_trocar && (
                          <span className="texto-documento">
                            <strong>Relação de peças a trocar</strong>
                            <br />
                            {o.pecas_a_trocar}
                          </span>
                        )}
                        {o.codigos_falha && (
                          <span className="texto-documento">
                            <strong>Códigos de falha / testes</strong>
                            <br />
                            {o.codigos_falha}
                          </span>
                        )}
                      </p>
                    </BlocoDetalhesOS>
                  </div>
                  <SecaoRecolhivel titulo="Dados completos do atendimento">
                    <dl className="os-dados-atendimento">
                      {[
                        ["KM de entrada", o.quilometragem_entrada],
                        ["KM de saída", o.quilometragem_saida],
                        ["Combustível (%)", o.combustivel_percentual],
                        ["Pertences", o.pertences],
                        ["Observações internas", o.observacoes_internas],
                        ["Observações", o.resumo_cliente],
                        ["Garantia", o.condicoes_garantia],
                        ["Garantia até", o.garantia_ate],
                      ].map(([k, v]) => (
                        <div key={String(k)}>
                          <dt>{k}</dt>
                          <dd>{v == null || v === "" ? "Não informado" : v}</dd>
                        </div>
                      ))}
                    </dl>
                  </SecaoRecolhivel>
                  {o.orcamento_origem_id && (
                    <p className="aviso-cliente">
                      Originada de orçamento aprovado. A proposta original permanece
                      registrada; os serviços atuais estão na aba Serviços.
                    </p>
                  )}
                  {!!Object.keys(o.checklist || {}).length && (
                    <SecaoRecolhivel
                      titulo="Conferência do atendimento"
                      descricao={
                        Object.values(o.checklist || {}).filter(Boolean).length +
                        " de " +
                        Object.keys(o.checklist || {}).length +
                        " itens conferidos"
                      }
                    >
                      <div className="os-checklist">
                        {Object.keys(o.checklist || {}).map((c) => (
                          <p key={c}>
                            <CheckCircle2
                              size={17}
                              color={o.checklist?.[c] ? "#47732b" : "#a0a6a0"}
                            />
                            {c}
                            <span>{o.checklist?.[c] ? "Conferido" : "Pendente"}</span>
                          </p>
                        ))}
                      </div>
                    </SecaoRecolhivel>
                  )}
                  {!encerrada && (
                    <div className="os-acoes-rodape">
                      {!o.arquivado_em && (
                        <DesistenciaAtendimento
                          tipo="os"
                          id={o.id}
                          revisao={o.revisao}
                          aprovado={!!o.orcamento_origem_id}
                          atualizar={async () => {
                            await detalhe.refetch();
                          }}
                        />
                      )}
                      <button
                        className="botao-secundario"
                        onClick={() => abrirEditor(o)}
                      >
                        Editar OS e serviços
                      </button>
                    </div>
                  )}
                </div>
              )}
              {aba === "execucao" && (
                <div className="os-secao">
                  <BlocoDetalhesOS titulo="Peças e serviços">
                    {!encerrada && !o.orcamento_aguardando_id && (
                      <div className="os-editor-acesso">
                        <button
                          className="botao-primario"
                          disabled={ocupado}
                          onClick={() => abrirEditor(o)}
                        >
                          <Pencil size={17} /> Incluir, editar ou remover serviços
                        </button>
                      </div>
                    )}
                    {!o.itens.length && (
                      <p className="texto-suave">
                        {o.orcamento_aguardando_id
                          ? "Os itens serão incluídos quando o cliente aprovar o orçamento."
                          : "Nenhum item incluído. Adicione uma peça ou serviço abaixo."}
                      </p>
                    )}
                    {o.itens.map((i) => (
                      <div className="os-item" key={i.id}>
                        <div>
                          <strong>{i.descricao}</strong>
                          <small>
                            {i.quantidade} {i.unidade} ·{" "}
                            {dinheiro(i.preco_unitario_centavos)} · Total{" "}
                            {dinheiro(
                              Math.round(i.quantidade * i.preco_unitario_centavos),
                            )}
                          </small>
                        </div>
                        <select
                          aria-label={`Execução de ${i.descricao}`}
                          disabled={ocupado || encerrada || o.situacao === "ready"}
                          value={i.situacao}
                          onChange={(e) =>
                            void executar(() =>
                              operar("salvar_item_os", {
                                p_revisao: o.revisao,
                                p_item: i.id,
                                p_dados: { situacao: e.target.value },
                              }),
                            )
                          }
                        >
                          <option value="pending">Pendente</option>
                          <option value="in_progress">Em execução</option>
                          <option value="done">Concluído</option>
                          <option value="cancelled" disabled>
                            Cancelado
                          </option>
                        </select>
                      </div>
                    ))}
                  </BlocoDetalhesOS>
                  {!o.orcamento_aguardando_id && (
                    <SecaoRecolhivel
                      titulo="Peças do estoque"
                      descricao="Adicionar peças e informar de onde elas vieram"
                    >
                      <EstoqueNaOS
                        os={o}
                        ocupado={ocupado}
                        executar={executar}
                        operar={operar}
                      />
                    </SecaoRecolhivel>
                  )}
                  <BlocoDetalhesOS titulo="Paradas e pendências">
                    {!o.paradas.some((p) => !p.encerrado_em) && (
                      <p className="texto-suave">Nenhuma pendência em aberto.</p>
                    )}
                    {o.paradas
                      .filter((p) => !p.encerrado_em)
                      .map((p) => (
                        <div className="os-bloqueio" key={p.id}>
                          <p>{p.detalhes}</p>
                          {!encerrada && (
                            <button
                              disabled={
                                ocupado ||
                                (!!o.orcamento_aguardando_id && p.motivo === "approval")
                              }
                              onClick={() =>
                                void executar(() =>
                                  operar("resolver_parada_os", {
                                    p_parada: p.id,
                                  }),
                                )
                              }
                            >
                              Marcar como resolvida
                            </button>
                          )}
                        </div>
                      ))}
                  </BlocoDetalhesOS>
                </div>
              )}
              {aba === "fotos" && (
                <div className="os-secao">
                  {!encerrada && acesso.permite("service_media") && (
                    <BlocoDetalhesOS titulo="Adicionar foto">
                      <form
                        className="formulario-cliente os-envio"
                        onSubmit={(e) =>
                          formulario(e, async (f) => {
                            const arquivo = f.get("foto") as File;
                            if (!arquivo?.size) throw new Error("Selecione uma foto.");
                            await enviarFotoOS(
                              acesso.demo,
                              oficina,
                              o,
                              arquivo,
                              String(f.get("fase")),
                              String(f.get("legenda")),
                            );
                          })
                        }
                      >
                        <fieldset disabled={ocupado}>
                          <div className="dupla-campos">
                            <label>
                              Momento
                              <select name="fase">
                                {Object.entries(fases).map(([k, v]) => (
                                  <option value={k} key={k}>
                                    {v}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Foto · JPG, PNG ou WebP
                              <input
                                type="file"
                                name="foto"
                                accept="image/jpeg,image/png,image/webp"
                                required
                              />
                            </label>
                          </div>
                          <label>
                            Legenda
                            <input
                              name="legenda"
                              maxLength={500}
                              placeholder="Ex.: Para-choque dianteiro antes do reparo"
                            />
                          </label>
                          <button className="botao-primario">
                            <Camera size={18} />
                            {ocupado ? "Enviando…" : "Salvar foto"}
                          </button>
                          <small>
                            Até 10 MB por foto. Arquivos privados da oficina.
                          </small>
                        </fieldset>
                      </form>
                    </BlocoDetalhesOS>
                  )}
                  {Object.entries(fases).map(([fase, nome]) => (
                    <BlocoDetalhesOS
                      key={fase}
                      titulo={`${nome} (${o.fotos.filter((f) => f.fase === fase).length})`}
                    >
                      <div className="os-fotos">
                        {o.fotos
                          .filter((f) => f.fase === fase)
                          .map((f) => (
                            <Foto key={f.id} foto={f} />
                          ))}
                      </div>
                      {!o.fotos.some((f) => f.fase === fase) && (
                        <p className="texto-suave">Nenhuma foto nesta etapa.</p>
                      )}
                    </BlocoDetalhesOS>
                  ))}
                </div>
              )}
              {aba === "historico" && (
                <div className="os-secao">
                  <BlocoDetalhesOS titulo="Adicionar anotação">
                    <form
                      className="formulario-cliente"
                      onSubmit={(e) =>
                        formulario(e, (f) =>
                          operar("registrar_anotacao_os", {
                            p_texto: f.get("texto"),
                          }),
                        )
                      }
                    >
                      <fieldset disabled={ocupado}>
                        <label>
                          Nova anotação
                          <textarea
                            name="texto"
                            required
                            maxLength={3000}
                            placeholder="Ex.: Cliente autorizou a retirada amanhã às 10h."
                          />
                        </label>
                        <button className="botao-secundario">
                          Registrar no histórico
                        </button>
                      </fieldset>
                    </form>
                  </BlocoDetalhesOS>
                  <BlocoDetalhesOS titulo="Histórico do atendimento">
                    <ol className="os-historico">
                      {o.historico.map((h) => (
                        <li key={h.id}>
                          <time>{data(h.ocorrido_em)}</time>
                          <p>{h.descricao}</p>
                          <Alteracoes metadados={h.metadados} />
                          {Boolean(h.metadados?.new_status) && (
                            <small>
                              {situacoesOS[String(h.metadados?.new_status)]}
                            </small>
                          )}
                        </li>
                      ))}
                    </ol>
                  </BlocoDetalhesOS>
                </div>
              )}
            </div>
          </>
        )}
      </Dialogo>
      <Dialogo
        aberto={!!novaSituacao}
        fechar={() => !ocupado && setNovaSituacao("")}
        titulo={
          novaSituacao === "cancelled"
            ? "Cancelar esta OS?"
            : novaSituacao
              ? `Alterar para ${situacoesOS[novaSituacao]}?`
              : "Situação atualizada"
        }
      >
        <p>
          {novaSituacao === "delivered"
            ? "A entrega encerra a edição e baixa as peças vinculadas ao estoque. Confira o saldo, a origem das peças, fotos, quilometragem e garantia antes de confirmar."
            : "A alteração ficará registrada no histórico."}
        </p>
        {erro && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        {novaSituacao === "cancelled" && (
          <label>
            Motivo do cancelamento
            <textarea
              maxLength={1000}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </label>
        )}
        <button
          className="botao-primario"
          disabled={ocupado || (novaSituacao === "cancelled" && !motivo.trim())}
          onClick={() =>
            o &&
            void executar(async () => {
              try {
                await alterarSituacao(o, novaSituacao);
              } catch (e) {
                if (novaSituacao === "delivered" && faltaOrigemPeca(e)) {
                  setNovaSituacao("");
                  setConferirPecas(true);
                } else throw e;
              }
            })
          }
        >
          {ocupado ? "Atualizando…" : "Confirmar alteração"}
        </button>
      </Dialogo>
      <Dialogo
        aberto={!!autorizacao}
        fechar={() => !ocupado && setAutorizacao(null)}
        titulo="Registrar autorização do cliente"
      >
        {erro && <p role="alert">{erro}</p>}
        {autorizacao && (
          <ConfirmarAutorizacao
            nomeInicial={autorizacao.os.dados_cliente.nome}
            total={autorizacao.total}
            ocupado={ocupado}
            confirmar={(m) => autorizar(autorizacao.os, m)}
          />
        )}
      </Dialogo>
      {conferirPecas && o && (
        <PecasNaEntrega
          osId={o.id}
          fechar={() => setConferirPecas(false)}
          continuar={async (atual) => {
            if (atual.situacao !== "ready")
              throw new Error(
                "A situação da OS mudou. Confira o atendimento antes de entregar.",
              );
            await alterarSituacao(atual, "delivered");
            setConferirPecas(false);
          }}
        />
      )}
    </>
  );
}
