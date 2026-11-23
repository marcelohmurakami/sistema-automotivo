import { useRef, useState } from "react";
import { componenteSobDemanda } from "../lib/componenteSobDemanda";
import { useBuscaDebounced } from "../lib/useBuscaDebounced";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Printer, ClipboardCheck, ChevronRight } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { Dialogo } from "../components/Dialogo";
import { Qualidade as RetornosAuto } from "./Qualidade";
import { GarantiasServicos as RetornosServicos } from "./GarantiasServicos";
import type { OcorrenciaAnalise } from "../components/QualidadeOperacional";
const BuscaCompra = componenteSobDemanda(async () => ({
  default: (await import("../components/BuscaCompra")).BuscaCompra,
}));
const SatisfacaoQualidade = componenteSobDemanda(async () => ({
  default: (await import("../components/SatisfacaoQualidade")).SatisfacaoQualidade,
}));
const FinanceiroGarantia = componenteSobDemanda(async () => ({
  default: (await import("../components/QualidadeOperacional")).FinanceiroGarantia,
}));
const CustosOcorrenciaAnalise = componenteSobDemanda(async () => ({
  default: (await import("../components/QualidadeOperacional")).CustosOcorrenciaAnalise,
}));
import {
  camposQualidade,
  etapasQualidade,
  titulosQualidade,
  roteiroAnalise,
  caminhoDocumentoQualidade,
  pacoteAssinatura,
  textoAvisoRetirada,
  type TipoAcompanhamento,
  type AcompanhamentoQualidade,
  type DocumentoQualidade,
  type CampoQualidade,
} from "../lib/qualidadeAvancada";
import { operacaoQualidade } from "../services/qualidadeAvancada";
import { erroPublico } from "../lib/supabase";
import { mesDoRelatorio } from "../lib/relatorioOficina";
import { hojeNoAparelho } from "../lib/dataServico";
import { dataDocumento } from "../lib/documentoCliente";
import { novoId } from "../lib/uuid";
import { dinheiro } from "../lib/formatacao";
import "./Compras.css";
import "./QualidadeAvancada.css";
import "../components/qualidade/QualidadeServicos.css";
const abas = {
  retornos: "Retornos",
  analise: "Análise da falha",
  fabricante: "Fabricante",
  satisfacao: "Satisfação",
  custodia: "Não retirados",
  assinatura: "Assinaturas",
};
type Aba = keyof typeof abas;
type Edicao = {
  id: string;
  tipo: TipoAcompanhamento;
  situacao: string;
  dados: Record<string, string | number>;
  documento: DocumentoQualidade | null;
  salvo?: AcompanhamentoQualidade;
};
const baixarJson = (obj: unknown, nome: string) => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
export function QualidadeAvancada() {
  const executando = useRef(false);
  const a = useAcesso(),
    w = a.oficina!,
    qc = useQueryClient(),
    [params, setParams] = useSearchParams();
  const aba = (
    (params.get("aba") || "") in abas ? params.get("aba") : "retornos"
  ) as Aba;
  const mes = mesDoRelatorio(hojeNoAparelho()),
    [inicio, setInicio] = useState(
      /^\d{4}-\d{2}-\d{2}$/.test(params.get("inicio") || "")
        ? params.get("inicio")!
        : mes.inicio,
    ),
    [fim, setFim] = useState(
      /^\d{4}-\d{2}-\d{2}$/.test(params.get("fim") || "")
        ? params.get("fim")!
        : mes.fim,
    ),
    [busca, setBusca] = useState(""),
    [pagina, setPagina] = useState(0),
    [dias, setDias] = useState(7);
  const [edicao, setEdicao] = useState<Edicao | null>(null),
    [ocorrencia, setOcorrencia] = useState<{
      analise: string;
      dados: OcorrenciaAnalise;
    } | null>(null),
    [buscaDoc, setBuscaDoc] = useState(""),
    [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [historico, setHistorico] = useState(false);
  const gestao = w.perfil !== "staff",
    ehCaso = ["analise", "fabricante", "custodia", "assinatura"].includes(aba);
  const termo = useBuscaDebounced(busca),
    termoDocumento = useBuscaDebounced(buscaDoc);
  const q = useQuery({
    queryKey: ["qualidade-avancada", w.id, a.demo, aba, inicio, fim, termo, pagina],
    queryFn: ({ signal }) =>
      operacaoQualidade<AcompanhamentoQualidade[]>(
        a.demo,
        "listar_acompanhamentos_qualidade",
        {
          p_oficina: w.id,
          p_tipo: aba,
          p_inicio: inicio,
          p_fim: fim,
          p_busca: termo,
          p_pagina: pagina,
        },
        signal,
      ),
    enabled: gestao && ehCaso,
  });
  const retirada = useQuery({
    queryKey: ["qualidade-avancada", w.id, "retiradas", dias, pagina],
    queryFn: ({ signal }) =>
      operacaoQualidade<DocumentoQualidade[]>(
        a.demo,
        "consultar_retiradas_qualidade",
        { p_oficina: w.id, p_dias: dias, p_pagina: pagina },
        signal,
      ),
    enabled: gestao && aba === "custodia",
  });
  const docs = useQuery({
    queryKey: [
      "qualidade-avancada",
      w.id,
      a.demo,
      "documentos",
      termoDocumento,
      edicao?.tipo,
    ],
    queryFn: ({ signal }) =>
      operacaoQualidade<DocumentoQualidade[]>(
        a.demo,
        "buscar_documentos_qualidade",
        {
          p_oficina: w.id,
          p_busca: termoDocumento,
          p_retirada: edicao?.tipo === "custodia",
        },
        signal,
      ),
    enabled: gestao && !!edicao && !edicao.salvo,
  });
  const hist = useQuery({
    queryKey: ["qualidade-avancada", w.id, "historico", edicao?.id],
    queryFn: ({ signal }) =>
      operacaoQualidade<
        {
          id: number;
          revisao: number;
          ocorrido_em: string;
          depois: AcompanhamentoQualidade;
        }[]
      >(
        a.demo,
        "historico_acompanhamento_qualidade",
        { p_oficina: w.id, p_id: edicao?.id },
        signal,
      ),
    enabled: historico && !!edicao?.salvo,
  });
  const novo = (
    tipo: TipoAcompanhamento,
    documento: DocumentoQualidade | null = null,
  ) => {
    setEdicao({
      id: novoId(),
      tipo,
      situacao: tipo === "assinatura" ? "preparada" : "aberta",
      dados: documento
        ? { descricao: `${documento.objeto} · OS #${documento.numero}` }
        : {},
      documento,
    });
    setBuscaDoc(documento ? `#${documento.numero} · ${documento.cliente}` : "");
    setErro("");
    setHistorico(false);
    setAviso("");
  };
  const abrir = (s: AcompanhamentoQualidade) => {
    setEdicao({
      id: s.id,
      tipo: s.tipo,
      situacao: s.situacao,
      dados: s.dados,
      documento: {
        ...s.documento,
        id: s.ordem_servico_id || s.atendimento_id!,
        origem: s.ordem_servico_id ? "os" : "atendimento",
      },
      salvo: s,
    });
    setErro("");
    setHistorico(false);
    setAviso("");
  };
  async function executar(fn: () => unknown | Promise<unknown>) {
    if (executando.current) return;
    executando.current = true;
    setOcupado(true);
    setErro("");
    try {
      await fn();
      return true;
    } catch (e) {
      setErro(erroPublico(e));
      return false;
    } finally {
      executando.current = false;
      setOcupado(false);
    }
  }
  const alterar = (id: string, valor: string | number) =>
    setEdicao((e) => (e ? { ...e, dados: { ...e.dados, [id]: valor } } : e));
  function campo(c: CampoQualidade) {
    if (!edicao) return null;
    const valor = edicao.dados[c.id] ?? "";
    return (
      <label key={c.id} className={c.tipo === "area" ? "qa-campo-amplo" : ""}>
        {c.nome}
        {c.tipo === "area" ? (
          <textarea
            rows={3}
            maxLength={c.id === "conteudo" ? 8000 : 3000}
            required={c.obrigatorio}
            value={valor}
            onChange={(e) => alterar(c.id, e.target.value)}
          />
        ) : (
          <input
            type={c.tipo === "dinheiro" ? "number" : c.tipo || "text"}
            step={c.tipo === "dinheiro" ? "0.01" : undefined}
            min={c.tipo === "dinheiro" ? 0 : undefined}
            max={c.tipo === "dinheiro" ? 100000000 : undefined}
            maxLength={c.tipo === "email" ? 254 : 1000}
            required={c.obrigatorio}
            value={c.tipo === "dinheiro" && valor !== "" ? Number(valor) / 100 : valor}
            onChange={(e) =>
              alterar(
                c.id,
                c.tipo === "dinheiro"
                  ? Math.round(Number(e.target.value) * 100)
                  : e.target.value,
              )
            }
          />
        )}{" "}
        {c.ajuda && <small>{c.ajuda}</small>}
      </label>
    );
  }
  if (!gestao)
    return (
      <p>O acompanhamento de qualidade está disponível para responsáveis e gerentes.</p>
    );
  return (
    <div className="qa-pagina qa-pagina-servicos">
      <header className="qa-servicos-titulo">
        <h1>Garantias e retrabalhos</h1>
        <p>Acompanhe retornos, resolva problemas e cuide dos seus clientes.</p>
      </header>
      <nav className="qa-abas" aria-label="Qualidade e garantia">
        {Object.entries(abas).map(([id, titulo]) => (
          <button
            key={id}
            aria-current={aba === id ? "page" : undefined}
            onClick={() => {
              setParams({ aba: id });
              setPagina(0);
              setErro("");
            }}
          >
            {titulo}
          </button>
        ))}
      </nav>
      {aba === "retornos" ? (
        w.ramo === "automotivo" || !w.ramo ? (
          <RetornosAuto />
        ) : (
          <RetornosServicos />
        )
      ) : (
        <>
          <header className="qa-cabecalho">
            <div>
              <h2>{abas[aba]}</h2>
              <p>
                {aba === "analise"
                  ? "Investigue com evidências, confirme a causa e verifique a solução."
                  : aba === "fabricante"
                    ? "Acompanhe solicitação, peças e ressarcimento em um só lugar."
                    : aba === "custodia"
                      ? "Bens prontos, contatos com o cliente e histórico de guarda."
                      : aba === "assinatura"
                        ? "Prepare documentos vinculados ao atendimento para o provedor de assinatura."
                        : "Ouça seus clientes e acompanhe o que precisa melhorar."}
              </p>
            </div>
            {ehCaso && (
              <button
                className="botao-primario"
                onClick={() => novo(aba as TipoAcompanhamento)}
              >
                <Plus size={18} />
                {aba === "analise"
                  ? "Nova análise"
                  : aba === "fabricante"
                    ? "Nova solicitação"
                    : aba === "custodia"
                      ? "Registrar acompanhamento"
                      : "Preparar documento"}
              </button>
            )}
          </header>
          <div className="qa-filtros">
            <label>
              De
              <input
                type="date"
                value={inicio}
                max={fim}
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
                min={inicio}
                value={fim}
                onChange={(e) => {
                  setFim(e.target.value);
                  setPagina(0);
                }}
              />
            </label>
            {ehCaso && (
              <label className="qa-filtro-busca">
                Buscar
                <input
                  value={busca}
                  onChange={(e) => {
                    setBusca(e.target.value);
                    setPagina(0);
                  }}
                  placeholder="Cliente, número ou descrição"
                />
              </label>
            )}
          </div>
          {erro && !edicao && (
            <p role="alert" className="qa-erro">
              {erro}
            </p>
          )}
          {aviso && !edicao && <p role="status">{aviso}</p>}
          {aba === "satisfacao" ? (
            <SatisfacaoQualidade key={`${inicio}:${fim}`} inicio={inicio} fim={fim} />
          ) : (
            <>
              {aba === "assinatura" && (
                <div className="qa-informacao">
                  <ClipboardCheck size={22} />
                  <p>
                    Integração preparada. Escolha e conecte um provedor para enviar e
                    colher assinaturas. Os documentos abaixo ainda não estão assinados.
                  </p>
                </div>
              )}
              {aba === "custodia" && (
                <section className="qa-secao">
                  <div className="qa-cabecalho">
                    <div>
                      <h2>Aguardando retirada</h2>
                      <p>Fila atual, independente do período de registros acima.</p>
                    </div>
                    <label>
                      Pronto há pelo menos
                      <select
                        value={dias}
                        onChange={(e) => {
                          setDias(Number(e.target.value));
                          setPagina(0);
                        }}
                      >
                        {[0, 7, 15, 30, 60, 90].map((n) => (
                          <option key={n} value={n}>
                            {n} dias
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {retirada.isLoading ? (
                    <p role="status">Consultando retiradas…</p>
                  ) : retirada.isError ? (
                    <p role="alert">{erroPublico(retirada.error)}</p>
                  ) : (
                    <div className="qa-lista">
                      {retirada.data?.slice(0, 50).map((d) => (
                        <article className="qa-linha" key={d.origem + d.id}>
                          <div className="qa-dias">
                            <strong>{d.dias}</strong>
                            <small>dias</small>
                          </div>
                          <div className="qa-linha-corpo">
                            <Link to={caminhoDocumentoQualidade(d)}>
                              <strong>
                                #{d.numero} · {d.cliente}
                              </strong>
                            </Link>
                            <span>{d.objeto}</span>
                            {d.itens?.length ? (
                              <small>
                                {d.itens
                                  .map(
                                    (i) => `${i.descricao}: ${i.local || i.situacao}`,
                                  )
                                  .join(" · ")}
                              </small>
                            ) : (
                              <small>
                                Local não registrado ·{" "}
                                <Link to="/localizacao">Localização e etiquetas</Link>
                              </small>
                            )}
                            {d.acompanhamento && (
                              <small>
                                Último contato:{" "}
                                {String(
                                  d.acompanhamento.dados.contato ||
                                    "Ainda não registrado",
                                )}
                              </small>
                            )}
                          </div>
                          <button
                            className="botao-secundario"
                            onClick={() => {
                              const existente = q.data?.find(
                                (x) => x.id === d.acompanhamento?.id,
                              );
                              if (existente) abrir(existente);
                              else if (d.acompanhamento) {
                                void executar(async () => {
                                  const salvo =
                                    await operacaoQualidade<AcompanhamentoQualidade>(
                                      a.demo,
                                      "consultar_acompanhamento_qualidade",
                                      {
                                        p_oficina: w.id,
                                        p_id: d.acompanhamento!.id,
                                      },
                                    );
                                  abrir(salvo);
                                });
                              } else novo("custodia", d);
                            }}
                          >
                            Acompanhar
                          </button>
                        </article>
                      ))}
                      {!retirada.data?.length && (
                        <p className="qa-vazio">
                          Nenhum bem aguardando retirada neste prazo.
                        </p>
                      )}
                    </div>
                  )}
                </section>
              )}
              <section className="qa-secao">
                <h2>
                  {aba === "custodia"
                    ? "Histórico de acompanhamento"
                    : "Registros no período"}
                </h2>
                {q.isLoading ? (
                  <p role="status">Carregando registros…</p>
                ) : q.isError ? (
                  <p role="alert">{erroPublico(q.error)}</p>
                ) : (
                  <div className="qa-lista">
                    {q.data?.slice(0, 50).map((s) => (
                      <button
                        type="button"
                        className="qa-linha qa-linha-botao"
                        key={s.id}
                        onClick={() => abrir(s)}
                      >
                        <div className="qa-linha-corpo">
                          <strong>
                            #{s.numero} · {s.cliente}
                          </strong>
                          <span>{String(s.dados.descricao)}</span>
                          <small>
                            {s.objeto} · {dataDocumento(s.criado_em, false)}
                          </small>
                        </div>
                        <div className="qa-estado">
                          <span>{etapasQualidade[s.tipo][s.situacao]}</span>
                          {s.tipo === "fabricante" && (
                            <small>
                              {dinheiro(Number(s.dados.recebido_centavos || 0))}{" "}
                              recebido ·{" "}
                              {dinheiro(
                                Math.max(
                                  0,
                                  Number(s.dados.autorizado_centavos || 0) -
                                    Number(s.dados.recebido_centavos || 0),
                                ),
                              )}{" "}
                              a receber
                            </small>
                          )}
                        </div>
                        <ChevronRight size={18} />
                      </button>
                    ))}
                    {!q.data?.length && (
                      <p className="qa-vazio">
                        Nenhum registro neste período. Use o botão acima para começar.
                      </p>
                    )}
                  </div>
                )}
                <div className="qa-paginacao">
                  <button
                    className="botao-secundario"
                    disabled={!pagina}
                    onClick={() => setPagina(pagina - 1)}
                  >
                    Anterior
                  </button>
                  <span>Página {pagina + 1}</span>
                  <button
                    className="botao-secundario"
                    disabled={
                      Math.max(
                        q.data?.length || 0,
                        aba === "custodia" ? retirada.data?.length || 0 : 0,
                      ) <= 50
                    }
                    onClick={() => setPagina(pagina + 1)}
                  >
                    Próxima
                  </button>
                </div>
              </section>
            </>
          )}
        </>
      )}
      <Dialogo
        aberto={!!edicao}
        fechar={() => {
          if (!ocupado) setEdicao(null);
        }}
        titulo={edicao ? titulosQualidade[edicao.tipo] : "Acompanhamento"}
        classe="qa-dialogo"
      >
        {edicao && (
          <form
            className="qa-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const criarOcorrencia =
                (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
                "ocorrencia";
              if (!edicao.documento) {
                setErro("Busque e selecione o atendimento.");
                return;
              }
              await executar(async () => {
                const s = await operacaoQualidade<AcompanhamentoQualidade>(
                  a.demo,
                  "salvar_acompanhamento_qualidade",
                  {
                    p_oficina: w.id,
                    p_id: edicao.id,
                    p_origem: edicao.documento!.origem,
                    p_documento: edicao.documento!.id,
                    p_tipo: edicao.tipo,
                    p_situacao: edicao.situacao,
                    p_dados: edicao.dados,
                    p_revisao: edicao.salvo?.revisao ?? null,
                  },
                );
                await qc.invalidateQueries({ queryKey: ["qualidade-avancada", w.id] });
                abrir(s);
                setAviso("Acompanhamento salvo.");
                if (criarOcorrencia) {
                  const dados = await operacaoQualidade<OcorrenciaAnalise>(
                    a.demo,
                    "ocorrencia_da_analise",
                    { p_oficina: w.id, p_id: s.id, p_criar: true },
                  );
                  setOcorrencia({ analise: s.id, dados });
                }
              });
            }}
          >
            <fieldset disabled={ocupado}>
              {edicao.salvo ? (
                <div className="qa-cabecalho">
                  <div>
                    <strong>
                      #{edicao.documento?.numero} · {edicao.documento?.cliente}
                    </strong>
                    <p>{edicao.documento?.objeto}</p>
                    <Link to={caminhoDocumentoQualidade(edicao.documento!)}>
                      Abrir atendimento
                    </Link>
                  </div>
                  <div className="qa-acoes">
                    {edicao.tipo === "custodia" && (
                      <>
                        <button
                          type="button"
                          className="botao-secundario"
                          onClick={() =>
                            void executar(async () => {
                              await navigator.clipboard.writeText(
                                textoAvisoRetirada(edicao.salvo!),
                              );
                              setAviso(
                                "Aviso copiado. Envie pelo canal combinado e registre o resultado do contato.",
                              );
                            })
                          }
                        >
                          Copiar aviso ao cliente
                        </button>
                        <button
                          type="button"
                          className="botao-secundario"
                          onClick={() =>
                            void executar(async () =>
                              (
                                await import("../services/pdfQualidade")
                              ).gerarAvisoRetirada(edicao.salvo!),
                            )
                          }
                        >
                          Imprimir aviso de retirada
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="botao-secundario"
                      onClick={() =>
                        void executar(async () =>
                          (await import("../services/pdfQualidade")).gerarPdfQualidade(
                            edicao.salvo!,
                          ),
                        )
                      }
                    >
                      <Printer size={16} />
                      Imprimir documento salvo
                    </button>
                    {edicao.tipo === "assinatura" &&
                      edicao.situacao === "preparada" && (
                        <button
                          type="button"
                          className="botao-secundario"
                          onClick={() =>
                            baixarJson(
                              pacoteAssinatura(edicao.salvo!),
                              `assinatura-${edicao.id}.json`,
                            )
                          }
                        >
                          Exportar para integração
                        </button>
                      )}
                  </div>
                </div>
              ) : (
                <BuscaCompra
                  rotulo="Atendimento de origem"
                  valor={buscaDoc}
                  alterar={(v) => {
                    setBuscaDoc(v);
                    setEdicao({ ...edicao, documento: null });
                  }}
                  obrigatorio
                  opcoes={(docs.data || []).map((d) => ({
                    id: d.origem + ":" + d.id,
                    nome: `#${d.numero} · ${d.cliente}`,
                    detalhe: d.objeto,
                  }))}
                  carregando={docs.isLoading}
                  selecionar={(o) => {
                    const d = docs.data!.find((d) => d.origem + ":" + d.id === o.id)!;
                    setBuscaDoc(o.nome);
                    setEdicao({ ...edicao, documento: d });
                  }}
                />
              )}
              <label>
                Etapa
                <select
                  aria-label="Etapa"
                  value={edicao.situacao}
                  onChange={(e) => setEdicao({ ...edicao, situacao: e.target.value })}
                >
                  {Object.entries(etapasQualidade[edicao.tipo]).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              {edicao.tipo === "analise" && (
                <div className="qa-roteiro">
                  <strong>Roteiro para investigar</strong>
                  <ul>
                    {roteiroAnalise(w.especialidade || "", w.ramo || "automotivo").map(
                      (t) => (
                        <li key={t}>{t}</li>
                      ),
                    )}
                  </ul>
                  <p>
                    A causa só será confirmada após o responsável registrar os testes e
                    evidências.
                  </p>
                </div>
              )}
              {edicao.tipo === "fabricante" && (
                <p className="qa-ajuda">
                  Ao aprovar, o valor autorizado entra nas contas a receber. Confirme o
                  recebimento abaixo somente quando o dinheiro chegar.
                </p>
              )}
              {edicao.tipo === "custodia" && (
                <p className="qa-ajuda">
                  Registre somente contatos realizados. Para finalizar, confirme a
                  entrega no atendimento. Este registro não autoriza descarte ou venda.
                </p>
              )}
              <fieldset disabled={edicao.tipo === "assinatura" && !!edicao.salvo}>
                <div className="qa-campos">
                  {camposQualidade[edicao.tipo]
                    .filter(
                      (c) =>
                        !c.opcional &&
                        c.id !== "recebido_centavos" &&
                        c.id !== "comprovante",
                    )
                    .map(campo)}
                </div>
              </fieldset>
              {camposQualidade[edicao.tipo].some((c) => c.opcional) && (
                <details>
                  <summary>Informações complementares (opcional)</summary>
                  <div className="qa-campos">
                    {camposQualidade[edicao.tipo].filter((c) => c.opcional).map(campo)}
                  </div>
                </details>
              )}
              {edicao.salvo && (
                <details
                  open={historico}
                  onToggle={(e) => setHistorico(e.currentTarget.open)}
                >
                  <summary>Histórico do acompanhamento (opcional)</summary>
                  {hist.isLoading ? (
                    <p>Carregando histórico…</p>
                  ) : hist.isError ? (
                    <p role="alert">{erroPublico(hist.error)}</p>
                  ) : (
                    hist.data?.map((h) => (
                      <div className="qa-historico" key={h.id}>
                        <strong>
                          Versão {h.revisao} · {dataDocumento(h.ocorrido_em)}
                        </strong>
                        <p>{etapasQualidade[h.depois.tipo][h.depois.situacao]}</p>
                        {camposQualidade[h.depois.tipo]
                          .filter((c) => h.depois.dados[c.id])
                          .map((c) => (
                            <p key={c.id}>
                              <b>{c.nome}: </b>
                              {c.tipo === "dinheiro"
                                ? dinheiro(Number(h.depois.dados[c.id]))
                                : String(h.depois.dados[c.id])}
                            </p>
                          ))}
                      </div>
                    ))
                  )}
                </details>
              )}
              {aviso && <p role="status">{aviso}</p>}
              {erro && (
                <p role="alert" className="qa-erro">
                  {erro}
                </p>
              )}
              <div className="qa-rodape">
                {edicao.tipo === "analise" && (
                  <button
                    className="botao-primario"
                    name="acao"
                    value="ocorrencia"
                    disabled={ocupado}
                  >
                    Registrar ocorrência e custos
                  </button>
                )}
                <button
                  type="button"
                  className="botao-secundario"
                  onClick={() => setEdicao(null)}
                >
                  Fechar
                </button>
                <button className="botao-primario" disabled={ocupado}>
                  {ocupado ? "Salvando…" : "Salvar acompanhamento"}
                </button>
              </div>
            </fieldset>
          </form>
        )}
        {edicao?.tipo === "fabricante" && edicao.salvo && (
          <FinanceiroGarantia registro={edicao.salvo} atualizar={abrir} />
        )}
      </Dialogo>
      {ocorrencia && (
        <CustosOcorrenciaAnalise
          key={ocorrencia.dados.id + ":" + ocorrencia.dados.revisao}
          analise={ocorrencia.analise}
          ocorrencia={ocorrencia.dados}
          fechar={() => setOcorrencia(null)}
        />
      )}
    </div>
  );
}
