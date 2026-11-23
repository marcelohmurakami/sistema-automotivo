import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, ChevronRight, Search } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { dinheiro } from "../lib/formatacao";
import { erroPublico } from "../lib/supabase";
import { useContasBancarias } from "../lib/useContasBancarias";
import { useBuscaDebounced } from "../lib/useBuscaDebounced";
import {
  indicadoresFinanceiro,
  ehIndicadorFinanceiro,
  dataFinanceiraValida,
  nomesComposicao,
} from "../lib/indicadoresFinanceiro";
import {
  consultarDetalheFinanceiro,
  type RegistroIndicador,
} from "../services/detalheFinanceiro";
import { categorias, formas, hoje, historicoFinanceiro } from "../services/financeiro";
import { Dialogo } from "../components/Dialogo";
import "./FinanceiroDetalhe.css";

const dataBR = (d: string) => d.slice(0, 10).split("-").reverse().join("/");
const nomeCategoria = (c: string) =>
  ({
    taxas: "Taxas de recebimento",
    estoque_consumido: "Consumo do estoque",
    ...categorias,
  })[c] || c;

export function FinanceiroDetalhe() {
  const { indicador } = useParams();
  return ehIndicadorFinanceiro(indicador) ? (
    <ConsultaIndicador key={indicador} indicador={indicador} />
  ) : (
    <section className="fin-detalhamento">
      <h1>Consulta não encontrada</h1>
      <Link to="/financeiro">Voltar ao financeiro</Link>
    </section>
  );
}

function ConsultaIndicador({
  indicador,
}: {
  indicador: keyof typeof indicadoresFinanceiro;
}) {
  const a = useAcesso(),
    oficina = a.oficina!,
    [params, setParams] = useSearchParams();
  const { contas } = useContasBancarias();
  const inicio = dataFinanceiraValida(params.get("inicio"))
    ? params.get("inicio")!
    : hoje().slice(0, 7) + "-01";
  const fim = dataFinanceiraValida(params.get("fim")) ? params.get("fim")! : hoje();
  const [busca, setBusca] = useState(params.get("busca") || "");
  const consulta = useBuscaDebounced(busca);
  const categoria = params.get("categoria") || "",
    conta = params.get("conta") || "";
  const pagina = Math.trunc(
    Math.max(0, Math.min(1000000, Number(params.get("pagina")) || 0)),
  );
  const filtrarVencimento = params.get("vencimento") === "sim";
  const pendente = indicador === "receber" || indicador === "pagar";
  const caixa = ["saldo", "entradas", "saidas"].includes(indicador);
  const [registro, setRegistro] = useState<RegistroIndicador | null>(null);
  const valido =
    inicio <= fim && Date.parse(fim) - Date.parse(inicio) <= 366 * 86400000;
  const permitido = oficina.perfil === "owner" || oficina.perfil === "manager";
  const filtros = {
    indicador,
    inicio,
    fim,
    busca: consulta,
    categoria,
    conta,
    pagina,
    filtrarVencimento,
  };
  const q = useQuery({
    queryKey: ["financeiro-detalhe", a.demo, oficina.id, filtros],
    queryFn: ({ signal }) =>
      consultarDetalheFinanceiro(a.demo, oficina.id, filtros, signal),
    enabled: valido && permitido,
    placeholderData: (anterior, consultaAnterior) =>
      consultaAnterior?.queryKey[1] === a.demo &&
      consultaAnterior.queryKey[2] === oficina.id
        ? anterior
        : undefined,
  });
  const voltar = `/financeiro?${new URLSearchParams({ inicio, fim })}`;
  const descricao = indicadoresFinanceiro[indicador];
  const automotivo = !oficina.ramo || oficina.ramo === "automotivo";
  const titulo =
    indicador === "resultado" && !automotivo
      ? "Resultado das contas registradas"
      : descricao.titulo;
  function filtrar(chave: string, valor: string) {
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (valor) n.set(chave, valor);
        else n.delete(chave);
        if (chave !== "pagina") n.delete("pagina");
        return n;
      },
      { replace: true },
    );
  }
  if (!permitido)
    return (
      <section className="fin-detalhamento">
        <h1>Histórico financeiro</h1>
        <p>Somente o proprietário e os gerentes podem consultar estes valores.</p>
      </section>
    );
  return (
    <section className="fin-detalhamento">
      <Link className="fin-hist-voltar" to={voltar}>
        <ArrowLeft size={18} /> Voltar ao financeiro
      </Link>
      <header className="fin-hist-cabecalho">
        <div>
          <p className="fin-hist-sobretitulo">FINANCEIRO · DETALHAMENTO</p>
          <h1>{titulo}</h1>
          <p>{descricao.explicacao}</p>
        </div>
      </header>
      <div className="fin-hist-filtros">
        {pendente && (
          <label className="fin-hist-checkbox">
            <input
              type="checkbox"
              checked={filtrarVencimento}
              onChange={(e) => filtrar("vencimento", e.target.checked ? "sim" : "")}
            />{" "}
            Filtrar por vencimento
          </label>
        )}
        {(!pendente || filtrarVencimento) && (
          <>
            <label>
              De
              <input
                type="date"
                value={inicio}
                onChange={(e) => filtrar("inicio", e.target.value)}
              />
            </label>
            <label>
              Até
              <input
                type="date"
                value={fim}
                onChange={(e) => filtrar("fim", e.target.value)}
              />
            </label>
            <button
              className="botao-secundario"
              onClick={() =>
                setParams(
                  (p) => {
                    const n = new URLSearchParams(p);
                    n.set("inicio", hoje().slice(0, 7) + "-01");
                    n.set("fim", hoje());
                    n.delete("pagina");
                    return n;
                  },
                  { replace: true },
                )
              }
            >
              Este mês
            </button>
          </>
        )}
        {caixa && (
          <label>
            Conta
            <select
              aria-label="Conta"
              value={conta}
              onChange={(e) => filtrar("conta", e.target.value)}
            >
              <option value="">Todas as contas</option>
              {Object.entries(contas).map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {!valido && (
        <p role="alert">
          Escolha uma data inicial anterior à final e um período de até 367 dias.
        </p>
      )}
      {q.isError && (
        <div role="alert" className="fin-hist-estado">
          <p>{erroPublico(q.error)}</p>
          <button className="botao-secundario" onClick={() => q.refetch()}>
            Tentar novamente
          </button>
        </div>
      )}
      {q.isPending && valido && <p role="status">Carregando os lançamentos…</p>}
      {q.isPlaceholderData && valido && (
        <p role="status">Atualizando valores para os filtros selecionados…</p>
      )}
      {valido && q.data && (
        <>
          <div className="fin-hist-resumo">
            <div className="fin-hist-total">
              <span>
                {indicador === "saldo"
                  ? "Saldo atual · todas as datas"
                  : pendente && !filtrarVencimento
                    ? "Em aberto · todas as datas"
                    : `De ${dataBR(inicio)} a ${dataBR(fim)}`}
              </span>
              <strong>{dinheiro(q.data.saldos?.atual ?? q.data.total_centavos)}</strong>
              <small>
                {q.data.quantidade_total} registros{" "}
                {pendente ? "em aberto" : "no período"}
              </small>
            </div>
            <dl className="fin-hist-composicao">
              {q.data.saldos ? (
                <>
                  <div>
                    <dt>Saldo anterior a {dataBR(inicio)}</dt>
                    <dd>{dinheiro(q.data.saldos.anterior)}</dd>
                  </div>
                  <div>
                    <dt>Movimento no período</dt>
                    <dd>{dinheiro(q.data.total_centavos)}</dd>
                  </div>
                  <div>
                    <dt>Saldo ao fim de {dataBR(fim)}</dt>
                    <dd>{dinheiro(q.data.saldos.final)}</dd>
                  </div>
                </>
              ) : (
                q.data.composicao.map((c) => (
                  <div key={c.tipo}>
                    <dt>
                      {nomesComposicao[c.tipo] || c.tipo}{" "}
                      <small>({c.quantidade})</small>
                    </dt>
                    <dd>{dinheiro(c.valor)}</dd>
                  </div>
                ))
              )}
            </dl>
          </div>
          {indicador === "resultado" && (
            <p className="fin-hist-nota">
              {automotivo
                ? "Resultado dos valores registrados. Custos ainda não informados podem alterar o lucro."
                : "Este resultado considera as contas do financeiro. Custos de materiais, horas e comissões dos atendimentos não são incluídos automaticamente."}
            </p>
          )}
          <div className="fin-hist-lista" aria-busy={q.isFetching}>
            <div className="fin-hist-busca">
              <label>
                <span>Buscar no histórico</span>
                <div>
                  <Search size={18} />
                  <input
                    type="search"
                    placeholder="Descrição, cliente ou fornecedor"
                    value={busca}
                    maxLength={120}
                    onChange={(e) => {
                      setBusca(e.target.value);
                      filtrar("busca", e.target.value);
                    }}
                  />
                </div>
              </label>
              <label>
                Categoria
                <select
                  aria-label="Categoria"
                  value={categoria}
                  onChange={(e) => filtrar("categoria", e.target.value)}
                >
                  <option value="">Todas as categorias</option>
                  {q.data.categorias.map((c) => (
                    <option key={c} value={c}>
                      {nomeCategoria(c)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="fin-hist-contagem">
              <span>
                {q.data.quantidade} registros
                {consulta || categoria ? " encontrados" : ""}
              </span>
              <span>
                {consulta || categoria
                  ? "Total filtrado"
                  : indicador === "saldo"
                    ? "Movimento no período"
                    : "Total"}
                : <b>{dinheiro(q.data.filtrado_centavos)}</b>
              </span>
            </div>
            <div className="fin-hist-colunas" aria-hidden="true">
              <span>{pendente ? "Vencimento" : caixa ? "Pagamento" : "Data"}</span>
              <span>Lançamento</span>
              <span>Valor</span>
              <span />
            </div>
            {q.data.itens.length === 0 ? (
              <p className="fin-hist-estado">
                Nenhum lançamento encontrado. Confira o período e os filtros.
              </p>
            ) : (
              q.data.itens.map((r) => (
                <button
                  key={r.id}
                  className="fin-hist-linha"
                  onClick={() => setRegistro(r)}
                >
                  <time dateTime={r.data}>{dataBR(r.data)}</time>
                  <span className="fin-hist-descricao">
                    <strong>{r.descricao}</strong>
                    <span>{r.pessoa || nomeCategoria(r.categoria)}</span>
                    <small>
                      {nomesComposicao[r.tipo]}
                      {r.dados.estorno ? " · Estorno" : ""}
                      {r.conta ? ` · ${contas[r.conta] || r.conta}` : ""}
                    </small>
                  </span>
                  <b className={r.valor < 0 ? "fin-hist-negativo" : ""}>
                    {dinheiro(r.valor)}
                  </b>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              ))
            )}
            {q.data.quantidade > 30 && (
              <nav className="fin-hist-paginacao" aria-label="Páginas do histórico">
                <button
                  className="botao-secundario"
                  disabled={pagina === 0}
                  onClick={() => filtrar("pagina", String(pagina - 1))}
                >
                  Anterior
                </button>
                <span>
                  Página {pagina + 1} de {Math.ceil(q.data.quantidade / 30)}
                </span>
                <button
                  className="botao-secundario"
                  disabled={(pagina + 1) * 30 >= q.data.quantidade}
                  onClick={() => filtrar("pagina", String(pagina + 1))}
                >
                  Próxima
                </button>
              </nav>
            )}
          </div>
        </>
      )}
      {registro && (
        <RegistroFinanceiro
          registro={registro}
          fechar={() => setRegistro(null)}
          periodo={new URLSearchParams({ inicio, fim }).toString()}
        />
      )}
    </section>
  );
}

function RegistroFinanceiro({
  registro: r,
  fechar,
  periodo,
}: {
  registro: RegistroIndicador;
  fechar: () => void;
  periodo: string;
}) {
  const a = useAcesso(),
    { contas } = useContasBancarias(),
    d = r.dados;
  const h = useQuery({
    queryKey: ["financeiro-historico", a.demo, a.oficina!.id, d.titulo_id],
    queryFn: ({ signal }) =>
      historicoFinanceiro(a.demo, a.oficina!.id, d.titulo_id!, signal),
    enabled: !!d.titulo_id,
  });
  return (
    <Dialogo
      aberto
      fechar={fechar}
      titulo="Detalhes do lançamento"
      classe="fin-hist-dialogo"
    >
      <div className="fin-hist-registro">
        <h3>{r.descricao}</h3>
        <p>{r.pessoa}</p>
        <strong className="fin-hist-valor">{dinheiro(r.valor)}</strong>
        <dl className="fin-hist-composicao">
          <div>
            <dt>Tipo</dt>
            <dd>
              {nomesComposicao[r.tipo]}
              {d.estorno ? " · Estorno" : ""}
            </dd>
          </div>
          <div>
            <dt>Data do registro</dt>
            <dd>{dataBR(r.data)}</dd>
          </div>
          <div>
            <dt>Categoria</dt>
            <dd>{nomeCategoria(r.categoria)}</dd>
          </div>
          {d.competencia && (
            <div>
              <dt>Data da receita ou despesa</dt>
              <dd>{dataBR(d.competencia)}</dd>
            </div>
          )}
          {d.vencimento && (
            <div>
              <dt>Vencimento</dt>
              <dd>{dataBR(d.vencimento)}</dd>
            </div>
          )}
          {r.conta && (
            <div>
              <dt>Conta</dt>
              <dd>{contas[r.conta] || r.conta}</dd>
            </div>
          )}
          {d.forma && (
            <div>
              <dt>Forma de pagamento</dt>
              <dd>{formas[d.forma] || d.forma}</dd>
            </div>
          )}
          {d.bruto !== undefined && (
            <div>
              <dt>Pagamento bruto</dt>
              <dd>{dinheiro(d.bruto)}</dd>
            </div>
          )}
          {!!d.taxa && (
            <div>
              <dt>Taxa</dt>
              <dd>{dinheiro(d.taxa)}</dd>
            </div>
          )}
          {d.valor_original !== undefined && (
            <div>
              <dt>Valor da conta</dt>
              <dd>{dinheiro(d.valor_original)}</dd>
            </div>
          )}
          {d.pago !== undefined && (
            <div>
              <dt>Já pago</dt>
              <dd>{dinheiro(d.pago)}</dd>
            </div>
          )}
          {d.quantidade !== undefined && (
            <div>
              <dt>Quantidade consumida</dt>
              <dd>{d.quantidade.toLocaleString("pt-BR")}</dd>
            </div>
          )}
          {d.custo_unitario !== undefined && (
            <div>
              <dt>Custo unitário</dt>
              <dd>{dinheiro(d.custo_unitario)}</dd>
            </div>
          )}
        </dl>
        {d.observacao && <p className="fin-hist-nota">{d.observacao}</p>}
        <div className="fin-hist-origem">
          {d.titulo_id && (
            <Link
              className="botao-primario"
              to={`/financeiro?titulo=${encodeURIComponent(d.titulo_id)}&${periodo}`}
            >
              Abrir conta <ArrowUpRight size={16} />
            </Link>
          )}
          {d.ordem_servico_id && (
            <Link
              className="botao-secundario"
              to={`/ordens-servico?os=${encodeURIComponent(d.ordem_servico_id)}`}
            >
              Abrir OS {d.numero_os ? `#${d.numero_os}` : ""}
              <ArrowUpRight size={16} />
            </Link>
          )}
        </div>
        {d.titulo_id && (
          <section>
            <h3>Histórico de pagamentos desta conta</h3>
            {h.isPending && <p>Carregando histórico…</p>}
            {h.isError && <p role="alert">{erroPublico(h.error)}</p>}
            {h.data?.length === 0 && <p>Nenhum pagamento registrado.</p>}
            {h.data?.map((b) => (
              <div className="fin-hist-pagamento" key={b.id}>
                <div>
                  <strong>
                    {b.estorno_de ? "Estorno" : "Pagamento"} · {dataBR(b.data)}
                  </strong>
                  <p>
                    {formas[b.forma]} · {contas[b.conta] || b.conta}
                  </p>
                  {b.observacao && <small>{b.observacao}</small>}
                </div>
                <div>
                  <b>{dinheiro(b.valor_centavos)}</b>
                  {!!b.taxa_centavos && (
                    <small>Taxa: {dinheiro(b.taxa_centavos)}</small>
                  )}
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </Dialogo>
  );
}
