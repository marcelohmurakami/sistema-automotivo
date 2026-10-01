import { PdfOS } from "../components/PdfOS";
import { ServicosNaOS } from "../components/ServicosNaOS";
import { FinanceiroNaOS } from "../components/PagamentosIntegrados";
import { atualizarIntegracoes } from "../lib/atualizarIntegracoes";
import { SelecaoClienteVeiculo } from "../components/SelecaoClienteVeiculo";
import { EstoqueNaOS } from "../components/EstoqueNaOS";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  Camera,
  Clock3,
  CheckCircle2,
  ArrowRight,
  Car,
  RefreshCw,
} from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { Dialogo } from "../components/Dialogo";
import { erroPublico } from "../lib/supabase";
import {
  auxiliaresOrcamento,
  dinheiro,
  type Auxiliares,
} from "../services/orcamentos";
import {
  listarOS,
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
const entradaData = (v: string | null | undefined) =>
  v
    ? new Date(new Date(v).getTime() - new Date(v).getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : "";
const fases: Record<string, string> = {
  before: "Antes",
  during: "Durante",
  after: "Depois",
};
const checklistBase = [
  "Avarias de entrada registradas",
  "Pertences conferidos",
  "Peças substituídas conferidas",
  "Teste de funcionamento realizado",
  "Veículo limpo para entrega",
];
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
    quilometragem_entrada: "KM de entrada",
    quilometragem_saida: "KM de saída",
    combustivel_percentual: "Combustível",
    pertences: "Pertences",
    entrega_prevista_em: "Entrega prevista",
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
            alt={
              foto.legenda ||
              `Foto ${fases[foto.fase].toLowerCase()} do serviço`
            }
            loading="lazy"
          />
        </a>
      ) : (
        <p>
          {consulta.isError
            ? "Não foi possível carregar a foto."
            : "Carregando foto…"}
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
function FormularioOS({
  aux,
  anterior,
  ocupado,
  salvar,
}: {
  aux: Auxiliares;
  anterior?: OrdemServico;
  ocupado: boolean;
  salvar: (d: Record<string, unknown>) => void;
}) {
  const [criando, setCriando] = useState(false);
  const [cliente, setCliente] = useState(anterior?.cliente_id ?? "");
  const [veiculo, setVeiculo] = useState(anterior?.veiculo_id ?? "");
  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const d: Record<string, unknown> = Object.fromEntries(f);
    d.cliente_id = cliente;
    d.veiculo_id = veiculo;
    d.entrega_prevista_em = d.entrega_prevista_em
      ? new Date(String(d.entrega_prevista_em)).toISOString()
      : null;
    d.checklist = Object.fromEntries(
      checklistBase.map((c, i) => [c, f.get("check-" + i) === "on"]),
    );
    salvar(d);
  }
  const campo = (nome: keyof OrdemServico, titulo: string, tipo = "text") => (
    <label>
      {titulo}
      <input
        name={nome}
        type={tipo}
        min={tipo === "number" ? 0 : undefined}
        max={nome === "combustivel_percentual" ? 100 : undefined}
        maxLength={160}
        defaultValue={String(anterior?.[nome] ?? "")}
      />
    </label>
  );
  const texto = (nome: keyof OrdemServico, titulo: string) => (
    <label>
      {titulo}
      <textarea
        name={nome}
        maxLength={5000}
        rows={3}
        defaultValue={String(anterior?.[nome] ?? "")}
      />
    </label>
  );
  return (
    <form className="formulario-cliente" onSubmit={enviar}>
      <fieldset disabled={ocupado || criando}>
        {!anterior ? (
          <SelecaoClienteVeiculo
            aux={aux}
            cliente={cliente}
            veiculo={veiculo}
            selecionarCliente={setCliente}
            selecionarVeiculo={setVeiculo}
            aoProcessar={setCriando}
          />
        ) : (
          <p className="aviso-cliente">
            {anterior.dados_cliente.nome} · {anterior.dados_veiculo.modelo} ·{" "}
            {anterior.dados_veiculo.placa || "Sem placa"}
          </p>
        )}
        {texto("queixa_cliente", "O que o cliente relatou?")}
        <div className="dupla-campos">
          {campo("responsavel", "Responsável pelo serviço")}
          <label>
            Previsão de entrega
            <input
              type="datetime-local"
              name="entrega_prevista_em"
              defaultValue={entradaData(anterior?.entrega_prevista_em)}
            />
          </label>
        </div>
        <label>
          Prioridade
          <select
            name="prioridade"
            defaultValue={anterior?.prioridade ?? "normal"}
          >
            <option value="low">Baixa</option>
            <option value="normal">Normal</option>
            <option value="high">Alta</option>
            <option value="urgent">Urgente</option>
          </select>
        </label>
        <details className="os-detalhes" open={!!anterior}>
          <summary>Entrada, diagnóstico e garantia</summary>
          <div className="dupla-campos">
            {campo(
              "quilometragem_entrada",
              "Quilometragem de entrada",
              "number",
            )}
            {campo("combustivel_percentual", "Combustível (%)", "number")}
          </div>
          {texto("pertences", "Pertences e condições de entrada")}
          {texto("diagnostico", "Diagnóstico técnico")}
          {texto("observacoes_internas", "Observações internas")}
          {texto("resumo_cliente", "Resumo do serviço para o cliente")}
          <div className="dupla-campos">
            {campo("quilometragem_saida", "Quilometragem de saída", "number")}
            {campo("garantia_ate", "Garantia até", "date")}
          </div>
          {texto("condicoes_garantia", "Condições da garantia")}
        </details>
        <details className="os-detalhes">
          <summary>Checklist de conferência</summary>
          {checklistBase.map((c, i) => (
            <label className="os-check" key={c}>
              <input
                type="checkbox"
                name={"check-" + i}
                defaultChecked={anterior?.checklist?.[c] ?? false}
              />
              {c}
            </label>
          ))}
        </details>
        <button className="botao-primario" type="submit">
          {ocupado
            ? "Salvando…"
            : anterior
              ? "Salvar atendimento"
              : "Abrir ordem de serviço"}
        </button>
      </fieldset>
    </form>
  );
}
export function OrdensServico() {
  const [parametros, setParametros] = useSearchParams();
  const acesso = useAcesso(),
    qc = useQueryClient(),
    oficina = acesso.oficina?.id ?? "";
  const [busca, setBusca] = useState(""),
    [filtro, setFiltro] = useState(""),
    [pagina, setPagina] = useState(0);
  const [id, setId] = useState<string | null>(parametros.get("os")),
    [editor, setEditor] = useState(parametros.get("nova") === "1"),
    [edicao, setEdicao] = useState<OrdemServico | undefined>(),
    [chave, setChave] = useState(() => crypto.randomUUID());
  const [aba, setAba] = useState("atendimento"),
    [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState("");
  const [novaSituacao, setNovaSituacao] = useState(""),
    [motivo, setMotivo] = useState("");
  const lista = useQuery({
    queryKey: ["os", acesso.demo, oficina, busca, filtro, pagina],
    queryFn: () => listarOS(acesso.demo, oficina, busca, filtro, pagina),
    refetchInterval: 30000,
  });
  const detalhe = useQuery({
    queryKey: ["os-detalhe", acesso.demo, oficina, id],
    queryFn: () => consultarOS(acesso.demo, oficina, id!),
    enabled: !!id,
    refetchInterval: 30000,
  });
  const aux = useQuery({
    queryKey: ["aux-orcamento", acesso.demo, oficina],
    queryFn: () => auxiliaresOrcamento(acesso.demo, oficina),
    enabled: editor,
  });
  const [itemEdicao, setItemEdicao] = useState<
    OrdemServico["itens"][number] | null
  >(null);
  const o = detalhe.data;
  const encerrada = !!o && ["delivered", "cancelled"].includes(o.situacao);
  async function executar(fn: () => Promise<unknown>) {
    setOcupado(true);
    setErro("");
    setAviso("");
    try {
      await fn();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["os"] }),
        qc.invalidateQueries({ queryKey: ["estoque"] }),
        qc.invalidateQueries({ queryKey: ["os-detalhe"] }),
        qc.invalidateQueries({ queryKey: ["financeiro"] }),
        atualizarIntegracoes(qc),
      ]);
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      setOcupado(false);
    }
  }
  function abrirEditor(atual?: OrdemServico) {
    setEdicao(atual);
    setChave(crypto.randomUUID());
    setErro("");
    setEditor(true);
  }
  async function operar(acao: string, dados: Record<string, unknown>) {
    if (!o) return;
    await operarOS(acesso.demo, oficina, o, acao, dados);
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
          <p>Menos papelada. Mais clareza sobre cada carro.</p>
        </div>
        <button className="botao-primario" onClick={() => abrirEditor()}>
          <Plus size={18} />
          Nova OS
        </button>
      </div>
      {acesso.demo && (
        <p className="aviso-cliente">
          Demonstração · Dados e fotos ficam somente neste navegador.
        </p>
      )}
      {!id && !editor && erro && (
        <p role="alert" className="erro-formulario">
          {erro}
        </p>
      )}
      <section className="painel-clientes os-painel">
        <div className="os-filtros">
          <label className="busca-clientes">
            <Search size={18} />
            <input
              aria-label="Buscar ordens de serviço"
              placeholder="Cliente, placa, veículo ou número"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina(0);
              }}
            />
          </label>
          <label>
            Situação
            <select
              value={filtro}
              onChange={(e) => {
                setFiltro(e.target.value);
                setPagina(0);
              }}
            >
              <option value="">Todas</option>
              {Object.entries(situacoesOS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        {lista.isPending ? (
          <p role="status">Carregando ordens…</p>
        ) : lista.isError ? (
          <p role="alert">
            {erroPublico(lista.error)}{" "}
            <button onClick={() => void lista.refetch()}>
              Tentar novamente
            </button>
          </p>
        ) : !lista.data.itens.length ? (
          <div className="estado-lista">
            <Car size={34} />
            <h2>
              {busca || filtro
                ? "Nenhuma OS encontrada"
                : "Seu próximo atendimento começa aqui"}
            </h2>
            <p>Abra uma OS ou converta um orçamento aprovado.</p>
          </div>
        ) : (
          <div className="os-grade">
            {lista.data.itens.map((w) => (
              <button
                className="os-cartao"
                key={w.id}
                onClick={() => {
                  setId(w.id);
                  setAba("atendimento");
                  setErro("");
                  setAviso("");
                }}
              >
                <div className="os-linha">
                  <strong>OS #{String(w.numero).padStart(4, "0")}</strong>
                  <span className={"os-status " + w.situacao}>
                    {situacoesOS[w.situacao]}
                  </span>
                </div>
                <h2>{w.dados_veiculo.modelo}</h2>
                <p>
                  {w.dados_veiculo.placa || "Placa não informada"} ·{" "}
                  {w.dados_cliente.nome}
                </p>
                {(w.paradas_abertas ??
                  w.paradas?.filter((p) => !p.encerrado_em).length) > 0 && (
                  <span className="os-parada">
                    Aguardando resolução de parada
                  </span>
                )}
                <div className="os-linha">
                  <span
                    className={
                      w.entrega_prevista_em &&
                      new Date(w.entrega_prevista_em) < new Date() &&
                      !["delivered", "cancelled"].includes(w.situacao)
                        ? "os-atrasada"
                        : ""
                    }
                  >
                    <Clock3 size={14} /> {data(w.entrega_prevista_em)}
                  </span>
                  <strong>{dinheiro(w.total_centavos)}</strong>
                </div>
              </button>
            ))}
          </div>
        )}
        <div className="os-paginacao">
          <span>
            {lista.data?.total ?? 0} OS · Página {pagina + 1}
          </span>
          <button disabled={!pagina} onClick={() => setPagina((p) => p - 1)}>
            Anterior
          </button>
          <button
            disabled={(pagina + 1) * 24 >= (lista.data?.total ?? 0)}
            onClick={() => setPagina((p) => p + 1)}
          >
            Próxima
          </button>
        </div>
      </section>
      <Dialogo
        aberto={editor}
        fechar={() => {
          if (!ocupado) {
            setEditor(false);
            if (parametros.has("nova")) setParametros({});
          }
        }}
        titulo={
          edicao ? `Editar OS #${edicao.numero}` : "Nova ordem de serviço"
        }
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
            aux={aux.data}
            anterior={edicao}
            ocupado={ocupado}
            salvar={(d) =>
              void executar(async () => {
                const salvo = await salvarOS(
                  acesso.demo,
                  oficina,
                  d,
                  chave,
                  edicao,
                );
                setEditor(false);
                setParametros({ os: salvo.id });
                setId(salvo.id);
                setAba("atendimento");
                setAviso("Atendimento salvo.");
              })
            }
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
        classe="dialogo-orcamento"
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
            {acesso.permite("finance") &&
              acesso.oficina?.perfil !== "staff" && <FinanceiroNaOS os={o} />}
            <div className="os-cabecalho">
              <div>
                <span className={"os-status " + o.situacao}>
                  {situacoesOS[o.situacao]}
                </span>
                <h2>
                  {o.dados_veiculo.modelo}{" "}
                  <small>{o.dados_veiculo.placa}</small>
                </h2>
                <p>{o.dados_cliente.nome}</p>
              </div>
              <button
                className="botao-icone"
                aria-label="Atualizar OS"
                onClick={() => void detalhe.refetch()}
              >
                <RefreshCw size={18} />
              </button>
            </div>
            <PdfOS os={o} />
            <nav className="os-abas" aria-label="Seções da ordem de serviço">
              {[
                ["atendimento", "Atendimento"],
                ["execucao", "Execução"],
                ["fotos", "Fotos"],
                ["historico", "Histórico"],
              ].map(([k, v]) => (
                <button
                  key={k}
                  aria-current={aba === k ? "page" : undefined}
                  onClick={() => setAba(k)}
                >
                  {v}
                </button>
              ))}
            </nav>
            {aba === "atendimento" && (
              <div className="os-secao">
                <div className="os-resumo">
                  <div>
                    <small>PREVISÃO DE ENTREGA</small>
                    <strong>{data(o.entrega_prevista_em)}</strong>
                  </div>
                  <div>
                    <small>RESPONSÁVEL</small>
                    <strong>{o.responsavel || "Não definido"}</strong>
                  </div>
                  <div>
                    <small>VALOR DA OS</small>
                    <strong>{dinheiro(o.total_centavos)}</strong>
                  </div>
                  <div>
                    <small>ENTRADA</small>
                    <strong>{data(o.recebido_em)}</strong>
                  </div>
                </div>
                <h3>Relato do cliente</h3>
                <p className="os-texto">
                  {o.queixa_cliente || "Não informado"}
                </p>
                <h3>Diagnóstico</h3>
                <p className="os-texto">
                  {o.diagnostico || "Aguardando avaliação técnica"}
                </p>
                <details className="os-detalhes">
                  <summary>Dados completos do atendimento</summary>
                  {[
                    ["KM de entrada", o.quilometragem_entrada],
                    ["KM de saída", o.quilometragem_saida],
                    ["Combustível (%)", o.combustivel_percentual],
                    ["Pertences", o.pertences],
                    ["Observações internas", o.observacoes_internas],
                    ["Resumo para o cliente", o.resumo_cliente],
                    ["Garantia", o.condicoes_garantia],
                    ["Garantia até", o.garantia_ate],
                  ].map(([k, v]) => (
                    <p className="os-texto" key={String(k)}>
                      <strong>{k}: </strong>
                      {v ?? "Não informado"}
                    </p>
                  ))}
                </details>
                {o.orcamento_origem_id && (
                  <p className="aviso-cliente">
                    Originada de orçamento aprovado. Os itens e valores
                    contratados estão preservados.
                  </p>
                )}
                {!encerrada && (
                  <button
                    className="botao-secundario"
                    onClick={() => abrirEditor(o)}
                  >
                    Editar atendimento e checklist
                  </button>
                )}
                <div className="os-checklist">
                  {checklistBase.map((c) => (
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
                {!encerrada && (
                  <div className="os-proximos">
                    <h3>Próximo passo</h3>
                    {proximasOS[o.situacao].map((s) => (
                      <button
                        className={
                          s === "cancelled"
                            ? "botao-secundario"
                            : "botao-primario"
                        }
                        key={s}
                        disabled={ocupado}
                        onClick={() => {
                          setNovaSituacao(s);
                          setMotivo("");
                          setErro("");
                        }}
                      >
                        {s === "cancelled" ? "Cancelar OS" : situacoesOS[s]}
                        <ArrowRight size={16} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {aba === "execucao" && (
              <div className="os-secao">
                <EstoqueNaOS
                  os={o}
                  ocupado={ocupado}
                  executar={executar}
                  operar={operar}
                />
                <ServicosNaOS
                  os={o}
                  ocupado={ocupado}
                  executar={executar}
                  operar={operar}
                />
                <h3>Peças e serviços</h3>
                {!o.itens.length && (
                  <p>
                    Nenhum item incluído. Adicione abaixo ou crie a OS a partir
                    de um orçamento.
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
                    {!encerrada &&
                      o.situacao !== "ready" &&
                      !o.orcamento_origem_id && (
                        <button
                          className="botao-secundario"
                          onClick={() => setItemEdicao(i)}
                        >
                          Corrigir
                        </button>
                      )}
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
                {!encerrada &&
                  o.situacao !== "ready" &&
                  !o.orcamento_origem_id && (
                    <details className="os-detalhes">
                      <summary>Adicionar peça ou serviço</summary>
                      <form
                        className="formulario-cliente"
                        onSubmit={(e) =>
                          formulario(e, (f) =>
                            operar("salvar_item_os", {
                              p_revisao: o.revisao,
                              p_dados: {
                                descricao: f.get("descricao"),
                                tipo: f.get("tipo"),
                                quantidade: Number(f.get("quantidade")),
                                preco_unitario_centavos: Math.round(
                                  Number(f.get("preco")) * 100,
                                ),
                              },
                            }),
                          )
                        }
                      >
                        <fieldset disabled={ocupado}>
                          <label>
                            Descrição
                            <input name="descricao" required maxLength={300} />
                          </label>
                          <div className="dupla-campos">
                            <label>
                              Tipo
                              <select name="tipo">
                                <option value="service">Serviço</option>
                                <option value="part">Peça</option>
                              </select>
                            </label>
                            <label>
                              Quantidade
                              <input
                                type="number"
                                name="quantidade"
                                min="0.001"
                                max="100000"
                                step="0.001"
                                defaultValue="1"
                                required
                              />
                            </label>
                            <label>
                              Preço unitário (R$)
                              <input
                                type="number"
                                name="preco"
                                min="0"
                                max="1000000"
                                step="0.01"
                                required
                              />
                            </label>
                          </div>
                          <button className="botao-primario">
                            Adicionar item
                          </button>
                        </fieldset>
                      </form>
                    </details>
                  )}
                <h3>Paradas e pendências</h3>
                {o.paradas
                  .filter((p) => !p.encerrado_em)
                  .map((p) => (
                    <div className="os-bloqueio" key={p.id}>
                      <p>{p.detalhes}</p>
                      {!encerrada && (
                        <button
                          disabled={ocupado}
                          onClick={() =>
                            void executar(() =>
                              operar("resolver_parada_os", { p_parada: p.id }),
                            )
                          }
                        >
                          Marcar como resolvida
                        </button>
                      )}
                    </div>
                  ))}
                {!encerrada && o.situacao !== "ready" && (
                  <details className="os-detalhes">
                    <summary>Registrar motivo de parada</summary>
                    <form
                      className="formulario-cliente"
                      onSubmit={(e) =>
                        formulario(e, (f) =>
                          operar("registrar_parada_os", {
                            p_motivo: f.get("motivo"),
                            p_detalhes: f.get("detalhes"),
                          }),
                        )
                      }
                    >
                      <fieldset disabled={ocupado}>
                        <label>
                          Motivo
                          <select name="motivo">
                            <option value="parts">Aguardando peças</option>
                            <option value="approval">
                              Aguardando aprovação
                            </option>
                            <option value="third_party">
                              Serviço de terceiros
                            </option>
                            <option value="capacity">
                              Falta de capacidade
                            </option>
                            <option value="diagnosis">Em diagnóstico</option>
                            <option value="other">Outro</option>
                          </select>
                        </label>
                        <label>
                          O que está impedindo o serviço?
                          <textarea name="detalhes" required maxLength={2000} />
                        </label>
                        <button className="botao-primario">
                          Registrar parada
                        </button>
                      </fieldset>
                    </form>
                  </details>
                )}
              </div>
            )}
            {aba === "fotos" && (
              <div className="os-secao">
                <h3>O serviço em imagens</h3>
                <p>
                  Registre a condição de entrada e mostre o resultado do
                  trabalho.
                </p>
                {!encerrada && acesso.permite("service_media") && (
                  <form
                    className="formulario-cliente os-envio"
                    onSubmit={(e) =>
                      formulario(e, async (f) => {
                        const arquivo = f.get("foto") as File;
                        if (!arquivo?.size)
                          throw new Error("Selecione uma foto.");
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
                )}
                {Object.entries(fases).map(([fase, nome]) => (
                  <section key={fase}>
                    <h3>
                      {nome}{" "}
                      <small>
                        ({o.fotos.filter((f) => f.fase === fase).length})
                      </small>
                    </h3>
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
                  </section>
                ))}
              </div>
            )}
            {aba === "historico" && (
              <div className="os-secao">
                <h3>Histórico do atendimento</h3>
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
              </div>
            )}
          </>
        )}
      </Dialogo>
      <Dialogo
        aberto={!!itemEdicao}
        fechar={() => !ocupado && setItemEdicao(null)}
        titulo="Corrigir item da OS"
      >
        <p>O histórico preservará os valores anteriores.</p>
        {erro && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        {itemEdicao && (
          <form
            key={itemEdicao.id}
            className="formulario-cliente"
            onSubmit={(e) =>
              formulario(e, async (f) => {
                await operar("corrigir_item_os", {
                  p_item: itemEdicao.id,
                  p_revisao: o!.revisao,
                  p_dados: {
                    descricao: f.get("descricao"),
                    quantidade: Number(f.get("quantidade")),
                    preco_unitario_centavos: Math.round(
                      Number(f.get("preco")) * 100,
                    ),
                  },
                });
                setItemEdicao(null);
              })
            }
          >
            <fieldset disabled={ocupado}>
              <label>
                Descrição
                <input
                  name="descricao"
                  required
                  maxLength={300}
                  defaultValue={itemEdicao.descricao}
                />
              </label>
              <label>
                Quantidade
                <input
                  name="quantidade"
                  type="number"
                  min="0.001"
                  max="100000"
                  step="0.001"
                  required
                  defaultValue={itemEdicao.quantidade}
                />
              </label>
              <label>
                Preço unitário (R$)
                <input
                  name="preco"
                  type="number"
                  min="0"
                  max="1000000"
                  step="0.01"
                  required
                  defaultValue={itemEdicao.preco_unitario_centavos / 100}
                />
              </label>
              <button className="botao-primario">Salvar correção</button>
            </fieldset>
          </form>
        )}
      </Dialogo>
      <Dialogo
        aberto={!!novaSituacao}
        fechar={() => !ocupado && setNovaSituacao("")}
        titulo={
          novaSituacao === "cancelled"
            ? "Cancelar esta OS?"
            : `Alterar para ${situacoesOS[novaSituacao]}?`
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
              await operar("atualizar_mapa_ordem_servico", {
                p_revisao_esperada: o.revisao,
                p_situacao: novaSituacao,
                p_etapa: o.etapa_id ?? null,
                p_local: o.local_id ?? null,
                p_entrega_prevista_em: o.entrega_prevista_em,
                p_recebido_em: o.recebido_em ?? new Date().toISOString(),
                p_motivo_cancelamento: motivo || null,
              });
              setNovaSituacao("");
              setAviso("Situação atualizada.");
            })
          }
        >
          {ocupado ? "Atualizando…" : "Confirmar alteração"}
        </button>
      </Dialogo>
    </>
  );
}
