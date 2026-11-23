import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  FileDown,
  Mic,
  Pencil,
  Send,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { Dialogo } from "./Dialogo";
import { novoId } from "../lib/uuid";
import { erroPublico } from "../lib/supabase";
import { dinheiro } from "../lib/formatacao";
import {
  contextoDaRota,
  destinoAssistenteValido,
  historicoLimitado,
  rotuloConfirmacaoAssistente,
  selecionarContas,
} from "../lib/assistente";
import type {
  ConsultaAssistente,
  ContextoAssistente,
  MensagemAssistente,
  PropostaAssistente,
  ResultadoAssistente,
} from "../lib/assistente";
import { abrirAssistente, useContextoAssistente } from "../lib/contextoAssistente";
import {
  pedidoAjustesItens,
  type AjustesItensAssistente,
} from "../lib/ajustesItensAssistente";
import { QuantidadeItemAssistente } from "./QuantidadeItemAssistente";
import {
  atualizarContasAssistente,
  cancelarAssistente,
  confirmarAssistente,
  pedirAssistente,
} from "../services/assistente";
import "./AssistenteOperacional.css";
import type { SolicitacaoAssistente } from "./AcessoAssistente";

const titulos: Record<string, string> = {
  clientes: "Clientes encontrados",
  objetos: "Identificações encontradas",
  catalogo: "Itens do catálogo",
  servicos: "Atendimentos",
  parados: "Serviços parados",
  estoque: "Estoque",
  contas: "Contas em aberto",
  devedores: "Maiores saldos em aberto",
  financeiro: "Resumo financeiro",
  agenda: "Agenda",
  recursos: "Responsáveis disponíveis",
};
const valorLinha = (l: Record<string, unknown>) => {
  const valor = l.aberto_centavos ?? l.preco_padrao_centavos ?? l.total_centavos;
  return typeof valor === "number" ? dinheiro(valor) : "";
};
const nomeLinha = (l: Record<string, unknown>) =>
  String(
    l.descricao ||
      l.nome ||
      l.cliente ||
      l.titulo ||
      l.modelo ||
      l.servico ||
      "Registro",
  );

function Consulta({
  consulta,
  escolher,
  exportar,
  ocupado,
}: {
  consulta: ConsultaAssistente;
  escolher: (texto: string) => void;
  exportar: (consulta: ConsultaAssistente, ids: string[]) => Promise<void>;
  ocupado: boolean;
}) {
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const c = consulta;
  const selecionaveis = [
    "clientes",
    "objetos",
    "catalogo",
    "servicos",
    "recursos",
    "devedores",
  ].includes(c.tipo);
  return (
    <section className="assistente-consulta">
      <h3>{titulos[c.tipo] || "Consulta"}</h3>
      {!c.linhas.length && <p>Nenhum registro encontrado.</p>}
      {c.tipo === "financeiro" ? (
        c.linhas.map((l, i) => (
          <div key={i} className="assistente-financeiro">
            <small>
              {String(l.inicio).split("-").reverse().join("/")} a{" "}
              {String(l.fim).split("-").reverse().join("/")}
            </small>
            <dl>
              <div>
                <dt>Receitas por competência</dt>
                <dd>{dinheiro(Number(l.receitas_centavos))}</dd>
              </div>
              <div>
                <dt>Despesas por competência</dt>
                <dd>{dinheiro(Number(l.despesas_centavos))}</dd>
              </div>
              <div>
                <dt>Dinheiro recebido no período</dt>
                <dd>{dinheiro(Number(l.recebido_centavos))}</dd>
              </div>
            </dl>
            <small>{String(l.base)}</small>
          </div>
        ))
      ) : (
        <ul className="assistente-resultados">
          {c.linhas.map((l, i) => {
            const id = String(l.id || l.cliente_id || i);
            const texto =
              c.tipo === "devedores"
                ? `Consulte as contas de ${nomeLinha(l)}, cliente ${id}.`
                : `Use este resultado de ${c.tipo}: ${nomeLinha(l)}. Identificador ${id}.`;
            return (
              <li key={`${id}:${i}`}>
                {c.tipo === "contas" && (
                  <input
                    type="checkbox"
                    aria-label={`Incluir ${nomeLinha(l)} no PDF`}
                    disabled={ocupado || !l.cliente_id || !l.servico_id}
                    checked={selecionados.includes(id)}
                    onChange={(e) =>
                      setSelecionados((anteriores) =>
                        e.target.checked
                          ? [...anteriores, id]
                          : anteriores.filter((v) => v !== id),
                      )
                    }
                  />
                )}
                <div>
                  {selecionaveis && (c.tipo !== "devedores" || l.cliente_id) ? (
                    <button
                      className="assistente-escolha"
                      onClick={() => escolher(texto)}
                      disabled={ocupado}
                    >
                      {nomeLinha(l)}
                    </button>
                  ) : (
                    <strong>{nomeLinha(l)}</strong>
                  )}
                  <small>
                    {[
                      l.numero ? `OS #${l.numero}` : "",
                      l.identificacao || l.modelo,
                      l.motivo,
                      l.vencimento
                        ? `Vence em ${String(l.vencimento).split("-").reverse().join("/")}`
                        : "",
                      l.inicio
                        ? new Date(String(l.inicio)).toLocaleString("pt-BR")
                        : "",
                      c.tipo === "estoque"
                        ? `Saldo registrado: ${l.quantidade} · Mínimo: ${l.estoque_minimo}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </div>
                <b>{valorLinha(l)}</b>
              </li>
            );
          })}
        </ul>
      )}
      {c.pode_haver_mais && (
        <p className="assistente-limite">
          Mostrando até {c.limite} resultados. Refine a busca para encontrar os demais.
        </p>
      )}
      {c.tipo === "contas" && !!c.linhas.length && (
        <>
          <small>Selecione as contas das OS que entram no demonstrativo.</small>
          <button
            className="botao-secundario"
            disabled={ocupado || !selecionados.length}
            onClick={() => void exportar(c, selecionados)}
          >
            <FileDown size={16} /> Gerar PDF ({selecionados.length})
          </button>
        </>
      )}
    </section>
  );
}

export function AssistenteOperacional({
  solicitacao,
}: {
  solicitacao: SolicitacaoAssistente;
}) {
  const acesso = useAcesso(),
    navegar = useNavigate(),
    local = useLocation(),
    cache = useQueryClient();
  const complementar = useContextoAssistente();
  const [contextoExplicito, setContextoExplicito] = useState<ContextoAssistente | null>(
    null,
  );
  const contexto = contextoExplicito || {
    ...contextoDaRota(local.pathname, local.search),
    ...complementar,
  };
  const [aberto, setAberto] = useState(false),
    [texto, setTexto] = useState("");
  const [mensagens, setMensagens] = useState<MensagemAssistente[]>([]);
  const [proposta, setProposta] = useState<PropostaAssistente | null>(null);
  const [ajustesItens, setAjustesItens] = useState<AjustesItensAssistente>({});
  const [consultas, setConsultas] = useState<ConsultaAssistente[]>([]);
  const [resultado, setResultado] = useState<ResultadoAssistente | null>(null);
  const [erro, setErro] = useState(""),
    [ocupacao, setOcupacao] = useState("");
  const [gravando, setGravando] = useState(false),
    [segundos, setSegundos] = useState(0);
  const [audio, setAudio] = useState<Blob | undefined>(),
    [audioUrl, setAudioUrl] = useState("");
  const sessao = useRef(novoId()),
    trava = useRef(false),
    pedido = useRef<AbortController | null>(null);
  const gravador = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const descartarGravacao = useRef(false),
    montado = useRef(true),
    formulario = useRef<HTMLTextAreaElement>(null);
  const finalConversa = useRef<HTMLDivElement>(null);
  const resumoConversa = useRef<HTMLElement>(null);
  const contextoAnterior = useRef("");
  const pedidoMicrofone = useRef(0),
    iniciandoMicrofone = useRef(false);
  const ocupado = !!ocupacao;
  const ajustesPendentes = Object.keys(ajustesItens).length > 0;
  let pedidoAjustes = "",
    erroAjustes = "";
  if (proposta && ajustesPendentes) {
    try {
      pedidoAjustes = pedidoAjustesItens(proposta, ajustesItens);
    } catch (e) {
      erroAjustes = e instanceof Error ? e.message : "Confira as quantidades.";
    }
  }
  const oficina = acesso.oficina!.id;
  const ultimaSolicitacao = useRef<SolicitacaoAssistente | null>(null);
  useEffect(() => {
    const abrir = () => {
      if (ultimaSolicitacao.current === solicitacao) return;
      ultimaSolicitacao.current = solicitacao;
      if (trava.current || gravador.current?.state === "recording") return;
      setAberto(true);
      const v = solicitacao;
      const selecionado = v?.contexto || {
        ...contextoDaRota(local.pathname, local.search),
        ...complementar,
      };
      const chaveContexto = JSON.stringify(selecionado);
      if (contextoAnterior.current && contextoAnterior.current !== chaveContexto) {
        if (!acesso.demo)
          void cancelarAssistente(oficina, sessao.current).catch(() => {});
        sessao.current = novoId();
        setMensagens([]);
        setConsultas([]);
        setProposta(null);
        setAjustesItens({});
        setResultado(null);
        setErro("");
        setTexto("");
        setAudio(undefined);
        setAudioUrl("");
      }
      contextoAnterior.current = chaveContexto;
      setContextoExplicito(v?.contexto || null);
      if (v?.pedido) setTexto(v.pedido);
    };
    abrir();
  }, [solicitacao, local.pathname, local.search, complementar, oficina, acesso.demo]);
  useEffect(() => {
    if (aberto) formulario.current?.focus({ preventScroll: true });
  }, [aberto]);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      descartarGravacao.current = true;
      pedido.current?.abort();
      clearInterval(timer.current);
      if (gravador.current?.state === "recording") gravador.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  useEffect(() => {
    if (audioUrl) return () => URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);
  useEffect(() => {
    if (aberto)
      (proposta ? resumoConversa.current : finalConversa.current)?.scrollIntoView({
        block: proposta ? "start" : "nearest",
        behavior: "instant",
      });
  }, [aberto, mensagens.length, proposta, resultado]);

  function limparAudio() {
    setAudio(undefined);
    setAudioUrl("");
  }
  function editarNoChat(pedido: string) {
    if (ocupado || gravando || ajustesPendentes) return;
    limparAudio();
    setTexto(pedido);
    formulario.current?.focus();
  }
  function fechar() {
    if (trava.current) return;
    pedidoMicrofone.current++;
    descartarGravacao.current = true;
    if (gravador.current?.state === "recording") gravador.current.stop();
    setAberto(false);
  }
  async function gravar() {
    if (iniciandoMicrofone.current) return;
    setErro("");
    if (acesso.demo) {
      setErro(
        "A voz usa a integração de IA da conta real. Entre em uma empresa com o plano habilitado.",
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setErro(
        "Seu navegador não oferece gravação aqui. Use o microfone do teclado ou escreva o pedido.",
      );
      return;
    }
    iniciandoMicrofone.current = true;
    const numeroPedido = ++pedidoMicrofone.current;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!montado.current || numeroPedido !== pedidoMicrofone.current) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = s;
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(
        (tipo) => MediaRecorder.isTypeSupported(tipo),
      );
      const r = new MediaRecorder(s, mimeType ? { mimeType } : undefined),
        partes: BlobPart[] = [];
      gravador.current = r;
      descartarGravacao.current = false;
      limparAudio();
      setSegundos(0);
      let tamanho = 0;
      r.ondataavailable = (e) => {
        if (e.data.size) {
          partes.push(e.data);
          tamanho += e.data.size;
          if (tamanho > 10 * 1024 * 1024 && r.state === "recording") r.stop();
        }
      };
      r.onstop = () => {
        clearInterval(timer.current);
        s.getTracks().forEach((t) => t.stop());
        if (!montado.current) return;
        setGravando(false);
        if (descartarGravacao.current) return;
        if (tamanho > 10 * 1024 * 1024 || !tamanho) {
          setErro("Grave um áudio mais curto, de até 90 segundos.");
          return;
        }
        const blob = new Blob(partes, { type: r.mimeType || "audio/webm" });
        setAudio(blob);
        setAudioUrl(URL.createObjectURL(blob));
      };
      r.onerror = () => {
        descartarGravacao.current = true;
        clearInterval(timer.current);
        s.getTracks().forEach((t) => t.stop());
        if (r.state === "recording") r.stop();
        setGravando(false);
        setErro("Não foi possível gravar. Tente novamente ou escreva.");
      };
      r.start(1000);
      setGravando(true);
      let tempo = 0;
      timer.current = setInterval(() => {
        setSegundos(++tempo);
        if (tempo >= 90 && r.state === "recording") r.stop();
      }, 1000);
    } catch {
      setErro(
        "O microfone não foi liberado. Permita o acesso no navegador ou escreva o pedido.",
      );
    } finally {
      iniciandoMicrofone.current = false;
    }
  }
  async function enviar(pedidoTexto = texto) {
    if (trava.current || gravando || (!pedidoTexto.trim() && !audio)) return;
    if (ajustesPendentes && (!pedidoAjustes || pedidoTexto !== pedidoAjustes)) return;
    if (acesso.demo) {
      setErro(
        "Entre em uma conta real com IA habilitada para consultar os dados e salvar pelo assistente.",
      );
      return;
    }
    trava.current = true;
    setOcupacao(
      audio
        ? "Transcrevendo e conferindo seu pedido…"
        : "Consultando os dados da empresa…",
    );
    setErro("");
    setResultado(null);
    const novas: MensagemAssistente[] = [
      ...mensagens,
      { role: "user", content: audio ? "Áudio enviado…" : pedidoTexto.trim() },
    ];
    setMensagens(novas);
    setProposta(null);
    setAjustesItens({});
    setConsultas([]);
    const controller = new AbortController();
    pedido.current = controller;
    try {
      const r = await pedirAssistente(
        {
          oficina,
          sessao: sessao.current,
          chave: novoId(),
          texto: pedidoTexto,
          contexto,
          historico: historicoLimitado(mensagens),
        },
        audio,
        controller.signal,
      );
      if (!montado.current) return;
      const confirmadas = r.transcricao
        ? [...novas.slice(0, -1), { role: "user" as const, content: r.transcricao }]
        : novas;
      setMensagens([...confirmadas, { role: "assistant", content: r.texto }]);
      setProposta(r.proposta);
      setConsultas(r.consultas);
      setTexto("");
      limparAudio();
    } catch (e) {
      if (montado.current) {
        setErro(erroPublico(e));
        setMensagens(mensagens);
      }
    } finally {
      trava.current = false;
      if (montado.current) setOcupacao("");
    }
  }
  async function confirmar() {
    if (
      !proposta ||
      trava.current ||
      gravando ||
      texto.trim() ||
      audio ||
      ajustesPendentes
    )
      return;
    trava.current = true;
    setOcupacao("Salvando e conferindo o resultado…");
    setErro("");
    try {
      const r = await confirmarAssistente(oficina, proposta.id);
      setResultado(r);
      setProposta(null);
      setAjustesItens({});
      setMensagens((m) => [...m, { role: "assistant", content: r.mensagem }]);
      // Invalida apenas as consultas ativas; o Query Client mantém a deduplicação.
      void cache.invalidateQueries().catch(() => {});
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      if (montado.current) setOcupacao("");
    }
  }
  async function descartar(novaConversa = false) {
    if (trava.current) return;
    trava.current = true;
    setOcupacao("Cancelando o resumo…");
    setErro("");
    try {
      if (!acesso.demo && mensagens.length)
        await cancelarAssistente(oficina, sessao.current);
      setProposta(null);
      setAjustesItens({});
      setResultado(null);
      if (novaConversa) {
        sessao.current = novoId();
        setMensagens([]);
        setConsultas([]);
        setTexto("");
        limparAudio();
      }
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupacao("");
    }
  }
  async function exportar(consulta: ConsultaAssistente, ids: string[]) {
    if (trava.current) return;
    trava.current = true;
    setOcupacao("Conferindo os saldos e preparando o PDF…");
    setErro("");
    try {
      const escolhidas = selecionarContas(consulta, ids);
      const atual = await atualizarContasAssistente(
        oficina,
        String(escolhidas[0].cliente_id),
      );
      setConsultas((c) => [...c.filter((v) => v !== consulta), atual]);
      if (ids.some((id) => !atual.linhas.some((linha) => linha.id === id))) {
        throw Error(
          "Uma das contas foi quitada ou alterada. Confira a lista atualizada e selecione novamente.",
        );
      }
      const atuais = selecionarContas(atual, ids);
      if (
        atuais.some(
          (l) =>
            Number(l.aberto_centavos) !==
            Number(escolhidas.find((i) => i.id === l.id)?.aberto_centavos),
        )
      ) {
        throw Error(
          "Os saldos mudaram. Confira as contas atualizadas e selecione novamente.",
        );
      }
      const { gerarPdfContasAssistente } =
        await import("../services/pdfContasAssistente");
      const pdf = await gerarPdfContasAssistente(oficina, atuais, atual.consultado_em);
      pdf.save("conta-cliente.pdf");
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupacao("");
    }
  }
  const ultimas = consultas.filter(
    (c, i) => consultas.findLastIndex((v) => v.tipo === c.tipo) === i,
  );
  return (
    <>
      {!aberto && (
        <button
          className="assistente-flutuante"
          onClick={() => abrirAssistente()}
          aria-label="Abrir assistente por voz ou texto"
        >
          <Sparkles size={20} />
          <span>Assistente</span>
        </button>
      )}
      <Dialogo
        aberto={aberto}
        fechar={fechar}
        titulo="Assistente"
        classe="assistente-dialogo"
      >
        <div className="assistente-contexto">
          <span>
            {contexto.titulo || contexto.tela}
            {contexto.os || contexto.atendimento
              ? " · atendimento selecionado"
              : contexto.cliente
                ? " · cliente selecionado"
                : ""}
          </span>
          <button
            onClick={() => void descartar(true)}
            disabled={ocupado || gravando || !mensagens.length}
          >
            Nova conversa
          </button>
        </div>
        <div className="assistente-conversa" aria-busy={ocupado}>
          {!mensagens.length && (
            <div className="assistente-boas-vindas">
              <Sparkles size={28} />
              <h3>Como posso ajudar?</h3>
              <p>Fale ou escreva. Eu consulto os dados e preparo o que você precisa.</p>
              <div className="assistente-sugestoes">
                {[
                  "Quero criar uma ordem de serviço",
                  "Quero criar um orçamento",
                  "Quem está devendo mais?",
                  "Quais serviços estão parados?",
                ].map((s) => (
                  <button key={s} disabled={ocupado} onClick={() => void enviar(s)}>
                    {s}
                  </button>
                ))}
              </div>
              <small>Antes de salvar uma alteração, você confere e confirma.</small>
            </div>
          )}
          {mensagens.map((m, i) => (
            <div key={i} className={`assistente-mensagem ${m.role}`}>
              <small>{m.role === "user" ? "Você" : "Assistente"}</small>
              <p>
                {m.role === "assistant"
                  ? m.content
                      .split(/(\*\*[^*\n]+\*\*)/g)
                      .map((trecho, n) =>
                        trecho.startsWith("**") && trecho.endsWith("**") ? (
                          <strong key={n}>{trecho.slice(2, -2)}</strong>
                        ) : (
                          trecho
                        ),
                      )
                  : m.content}
              </p>
            </div>
          ))}
          {!!ultimas.length && (
            <details className="assistente-fontes" open={!proposta && !resultado}>
              <summary>Resultados consultados ({ultimas.length})</summary>
              {ultimas.map((c, i) => (
                <Consulta
                  key={`${c.tipo}:${c.consultado_em}:${i}`}
                  consulta={c}
                  escolher={(v) => void enviar(v)}
                  exportar={exportar}
                  ocupado={ocupado || gravando || ajustesPendentes}
                />
              ))}
            </details>
          )}
          {proposta && (
            <section
              ref={resumoConversa}
              className="assistente-proposta"
              aria-label="Resumo para confirmar"
            >
              <div className="assistente-proposta-topo">
                <span>CONFERIR ANTES DE SALVAR</span>
                <h3>{proposta.titulo}</h3>
              </div>
              <dl>
                {proposta.campos
                  .filter((c) => c.valor)
                  .map((c, i) => (
                    <div key={i}>
                      <dt>{c.rotulo}</dt>
                      <dd>{c.valor}</dd>
                      {c.editar && (
                        <button
                          type="button"
                          className="assistente-editar"
                          disabled={ocupado || gravando || ajustesPendentes}
                          aria-label={`Alterar ${c.editar === "veiculo" ? "veículo" : c.editar === "motor" ? "motor" : c.rotulo.toLowerCase()}`}
                          onClick={() =>
                            editarNoChat(
                              c.editar === "veiculo"
                                ? "Troque o veículo para "
                                : c.editar === "motor"
                                  ? "Troque o motor para "
                                  : `Altere ${c.rotulo.toLowerCase()} para `,
                            )
                          }
                        >
                          <Pencil size={14} /> Alterar
                        </button>
                      )}
                    </div>
                  ))}
              </dl>
              {proposta.itens && (
                <ul>
                  {proposta.itens.map((item, i) => (
                    <li key={i}>
                      <div>
                        <strong>{item.descricao}</strong>
                        {item.aproximacao && (
                          <div className="assistente-aproximacao">
                            <strong>Sugestão por nome parecido</strong>
                            <span>Você pediu: “{item.aproximacao.pedido}”</span>
                          </div>
                        )}
                        <small>
                          {item.quantidade} × {dinheiro(item.preco_centavos)} ·{" "}
                          {item.origem}
                        </small>
                        {proposta.acao === "documento" && (
                          <QuantidadeItemAssistente
                            nome={item.descricao}
                            original={item.quantidade}
                            valor={
                              Object.hasOwn(ajustesItens, i)
                                ? ajustesItens[i]
                                : String(item.quantidade)
                            }
                            bloqueado={ocupado || gravando || !!texto.trim() || !!audio}
                            alterar={(valor) =>
                              setAjustesItens((anteriores) => {
                                const novos = { ...anteriores };
                                if (
                                  valor !== null &&
                                  /^\d+$/.test(valor) &&
                                  Number(valor) === item.quantidade
                                )
                                  delete novos[i];
                                else novos[i] = valor;
                                return novos;
                              })
                            }
                          />
                        )}
                        <button
                          type="button"
                          className="assistente-editar"
                          disabled={ocupado || gravando || ajustesPendentes}
                          aria-label={`Trocar ${item.descricao}`}
                          onClick={() =>
                            editarNoChat(
                              `Troque o item ${i + 1} (${item.descricao}) por `,
                            )
                          }
                        >
                          <Pencil size={14} /> Trocar item
                        </button>
                      </div>
                      <b>{dinheiro(item.quantidade * item.preco_centavos)}</b>
                    </li>
                  ))}
                </ul>
              )}
              {proposta.total_centavos != null && (
                <div className="assistente-total">
                  <span>
                    {proposta.titulo === "Adicionar itens à OS"
                      ? "Total dos novos itens"
                      : "Total"}
                  </span>
                  <strong>{dinheiro(proposta.total_centavos)}</strong>
                </div>
              )}
              <small>
                {ajustesPendentes
                  ? "O total será recalculado ao atualizar o resumo."
                  : "Ajuste as quantidades aqui ou peça outra alteração no chat."}
              </small>
            </section>
          )}
          {resultado && (
            <div className="assistente-sucesso" role="status">
              <Check size={19} />
              <strong>{resultado.mensagem}</strong>
              {destinoAssistenteValido(resultado.destino) && (
                <button
                  className="botao-secundario"
                  onClick={() => {
                    setAberto(false);
                    window.dispatchEvent(new Event("patio:abrir-registro-assistente"));
                    navegar(resultado.destino);
                  }}
                >
                  Ver registro
                </button>
              )}
            </div>
          )}
          {ocupado && (
            <p role="status" className="assistente-status">
              {ocupacao}
            </p>
          )}
          {erro && (
            <p role="alert" className="erro-formulario">
              {erro}
            </p>
          )}
          <div ref={finalConversa} />
        </div>
        {proposta && (
          <div className="assistente-confirmacao-fixa">
            <small>
              {ajustesPendentes
                ? "Atualize o resumo para conferir os ajustes antes de salvar."
                : "Confira o resumo e use o botão abaixo para salvar."}
            </small>
            {ajustesPendentes && (
              <div className="assistente-ajustes-acoes">
                <button
                  type="button"
                  className="botao-primario"
                  disabled={ocupado || !!erroAjustes || !pedidoAjustes}
                  onClick={() => {
                    setTexto(pedidoAjustes);
                    void enviar(pedidoAjustes);
                  }}
                >
                  Atualizar resumo
                </button>
                <button
                  type="button"
                  className="assistente-editar"
                  disabled={ocupado}
                  onClick={() => setAjustesItens({})}
                >
                  Desfazer ajustes
                </button>
                {erroAjustes && <small role="alert">{erroAjustes}</small>}
              </div>
            )}
            <div className="assistente-proposta-acoes">
              <button
                className="botao-primario"
                disabled={
                  ocupado || gravando || !!texto.trim() || !!audio || ajustesPendentes
                }
                onClick={() => void confirmar()}
              >
                <Check size={17} /> {rotuloConfirmacaoAssistente(proposta)}
              </button>
              <button
                className="botao-secundario"
                disabled={ocupado || gravando}
                onClick={() => void descartar()}
              >
                Descartar
              </button>
              {["Criar ordem de serviço", "Criar orçamento"].includes(
                proposta.titulo,
              ) && (
                <button
                  type="button"
                  className="assistente-editar"
                  disabled={
                    ocupado || gravando || !!texto.trim() || !!audio || ajustesPendentes
                  }
                  onClick={() =>
                    void enviar(
                      proposta.titulo === "Criar orçamento"
                        ? "Quero uma ordem de serviço, não orçamento. Mantenha os mesmos dados e itens."
                        : "Quero um orçamento, não ordem de serviço. Mantenha os mesmos dados e itens.",
                    )
                  }
                >
                  {proposta.titulo === "Criar orçamento"
                    ? "Mudar para OS"
                    : "Mudar para orçamento"}
                </button>
              )}
            </div>
            {(texto.trim() || audio) && (
              <small>
                Envie a correção para atualizar o resumo antes de confirmar.
              </small>
            )}
          </div>
        )}
        {!ajustesPendentes && (
          <form
            className={`assistente-compositor${proposta ? " assistente-compositor-resumo" : ""}`}
            onSubmit={(e) => {
              e.preventDefault();
              void enviar();
            }}
          >
            {audioUrl && (
              <div className="assistente-audio">
                <audio
                  src={audioUrl}
                  controls
                  aria-label="Ouvir áudio antes de enviar"
                />
                <button
                  type="button"
                  className="botao-icone"
                  aria-label="Descartar áudio"
                  disabled={ocupado}
                  onClick={limparAudio}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            )}
            <label className="assistente-rotulo" htmlFor="pedido-assistente">
              {audio ? "Áudio pronto para enviar" : "Seu pedido"}
            </label>
            {!audio && (
              <textarea
                ref={formulario}
                id="pedido-assistente"
                rows={proposta ? 1 : 2}
                maxLength={3000}
                value={texto}
                disabled={ocupado || gravando || ajustesPendentes}
                placeholder={
                  proposta
                    ? "Escreva aqui o que deseja alterar…"
                    : "Ex.: crie uma OS para o cliente João…"
                }
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void enviar();
                  }
                }}
              />
            )}
            <div className="assistente-enviar">
              <button
                type="button"
                className={`botao-secundario ${gravando ? "assistente-gravando" : ""}`}
                disabled={ocupado || ajustesPendentes}
                onClick={() => (gravando ? gravador.current?.stop() : void gravar())}
              >
                {gravando ? <Square size={17} /> : <Mic size={17} />}
                {gravando ? `Parar · ${segundos}s` : "Gravar áudio"}
              </button>
              <button
                className="botao-primario"
                disabled={
                  ocupado || gravando || ajustesPendentes || (!texto.trim() && !audio)
                }
              >
                <Send size={17} />{" "}
                {ocupado
                  ? "Aguarde…"
                  : proposta
                    ? "Enviar correção"
                    : "Enviar mensagem"}
              </button>
            </div>
            {!proposta && !ocupado && !gravando && !texto.trim() && !audio && (
              <small>Digite uma mensagem ou grave um áudio para enviar.</small>
            )}
            <small>
              Texto e áudio enviados à IA da empresa. Evite senhas e dados sensíveis.
            </small>
          </form>
        )}
      </Dialogo>
    </>
  );
}
