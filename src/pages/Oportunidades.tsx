import { dinheiro } from "../lib/formatacao";
import { useMemo, useRef, useState } from "react";
import { atualizarCadastro } from "../lib/atualizarCadastro";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  CalendarDays,
  MessageCircle,
  Search,
  CircleCheck,
  ClipboardList,
  Clock3,
  Wrench,
} from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { erroPublico } from "../lib/supabase";

import {
  acompanharOportunidade,
  consultarOportunidades,
  type Oportunidade,
} from "../services/oficinaAgil";
import { Dialogo } from "../components/Dialogo";
import "./OficinaAgil.css";
import "./Oportunidades.css";
const categorias = [
  { id: "ativos", nome: "Todos", icone: MessageCircle },
  { id: "orcamento", nome: "Orçamentos", icone: ClipboardList },
  { id: "adiados", nome: "Adiados e retiradas", icone: Clock3 },
  { id: "manutencao", nome: "Revisões", icone: Wrench },
];
const motivos = {
  orcamento: "Retomar orçamento",
  adiados: "Serviço adiado",
  retirada: "Aguardando retirada",
  manutencao: "Revisão prevista",
};
const situacoes: Record<string, string> = {
  aberto: "Sem contato",
  contatado: "Contatado",
  adiado: "Contato adiado",
  descartado: "Encerrado",
};
const pertence = (o: Oportunidade, filtro: string) =>
  filtro === "ativos" ||
  o.origem === filtro ||
  (filtro === "adiados" && o.origem === "retirada");
const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
export function Oportunidades() {
  const executando = useRef(false);
  const [params, setParams] = useSearchParams();
  const caso = params.get("caso");
  const a = useAcesso(),
    nav = useNavigate(),
    cache = useQueryClient();
  const [filtro, setFiltro] = useState("ativos"),
    [busca, setBusca] = useState(""),
    [mostrar, setMostrar] = useState("ativos"),
    [erro, setErro] = useState(""),
    [busy, setBusy] = useState(false),
    [editar, setEditar] = useState<Oportunidade | null>(null);
  const q = useQuery({
    queryKey: ["oportunidades", a.oficina!.id, a.demo],
    queryFn: ({ signal }) =>
      a.demo
        ? Promise.resolve({ itens: [] })
        : consultarOportunidades(a.oficina!.id, signal),
    refetchInterval: 60000,
  });
  const itens = useMemo(() => q.data?.itens ?? [], [q.data]);
  const indice = useMemo(
    () =>
      new Map(
        itens.map((o) => [
          o,
          normalizar([o.cliente, o.veiculo, o.placa, o.descricao].join(" ")),
        ]),
      ),
    [itens],
  );
  const termo = normalizar(busca);
  const base = useMemo(
    () =>
      itens.filter(
        (o) =>
          mostrar === "todos" ||
          (mostrar === "encerrados"
            ? o.situacao === "descartado"
            : o.situacao !== "descartado"),
      ),
    [itens, mostrar],
  );
  const visiveis = caso
    ? itens.filter((o) => caso === o.origem + ":" + o.origem_id)
    : base.filter((o) => pertence(o, filtro) && indice.get(o)!.includes(termo));
  function limpar() {
    setParams({});
    setBusca("");
    setFiltro("ativos");
    setMostrar("ativos");
  }
  async function agir(o: Oportunidade, d: Record<string, unknown>) {
    if (executando.current) return;
    executando.current = true;
    setBusy(true);
    setErro("");
    try {
      const r = await acompanharOportunidade(a.oficina!.id, o, d);
      void cache.invalidateQueries({ queryKey: ["alertas"] }).catch(() => {});
      await atualizarCadastro(cache, ["oportunidades", a.oficina!.id, a.demo]);
      setEditar(null);
      if (d.acao === "orcamento" && r.orcamento)
        nav("/orcamentos?orcamento=" + r.orcamento);
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      executando.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="agil-pagina contatos-pagina">
      <header className="agil-cabecalho">
        <div>
          <h1>Clientes para contatar</h1>
          <p>Pendências com clientes, reunidas automaticamente.</p>
        </div>
      </header>
      {caso ? (
        <div className="contatos-caso">
          <span>Contato selecionado pelo sininho</span>
          <button className="botao-secundario" onClick={limpar}>
            Ver todos
          </button>
        </div>
      ) : (
        <>
          <div className="contatos-abas" aria-label="Motivo do contato">
            {categorias.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={filtro === c.id}
                onClick={() => setFiltro(c.id)}
              >
                <c.icone size={17} aria-hidden="true" />
                {c.nome}
                <span>
                  {q.isPending || q.isError
                    ? "—"
                    : base.filter((o) => pertence(o, c.id)).length}
                </span>
              </button>
            ))}
          </div>
          <div className="contatos-filtros">
            <label>
              <span>Buscar cliente ou serviço</span>
              <span className="contatos-busca">
                <Search size={18} aria-hidden="true" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Nome, veículo, placa ou serviço"
                />
              </span>
            </label>
            <label>
              Mostrar
              <select value={mostrar} onChange={(e) => setMostrar(e.target.value)}>
                <option value="ativos">Em acompanhamento</option>
                <option value="encerrados">Encerrados</option>
                <option value="todos">Todos</option>
              </select>
            </label>
          </div>
        </>
      )}
      {(erro || q.isError) && (
        <p role="alert" className="agil-alerta">
          {erro || erroPublico(q.error)}
        </p>
      )}
      <section className="contatos-lista" aria-label="Clientes para contato">
        {q.isPending ? (
          <p className="contatos-vazio" role="status">
            Carregando contatos…
          </p>
        ) : q.isError ? (
          <div className="contatos-vazio">
            <button className="botao-secundario" onClick={() => void q.refetch()}>
              Tentar novamente
            </button>
          </div>
        ) : !visiveis.length ? (
          <div className="contatos-vazio">
            <CircleCheck size={32} aria-hidden="true" />
            <h2>
              {caso || itens.length
                ? "Nenhum contato nesta seleção"
                : "Tudo em dia por aqui"}
            </h2>
            <p>
              {caso || itens.length
                ? "Altere os filtros para ver os demais contatos."
                : "Orçamentos pendentes, retiradas, serviços adiados e revisões aparecerão aqui."}
            </p>
            {(caso || itens.length > 0) && (
              <button className="botao-secundario" onClick={limpar}>
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          visiveis.map((o) => (
            <article className="contatos-linha" key={o.origem + ":" + o.origem_id}>
              <div className="contatos-avatar" aria-hidden="true">
                {o.origem === "retirada" ? (
                  <CircleCheck size={23} />
                ) : o.origem === "manutencao" ? (
                  <Wrench size={23} />
                ) : (
                  <MessageCircle size={23} />
                )}
              </div>
              <div className="contatos-identidade">
                <h2>{o.cliente}</h2>
                <p>
                  {o.veiculo}
                  {o.placa ? " · " + o.placa : ""}
                </p>
                <details className="contatos-detalhes">
                  <summary>Detalhes do contato</summary>
                  <p>{o.descricao}</p>
                  {o.valor_centavos > 0 && (
                    <p>Valor do serviço: {dinheiro(o.valor_centavos)}</p>
                  )}
                  {o.anotacao && (
                    <p>
                      <strong>Última anotação:</strong> {o.anotacao}
                    </p>
                  )}
                  {o.ordem_servico_id ? (
                    <Link to={"/ordens-servico?os=" + o.ordem_servico_id}>
                      Abrir OS <ArrowUpRight size={14} />
                    </Link>
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() => void agir(o, { acao: "orcamento" })}
                    >
                      {o.orcamento_id ? "Abrir orçamento" : "Preparar orçamento"}{" "}
                      <ArrowUpRight size={14} />
                    </button>
                  )}
                </details>
              </div>
              <div className="contatos-motivo">
                <strong className={"contatos-etiqueta contatos-etiqueta--" + o.origem}>
                  {motivos[o.origem]}
                </strong>
                <span>{situacoes[o.situacao] || o.situacao}</span>
                {o.proximo_contato && (
                  <small>
                    <CalendarDays size={14} /> Contatar em{" "}
                    {o.proximo_contato.split("-").reverse().join("/")}
                  </small>
                )}
              </div>
              <div className="contatos-acoes">
                {o.telefone ? (
                  <a
                    className="botao-primario"
                    href={
                      "https://wa.me/" +
                      o.telefone.replace(/\D/g, "") +
                      "?text=" +
                      encodeURIComponent(
                        o.origem === "retirada"
                          ? "Olá, " +
                              o.cliente +
                              "! Aqui é da " +
                              a.oficina!.nome +
                              ". O serviço do seu " +
                              o.veiculo +
                              " está pronto para retirada. Qual dia e horário você pode buscar?"
                          : "Olá, " +
                              o.cliente +
                              "! Aqui é da " +
                              a.oficina!.nome +
                              ". Gostaria de conversar sobre " +
                              o.descricao.toLocaleLowerCase() +
                              " do seu " +
                              o.veiculo +
                              ". Qual é o melhor horário para falar?",
                      )
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle size={16} />
                    WhatsApp
                  </a>
                ) : o.cliente_id ? (
                  <Link
                    className="botao-secundario"
                    to={"/clientes?cliente=" + o.cliente_id}
                  >
                    Cadastrar telefone
                  </Link>
                ) : (
                  <small>Sem telefone cadastrado</small>
                )}
                <button
                  className="botao-secundario"
                  disabled={busy || a.demo}
                  onClick={() => setEditar(o)}
                >
                  Registrar contato
                </button>
              </div>
            </article>
          ))
        )}
      </section>
      <details className="contatos-ajuda">
        <summary>Como funciona esta lista?</summary>
        <p>
          Abra o WhatsApp para conversar e use “Registrar contato” para anotar o
          combinado ou encerrar o acompanhamento. Nenhuma mensagem é enviada
          automaticamente.
        </p>
        <p>
          Entram orçamentos sem resposta há mais de um dia, vencidos ou recusados;
          serviços adiados; OS prontas para retirada; e revisões vencidas, sem data ou
          previstas nos próximos 30 dias. Até 500 casos, dos mais antigos aos mais
          recentes.
        </p>
      </details>
      {editar && (
        <Dialogo
          aberto
          titulo="Registrar conversa com o cliente"
          fechar={() => {
            if (!busy) setEditar(null);
          }}
        >
          <form
            className="agil-pagina"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void agir(editar, {
                situacao: f.get("situacao"),
                proximo_contato: f.get("proximo_contato"),
                anotacao: f.get("anotacao"),
              });
            }}
          >
            <p>
              {editar.cliente} · {editar.descricao}
            </p>
            <label>
              Como ficou a conversa?
              <select name="situacao" defaultValue="contatado">
                <option value="contatado">Conversei com o cliente</option>
                <option value="adiado">Deixamos para depois</option>
                <option value="aberto">Ainda preciso falar</option>
                <option value="descartado">Não acompanhar mais</option>
              </select>
            </label>
            <label>
              Próximo contato (opcional)
              <input
                type="date"
                name="proximo_contato"
                defaultValue={editar.proximo_contato || ""}
              />
            </label>
            <label>
              O que ficou combinado?
              <textarea
                name="anotacao"
                rows={3}
                maxLength={2000}
                defaultValue={editar.anotacao || ""}
              />
            </label>
            {erro && <p role="alert">{erro}</p>}
            <button className="botao-primario" disabled={busy}>
              {busy ? "Salvando…" : "Salvar acompanhamento"}
            </button>
          </form>
        </Dialogo>
      )}
    </div>
  );
}
