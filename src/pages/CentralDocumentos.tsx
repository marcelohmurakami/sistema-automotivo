import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  ChevronLeft,
  ChevronRight,
  FileText,
  ImagePlus,
  Palette,
  Printer,
  Search,
} from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { Dialogo } from "../components/Dialogo";
import { IdentidadeDocumentos } from "../components/IdentidadeDocumentos";
import { DocumentoCliente } from "../components/DocumentoCliente";
import { FichaComplementarOS } from "../components/FichaComplementarOS";
import {
  documentoDaOS,
  documentoDoOrcamento,
  logoDocumento,
  moedaDocumento,
  type DocumentoCliente as Documento,
} from "../lib/documentoCliente";
import { erroPublico } from "../lib/supabase";
import { consultarIdentidade } from "../services/documentos";
import { consultarOS, listarOS, situacoesOS } from "../services/ordensServico";
import {
  listarPropostas,
  obterProposta,
  rotulosSituacao,
} from "../services/orcamentos";
import "./CentralDocumentos.css";

export function CentralDocumentos() {
  const a = useAcesso();
  // Uma troca de oficina descarta os filtros e a prévia da empresa anterior.
  return <CentralDaOficina key={`${a.demo}:${a.oficina!.id}`} />;
}
function CentralDaOficina() {
  const a = useAcesso(),
    oficina = a.oficina!.id;
  const [params, setParams] = useSearchParams();
  const tipo = params.get("tipo") === "orcamento" ? "orcamento" : "os";
  const id = params.get("id"),
    versao = params.get("versao") || undefined;
  const direto = !!id && (tipo === "orcamento" || params.get("origem") === "os");
  const permitido = a.permite(tipo === "os" ? "work_orders" : "quotes");
  const [busca, setBusca] = useState(""),
    [buscaServidor, setBuscaServidor] = useState(""),
    [pagina, setPagina] = useState(0);
  const [identidadeAberta, setIdentidadeAberta] = useState(false),
    [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState("");
  const [dadosImpressao, setDadosImpressao] = useState<
    Record<
      string,
      { vencimento?: string; formaPagamento?: string; pixCopiaCola?: string }
    >
  >({});
  const previa = useRef<HTMLElement>(null);
  const preparando = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setBuscaServidor(busca);
      setPagina(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [busca]);
  const identidade = useQuery({
    queryKey: ["identidade", a.demo, oficina],
    queryFn: ({ signal }) => consultarIdentidade(a.demo, oficina, signal),
    refetchOnWindowFocus: false,
  });
  const lista = useQuery({
    staleTime: 0,
    queryKey: ["documentos-lista", a.demo, oficina, tipo, buscaServidor, pagina],
    enabled: permitido && !direto,
    queryFn: async ({ signal }) => {
      if (tipo === "os") {
        const r = await listarOS(a.demo, oficina, buscaServidor, "", pagina, signal);
        return {
          total: r.total,
          itens: r.itens.map((o) => ({
            id: o.id,
            numero: o.numero,
            cliente: o.dados_cliente.nome,
            veiculo: o.dados_veiculo.modelo,
            placa: o.dados_veiculo.placa,
            total: o.total_centavos,
            situacao: situacoesOS[o.situacao] || o.situacao,
          })),
        };
      }
      const r = await listarPropostas(
        a.demo,
        oficina,
        buscaServidor,
        "",
        pagina,
        signal,
      );
      return {
        total: r.total,
        itens: r.itens.map((q) => ({
          id: q.id,
          numero: q.numero,
          cliente: q.cliente,
          veiculo: q.veiculo,
          placa: q.placa,
          total: q.total_centavos,
          situacao: rotulosSituacao[q.situacao] || q.situacao,
        })),
      };
    },
  });
  const detalhe = useQuery({
    staleTime: 0,
    queryKey: ["documento-cliente", a.demo, oficina, tipo, id, versao],
    enabled: !!id && permitido,
    queryFn: async ({ signal }) =>
      tipo === "os"
        ? { tipo: "os" as const, os: await consultarOS(a.demo, oficina, id!, signal) }
        : {
            tipo: "orcamento" as const,
            orcamento: await obterProposta(a.demo, oficina, id!, versao, signal),
          },
  });
  const documento: Documento | undefined =
    permitido && !detalhe.isError && detalhe.data
      ? detalhe.data.tipo === "os"
        ? identidade.data && !identidade.isError
          ? documentoDaOS(detalhe.data.os, identidade.data)
          : undefined
        : documentoDoOrcamento(detalhe.data.orcamento)
      : undefined;
  if (documento?.tipo === "os")
    Object.assign(documento, dadosImpressao[id || ""] || {});
  const proposta =
    detalhe.data?.tipo === "orcamento" ? detalhe.data.orcamento : undefined;
  const logo = logoDocumento(identidade.data?.logo);
  function selecionar(novoId: string) {
    setErro("");
    setParams({ tipo, id: novoId });
    previa.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function baixar() {
    if (!documento || preparando.current) return;
    preparando.current = true;
    setOcupado(true);
    setErro("");
    try {
      const { gerarPdfCliente } = await import("../services/pdfCliente");
      gerarPdfCliente(documento).save(documento.arquivo);
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      preparando.current = false;
      setOcupado(false);
    }
  }
  async function imprimir() {
    if (!documento || !previa.current || preparando.current) return;
    // Chamada nativa: leitores de PDF podem ignorar o comando de impressão automática.
    const janela = window.open("", "_blank");
    if (!janela) {
      setErro("Permita abrir a impressão no navegador ou use Baixar PDF.");
      return;
    }
    janela.opener = null;
    preparando.current = true;
    setOcupado(true);
    setErro("");
    try {
      const { imprimirDocumentoCliente } =
        await import("../services/impressaoDocumentoCliente");
      await imprimirDocumentoCliente(janela, documento);
    } catch {
      janela.close();
      setErro("Não foi possível preparar a impressão. Tente baixar o PDF.");
    } finally {
      preparando.current = false;
      setOcupado(false);
    }
  }
  return (
    <div className={`central-documentos ${direto ? "documento-direto" : ""}`}>
      {direto && (
        <Link
          className="docs-voltar"
          to={tipo === "orcamento" ? "/orcamentos" : "/ordens-servico"}
        >
          <ChevronLeft size={18} />{" "}
          {tipo === "orcamento"
            ? "Voltar aos orçamentos"
            : "Voltar às ordens de serviço"}
        </Link>
      )}
      {!direto && (
        <header className="docs-capa">
          <div className="docs-apresentacao">
            <span className="docs-sobretitulo">
              <Printer size={14} /> DOCUMENTOS DA OFICINA
            </span>
            <h1>
              Imprimir documentos<span>.</span>
            </h1>
            <p>Escolha uma OS ou orçamento, confira e imprima.</p>
          </div>
          <div className="docs-cartao-marca">
            <div className="docs-logo">
              {logo ? (
                <img src={logo} alt="Logo da oficina" />
              ) : (
                <Building2 size={36} strokeWidth={1.3} />
              )}
            </div>
            <span>SUA IDENTIDADE, EM CADA ENTREGA</span>
            <strong>{identidade.data?.nome || a.oficina!.nome}</strong>
            <small>
              {logo
                ? "Logo cadastrado nos documentos"
                : "Adicione o logo para personalizar seus documentos"}
            </small>
            <button
              className="botao-secundario"
              onClick={() => setIdentidadeAberta(true)}
            >
              <Palette size={16} />
              {logo ? "Personalizar documentos" : "Adicionar logo da oficina"}
            </button>
          </div>
        </header>
      )}
      {a.demo && (
        <p className="aviso-cliente">
          Demonstração · Documentos dos atendimentos deste navegador.
        </p>
      )}
      <div className="docs-estacao">
        {!direto && (
          <section className="docs-selecao" aria-label="Selecionar documento">
            <div className="docs-passo">
              <span>01</span>
              <div>
                <h2>Escolha o documento</h2>
                <p>Encontre o atendimento do cliente.</p>
              </div>
            </div>
            <div className="docs-tipos" aria-label="Tipo de documento">
              {(
                [
                  ["os", "Ordens de serviço", "work_orders"],
                  ["orcamento", "Orçamentos", "quotes"],
                ] as const
              ).map(([t, nome, recurso]) => (
                <button
                  key={t}
                  aria-pressed={tipo === t}
                  disabled={!a.permite(recurso)}
                  onClick={() => {
                    setParams({ tipo: t });
                    setPagina(0);
                    setErro("");
                  }}
                >
                  {nome}
                </button>
              ))}
            </div>
            <label className="docs-busca">
              <Search size={18} />
              <input
                aria-label="Buscar documento por cliente, placa ou número"
                placeholder="Cliente, placa ou número…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </label>
            {!permitido ? (
              <p>Este tipo de documento não está disponível no seu plano.</p>
            ) : lista.isError ? (
              <p role="alert">
                {erroPublico(lista.error)}{" "}
                <button onClick={() => void lista.refetch()}>Tentar novamente</button>
              </p>
            ) : lista.isPending ? (
              <p role="status" className="docs-vazio">
                Carregando atendimentos…
              </p>
            ) : !lista.data.itens.length ? (
              <div className="docs-vazio">
                <FileText size={30} />
                <strong>Nenhum documento encontrado</strong>
                <p>
                  {busca
                    ? "Tente outra placa, nome ou número."
                    : "Cadastre um atendimento para visualizar seu documento aqui."}
                </p>
                <Link
                  to={tipo === "os" ? "/ordens-servico?nova=1" : "/orcamentos?novo=1"}
                >
                  Criar {tipo === "os" ? "ordem de serviço" : "orçamento"}{" "}
                  <ArrowUpRight size={14} />
                </Link>
              </div>
            ) : (
              <div className="docs-resultados">
                {lista.data.itens.map((i) => (
                  <button
                    key={i.id}
                    className="docs-resultado"
                    aria-pressed={id === i.id}
                    onClick={() => selecionar(i.id)}
                  >
                    <span className="docs-resultado-topo">
                      <strong>
                        {tipo === "os" ? "OS" : "ORÇ"} #
                        {String(i.numero).padStart(4, "0")}
                      </strong>
                      <small>{i.situacao}</small>
                    </span>
                    <strong>{i.cliente}</strong>
                    <span>
                      {i.veiculo} · {i.placa || "Sem placa"}
                    </span>
                    <span className="docs-resultado-base">
                      <b>{moedaDocumento(i.total)}</b>
                      <span>
                        {id === i.id ? "Selecionado" : "Ver documento"}{" "}
                        <ChevronRight size={14} />
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="docs-paginacao">
              <span>
                {lista.data?.total ?? 0} documentos · Pág. {pagina + 1}
              </span>
              <button
                aria-label="Página anterior de documentos"
                disabled={!pagina || lista.isFetching}
                onClick={() => setPagina((p) => p - 1)}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                aria-label="Próxima página de documentos"
                disabled={
                  lista.isFetching || (pagina + 1) * 24 >= (lista.data?.total ?? 0)
                }
                onClick={() => setPagina((p) => p + 1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </section>
        )}
        <section
          className="docs-visualizacao"
          ref={previa}
          aria-label="Visualizar e imprimir"
        >
          <div className="docs-barra-previa">
            <div className="docs-passo">
              {!direto && <span>02</span>}
              <div>
                <h2>
                  {direto
                    ? `${tipo === "orcamento" ? "Imprimir orçamento" : "Notinha da OS"}${documento ? ` #${documento.numero}` : ""}`
                    : "Confira e entregue"}
                </h2>
                <p>
                  {direto && tipo === "orcamento"
                    ? "Confira a proposta antes de imprimir ou enviar ao cliente."
                    : "Uma boa impressão começa aqui."}
                </p>
              </div>
            </div>
            <div className="docs-acoes">
              <button
                className="botao-secundario"
                disabled={!documento || ocupado || detalhe.isFetching}
                onClick={() => void baixar()}
              >
                <ArrowDownToLine size={17} />
                Baixar PDF
              </button>
              <button
                className="botao-primario"
                disabled={!documento || ocupado || detalhe.isFetching}
                onClick={() => void imprimir()}
              >
                <Printer size={17} />
                {ocupado ? "Preparando…" : "Imprimir"}
              </button>
            </div>
          </div>
          {detalhe.data?.os && !detalhe.isFetching && (
            <FichaComplementarOS os={detalhe.data.os} />
          )}
          {erro && (
            <p role="alert" className="erro-formulario">
              {erro}
            </p>
          )}
          {!id ? (
            <div className="docs-previa-vazia">
              <div>
                <FileText size={48} strokeWidth={1.2} />
                <BadgeCheck size={24} />
              </div>
              <h3>
                Seu próximo documento,
                <br />
                pronto para impressionar.
              </h3>
              <p>
                Selecione uma OS ou um orçamento para conferir a prévia e imprimir com a
                identidade da sua oficina.
              </p>
              <span>
                <Printer size={15} /> Formato A4 · conteúdo para o cliente
              </span>
            </div>
          ) : detalhe.isError || (tipo === "os" && identidade.isError) ? (
            <p role="alert">
              {erroPublico(detalhe.error || identidade.error)}
              <button
                className="botao-secundario"
                onClick={() => {
                  void detalhe.refetch();
                  void identidade.refetch();
                }}
              >
                Tentar novamente
              </button>
            </p>
          ) : !permitido ? (
            <p>Documento indisponível no plano contratado.</p>
          ) : !documento ? (
            <p className="docs-vazio" role="status">
              Preparando documento…
            </p>
          ) : (
            <>
              {proposta && (
                <div className="docs-versao">
                  <label>
                    Versão do orçamento
                    <select
                      aria-label="Versão do orçamento para impressão"
                      value={proposta.versao.id}
                      onChange={(e) =>
                        setParams({ tipo, id: id!, versao: e.target.value })
                      }
                    >
                      {proposta.historico.map((v) => (
                        <option key={v.id} value={v.id}>
                          Versão {v.numero_versao}
                          {v.id === proposta.versao_atual_id ? " · atual" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p>
                    Orçamentos emitidos preservam os dados, valores e a identidade da
                    versão original.
                  </p>
                </div>
              )}
              {documento.tipo === "os" && (
                <details className="docs-dados-impressao">
                  <summary>Pagamento e vencimento nesta impressão</summary>
                  <p>
                    Campos opcionais para este documento. Não registram pagamento nem
                    alteram as contas.
                  </p>
                  {(["vencimento", "formaPagamento", "pixCopiaCola"] as const).map(
                    (campo) => (
                      <label key={campo}>
                        {campo === "vencimento"
                          ? "Vencimento"
                          : campo === "formaPagamento"
                            ? "Forma de pagamento"
                            : "Pix copia e cola fornecido pelo banco"}
                        <input
                          type={campo === "vencimento" ? "date" : "text"}
                          maxLength={campo === "pixCopiaCola" ? 1024 : 180}
                          value={dadosImpressao[id || ""]?.[campo] || ""}
                          onChange={(e) =>
                            setDadosImpressao((v) => ({
                              ...v,
                              [id || ""]: {
                                ...v[id || ""],
                                [campo]: e.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                    ),
                  )}
                </details>
              )}
              <div className="docs-papel">
                <DocumentoCliente documento={documento} />
              </div>
              <p className="docs-nota">
                <BadgeCheck size={16} /> Somente informações para o cliente. Observações
                internas e custos não aparecem na impressão.
              </p>
            </>
          )}
        </section>
      </div>
      {!direto && (
        <div className="docs-faixa">
          <ImagePlus size={24} />
          <div>
            <strong>Uma identidade que o cliente reconhece.</strong>
            <p>Logo, cor e uma mensagem de agradecimento em cada documento.</p>
          </div>
          <button onClick={() => setIdentidadeAberta(true)}>
            Configurar identidade <ArrowUpRight size={17} />
          </button>
        </div>
      )}
      <Dialogo
        aberto={identidadeAberta}
        fechar={() => setIdentidadeAberta(false)}
        titulo="A identidade da sua oficina"
      >
        <IdentidadeDocumentos />
        <p className="docs-nota">
          A identidade salva vale para as OS e para novos orçamentos. Documentos de
          versões já emitidas são preservados.
        </p>
        <Link to="/configuracoes" className="botao-secundario">
          Editar nome, telefone e endereço <ArrowUpRight size={15} />
        </Link>
      </Dialogo>
    </div>
  );
}
