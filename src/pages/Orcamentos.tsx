import { FotosOrcamento } from "../components/FotosOrcamento";
import "./Documentos.css";
import { buscarCatalogo } from "../lib/catalogo";
import { SelecaoClienteVeiculo } from "../components/SelecaoClienteVeiculo";
import { ConteudoProposta } from "../components/ConteudoProposta";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Plus,
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
  auxiliaresOrcamento,
  dinheiro,
  emitirProposta,
  linkSomenteLocal,
  listarPropostas,
  novoLink,
  obterProposta,
  rotulosSituacao,
  salvarProposta,
  type Auxiliares,
  type DadosProposta,
  type ItemProposta,
  type Proposta,
} from "../services/orcamentos";
import { arquivoPdf, gerarPdf } from "../services/pdfOrcamento";
function EditorOrcamento({
  anterior,
  aux,
  salvar,
  cancelar,
  ocupado,
  erro,
}: {
  anterior?: Proposta;
  aux: Auxiliares;
  salvar: (d: DadosProposta) => void;
  cancelar: () => void;
  ocupado: boolean;
  erro: string;
}) {
  const acesso = useAcesso();
  const [cliente, setCliente] = useState(anterior?.cliente_id ?? "");
  const [veiculo, setVeiculo] = useState(anterior?.veiculo_id ?? "");
  const [itens, setItens] = useState<ItemProposta[]>(anterior?.itens ?? []);
  const [desconto, setDesconto] = useState(
    (anterior?.versao.desconto_centavos ?? 0) / 100,
  );
  const [catalogoBusca, setCatalogoBusca] = useState("");
  const [erroLocal, setErroLocal] = useState("");
  const [criando, setCriando] = useState(false);
  const subtotal = itens.reduce(
    (s, i) => s + Math.round(i.quantidade * i.preco_unitario_centavos),
    0,
  );
  function adicionar(i: Auxiliares["catalogo"][number]) {
    if (itens.length >= 100) return;
    setItens([
      ...itens,
      {
        item_catalogo_id: acesso.demo ? null : i.id,
        tipo: i.tipo,
        descricao: i.descricao,
        unidade: i.unidade,
        quantidade: 1,
        preco_unitario_centavos: i.preco_padrao_centavos,
      },
    ]);
  }
  function alterar(n: number, d: Partial<ItemProposta>) {
    setItens(itens.map((i, j) => (j === n ? { ...i, ...d } : i)));
  }
  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErroLocal("");
    const f = new FormData(e.currentTarget);
    if (Math.round(desconto * 100) > subtotal) {
      setErroLocal("O desconto não pode ultrapassar o subtotal.");
      return;
    }
    salvar({
      cliente_id: cliente,
      veiculo_id: veiculo,
      itens,
      desconto_centavos: Math.round(desconto * 100),
      observacoes: String(f.get("observacoes")),
      condicoes: String(f.get("condicoes")),
    });
  }
  return (
    <form className="formulario-cliente editor-proposta" onSubmit={enviar}>
      <fieldset disabled={ocupado || criando}>
        <div className="etapa-formulario">
          <span>01</span>
          <div>
            <h3>Cliente e veículo</h3>
            <p>Selecione quem será atendido.</p>
          </div>
        </div>
        <SelecaoClienteVeiculo
          aux={aux}
          cliente={cliente}
          veiculo={veiculo}
          selecionarCliente={setCliente}
          selecionarVeiculo={setVeiculo}
          aoProcessar={setCriando}
        />
        <div className="etapa-formulario">
          <span>02</span>
          <div>
            <h3>Peças e serviços</h3>
            <p>Toque nos itens do catálogo ou inclua um item avulso.</p>
          </div>
        </div>
        <label>
          Buscar no catálogo
          <input
            placeholder="Ex.: óleo, freio, alinhamento…"
            value={catalogoBusca}
            onChange={(e) => setCatalogoBusca(e.target.value)}
          />
        </label>
        <div className="catalogo-rapido">
          {aux.catalogo
            .filter((i) =>
              buscarCatalogo(i.descricao).includes(
                buscarCatalogo(catalogoBusca),
              ),
            )
            .slice(0, 8)
            .map((i) => (
              <button
                key={i.id}
                type="button"
                disabled={itens.length >= 100}
                onClick={() => adicionar(i)}
              >
                <Plus size={15} />
                <span>
                  {i.descricao}
                  <small>{dinheiro(i.preco_padrao_centavos)}</small>
                </span>
              </button>
            ))}
        </div>
        <div className="itens-editor">
          {itens.map((i, n) => (
            <div key={n} className="item-editor">
              <label className="descricao-item">
                Descrição
                <input
                  aria-label={`Descrição do item ${n + 1}`}
                  required
                  maxLength={300}
                  value={i.descricao}
                  onChange={(e) => alterar(n, { descricao: e.target.value })}
                />
              </label>
              <label>
                Tipo
                <select
                  aria-label={`Tipo do item ${n + 1}`}
                  value={i.tipo}
                  onChange={(e) =>
                    alterar(n, { tipo: e.target.value as ItemProposta["tipo"] })
                  }
                >
                  <option value="service">Serviço</option>
                  <option value="part">Peça</option>
                </select>
              </label>
              <label>
                Quantidade
                <input
                  aria-label={`Quantidade do item ${n + 1}`}
                  type="number"
                  step="0.001"
                  min="0.001"
                  max="100000"
                  required
                  value={i.quantidade}
                  onChange={(e) =>
                    alterar(n, { quantidade: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Preço (R$)
                <input
                  aria-label={`Preço do item ${n + 1}`}
                  type="number"
                  step="0.01"
                  min="0"
                  max="1000000"
                  required
                  value={i.preco_unitario_centavos / 100}
                  onChange={(e) =>
                    alterar(n, {
                      preco_unitario_centavos: Math.round(
                        Number(e.target.value) * 100,
                      ),
                    })
                  }
                />
              </label>
              <strong>
                {dinheiro(Math.round(i.quantidade * i.preco_unitario_centavos))}
              </strong>
              <button
                type="button"
                className="botao-icone"
                aria-label={`Remover item ${n + 1}`}
                onClick={() => setItens(itens.filter((_, j) => j !== n))}
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="botao-secundario"
          disabled={itens.length >= 100}
          onClick={() =>
            setItens([
              ...itens,
              {
                descricao: "",
                tipo: "service",
                unidade: "un",
                quantidade: 1,
                preco_unitario_centavos: 0,
              },
            ])
          }
        >
          <Plus size={17} />
          Adicionar item avulso
        </button>
        <div className="resumo-editor">
          <label>
            Desconto total (R$)
            <input
              type="number"
              min="0"
              max={subtotal / 100}
              step="0.01"
              required
              value={desconto}
              onChange={(e) => setDesconto(Number(e.target.value))}
            />
          </label>
          <div>
            <small>TOTAL DO ORÇAMENTO</small>
            <strong>{dinheiro(subtotal - Math.round(desconto * 100))}</strong>
          </div>
        </div>
        <label>
          Observações
          <textarea
            name="observacoes"
            rows={3}
            maxLength={4000}
            defaultValue={anterior?.versao.observacoes}
            placeholder="Diagnóstico, escopo e detalhes do serviço"
          />
        </label>
        <label>
          Condições de pagamento e execução
          <textarea
            name="condicoes"
            rows={3}
            maxLength={4000}
            defaultValue={
              anterior?.versao.condicoes ??
              "Serviços executados após a aprovação deste orçamento. Qualquer serviço adicional será apresentado para nova aprovação."
            }
          />
        </label>
      </fieldset>
      {(erro || erroLocal) && (
        <p className="erro-formulario" role="alert">
          {erroLocal || erro}
        </p>
      )}
      <div className="acoes-formulario">
        <button
          type="button"
          className="botao-secundario"
          disabled={ocupado || criando}
          onClick={cancelar}
        >
          Cancelar
        </button>
        <button className="botao-primario" disabled={ocupado || criando}>
          {ocupado ? "Salvando…" : "Salvar rascunho"}
        </button>
      </div>
    </form>
  );
}
export function Orcamentos() {
  const acesso = useAcesso(),
    cache = useQueryClient();
  const oficina = acesso.oficina!.id;
  const [parametros, setParametros] = useSearchParams();
  const [busca, setBusca] = useState(""),
    [situacao, setSituacao] = useState(""),
    [pagina, setPagina] = useState(0);
  const [detalhe, setDetalhe] = useState<Proposta | null>(null),
    [edicao, setEdicao] = useState<Proposta | null>(null);
  const [chaveCriacao, setChaveCriacao] = useState(() => crypto.randomUUID());
  const [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [link, setLink] = useState(""),
    [validade, setValidade] = useState(7),
    [confirmacao, setConfirmacao] = useState<
      "cancelar" | "revisar" | "converter" | null
    >(null);
  const editorAberto = parametros.get("novo") === "1" || !!edicao;
  const chave = ["orcamentos", acesso.demo ? "demo" : acesso.usuario, oficina];
  const lista = useQuery({
    queryKey: [...chave, busca, situacao, pagina],
    queryFn: () =>
      listarPropostas(acesso.demo, oficina, busca, situacao, pagina),
    retry: false,
    refetchInterval: 30000,
  });
  const aux = useQuery({
    queryKey: [
      "auxiliares-orcamento",
      acesso.demo ? "demo" : acesso.usuario,
      oficina,
    ],
    queryFn: () => auxiliaresOrcamento(acesso.demo, oficina),
    enabled: editorAberto,
    retry: false,
  });
  async function executar(acao: () => Promise<void>) {
    if (ocupado) return;
    setOcupado(true);
    setErro("");
    try {
      await acao();
      await cache.invalidateQueries({ queryKey: chave });
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
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
    });
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
          setAviso(
            "Compartilhamento aberto. Escolha o WhatsApp e o destinatário.",
          );
          return;
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
        }
      }
      {
        gerarPdf(detalhe, linkSomenteLocal() ? "" : destino).save(arquivo.name);
        setAviso(
          "PDF baixado. Use “Abrir WhatsApp” e anexe o arquivo na conversa.",
        );
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
          <p>Propostas profissionais, prontas em poucos toques.</p>
        </div>
        <button
          className="botao-primario"
          onClick={() => {
            setChaveCriacao(crypto.randomUUID());
            setErro("");
            setParametros({ novo: "1" });
          }}
        >
          <Plus size={19} />
          Novo orçamento
        </button>
      </div>
      {acesso.demo && (
        <div className="nota-demo">
          Demonstração · Orçamentos salvos neste navegador. Aprovação por link e
          conversão em OS usam a conta real.
        </div>
      )}
      {aviso && (
        <div className="aviso-cliente" role="status">
          {aviso}
        </div>
      )}
      {erro && !editorAberto && (
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
            <p>Acompanhe o que precisa de aprovação.</p>
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
                setPagina(0);
              }}
            />
          </label>
        </div>
        <div className="filtros-propostas">
          <label>
            Situação{" "}
            <select
              value={situacao}
              onChange={(e) => {
                setSituacao(e.target.value);
                setPagina(0);
              }}
            >
              <option value="">Todas as situações</option>
              {Object.entries(rotulosSituacao).map(([valor, nome]) => (
                <option key={valor} value={valor}>
                  {nome}
                </option>
              ))}
            </select>
          </label>
          <span>Atualização automática a cada 30 segundos</span>
        </div>
        {lista.isPending ? (
          <div className="estado-lista" role="status">
            Carregando orçamentos…
          </div>
        ) : lista.isError ? (
          <div className="estado-lista">
            <p role="alert">{erroPublico(lista.error)}</p>
            <button
              className="botao-secundario"
              onClick={() => void lista.refetch()}
            >
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
            <p>
              Selecione o cliente, adicione os itens e prepare sua proposta.
            </p>
          </div>
        ) : (
          <div className="lista-propostas">
            {lista.data.itens.map((q) => (
              <button
                key={q.id}
                className="linha-proposta"
                disabled={ocupado}
                onClick={() => void abrir(q.id)}
              >
                <span className="icone-proposta">
                  <FileText size={22} />
                </span>
                <div>
                  <strong>
                    #{String(q.numero).padStart(4, "0")} · {q.cliente}
                  </strong>
                  <small>
                    {q.veiculo}
                    {q.placa ? ` · ${q.placa}` : ""} · Versão {q.numero_versao}
                  </small>
                </div>
                <span className={`situacao-proposta ${q.situacao}`}>
                  {rotulosSituacao[q.situacao]}
                </span>
                <strong>{dinheiro(q.total_centavos)}</strong>
                <ChevronRight size={18} />
              </button>
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
        titulo={
          edicao ? `Editar orçamento #${edicao.numero}` : "Novo orçamento"
        }
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
                key={edicao?.id ?? chaveCriacao}
                anterior={edicao ?? undefined}
                aux={aux.data}
                ocupado={ocupado}
                erro={erro}
                cancelar={fecharEditor}
                salvar={(dados) =>
                  void executar(async () => {
                    const q = await salvarProposta(
                      acesso.demo,
                      oficina,
                      dados,
                      chaveCriacao,
                      edicao ?? undefined,
                    );
                    setParametros({});
                    setEdicao(null);
                    setChaveCriacao(crypto.randomUUID());
                    setDetalhe(q);
                    setLink("");
                    setAviso(
                      "Rascunho salvo. Confira os dados e emita para enviar ao cliente.",
                    );
                  })
                }
              />
            )
          ))}
      </Dialogo>
      <Dialogo
        aberto={!!detalhe && !editorAberto}
        fechar={() => {
          if (!ocupado) {
            setDetalhe(null);
            setErro("");
            setLink("");
          }
        }}
        titulo={detalhe ? `Orçamento #${detalhe.numero}` : "Orçamento"}
        classe="dialogo-orcamento"
      >
        {detalhe && (
          <>
            {aviso && (
              <p className="aviso-cliente" role="status">
                {aviso}
              </p>
            )}
            <div className="barra-proposta">
              <span className={`situacao-proposta ${detalhe.situacao}`}>
                {rotulosSituacao[detalhe.situacao]}
              </span>
              {!acesso.demo && (
                <label>
                  Versão
                  <select
                    value={detalhe.versao.id}
                    onChange={(e) => void abrir(detalhe.id, e.target.value)}
                    disabled={ocupado}
                  >
                    {detalhe.historico.map((v) => (
                      <option key={v.id} value={v.id}>
                        v{v.numero_versao} ·{" "}
                        {v.publicado_em ? "Emitida" : "Rascunho"}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                className="botao-secundario"
                disabled={ocupado}
                onClick={() => void abrir(detalhe.id)}
              >
                <Check size={15} />
                Atualizar situação
              </button>
            </div>
            <ConteudoProposta q={detalhe} />
            {erro && (
              <p role="alert" className="erro-formulario">
                {erro}
              </p>
            )}
            <FotosOrcamento
              versao={detalhe.versao.id}
              rascunho={!detalhe.versao.publicado_em}
            />
            {detalhe.versao.id === detalhe.versao_atual_id && (
              <div className="acoes-proposta">
                {detalhe.situacao === "draft" ? (
                  <>
                    <button
                      className="botao-secundario"
                      disabled={ocupado}
                      onClick={() => {
                        setEdicao(detalhe);
                        setErro("");
                      }}
                    >
                      Editar rascunho
                    </button>
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
                      disabled={ocupado || !detalhe.itens.length}
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
                          setAviso(
                            "Proposta emitida. Agora você pode compartilhar o PDF e o link.",
                          );
                        })
                      }
                    >
                      <Send size={17} />
                      {ocupado ? "Emitindo…" : "Emitir orçamento"}
                    </button>
                  </>
                ) : (
                  <>
                    {detalhe.situacao !== "cancelled" && (
                      <button
                        className="botao-primario"
                        disabled={ocupado}
                        onClick={() => void compartilhar()}
                      >
                        <Send size={17} />
                        Compartilhar PDF
                      </button>
                    )}
                    {!detalhe.ordem_servico_id && (
                      <button
                        className="botao-secundario"
                        disabled={ocupado}
                        onClick={() => setConfirmacao("revisar")}
                      >
                        Criar nova versão
                      </button>
                    )}
                    {detalhe.situacao === "approved" &&
                      acesso.permite("work_orders") &&
                      !detalhe.ordem_servico_id && (
                        <button
                          className="botao-primario"
                          disabled={ocupado}
                          onClick={() => setConfirmacao("converter")}
                        >
                          Transformar em OS
                          <ArrowUpRight size={17} />
                        </button>
                      )}
                  </>
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
            <div className="acoes-proposta">
              <button
                className="botao-secundario"
                onClick={() =>
                  gerarPdf(detalhe, linkSomenteLocal() ? "" : link).save(
                    `orcamento-${detalhe.numero}-v${detalhe.versao.numero_versao}.pdf`,
                  )
                }
              >
                <Download size={17} />
                Baixar PDF
              </button>
              {!acesso.demo &&
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
            {link && (
              <div className="compartilhar-link">
                <label>
                  Link desta versão
                  <input
                    readOnly
                    value={link}
                    onFocus={(e) => e.target.select()}
                  />
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
            {linkSomenteLocal() && detalhe.versao.publicado_em && (
              <p className="nota-demo">
                O PDF já pode ser enviado. O link de aprovação só funciona neste
                computador enquanto o sistema estiver em localhost; para o
                cliente abrir pelo celular, publique o sistema e configure sua
                URL pública.
              </p>
            )}
            {detalhe.ordem_servico_id && (
              <p className="aviso-cliente">
                <Link to={`/ordens-servico?os=${detalhe.ordem_servico_id}`}>
                  Abrir ordem de serviço
                </Link>
                . Os itens e valores aprovados foram preservados.
              </p>
            )}
          </>
        )}
      </Dialogo>
      <Dialogo
        aberto={!!confirmacao}
        fechar={() => {
          if (!ocupado) setConfirmacao(null);
        }}
        titulo={
          confirmacao === "cancelar"
            ? "Cancelar orçamento?"
            : confirmacao === "converter"
              ? "Transformar em ordem de serviço?"
              : "Criar nova versão?"
        }
      >
        <p className="texto-suave">
          {confirmacao === "cancelar"
            ? "Os links serão revogados. O orçamento e seu histórico serão preservados."
            : confirmacao === "converter"
              ? "A OS será criada com os itens e valores aprovados pelo cliente."
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
                setDetalhe(
                  await obterProposta(acesso.demo, oficina, detalhe.id),
                );
                setConfirmacao(null);
                setLink("");
                setAviso(
                  acao === "converter"
                    ? "Ordem de serviço criada com sucesso."
                    : "Orçamento atualizado.",
                );
              })
            }
          >
            {ocupado ? "Processando…" : "Confirmar"}
          </button>
        </div>
      </Dialogo>
    </>
  );
}
