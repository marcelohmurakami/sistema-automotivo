import { componenteSobDemanda } from "../lib/componenteSobDemanda";
const EditorOrcamento = componenteSobDemanda(async () => ({
  default: (await import("../components/orcamentos/EditorOrcamento")).EditorOrcamento,
}));
const FotosOrcamento = componenteSobDemanda(async () => ({
  default: (await import("../components/FotosOrcamento")).FotosOrcamento,
}));
const ConteudoProposta = componenteSobDemanda(async () => ({
  default: (await import("../components/ConteudoProposta")).ConteudoProposta,
}));
import { novoId } from "../lib/uuid.ts";
import {
  ConfirmarAutorizacao,
  type ManifestacaoEquipe,
} from "../components/ConfirmarAutorizacao";
import { CobrancaDiagnostico } from "../components/CobrancaDiagnostico";
import { abatimentoDiagnostico } from "../lib/diagnosticoOrcamento";
import { FiltrosSituacao } from "../components/FiltrosSituacao";
import { AcaoOrcamento } from "../components/AcaoOrcamento";
import { AtalhoRegistro } from "../components/AtalhoRegistro";
import { IconeTipoServico } from "../components/TipoServico";
import { IndicadorEntrega } from "../components/PrazoEntrega";
import { classificarEntrega } from "../lib/entregaPrometida";
import { useAgora } from "../lib/useAgora";
import type { EdicaoListaOrcamento } from "../components/orcamentos/EdicaoRapidaOrcamento";
const EdicaoRapidaOrcamento = componenteSobDemanda(async () => ({
  default: (await import("../components/orcamentos/EdicaoRapidaOrcamento"))
    .EdicaoRapidaOrcamento,
}));

import { dinheiro } from "../lib/formatacao";
import { useBuscaDebounced } from "../lib/useBuscaDebounced";
import { DesistenciaAtendimento } from "../components/DesistenciaAtendimento";
import { SecaoRecolhivel } from "../components/SecaoRecolhivel";
import "./OrdensServico.css";
import { chaveRascunho, limparRascunho } from "../lib/rascunhos";
import "./Produtividade.css";

import { AtalhoLocalizacao } from "../components/AtalhoLocalizacao";
import "./Documentos.css";
import "./Orcamentos.css";
const ObservacoesProposta = componenteSobDemanda(async () => ({
  default: (await import("../components/ConteudoProposta")).ObservacoesProposta,
}));
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Printer,
  FileText,
  Plus,
  Pencil,
  RotateCcw,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { Dialogo } from "../components/Dialogo";
import { erroPublico } from "../lib/supabase";
import {
  acaoProposta,
  aprovarPropostaInterna,
  criarOSParaOrcamento,
  excluirProposta,
  restaurarProposta,
  auxiliaresOrcamento,
  emitirProposta,
  linkSomenteLocal,
  listarPropostas,
  novoLink,
  obterProposta,
  rotulosSituacao,
  salvarProposta,
  type Proposta,
  type ResumoProposta,
} from "../services/orcamentos";

export function Orcamentos() {
  const agora = useAgora();
  const [atalho, setAtalho] = useState<EdicaoListaOrcamento | null>(null);
  const acesso = useAcesso(),
    cache = useQueryClient();
  const oficina = acesso.oficina!.id;
  const navegar = useNavigate();
  const [exclusao, setExclusao] = useState<ResumoProposta | null>(null);
  const [motivoExclusao, setMotivoExclusao] = useState("");
  const [autorizacao, setAutorizacao] = useState<Proposta | null>(null);
  const [parametros, setParametros] = useSearchParams();
  const [busca, setBusca] = useState(""),
    [situacao, setSituacao] = useState(""),
    [pagina, setPagina] = useState(0);
  const [buscaConfirmada, setBuscaConfirmada] = useState<string | null>(null);
  const emExecucao = useRef(false);
  const [abrirFotos, setAbrirFotos] = useState(false);
  const [processandoFotos, setProcessandoFotos] = useState(false);
  const [detalhe, setDetalhe] = useState<Proposta | null>(null),
    [edicao, setEdicao] = useState<Proposta | null>(null);
  const [chaveCriacao, setChaveCriacao] = useState(() => novoId());
  const [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [link, setLink] = useState(""),
    [validade, setValidade] = useState(7),
    [confirmacao, setConfirmacao] = useState<"cancelar" | "revisar" | null>(null);
  const idDireto = parametros.get("orcamento");
  useEffect(() => {
    if (!idDireto) return;
    let ativo = true;
    const controller = new AbortController();
    obterProposta(acesso.demo, oficina, idDireto, undefined, controller.signal)
      .then((q) => {
        if (ativo) setDetalhe(q);
      })
      .catch((e) => {
        if (ativo) setErro(erroPublico(e));
      });
    return () => {
      ativo = false;
      controller.abort();
    };
  }, [idDireto, acesso.demo, oficina]);
  const editorAberto = parametros.get("novo") === "1" || !!edicao;
  const chave = ["orcamentos", acesso.demo ? "demo" : acesso.usuario, oficina];
  const buscaDebounced = useBuscaDebounced(busca);
  const buscaConsulta = buscaConfirmada === busca ? busca : buscaDebounced;
  const lista = useQuery({
    queryKey: [...chave, buscaConsulta, situacao, pagina],
    queryFn: ({ signal }) =>
      listarPropostas(acesso.demo, oficina, buscaConsulta, situacao, pagina, signal),
    retry: false,
    refetchInterval: editorAberto || detalhe ? false : 30000,
  });
  const aux = useQuery({
    queryKey: ["auxiliares-orcamento", acesso.demo ? "demo" : acesso.usuario, oficina],
    queryFn: () => auxiliaresOrcamento(acesso.demo, oficina),
    enabled: editorAberto,
    retry: false,
  });
  const [converterRapido, setConverterRapido] = useState<Proposta | null>(null);
  async function executar(acao: () => Promise<void>, alterou = true) {
    if (emExecucao.current) return;
    emExecucao.current = true;
    setOcupado(true);
    setErro("");
    setAviso("");
    try {
      await acao();
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      // A gravação já foi confirmada. Atualizar a lista não bloqueia consultar/editar.
      if (alterou) void cache.invalidateQueries({ queryKey: chave }).catch(() => {});
      emExecucao.current = false;
      setOcupado(false);
    }
  }
  function fecharEditor() {
    if (ocupado) return;
    setParametros({});
    setEdicao(null);
    setErro("");
  }
  async function abrir(id: string, versao?: string) {
    await executar(async () => {
      setDetalhe(await obterProposta(acesso.demo, oficina, id, versao));
      setLink("");
    }, false);
  }
  async function editar(id: string) {
    await executar(async () => {
      const q = await obterProposta(acesso.demo, oficina, id);
      if (q.arquivado_em) throw new Error("Restaure o orçamento antes de editar.");
      if (q.edicao_bloqueada || q.adicional_aplicado_em)
        throw new Error(
          "Este orçamento já autorizou uma OS. Para serviços adicionais, abra a OS e crie um orçamento adicional.",
        );
      setParametros({});
      setDetalhe(null);
      setEdicao(q);
    }, false);
  }
  async function aprovar(
    q: Pick<Proposta, "id" | "revisao">,
    manifestacao?: ManifestacaoEquipe,
  ) {
    await executar(async () => {
      let proposta = await obterProposta(acesso.demo, oficina, q.id);
      if (proposta.revisao !== q.revisao)
        throw new Error(
          "O orçamento mudou. Atualize e confira os valores antes de aprovar.",
        );
      if (!manifestacao) {
        setAutorizacao(proposta);
        return;
      }
      await aprovarPropostaInterna(acesso.demo, oficina, proposta, manifestacao);
      setAutorizacao(null);
      proposta = await obterProposta(acesso.demo, oficina, q.id);
      if (detalhe?.id === proposta.id) setDetalhe(proposta);
      setAviso(`Orçamento #${proposta.numero} aprovado.`);
      await atualizarOrdens();
      if (
        acesso.permite("work_orders") &&
        !proposta.ordem_servico_id &&
        !proposta.adicional_os_id
      )
        setConverterRapido(proposta);
    }, !!manifestacao);
  }
  async function prepararConversao(q: Pick<Proposta, "id">) {
    await executar(async () => {
      const proposta = await obterProposta(acesso.demo, oficina, q.id);
      const os = proposta.ordem_servico_id || proposta.adicional_os_id;
      if (os) {
        setDetalhe(null);
        navegar("/ordens-servico?os=" + os);
      } else if (proposta.situacao === "approved") {
        setConverterRapido(proposta);
      } else {
        throw new Error("Aprove o orçamento antes de transformar em OS.");
      }
    }, false);
  }
  async function atualizarOrdens() {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["os"] }),
      cache.invalidateQueries({ queryKey: ["mapa-oficina"] }),
    ]);
  }
  async function compartilhar() {
    if (!detalhe) return;
    await executar(async () => {
      let destino = link;
      if (
        !acesso.demo &&
        !destino &&
        ["awaiting_approval", "approved", "declined"].includes(detalhe.situacao)
      ) {
        destino = await novoLink(oficina, detalhe);
        setLink(destino);
      }
      const { arquivoPdf, gerarPdf } = await import("../services/pdfOrcamento");
      const arquivo = arquivoPdf(detalhe, linkSomenteLocal() ? "" : destino);
      if (navigator.canShare?.({ files: [arquivo] })) {
        try {
          await navigator.share({
            files: [arquivo],
            title: `Orçamento #${detalhe.numero}`,
            text: linkSomenteLocal()
              ? "Confira o orçamento em PDF."
              : `Confira e responda ao orçamento: ${destino}`,
          });
          return;
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
        }
      }
      {
        gerarPdf(detalhe, linkSomenteLocal() ? "" : destino).save(arquivo.name);
        setAviso("PDF baixado. Use “Abrir WhatsApp” e anexe o arquivo na conversa.");
      }
    });
  }
  return (
    <>
      <div className="titulo-pagina">
        <div>
          <div className="sobretitulo">
            <span className="linha-verde" />
            DO DIAGNÓSTICO À APROVAÇÃO
          </div>
          <h1>
            Orçamentos<span>.</span>
          </h1>
        </div>
        <button
          className="botao-primario"
          data-preparar-modulo="formularioOrcamento"
          onClick={() => {
            setChaveCriacao(novoId());
            setErro("");
            setParametros({ novo: "1" });
          }}
        >
          <Plus size={19} />
          Novo orçamento
        </button>
      </div>
      {atalho && (
        <EdicaoRapidaOrcamento
          edicao={atalho}
          fechar={() => setAtalho(null)}
          aoSalvar={(mensagem) => {
            setAtalho(null);
            setAviso(mensagem);
          }}
          aprovar={(q) => void aprovar(q)}
        />
      )}
      {acesso.demo && (
        <div className="nota-demo">
          Demonstração · Orçamentos, aprovações e OS salvos somente neste navegador.
        </div>
      )}
      {aviso && !detalhe && !editorAberto && (
        <div className="aviso-cliente" role="status">
          {aviso}
        </div>
      )}
      {erro &&
        !editorAberto &&
        !detalhe &&
        !exclusao &&
        !autorizacao &&
        !converterRapido &&
        !confirmacao && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
      <section className="painel-registros">
        <div className="registros-cabecalho">
          <div>
            <h2>
              Suas propostas{" "}
              <span className="contagem-total">{lista.data?.total ?? "—"}</span>
            </h2>
          </div>
          <label className="campo-busca">
            <Search size={17} />
            <input
              aria-label="Buscar orçamentos"
              placeholder="Cliente, placa ou número…"
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
                aria-label="Limpar busca de orçamentos"
                onClick={() => {
                  setBusca("");
                  setBuscaConfirmada(null);
                  setPagina(0);
                }}
              >
                <X size={16} />
              </button>
            )}
          </label>
        </div>
        <div className="filtros-propostas">
          <FiltrosSituacao
            rotulo="Filtrar orçamentos"
            valor={situacao}
            alterar={(valor) => {
              setSituacao(valor);
              setPagina(0);
            }}
            principais={[
              { valor: "", nome: "Todos" },
              { valor: "draft", nome: "Rascunhos" },
              {
                valor: "awaiting_approval",
                nome: "Aguardando aprovação",
                tom: "atencao",
              },
              { valor: "approved", nome: "Aprovados", tom: "concluido" },
            ]}
            outras={[
              ...Object.entries(rotulosSituacao)
                .filter(
                  ([valor]) =>
                    !["draft", "awaiting_approval", "approved"].includes(valor),
                )
                .map(([valor, nome]) => ({ valor, nome })),
              { valor: "excluidos", nome: "Excluídos" },
            ]}
          />
        </div>
        {lista.isPending ? (
          <div className="estado-lista" role="status">
            Carregando orçamentos…
          </div>
        ) : lista.isError ? (
          <div className="estado-lista">
            <p role="alert">{erroPublico(lista.error)}</p>
            <button className="botao-secundario" onClick={() => void lista.refetch()}>
              Tentar novamente
            </button>
          </div>
        ) : !lista.data.itens.length ? (
          <div className="estado-lista">
            <FileText size={36} />
            <h3>
              {busca || situacao
                ? "Nenhum orçamento encontrado"
                : "Seu próximo serviço começa aqui"}
            </h3>
            {busca || situacao ? (
              <>
                <p>Tente outro termo ou volte à lista completa.</p>
                <button
                  type="button"
                  className="botao-secundario"
                  onClick={() => {
                    setBusca("");
                    setSituacao("");
                    setPagina(0);
                  }}
                >
                  Limpar filtros
                </button>
              </>
            ) : (
              <>
                <p>Selecione o cliente, adicione os itens e prepare sua proposta.</p>
                <button
                  type="button"
                  className="botao-primario"
                  onClick={() => {
                    setChaveCriacao(novoId());
                    setErro("");
                    setParametros({ novo: "1" });
                  }}
                >
                  <Plus size={17} />
                  Criar primeiro orçamento
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="lista-propostas">
            {lista.data.itens.map((q) => (
              <article
                key={q.id}
                className="linha-proposta"
                aria-label={`Orçamento #${q.numero}`}
              >
                <div className="abrir-proposta proposta-interativa">
                  <AtalhoRegistro
                    nome={`Alterar ícone do orçamento #${q.numero}`}
                    classe="icone-proposta"
                    desabilitado={ocupado}
                    alterar={
                      !q.arquivado_em
                        ? () => setAtalho({ campo: "tipo", id: q.id, numero: q.numero })
                        : undefined
                    }
                  >
                    <IconeTipoServico tipo={q.tipo_servico} />
                  </AtalhoRegistro>
                  <button
                    className="lista-registro-abrir proposta-identificacao"
                    disabled={ocupado}
                    onClick={() => void abrir(q.id)}
                    aria-label={`Abrir orçamento #${q.numero} de ${q.cliente}`}
                  >
                    <strong>
                      #{String(q.numero).padStart(4, "0")} · {q.cliente}
                    </strong>
                    <small>
                      {q.veiculo}
                      {q.placa ? ` · ${q.placa}` : ""} · Versão {q.numero_versao}
                    </small>
                  </button>
                  <AtalhoRegistro
                    classe="proposta-situacao-atalho"
                    nome={`Alterar situação do orçamento #${q.numero}`}
                    desabilitado={ocupado}
                    alterar={
                      !q.arquivado_em
                        ? () =>
                            setAtalho({ campo: "situacao", id: q.id, numero: q.numero })
                        : undefined
                    }
                  >
                    <span className={`situacao-proposta ${q.situacao}`}>
                      {q.arquivado_em ? "Excluído" : rotulosSituacao[q.situacao]}
                    </span>
                  </AtalhoRegistro>
                  <AtalhoRegistro
                    classe="proposta-entrega-atalho"
                    nome={`Alterar entrega do orçamento #${q.numero}`}
                    desabilitado={ocupado}
                    alterar={
                      !q.arquivado_em
                        ? () =>
                            setAtalho({ campo: "entrega", id: q.id, numero: q.numero })
                        : undefined
                    }
                  >
                    <IndicadorEntrega
                      prazo={classificarEntrega(
                        q.entrega_prevista_em,
                        q.situacao === "cancelled" ? "cancelled" : "open",
                        agora,
                      )}
                    />
                  </AtalhoRegistro>
                  <div className="proposta-total-lista">
                    <strong>
                      {dinheiro(q.total_aprovado_centavos ?? q.total_centavos)}
                    </strong>
                    {q.total_aprovado_centavos != null &&
                      q.total_aprovado_centavos !== q.total_centavos && (
                        <small>
                          Autorizado · proposta {dinheiro(q.total_centavos)}
                        </small>
                      )}
                  </div>
                  <button
                    className="lista-registro-abrir proposta-seta"
                    disabled={ocupado}
                    onClick={() => void abrir(q.id)}
                    aria-label={`Ver detalhes do orçamento #${q.numero}`}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
                <div className="acoes-linha-proposta">
                  <AcaoOrcamento
                    proposta={q}
                    permiteOS={acesso.permite("work_orders")}
                    ocupado={ocupado}
                    compacta
                    aprovar={() => void aprovar(q)}
                    converter={() => void prepararConversao(q)}
                  />
                  {q.arquivado_em ? (
                    <button
                      className="botao-icone"
                      title="Restaurar orçamento"
                      aria-label={`Restaurar orçamento #${q.numero}`}
                      disabled={ocupado}
                      onClick={() =>
                        void executar(async () => {
                          await restaurarProposta(acesso.demo, oficina, q);
                          setAviso(
                            `Orçamento #${q.numero} restaurado. Os links antigos permanecem desativados.`,
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
                          q.edicao_bloqueada
                            ? "Valores já autorizados na OS. Use um orçamento adicional na OS."
                            : "Editar orçamento"
                        }
                        aria-label={`Editar orçamento #${q.numero}`}
                        disabled={ocupado || q.edicao_bloqueada}
                        onClick={() => void editar(q.id)}
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        className="botao-icone excluir-proposta"
                        title="Excluir orçamento"
                        aria-label={`Excluir orçamento #${q.numero}`}
                        disabled={ocupado}
                        onClick={() => {
                          setExclusao(q);
                          setMotivoExclusao("");
                          setErro("");
                        }}
                      >
                        <Trash2 size={18} />
                      </button>
                    </>
                  )}
                </div>
                {q.arquivado_em && (
                  <p className="motivo-exclusao-proposta">
                    Motivo: {q.motivo_exclusao}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
        <div className="paginacao-clientes">
          <span>
            {lista.data?.total ?? 0} orçamento(s) · Página {pagina + 1}
          </span>
          <div>
            <button
              className="botao-icone"
              disabled={!pagina}
              aria-label="Página anterior"
              onClick={() => setPagina((p) => p - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="botao-icone"
              disabled={!lista.data || (pagina + 1) * 24 >= lista.data.total}
              aria-label="Próxima página"
              onClick={() => setPagina((p) => p + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </section>
      <Dialogo
        aberto={editorAberto}
        fechar={fecharEditor}
        titulo={edicao ? `Editar orçamento #${edicao.numero}` : "Novo orçamento"}
        classe="dialogo-orcamento"
      >
        {editorAberto &&
          (aux.isPending ? (
            <p role="status">Carregando clientes e catálogo…</p>
          ) : aux.isError ? (
            <p role="alert">{erroPublico(aux.error)}</p>
          ) : (
            aux.data && (
              <EditorOrcamento
                key={edicao?.id ?? `${chaveCriacao}:${parametros.get("cliente") || ""}`}
                clienteInicial={parametros.get("cliente") || ""}
                anterior={edicao ?? undefined}
                aux={aux.data}
                ocupado={ocupado}
                erro={erro}
                cancelar={fecharEditor}
                salvar={(dados, idLocal, fotos) =>
                  void executar(async () => {
                    const q = await salvarProposta(
                      acesso.demo,
                      oficina,
                      dados,
                      idLocal,
                      edicao ?? undefined,
                    );
                    limparRascunho(
                      chaveRascunho(
                        acesso.demo ? "demo" : acesso.usuario!,
                        oficina,
                        edicao?.id,
                        parametros.get("cliente") || "",
                      ),
                    );
                    setParametros({});
                    setEdicao(null);
                    setChaveCriacao(novoId());
                    setDetalhe(q);
                    setAbrirFotos(!!fotos);
                    setLink("");
                    // Primeiro preserva o documento salvo. Se a emissão falhar,
                    // o usuário consegue tentar novamente sem duplicar o orçamento.
                    if (q.situacao === "draft" && !fotos) {
                      try {
                        const emitido = await emitirProposta(
                          acesso.demo,
                          oficina,
                          q,
                          validade,
                        );
                        setDetalhe(emitido.proposta);
                        setLink(emitido.link);
                      } catch (e) {
                        throw new Error(
                          `O orçamento #${q.numero} foi salvo, mas não foi possível deixá-lo pronto para aprovação. ${erroPublico(e)} Use o botão Aprovar para tentar novamente.`,
                          { cause: e },
                        );
                      }
                    }
                    setAviso(
                      fotos
                        ? "Adicione as fotos e clique em Concluir orçamento ou Aprovar."
                        : "Orçamento salvo. Aguardando aprovação do cliente.",
                    );
                  })
                }
              />
            )
          ))}
      </Dialogo>
      <Dialogo
        aberto={!!detalhe && !editorAberto && !exclusao}
        fechar={() => {
          if (!ocupado && !processandoFotos) {
            setDetalhe(null);
            setParametros({});
            setErro("");
            setAviso("");
            setLink("");
          }
        }}
        titulo={detalhe ? `Orçamento #${detalhe.numero}` : "Orçamento"}
        classe="dialogo-orcamento dialogo-detalhe-orcamento"
      >
        {detalhe && (
          <div
            className="acoes-detalhe-orcamento"
            role="group"
            aria-label="Ações do orçamento"
          >
            {!detalhe.arquivado_em &&
              !detalhe.edicao_bloqueada &&
              !detalhe.adicional_aplicado_em &&
              detalhe.versao.id === detalhe.versao_atual_id && (
                <button
                  className="botao-secundario"
                  disabled={ocupado || processandoFotos}
                  onClick={() => void editar(detalhe.id)}
                >
                  <Pencil size={17} /> Editar orçamento
                </button>
              )}
            <Link
              className="botao-secundario"
              to={
                "/documentos?tipo=orcamento&id=" +
                detalhe.id +
                "&versao=" +
                detalhe.versao.id
              }
              aria-label={"Imprimir orçamento #" + detalhe.numero}
            >
              <Printer size={17} />
              <span>Imprimir / PDF</span>
            </Link>
            <button
              className="botao-primario"
              aria-label="Compartilhar PDF"
              disabled={
                ocupado ||
                !!detalhe.arquivado_em ||
                detalhe.versao.id !== detalhe.versao_atual_id ||
                ["draft", "cancelled"].includes(detalhe.situacao)
              }
              title={
                detalhe.arquivado_em
                  ? "Restaure o orçamento antes de compartilhar"
                  : detalhe.versao.id !== detalhe.versao_atual_id
                    ? "Selecione a versão atual para compartilhar"
                    : detalhe.situacao === "draft"
                      ? "Prepare o orçamento para enviar antes de compartilhar"
                      : detalhe.situacao === "cancelled"
                        ? "Este orçamento foi cancelado"
                        : "Compartilhar PDF"
              }
              onClick={() => void compartilhar()}
            >
              <Send size={17} />
              <span>Compartilhar PDF</span>
            </button>
            <details className="orcamento-mais-acoes">
              <summary>Mais ações</summary>
              <div className="orcamento-acoes-secundarias">
                <AtalhoLocalizacao tipo="orcamento" id={detalhe.id} />
                {!detalhe.arquivado_em &&
                  !["declined", "cancelled"].includes(detalhe.situacao) &&
                  detalhe.versao.id === detalhe.versao_atual_id && (
                    <DesistenciaAtendimento
                      tipo="orcamento"
                      id={detalhe.id}
                      revisao={detalhe.revisao}
                      aprovado={detalhe.situacao === "approved"}
                      osVinculada={!!detalhe.ordem_servico_id}
                      atualizar={async () => {
                        setLink("");
                        await abrir(detalhe.id);
                      }}
                    />
                  )}
                <button
                  className="botao-secundario"
                  aria-label="Atualizar situação"
                  title="Atualizar situação"
                  disabled={ocupado}
                  onClick={() => void abrir(detalhe.id)}
                >
                  <Check size={15} />
                  <span>Atualizar situação</span>
                </button>
              </div>
            </details>
          </div>
        )}
        {detalhe && (
          <>
            <ConteudoProposta q={detalhe} recolherDetalhes exibirObservacoes={false} />
            <CobrancaDiagnostico documento={detalhe.id} tipo="automotivo" />
            {aviso && (
              <p className="aviso-cliente" role="status">
                {aviso}
              </p>
            )}
            {detalhe.arquivado_em && (
              <p className="aviso-cliente">
                Orçamento excluído. Motivo: {detalhe.motivo_exclusao}
              </p>
            )}
            {!detalhe.arquivado_em && detalhe.versao.id === detalhe.versao_atual_id && (
              <div className="acoes-proposta">
                <AcaoOrcamento
                  proposta={detalhe}
                  permiteOS={acesso.permite("work_orders")}
                  ocupado={ocupado || processandoFotos}
                  aprovar={() => void aprovar(detalhe)}
                  converter={() => void prepararConversao(detalhe)}
                />
                {detalhe.situacao === "draft" ? (
                  <>
                    <button
                      className="botao-secundario"
                      disabled={ocupado}
                      onClick={() => void editar(detalhe.id)}
                    >
                      Editar rascunho
                    </button>
                    {acesso.permite("work_orders") &&
                      !detalhe.ordem_servico_id &&
                      !detalhe.adicional_os_id && (
                        <button
                          className="botao-secundario"
                          disabled={ocupado}
                          onClick={() =>
                            void executar(async () => {
                              const os = await criarOSParaOrcamento(
                                acesso.demo,
                                oficina,
                                detalhe,
                              );
                              await Promise.all([
                                cache.invalidateQueries({ queryKey: ["os"] }),
                                cache.invalidateQueries({ queryKey: ["mapa-oficina"] }),
                              ]);
                              setDetalhe(null);
                              navegar("/ordens-servico?os=" + os);
                            })
                          }
                        >
                          <Plus size={16} />
                          Abrir OS aguardando aprovação
                        </button>
                      )}
                    <label>
                      Validade
                      <select
                        aria-label="Validade do orçamento"
                        value={validade}
                        onChange={(e) => setValidade(Number(e.target.value))}
                      >
                        {[3, 7, 15, 30].map((n) => (
                          <option key={n} value={n}>
                            {n} dias
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="botao-primario"
                      disabled={ocupado || processandoFotos || !detalhe.itens.length}
                      onClick={() =>
                        void executar(async () => {
                          const r = await emitirProposta(
                            acesso.demo,
                            oficina,
                            detalhe,
                            validade,
                          );
                          setDetalhe(r.proposta);
                          setLink(r.link);
                          setAviso("Orçamento salvo. Aguardando aprovação do cliente.");
                        })
                      }
                    >
                      <Send size={17} />
                      {ocupado ? "Salvando…" : "Concluir orçamento"}
                    </button>
                  </>
                ) : null}
              </div>
            )}
            {erro && !confirmacao && !autorizacao && !converterRapido && (
              <p role="alert" className="erro-formulario">
                {erro}
              </p>
            )}
            {detalhe.encerramento?.versao_id === detalhe.versao.id && (
              <p className="aviso-cliente">
                <strong>
                  {detalhe.encerramento.decisao === "nao_aprovou"
                    ? "Cliente não aprovou"
                    : "Cliente desistiu"}
                </strong>
                : {detalhe.encerramento.motivo}
              </p>
            )}
            {(detalhe.versao.pecas_a_trocar ||
              detalhe.versao.observacoes ||
              detalhe.versao.condicoes ||
              detalhe.versao.diagnostico ||
              detalhe.versao.queixa_cliente ||
              detalhe.versao.codigos_falha ||
              detalhe.versao.tipo_servico) && (
              <SecaoRecolhivel
                key={detalhe.versao.id}
                titulo="Observações e condições"
                classe="observacoes-orcamento"
              >
                <ObservacoesProposta q={detalhe} />
              </SecaoRecolhivel>
            )}
            <FotosOrcamento
              aoProcessar={setProcessandoFotos}
              aberta={abrirFotos}
              versao={detalhe.versao.id}
              rascunho={!detalhe.arquivado_em && !detalhe.versao.publicado_em}
            />
            <SecaoRecolhivel titulo="PDF, impressão e outras opções">
              {!acesso.demo && detalhe.historico.length > 1 && (
                <div className="acoes-proposta">
                  <label>
                    Versão
                    <select
                      value={detalhe.versao.id}
                      onChange={(e) => void abrir(detalhe.id, e.target.value)}
                      disabled={ocupado}
                    >
                      {detalhe.historico.map((v) => (
                        <option key={v.id} value={v.id}>
                          v{v.numero_versao} · {v.publicado_em ? "Emitida" : "Rascunho"}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              <div className="acoes-proposta">
                <Link
                  className="botao-secundario"
                  to={`/documentos?tipo=orcamento&id=${detalhe.id}&versao=${detalhe.versao.id}`}
                >
                  <Printer size={17} /> Visualizar e imprimir
                </Link>
                <button
                  className="botao-secundario"
                  disabled={ocupado}
                  onClick={() =>
                    void executar(async () => {
                      const { gerarPdf } = await import("../services/pdfOrcamento");
                      gerarPdf(detalhe, linkSomenteLocal() ? "" : link).save(
                        `orcamento-${detalhe.numero}-v${detalhe.versao.numero_versao}.pdf`,
                      );
                    }, false)
                  }
                >
                  <Download size={17} />
                  Baixar PDF
                </button>
                {!acesso.demo &&
                  !detalhe.arquivado_em &&
                  detalhe.versao.id === detalhe.versao_atual_id &&
                  ["awaiting_approval", "approved", "declined"].includes(
                    detalhe.situacao,
                  ) && (
                    <button
                      className="botao-secundario"
                      disabled={ocupado}
                      onClick={() =>
                        void executar(async () => {
                          setLink(await novoLink(oficina, detalhe));
                        })
                      }
                    >
                      <Copy size={17} />
                      Preparar link de aprovação
                    </button>
                  )}
              </div>
              {!detalhe.arquivado_em &&
                detalhe.versao.id === detalhe.versao_atual_id && (
                  <div className="acoes-proposta">
                    {detalhe.situacao !== "draft" &&
                      !detalhe.ordem_servico_id &&
                      !detalhe.adicional_aplicado_em && (
                        <button
                          className="botao-secundario"
                          disabled={ocupado}
                          onClick={() => setConfirmacao("revisar")}
                        >
                          Criar nova versão
                        </button>
                      )}
                    {!["approved", "cancelled"].includes(detalhe.situacao) && (
                      <button
                        className="botao-secundario"
                        disabled={ocupado}
                        onClick={() => setConfirmacao("cancelar")}
                      >
                        <X size={16} />
                        Cancelar orçamento
                      </button>
                    )}
                  </div>
                )}
            </SecaoRecolhivel>
            {link && (
              <div className="compartilhar-link">
                <label>
                  Link desta versão
                  <input readOnly value={link} onFocus={(e) => e.target.select()} />
                </label>
                <button
                  className="botao-secundario"
                  onClick={() =>
                    void executar(async () => {
                      await navigator.clipboard.writeText(link);
                      setAviso("Link copiado.");
                    })
                  }
                >
                  <Copy size={16} />
                  Copiar
                </button>
                <a
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  className="botao-secundario"
                >
                  Visualizar proposta
                </a>
                {
                  <a
                    className="botao-primario"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://wa.me/${detalhe.versao.dados_cliente.telefone_e164?.replace(/\D/g, "") ?? ""}?text=${encodeURIComponent(`Olá! Confira o orçamento #${detalhe.numero} da ${detalhe.versao.dados_oficina.nome}, no valor de ${dinheiro(detalhe.versao.total_centavos)}. ${linkSomenteLocal() ? "Segue o documento em PDF (anexe o arquivo à conversa)." : `Você pode aprovar ou recusar pelo link: ${link}`}`)}`}
                  >
                    Abrir WhatsApp
                  </a>
                }
              </div>
            )}
            {detalhe.adicional_os_id && (
              <p className="aviso-cliente">
                <Link to={`/ordens-servico?os=${detalhe.adicional_os_id}`}>
                  Voltar à OS original
                </Link>
                .{" "}
                {detalhe.adicional_aplicado_em
                  ? "Este adicional já foi incorporado."
                  : "Após a aprovação, abra a OS e escolha Mais opções → Vistoria e ferramentas para incluir os itens."}
              </p>
            )}
          </>
        )}
      </Dialogo>
      <Dialogo
        aberto={!!exclusao}
        titulo={`Excluir orçamento #${exclusao?.numero ?? ""}?`}
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
              await excluirProposta(acesso.demo, oficina, exclusao, motivoExclusao);
              setAviso(
                `Orçamento #${exclusao.numero} excluído. Você pode restaurá-lo em Mais situações → Excluídos.`,
              );
              setExclusao(null);
              setDetalhe(null);
              setParametros({});
              setPagina(0);
            });
          }}
        >
          <p className="texto-suave">
            O orçamento sairá da lista e os links serão desativados. O histórico será
            preservado e você poderá restaurá-lo.
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
              placeholder="Ex.: orçamento duplicado ou cadastro incorreto"
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
              {ocupado ? "Excluindo…" : "Excluir orçamento"}
            </button>
          </div>
        </form>
      </Dialogo>
      <Dialogo
        aberto={!!converterRapido}
        fechar={() => {
          if (!ocupado) setConverterRapido(null);
        }}
        titulo="Transformar orçamento aprovado em OS?"
      >
        <p>
          Orçamento #{converterRapido?.numero} ·{" "}
          {converterRapido?.versao.dados_cliente.nome}. A OS terá os itens e valores
          aprovados.
        </p>
        {erro && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        <div className="acoes-formulario">
          <button
            className="botao-secundario"
            disabled={ocupado}
            onClick={() => setConverterRapido(null)}
          >
            Agora não
          </button>
          <button
            className="botao-primario"
            disabled={ocupado}
            onClick={() =>
              converterRapido &&
              void executar(async () => {
                const os = await acaoProposta(
                  acesso.demo,
                  oficina,
                  converterRapido,
                  "converter",
                );
                if (typeof os !== "string")
                  throw new Error(
                    "Não foi possível identificar a OS. Atualize o orçamento e tente novamente.",
                  );
                setConverterRapido(null);
                setDetalhe(null);
                await atualizarOrdens();
                navegar("/ordens-servico?os=" + os);
              })
            }
          >
            {ocupado ? "Criando…" : "Sim, transformar em OS"}
          </button>
        </div>
      </Dialogo>
      <Dialogo
        aberto={!!confirmacao}
        fechar={() => {
          if (!ocupado) setConfirmacao(null);
        }}
        titulo={
          confirmacao === "cancelar" ? "Cancelar orçamento?" : "Criar nova versão?"
        }
      >
        <p className="texto-suave">
          {confirmacao === "cancelar"
            ? "Os links serão revogados. O orçamento e seu histórico serão preservados."
            : "A proposta anterior será preservada no histórico, mas seus links serão desativados. A nova versão precisará ser emitida e aprovada novamente."}
        </p>
        {erro && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        <div className="acoes-formulario">
          <button
            className="botao-secundario"
            disabled={ocupado}
            onClick={() => setConfirmacao(null)}
          >
            Voltar
          </button>
          <button
            className="botao-primario"
            disabled={ocupado}
            onClick={() =>
              detalhe &&
              confirmacao &&
              void executar(async () => {
                const acao = confirmacao;
                await acaoProposta(acesso.demo, oficina, detalhe, acao);
                setDetalhe(await obterProposta(acesso.demo, oficina, detalhe.id));
                setConfirmacao(null);
                setLink("");
                setAviso("Orçamento atualizado.");
              })
            }
          >
            {ocupado ? "Processando…" : "Confirmar"}
          </button>
        </div>
      </Dialogo>
      <Dialogo
        aberto={!!autorizacao}
        titulo="Registrar autorização do cliente"
        fechar={() => {
          if (!ocupado) setAutorizacao(null);
        }}
      >
        {erro && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        {autorizacao && (
          <ConfirmarAutorizacao
            key={autorizacao.versao_atual_id}
            nomeInicial={autorizacao.versao.dados_cliente.nome}
            total={
              autorizacao.versao.total_centavos -
              abatimentoDiagnostico(
                autorizacao.versao.taxa_diagnostico,
                autorizacao.versao.total_centavos,
              )
            }
            ocupado={ocupado}
            confirmar={(m) => void aprovar(autorizacao, m)}
          />
        )}
      </Dialogo>
    </>
  );
}
