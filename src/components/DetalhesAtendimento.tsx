import { useBuscaDebounced } from "../lib/useBuscaDebounced";
import { componenteSobDemanda } from "../lib/componenteSobDemanda";
const OcorrenciasAtendimento = componenteSobDemanda(async () => ({
  default: (await import("./qualidade/OcorrenciasAtendimento")).OcorrenciasAtendimento,
}));
const FotosAtendimento = componenteSobDemanda(async () => ({
  default: (await import("./servicos/FotosAtendimento")).FotosAtendimento,
}));
const LucroServico = componenteSobDemanda(async () => ({
  default: (await import("./LucroServico")).LucroServico,
}));
const AprovacaoAtendimento = componenteSobDemanda(async () => ({
  default: (await import("./AprovacaoAtendimento")).AprovacaoAtendimento,
}));
const HistoricoPropostasAtendimento = componenteSobDemanda(async () => ({
  default: (await import("./AprovacaoAtendimento")).HistoricoPropostasAtendimento,
}));

import { consultasQualidade } from "../lib/atualizarQualidade";
import { atualizarConsultas } from "../lib/atualizarConsultas";
import { novoId } from "../lib/uuid.ts";
import { imprimirNotaAtendimento } from "../services/impressaoAtendimento";
import { ImprimirLaudoOS } from "./ordens-servico/ImprimirLaudoOS";
import { OcorrenciaHistorico } from "./OcorrenciaHistorico";
import type { EventoGestao } from "../services/gestao";
import { CobrancaDiagnostico } from "./CobrancaDiagnostico";
import { FerramentasAtendimento } from "./FerramentasAtendimento";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Printer,
  Camera,
  Plus,
  Minus,
  Trash2,
  Play,
  Square,
  Check,
  ArrowLeft,
  Wallet,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAcesso } from "../auth/contexto";
import { interfaceRamo } from "../lib/interfaceRamo";
import { usePagamentoAposRegistro } from "../lib/pagamentoAposRegistro";
import {
  concluirReparo,
  registrarRetirada,
  apresentacaoEntrega,
} from "../lib/assistenciaTecnica";
import { ResumoTecnicoReparo } from "./ResumoTecnicoReparo";
import { ResumoLimpeza } from "./ResumoLimpeza";
import { ResumoManutencao } from "./ResumoManutencao";
import { AceiteServico } from "./AceiteServico";
import { Dialogo } from "./Dialogo";
import { AssistenteContextual } from "./AtalhoAssistente";
import { BuscaCompra } from "./BuscaCompra";
import {
  consultarDetalhesAtendimento,
  operarAtendimento,
} from "../services/servicosCompletos";
import { consultarIdentidade } from "../services/documentos";
import { gravarServico, estadosServico } from "../services/servicos";
import { listarEstoque, type ProdutoEstoque } from "../services/estoque";
import { listarFuncionarios } from "../services/funcionarios";
import { useCatalogoBusca } from "../lib/useCatalogoBusca";
import { filtrarCatalogo, type ItemCatalogo } from "../lib/catalogo";
import {
  totaisItens,
  quantidadeMinima,
  ajustarQuantidade,
} from "../lib/calculosAtendimento";
import { dinheiro } from "../lib/formatacao";
import {
  ordemSemAutorizacao,
  ordemComCusteio,
  rotuloSituacaoDocumento,
} from "../lib/apresentacaoDocumentoServico";
import { erroPublico } from "../lib/supabase";
import type { AtendimentoServico } from "../services/servicos";
import type {
  DetalhesAtendimento as Dados,
  ItemAtendimento,
} from "../types/servicosCompletos";
import "./DetalhesAtendimento.css";

import { CustoMargemItem } from "./CustoMargemItem";
import { CampoDesconto } from "./CampoDesconto";
import { useDesconto } from "../lib/useDesconto";

type Operar = (nome: string, args: Record<string, unknown>) => Promise<unknown>;
export function DetalhesAtendimento({
  id,
  abaInicial = "resumo",
  fechar,
  editar,
}: {
  id: string;
  abaInicial?: "resumo" | "fotos" | "aprovacao";
  fechar: () => void;
  editar: (a: AtendimentoServico) => void;
}) {
  const acesso = useAcesso(),
    w = acesso.oficina!,
    qc = useQueryClient(),
    navegar = useNavigate();
  const [aba, setAba] = useState<string>(abaInicial),
    [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState(""),
    [motivo, setMotivo] = useState<string | null>(null);
  const gerente = w.perfil !== "staff";
  const interfaceAtual = interfaceRamo(w.ramo, w.especialidade);
  const [retirada, setRetirada] = useState(false);
  const [ocorrencia, setOcorrencia] = useState<EventoGestao | null>(null);
  const perguntarPagamento = usePagamentoAposRegistro();
  const trava = useRef(false);
  function iniciarOperacao() {
    if (trava.current || ocupado) return false;
    trava.current = true;
    setOcupado(true);
    setErro("");
    return true;
  }
  function finalizarOperacao() {
    trava.current = false;
    setOcupado(false);
  }
  const q = useQuery({
    queryKey: ["detalhes-atendimento", w.id, id],
    queryFn: ({ signal }) =>
      consultarDetalhesAtendimento(acesso.demo, w.id, id, signal),
    refetchInterval: (consulta) =>
      aba === "aprovacao" && consulta.state.data?.atendimento.situacao === "orcamento"
        ? 15000
        : false,
  });
  async function atualizar(qualidade = false) {
    await atualizarConsultas(
      qc,
      [
        ["detalhes-atendimento", w.id, id],
        ["servicos", w.id],
        ["selecao-operacao", w.id],
        ["estoque"],
        ["estoque-atendimento"],
        ["estoque-historico"],
        ["relatorios-servicos"],
        ["financeiro"],
        ["lucro-documento", w.id, id],
        ["lucro-cliente", w.id],
        ["custeio"],
        ["custeio-detalhe", w.id, id],
        ["alertas"],
        ...(qualidade ? consultasQualidade : []),
      ],
      [["detalhes-atendimento", w.id, id]],
    );
  }
  const executar: Operar = async (nome, args) => {
    if (!iniciarOperacao()) throw new Error("Aguarde a operação em andamento.");
    try {
      const r = await operarAtendimento(acesso.demo, w.id, nome, {
        p_atendimento: id,
        ...args,
      });
      await atualizar(nome === "salvar_qualidade_atendimento");
      if (
        ["aprovar_grupos_atendimento", "registrar_autorizacao_atendimento"].includes(
          nome,
        )
      )
        setAba("resumo");
      return r;
    } catch (e) {
      setErro(erroPublico(e));
      throw e;
    } finally {
      finalizarOperacao();
    }
  };
  async function situacao(situacao: AtendimentoServico["situacao"]) {
    if (!q.data || !iniciarOperacao()) return;
    try {
      await gravarServico(
        "salvar_atendimento_servico",
        w.id,
        {
          p_id: id,
          p_revisao: q.data.atendimento.revisao,
          p_dados:
            interfaceAtual.assistencia && situacao === "concluido"
              ? concluirReparo(
                  q.data.atendimento,
                  w.especialidade || "assistencia_geral",
                )
              : { ...q.data.atendimento, situacao },
        },
        acesso.demo,
      );
      await atualizar();
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      finalizarOperacao();
    }
  }
  async function imprimir(modo: "atendimento" | "orcamento" | "tecnica") {
    if (!q.data) return;
    setErro("");
    try {
      const [{ gerarPdfAtendimento }, empresa] = await Promise.all([
        import("../services/pdfAtendimento"),
        consultarIdentidade(acesso.demo, w.id),
      ]);
      gerarPdfAtendimento(
        q.data,
        { ...empresa, nome: w.nome, especialidade: w.especialidade },
        modo,
      ).save(`${modo}-${q.data.atendimento.numero || id}.pdf`);
    } catch (e) {
      setErro(erroPublico(e));
    }
  }
  const d = q.data,
    a = d?.atendimento,
    encerrado = a && ["concluido", "cancelado"].includes(a.situacao);
  const tabs = [
    ["resumo", "Resumo"],
    ...(gerente && acesso.permite("quotes") && a?.situacao === "orcamento"
      ? [["aprovacao", "Aprovação / link do cliente"]]
      : []),
    ["itens", interfaceAtual.assistencia ? "Serviços e peças" : "Serviços e materiais"],
    ["equipe", "Equipe e horas"],
    ...(gerente && acesso.permite("finance") && a && ordemComCusteio(a)
      ? [["lucro", "Lucro e custos"]]
      : []),
    ...(acesso.permite("service_media") ? [["fotos", "Fotos antes e depois"]] : []),
    ...(gerente ? [["qualidade", "Garantia e retrabalho"]] : []),
    ["historico", "Histórico"],
    ["tecnica", "Ficha técnica e diagnóstico"],
  ];
  const principais = ["resumo", "itens", "fotos", "lucro"];
  return (
    <Dialogo
      aberto
      acoesCabecalho={
        <AssistenteContextual
          contexto={{
            atendimento: id,
            cliente: a?.cliente_id,
            titulo: a ? `${interfaceAtual.ordem} #${a.numero}` : interfaceAtual.ordem,
          }}
        />
      }
      fechar={() => {
        if (!ocupado) fechar();
      }}
      titulo={
        a
          ? `${a.situacao === "orcamento" && a.dados.documento !== "ordem" ? "Orçamento" : interfaceAtual.ordem} #${a.numero || id.slice(0, 8)}`
          : interfaceAtual.ordem
      }
      classe="detalhes-servico"
    >
      {q.isPending ? (
        <p role="status">Carregando atendimento…</p>
      ) : q.isError ? (
        <p role="alert">
          {erroPublico(q.error)}{" "}
          <button onClick={() => void q.refetch()}>Tentar novamente</button>
        </p>
      ) : (
        d &&
        a && (
          <>
            <div className="atendimento-cabecalho">
              <div>
                <h3>{d.cliente.nome}</h3>
                <p>
                  {d.objeto.nome} ·{" "}
                  {(a.data_servico || a.vencimento).split("-").reverse().join("/")}
                </p>
              </div>
              <div className="atendimento-acoes-documento">
                <ImprimirLaudoOS key={`laudo-${id}`} id={id} tipo="atendimento" />
                {acesso.permite("service_media") && (
                  <button
                    type="button"
                    className="botao-secundario"
                    disabled={ocupado}
                    onClick={() => setAba("fotos")}
                  >
                    <Camera size={18} /> Adicionar fotos
                  </button>
                )}
                <button
                  className="botao-primario"
                  onClick={() => {
                    setErro("");
                    void imprimirNotaAtendimento(acesso.demo, w.id, id).catch((e) =>
                      setErro(erroPublico(e)),
                    );
                  }}
                >
                  <Printer size={18} />
                  {a.situacao === "orcamento" && a.dados.documento !== "ordem"
                    ? "Imprimir orçamento"
                    : "Imprimir nota do serviço"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void imprimir(
                      a.situacao === "orcamento" && a.dados.documento !== "ordem"
                        ? "orcamento"
                        : "atendimento",
                    )
                  }
                >
                  Baixar PDF
                </button>
              </div>
            </div>
            <FerramentasAtendimento tipo="atendimento" id={a.id} />
            <nav className="atendimento-abas" aria-label="Detalhes do atendimento">
              {tabs
                .filter(([id]) => principais.includes(id))
                .map(([id, nome]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={aba === id}
                    disabled={ocupado}
                    onClick={() => setAba(id)}
                  >
                    {nome}
                  </button>
                ))}
              <select
                aria-label="Mais opções do atendimento"
                value={principais.includes(aba) ? "" : aba}
                disabled={ocupado}
                onChange={(e) => {
                  if (e.target.value) setAba(e.target.value);
                }}
              >
                <option value="" disabled>
                  Mais opções
                </option>
                {tabs
                  .filter(([id]) => !principais.includes(id))
                  .map(([id, nome]) => (
                    <option key={id} value={id}>
                      {nome}
                    </option>
                  ))}
              </select>
            </nav>
            {erro && (
              <p role="alert" className="erro-formulario">
                {erro}
              </p>
            )}
            {aba === "resumo" && (
              <>
                <div className="atendimento-resumo">
                  <div>
                    <span>
                      {rotuloSituacaoDocumento(a, estadosServico[a.situacao])}
                    </span>
                    <h3>{a.titulo}</h3>
                    <p>{a.ficha_especialidade?.etapa}</p>
                  </div>
                  <strong>{dinheiro(a.valor_centavos)}</strong>
                </div>
                <section
                  className="atendimento-servicos-resumo"
                  aria-label="Itens do atendimento"
                >
                  <h3>
                    {interfaceAtual.assistencia
                      ? "Serviços e peças"
                      : "Serviços e materiais"}
                  </h3>
                  {d.itens.map((i) => (
                    <div key={i.id}>
                      <span>
                        {i.quantidade} × {i.descricao}
                      </span>
                      <strong>
                        {dinheiro(Math.round(i.quantidade * i.preco_centavos))}
                      </strong>
                    </div>
                  ))}
                  {!d.itens.length && (
                    <p>Nenhum item detalhado. Abra Serviços para incluir os itens.</p>
                  )}
                </section>
                <div className="atendimento-acoes">
                  {a.situacao === "orcamento" &&
                    gerente &&
                    acesso.permite("quotes") && (
                      <button
                        disabled={ocupado}
                        className="botao-primario"
                        onClick={() => setAba("aprovacao")}
                      >
                        <Check size={17} />
                        {ordemSemAutorizacao(a)
                          ? "Registrar autorização"
                          : "Aprovar orçamento"}
                      </button>
                    )}
                  {a.situacao === "aprovado" && (
                    <button
                      disabled={ocupado}
                      className="botao-primario"
                      onClick={() => void situacao("em_execucao")}
                    >
                      <Play size={17} />
                      {interfaceAtual.assistencia
                        ? "Iniciar reparo"
                        : "Iniciar serviço"}
                    </button>
                  )}
                  {["em_execucao", "aguardando"].includes(a.situacao) && (
                    <button
                      disabled={ocupado}
                      className="botao-primario"
                      onClick={() => void situacao("concluido")}
                    >
                      <Check size={17} />
                      {interfaceAtual.assistencia
                        ? "Concluir reparo"
                        : "Concluir serviço"}
                    </button>
                  )}
                  <button disabled={ocupado || q.isFetching} onClick={() => editar(a)}>
                    Editar ficha e dados
                  </button>
                  <button onClick={() => void imprimir("tecnica")}>
                    Imprimir ficha técnica
                  </button>
                  {gerente && acesso.permite("finance") && (
                    <button
                      disabled={
                        ocupado ||
                        ["orcamento", "cancelado"].includes(a.situacao) ||
                        a.valor_centavos <= 0
                      }
                      onClick={async () => {
                        if (!iniciarOperacao()) return;
                        try {
                          const t = await gravarServico(
                            "faturar_atendimento_servico",
                            w.id,
                            { p_atendimento: id },
                            acesso.demo,
                          );
                          navegar(`/financeiro?aba=contas&titulo=${t}`);
                        } catch (e) {
                          setErro(erroPublico(e));
                        } finally {
                          finalizarOperacao();
                        }
                      }}
                    >
                      <Wallet size={17} />
                      Cobrança / recebimento
                    </button>
                  )}
                  {gerente && a.situacao === "concluido" && (
                    <button disabled={ocupado} onClick={() => setMotivo("")}>
                      <ArrowLeft size={17} />
                      Reabrir atendimento
                    </button>
                  )}
                </div>
                {interfaceAtual.assistencia && a.situacao === "concluido" && (
                  <section className="atendimento-retirada">
                    <div>
                      <strong>{apresentacaoEntrega(a).titulo}</strong>
                      <p>{apresentacaoEntrega(a).ajuda}</p>
                    </div>
                    {!apresentacaoEntrega(a).confirmada && !retirada && (
                      <button
                        className="botao-primario"
                        disabled={ocupado}
                        onClick={() => setRetirada(true)}
                      >
                        {apresentacaoEntrega(a).acao}
                      </button>
                    )}
                    {retirada && (
                      <form
                        className="atendimento-form"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!iniciarOperacao()) return;
                          const f = new FormData(e.currentTarget);
                          try {
                            await gravarServico(
                              "salvar_atendimento_servico",
                              w.id,
                              {
                                p_id: id,
                                p_revisao: a.revisao,
                                p_dados: registrarRetirada(
                                  a,
                                  String(f.get("recebedor") || ""),
                                  w.especialidade || "assistencia_geral",
                                ),
                              },
                              acesso.demo,
                            );
                            await atualizar();
                            setRetirada(false);
                            perguntarPagamento({
                              tipo: "atendimento",
                              id,
                              contexto: "entrega",
                            });
                          } catch (e) {
                            setErro(erroPublico(e));
                          } finally {
                            finalizarOperacao();
                          }
                        }}
                      >
                        <label>
                          {apresentacaoEntrega(a).pessoa}
                          <input
                            name="recebedor"
                            required
                            maxLength={1500}
                            defaultValue={d.cliente.nome}
                          />
                        </label>
                        <div className="atendimento-acoes">
                          <button className="botao-primario" disabled={ocupado}>
                            {apresentacaoEntrega(a).confirmar}
                          </button>
                          <button
                            type="button"
                            disabled={ocupado}
                            onClick={() => setRetirada(false)}
                          >
                            Cancelar
                          </button>
                        </div>
                      </form>
                    )}
                  </section>
                )}
                <AceiteServico
                  atendimento={a}
                  ocupado={ocupado}
                  salvar={async (novo) => {
                    if (!iniciarOperacao())
                      throw new Error("Aguarde a operação em andamento.");
                    try {
                      await gravarServico(
                        "salvar_atendimento_servico",
                        w.id,
                        { p_id: a.id, p_revisao: a.revisao, p_dados: novo },
                        acesso.demo,
                      );
                      await atualizar();
                      if (
                        novo.ficha_especialidade?.campos.situacao_aceite?.startsWith(
                          "Aceito",
                        ) &&
                        !a.ficha_especialidade?.campos.situacao_aceite?.startsWith(
                          "Aceito",
                        )
                      ) {
                        perguntarPagamento({
                          tipo: "atendimento",
                          id,
                          contexto: "entrega",
                        });
                      }
                    } catch (e) {
                      throw new Error(erroPublico(e), { cause: e });
                    } finally {
                      finalizarOperacao();
                    }
                  }}
                />
                {motivo !== null && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        await executar("reabrir_atendimento_servico", {
                          p_revisao: a.revisao,
                          p_motivo: motivo,
                        });
                        setMotivo(null);
                      } catch {
                        /* apresentado acima */
                      }
                    }}
                  >
                    <label>
                      Motivo da reabertura
                      <input
                        required
                        minLength={3}
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                      />
                    </label>
                    <p>
                      Os materiais consumidos voltarão ao estoque. A cobrança permanece
                      no financeiro.
                    </p>
                    <button disabled={ocupado}>Confirmar reabertura</button>
                  </form>
                )}
                {gerente && acesso.permite("customer_portal") && (
                  <Compartilhar
                    key={a.id}
                    a={a}
                    executar={executar}
                    ocupado={ocupado}
                  />
                )}
              </>
            )}
            {aba === "tecnica" && (
              <>
                <ResumoTecnicoReparo ficha={a.ficha_especialidade} />
                <ResumoManutencao atendimento={a} objeto={d.objeto} />
                <ResumoLimpeza atendimento={a} objeto={d.objeto} />
                {a.dados.execucao && <p>{a.dados.execucao}</p>}
                <CobrancaDiagnostico documento={id} tipo="servico" />
              </>
            )}
            {aba === "lucro" &&
              gerente &&
              acesso.permite("finance") &&
              ordemComCusteio(a) && <LucroServico id={id} />}
            {aba === "itens" && (
              <>
                <Itens
                  key={a.revisao}
                  d={d}
                  executar={executar}
                  bloqueado={!gerente || !!encerrado || ocupado || q.isFetching}
                />
                <ReservasEstoque
                  documento={a.id}
                  ramo="atendimento"
                  bloqueado={!gerente || !!encerrado || ocupado}
                />
              </>
            )}
            {aba === "aprovacao" &&
              gerente &&
              acesso.permite("quotes") &&
              (a.situacao === "orcamento" ? (
                <AprovacaoAtendimento
                  key={a.revisao}
                  d={d}
                  executar={executar}
                  ocupado={ocupado}
                />
              ) : (
                <div className="aprovacao-servico">
                  <h3>Autorização registrada</h3>
                  <p>A OS contém somente os serviços autorizados.</p>
                  <HistoricoPropostasAtendimento propostas={d.propostas || []} />
                  <button
                    type="button"
                    className="botao-primario"
                    onClick={() => setAba("resumo")}
                  >
                    Abrir resumo da OS
                  </button>
                </div>
              ))}
            {aba === "equipe" && (
              <Equipe
                key={a.revisao}
                d={d}
                executar={executar}
                gerente={gerente}
                ocupado={ocupado}
              />
            )}
            {aba === "fotos" && acesso.permite("service_media") && (
              <FotosAtendimento
                atendimento={a.id}
                cancelado={a.situacao === "cancelado"}
                aoProcessar={setOcupado}
              />
            )}
            {aba === "qualidade" && gerente && (
              <OcorrenciasAtendimento d={d} executar={executar} ocupado={ocupado} />
            )}
            {aba === "historico" && (
              <>
                <HistoricoPropostasAtendimento propostas={d.propostas || []} />
                <ol className="atendimento-historico">
                  {d.eventos.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        disabled={!gerente}
                        onClick={() =>
                          setOcorrencia({
                            id: String(e.id),
                            origem: "atendimento",
                            tipo: "atendimento",
                            entidade: a.id,
                            numero: String(a.numero || ""),
                            data: e.criado_em,
                            descricao: e.depois || e.tipo,
                            autor: null,
                          })
                        }
                      >
                        <time>{new Date(e.criado_em).toLocaleString("pt-BR")}</time>
                        <strong>
                          {e.tipo === "situacao"
                            ? estadosServico[e.depois as keyof typeof estadosServico]
                            : e.depois}
                        </strong>
                        {e.tipo === "aceite" && e.antes && (
                          <small>Antes: {e.antes}</small>
                        )}
                        {gerente && <span>Ver detalhes →</span>}
                      </button>
                    </li>
                  ))}
                  {!d.eventos.length && (
                    <li>O histórico será registrado nas próximas alterações.</li>
                  )}
                </ol>
              </>
            )}
            {ocorrencia && (
              <OcorrenciaHistorico
                evento={ocorrencia}
                fechar={() => setOcorrencia(null)}
              />
            )}
          </>
        )
      )}
    </Dialogo>
  );
}
function Compartilhar({
  a,
  executar,
  ocupado,
}: {
  a: AtendimentoServico;
  executar: Operar;
  ocupado: boolean;
}) {
  const [resumo, setResumo] = useState(a.resumo_cliente || ""),
    [publicado, setPublicado] = useState(!!a.compartilhado_cliente),
    [url, setUrl] = useState("");
  return (
    <details className="atendimento-resultado">
      <summary>
        Área do cliente ·{" "}
        {a.compartilhado_cliente ? "compartilhado" : "não compartilhado"}
      </summary>
      <form
        className="atendimento-form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const destino = await executar("compartilhar_atendimento_cliente", {
              p_revisao: a.revisao,
              p_compartilhar: publicado,
              p_resumo: resumo,
            });
            if (typeof destino === "string" && destino.startsWith("/oficina/"))
              setUrl(destino);
          } catch {
            /* erro apresentado pelo atendimento */
          }
        }}
      >
        <p>
          Somente o cliente com acesso liberado verá o resumo, a situação, os itens e os
          preços. As anotações técnicas e os custos ficam internos.
        </p>
        <label>
          Resumo para o cliente
          <textarea
            rows={3}
            maxLength={3000}
            value={resumo}
            onChange={(e) => setResumo(e.target.value)}
          />
        </label>
        <label className="atendimento-check">
          <input
            type="checkbox"
            checked={publicado}
            onChange={(e) => setPublicado(e.target.checked)}
          />
          Disponibilizar na área do cliente
        </label>
        <button disabled={ocupado}>Salvar compartilhamento</button>
        {url && (
          <a href={url} target="_blank" rel="noreferrer">
            Abrir área do cliente
          </a>
        )}
      </form>
    </details>
  );
}
function Itens({
  d,
  executar,
  bloqueado,
}: {
  d: Dados;
  executar: Operar;
  bloqueado: boolean;
}) {
  const a = useAcesso();
  const assistencia = a.oficina?.ramo === "assistencia_tecnica";
  const [itens, setItens] = useState(d.itens),
    [mostrarDescontoNota, setMostrarDescontoNota] = useState(
      d.atendimento.mostrar_desconto_nota === true,
    ),
    [extra, setExtra] = useState((d.comercial.custo_extra_centavos || 0) / 100),
    [motivo, setMotivo] = useState(d.comercial.motivo_custo || ""),
    [busca, setBusca] = useState(""),
    [erro, setErro] = useState("");
  const controleDesconto = useDesconto(
    itens.reduce((total, i) => total + Math.round(i.quantidade * i.preco_centavos), 0),
    d.comercial.desconto_centavos || 0,
  );
  const desconto = controleDesconto.centavos;
  const termoConsulta1 = useBuscaDebounced(busca);
  const estoque = useQuery({
    queryKey: ["estoque-atendimento", a.oficina!.id, termoConsulta1],
    queryFn: ({ signal }) =>
      listarEstoque(a.demo, a.oficina!.id, termoConsulta1, "controlados", 0, signal),
    enabled: a.permite("inventory") && !bloqueado,
  });
  const catalogo = useCatalogoBusca(
    busca,
    "service",
    a.permite("catalog") && !bloqueado,
  );
  const servicos =
    a.permite("catalog") && !catalogo.aguardando
      ? filtrarCatalogo(catalogo.data || [], busca, "service", "ativos", false).slice(
          0,
          20,
        )
      : [];
  const alterar = (id: string, p: Partial<ItemAtendimento>) =>
    setItens(itens.map((i) => (i.id === id ? { ...i, ...p } : i)));
  function novo(p?: ProdutoEstoque, s?: ItemCatalogo) {
    setItens([
      ...itens,
      {
        id: novoId(),
        tipo: p ? "material" : "servico",
        descricao: p?.descricao || s?.descricao || "",
        quantidade: 1,
        unidade: p?.unidade || s?.unidade || "un",
        preco_centavos: p?.preco_padrao_centavos || s?.preco_padrao_centavos || 0,
        custo_centavos: p?.custo_centavos ?? s?.custo_centavos ?? 0,
        custo_informado: (p?.custo_centavos ?? s?.custo_centavos) != null,
        origem: p ? "estoque" : "externa",
        produto_id: p?.id || null,
      },
    ]);
    setBusca("");
  }
  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    try {
      totaisItens(itens, desconto);
      await executar("salvar_itens_atendimento", {
        p_revisao: d.atendimento.revisao,
        p_itens: itens,
        p_desconto: desconto,
        p_mostrar_desconto_nota: mostrarDescontoNota,
        p_custo_extra: Math.round(extra * 100),
        p_motivo: motivo,
      });
    } catch (e) {
      setErro(erroPublico(e));
    }
  }
  return (
    <form onSubmit={(e) => void salvar(e)} className="atendimento-form">
      <fieldset disabled={bloqueado}>
        {(a.permite("inventory") || a.permite("catalog")) && (
          <BuscaCompra
            rotulo={
              assistencia
                ? "Adicionar serviço do catálogo ou peça do estoque"
                : "Adicionar serviço do catálogo ou material do estoque"
            }
            valor={busca}
            alterar={setBusca}
            opcoes={[
              ...servicos.map((s) => ({
                id: `servico:${s.id}`,
                nome: s.descricao,
                detalhe: `Serviço · ${dinheiro(s.preco_padrao_centavos)}`,
              })),
              ...(estoque.data?.itens || []).map((p) => ({
                id: `peca:${p.id}`,
                nome: p.descricao,
                detalhe: `${p.saldo} ${p.unidade} disponíveis · ${dinheiro(p.preco_padrao_centavos)}`,
              })),
            ]}
            selecionar={(o) => {
              const p = estoque.data?.itens.find((p) => `peca:${p.id}` === o.id);
              const s = servicos.find((s) => `servico:${s.id}` === o.id);
              if (p || s) novo(p, s);
            }}
            carregando={
              estoque.isFetching || catalogo.isFetching || busca !== termoConsulta1
            }
          />
        )}
        {(estoque.isError || catalogo.isError) && (
          <p role="alert">
            {erroPublico(estoque.error || catalogo.error)}{" "}
            <button
              type="button"
              onClick={() => {
                if (a.permite("inventory")) void estoque.refetch();
                if (a.permite("catalog")) void catalogo.refetch();
              }}
            >
              Tentar novamente
            </button>
          </p>
        )}
        <button type="button" onClick={() => novo()}>
          <Plus size={16} />
          {assistencia ? "Serviço ou peça avulsa" : "Serviço ou material avulso"}
        </button>
        {itens.map((i) => (
          <article className="atendimento-item" key={i.id}>
            <label>
              Descrição
              <input
                required
                maxLength={300}
                value={i.descricao}
                onChange={(e) => alterar(i.id, { descricao: e.target.value })}
              />
            </label>
            <div className="atendimento-campos">
              <label>
                Tipo
                <select
                  value={i.tipo}
                  disabled={i.origem === "estoque"}
                  onChange={(e) =>
                    alterar(i.id, { tipo: e.target.value as ItemAtendimento["tipo"] })
                  }
                >
                  <option value="servico">Serviço</option>
                  <option value="material">
                    {assistencia ? "Peça / componente" : "Material"}
                  </option>
                </select>
              </label>
              <label>
                Quantidade
                <div className="atendimento-quantidade">
                  <button
                    type="button"
                    aria-label={`Diminuir quantidade de ${i.descricao}`}
                    disabled={i.quantidade <= quantidadeMinima(i.unidade)}
                    onClick={() =>
                      alterar(i.id, {
                        quantidade: ajustarQuantidade(i.quantidade, i.unidade, -1),
                      })
                    }
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    aria-label={`Quantidade de ${i.descricao || "item"}`}
                    required
                    type="number"
                    min={quantidadeMinima(i.unidade)}
                    step={quantidadeMinima(i.unidade)}
                    max={1000000}
                    value={i.quantidade}
                    onChange={(e) =>
                      alterar(i.id, { quantidade: Number(e.target.value) })
                    }
                  />
                  <button
                    type="button"
                    aria-label={`Aumentar quantidade de ${i.descricao}`}
                    disabled={i.quantidade >= 1000000}
                    onClick={() =>
                      alterar(i.id, {
                        quantidade: ajustarQuantidade(i.quantidade, i.unidade, 1),
                      })
                    }
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </label>
              <label>
                Unidade
                <input
                  required
                  maxLength={12}
                  value={i.unidade}
                  onChange={(e) => alterar(i.id, { unidade: e.target.value })}
                />
              </label>
              <label>
                Preço unitário (R$)
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0"
                  value={i.preco_centavos / 100}
                  onChange={(e) =>
                    alterar(i.id, {
                      preco_centavos: Math.round(Number(e.target.value) * 100),
                    })
                  }
                />
              </label>
            </div>
            <div className="atendimento-campos">
              {i.origem !== "estoque" && (
                <label>
                  Origem
                  <select
                    value={i.origem}
                    onChange={(e) =>
                      alterar(i.id, {
                        origem: e.target.value as ItemAtendimento["origem"],
                      })
                    }
                  >
                    <option value="externa">Próprio / compra externa</option>
                    {i.tipo === "material" && (
                      <option value="cliente">Fornecido pelo cliente</option>
                    )}
                  </select>
                </label>
              )}
              <strong>{dinheiro(Math.round(i.quantidade * i.preco_centavos))}</strong>
              <button
                type="button"
                aria-label={`Remover ${i.descricao}`}
                onClick={() => setItens(itens.filter((x) => x.id !== i.id))}
              >
                <Trash2 size={17} />
              </button>
            </div>
            {a.oficina?.perfil !== "staff" && i.origem === "externa" && (
              <CustoMargemItem
                custo={i.custo_informado || i.custo_centavos ? i.custo_centavos : null}
                preco={i.preco_centavos}
                quantidade={i.quantidade}
                alterar={(c) =>
                  alterar(i.id, { custo_centavos: c ?? 0, custo_informado: c !== null })
                }
              />
            )}
          </article>
        ))}
        {!itens.length && (
          <p>Adicione os serviços e materiais para calcular o total.</p>
        )}
        <div className="atendimento-campos">
          <CampoDesconto
            controle={controleDesconto}
            nota={{ mostrar: mostrarDescontoNota, alterar: setMostrarDescontoNota }}
          />
          {a.oficina?.perfil !== "staff" && (
            <label>
              Outros custos (R$)
              <input
                type="number"
                min="0"
                step="0.01"
                value={extra}
                onChange={(e) => setExtra(Number(e.target.value))}
              />
            </label>
          )}
        </div>
        {!!extra && (
          <label>
            Descrição dos custos
            <input
              maxLength={1000}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </label>
        )}
        {!!d.comercial.abatimento_diagnostico_centavos && (
          <p>
            Abatimento do diagnóstico já autorizado:{" "}
            {dinheiro(d.comercial.abatimento_diagnostico_centavos)}. Aplicado além do
            desconto acima.
          </p>
        )}
        <p>
          Os materiais do estoque serão baixados quando o serviço for concluído.
          Quantidades fracionadas podem ser usadas para litros, metros e horas.
        </p>
        <button className="botao-primario">Salvar itens e valores</button>
      </fieldset>
      {erro && <p role="alert">{erro}</p>}
    </form>
  );
}
function Equipe({
  d,
  executar,
  gerente,
  ocupado,
}: {
  d: Dados;
  executar: Operar;
  gerente: boolean;
  ocupado: boolean;
}) {
  const a = useAcesso();
  const [equipe, setEquipe] = useState(d.equipe),
    [erro, setErro] = useState("");
  const f = useQuery({
    queryKey: ["funcionarios", a.oficina!.id],
    queryFn: ({ signal }) => listarFuncionarios(a.demo, a.oficina!.id, signal),
    enabled: gerente,
  });
  const encerrado = ["concluido", "cancelado"].includes(d.atendimento.situacao);
  const horasPorFuncionario = useMemo(() => {
    const indice = new Map<
      string,
      { minutos: number; ativa?: Dados["horas"][number] }
    >();
    for (const h of d.horas) {
      const registro = indice.get(h.funcionario_id) || { minutos: 0 };
      if (h.fim) registro.minutos += (Date.parse(h.fim) - Date.parse(h.inicio)) / 60000;
      else if (!registro.ativa) registro.ativa = h;
      indice.set(h.funcionario_id, registro);
    }
    return indice;
  }, [d.horas]);
  const seguro = async (fn: () => Promise<unknown>) => {
    setErro("");
    try {
      await fn();
    } catch (e) {
      setErro(erroPublico(e));
    }
  };
  return (
    <div className="atendimento-form">
      {gerente && !encerrado && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void seguro(() =>
              executar("salvar_equipe_atendimento", {
                p_revisao: d.atendimento.revisao,
                p_equipe: equipe,
              }),
            );
          }}
        >
          <fieldset disabled={ocupado}>
            <label>
              Adicionar funcionário
              <select
                value=""
                onChange={(e) => {
                  const func = f.data?.find((f) => f.id === e.target.value);
                  if (func && !equipe.some((e) => e.funcionario_id === func.id))
                    setEquipe([
                      ...equipe,
                      {
                        id: novoId(),
                        funcionario_id: func.id,
                        nome: func.nome,
                        percentual: 0,
                        custo_hora_centavos: 0,
                      },
                    ]);
                }}
              >
                <option value="">Selecione</option>
                {f.data
                  ?.filter((f) => f.ativo)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
              </select>
            </label>
            {equipe.map((e) => (
              <div className="atendimento-item" key={e.funcionario_id}>
                <strong>{e.nome}</strong>
                <div className="atendimento-campos">
                  {a.permite("employee_reports") && (
                    <label>
                      Porcentagem sobre a mão de obra (%)
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={e.percentual || 0}
                        onChange={(v) =>
                          setEquipe(
                            equipe.map((x) =>
                              x === e
                                ? { ...x, percentual: Number(v.target.value) }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                  )}
                  <details className="comissao-custo-avancado">
                    <summary>Avançado · custo da hora</summary>
                    <label>
                      Custo da hora (R$)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={(e.custo_hora_centavos || 0) / 100}
                        onChange={(v) =>
                          setEquipe(
                            equipe.map((x) =>
                              x === e
                                ? {
                                    ...x,
                                    custo_hora_centavos: Math.round(
                                      Number(v.target.value) * 100,
                                    ),
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                  </details>
                  <button
                    type="button"
                    onClick={() => setEquipe(equipe.filter((x) => x !== e))}
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
            <button className="botao-primario">Salvar equipe</button>
          </fieldset>
        </form>
      )}
      {f.isError && (
        <p role="alert">
          {erroPublico(f.error)}{" "}
          <button type="button" onClick={() => void f.refetch()}>
            Tentar novamente
          </button>
        </p>
      )}
      {d.equipe.map((e) => {
        const { ativa, minutos } = horasPorFuncionario.get(e.funcionario_id) || {
          minutos: 0,
        };
        return (
          <article className="atendimento-item" key={e.id}>
            <strong>{e.nome}</strong>
            <p>
              {Math.round(minutos)} minutos registrados
              {e.comissao_centavos
                ? ` · Comissão: ${dinheiro(e.comissao_centavos)}`
                : ""}
            </p>
            <div className="atendimento-acoes">
              {!encerrado && (
                <button
                  disabled={ocupado || d.atendimento.situacao === "orcamento"}
                  onClick={() =>
                    void seguro(() =>
                      executar("registrar_horas_atendimento", {
                        p_id: ativa?.id || novoId(),
                        p_funcionario: e.funcionario_id,
                        p_inicio: ativa?.inicio || new Date().toISOString(),
                        p_fim: ativa ? new Date().toISOString() : null,
                      }),
                    )
                  }
                >
                  {ativa ? <Square size={16} /> : <Play size={16} />}{" "}
                  {ativa ? "Encerrar tempo" : "Iniciar tempo"}
                </button>
              )}
              {gerente && a.permite("employee_reports") && !!e.comissao_centavos && (
                <button
                  disabled={ocupado}
                  onClick={() =>
                    void seguro(() =>
                      executar("gerar_comissao_atendimento", { p_equipe: e.id }),
                    )
                  }
                >
                  {e.titulo_id
                    ? "Conta da comissão já gerada"
                    : "Gerar conta da comissão"}
                </button>
              )}
            </div>
          </article>
        );
      })}
      {!!d.equipe.length && !encerrado && (
        <details>
          <summary>Registrar horas anteriores</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void seguro(() =>
                executar("registrar_horas_atendimento", {
                  p_id: novoId(),
                  p_funcionario: f.get("funcionario"),
                  p_inicio: new Date(String(f.get("inicio"))).toISOString(),
                  p_fim: new Date(String(f.get("fim"))).toISOString(),
                  p_descricao: f.get("descricao"),
                }),
              );
            }}
          >
            <fieldset disabled={ocupado}>
              <label>
                Funcionário
                <select name="funcionario">
                  {d.equipe.map((e) => (
                    <option key={e.id} value={e.funcionario_id}>
                      {e.nome}
                    </option>
                  ))}
                </select>
              </label>
              <div className="atendimento-campos">
                <label>
                  Início
                  <input required type="datetime-local" name="inicio" />
                </label>
                <label>
                  Fim
                  <input required type="datetime-local" name="fim" />
                </label>
              </div>
              <label>
                Atividade
                <input name="descricao" maxLength={1000} />
              </label>
              <button>Registrar horas</button>
            </fieldset>
          </form>
        </details>
      )}
      {!d.equipe.length && (
        <p>
          {encerrado && gerente
            ? "Nenhuma equipe registrada nesta ordem. Para incluir, reabra o atendimento na aba Resumo."
            : !gerente
              ? "A equipe ainda não foi vinculada a esta ordem."
              : f.isPending
                ? "Carregando funcionários…"
                : f.data?.length
                  ? "Selecione os profissionais acima e salve a equipe para registrar horas e comissões."
                  : "Cadastre os funcionários e vincule a equipe para registrar horas e comissões."}
        </p>
      )}
      {erro && <p role="alert">{erro}</p>}
    </div>
  );
}
import { ReservasEstoque } from "./suprimentos/ReservasEstoque";
