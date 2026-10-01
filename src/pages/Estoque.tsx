import "./Compras.css";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Package,
  Plus,
  Search,
  ArrowDownUp,
  AlertTriangle,
} from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { Dialogo } from "../components/Dialogo";
import { erroPublico } from "../lib/supabase";
import { dinheiro } from "../services/orcamentos";
import {
  listarEstoque,
  salvarProduto,
  movimentar,
  historicoEstoque,
  estornarEstoque,
  arquivarProduto,
  tiposMovimento,
  type ProdutoEstoque,
  type MovimentoEstoque,
} from "../services/estoque";
const numero = (n: number | null) =>
  n === null
    ? "Não controlado"
    : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(n);
export function Estoque() {
  const a = useAcesso(),
    oficina = a.oficina!.id,
    qc = useQueryClient();
  const [busca, setBusca] = useState(""),
    [filtro, setFiltro] = useState(""),
    [pagina, setPagina] = useState(0);
  const [produto, setProduto] = useState<ProdutoEstoque | null>(null),
    [modal, setModal] = useState(""),
    [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [tipo, setTipo] = useState("entrada"),
    [chave, setChave] = useState(() => crypto.randomUUID()),
    [paginaHistorico, setPaginaHistorico] = useState(0),
    [estorno, setEstorno] = useState<MovimentoEstoque | null>(null);
  const consulta = useQuery({
    queryKey: ["estoque", a.demo, oficina, busca, filtro, pagina],
    queryFn: () => listarEstoque(a.demo, oficina, busca, filtro, pagina),
    refetchInterval: 30000,
  });
  const historico = useQuery({
    queryKey: [
      "estoque-historico",
      a.demo,
      oficina,
      produto?.id,
      paginaHistorico,
    ],
    queryFn: () =>
      historicoEstoque(a.demo, oficina, produto!.id, paginaHistorico),
    enabled: modal === "historico" && !!produto,
    refetchInterval: 30000,
  });
  function abrir(m: string, p?: ProdutoEstoque) {
    setProduto(p ?? null);
    setModal(m);
    setErro("");
    setChave(crypto.randomUUID());
    setPaginaHistorico(0);
    setEstorno(null);
    setTipo("entrada");
  }
  async function executar(fn: () => Promise<unknown>, fechar = true) {
    setOcupado(true);
    setErro("");
    try {
      await fn();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["catalogo"] }),
        qc.invalidateQueries({ queryKey: ["estoque"] }),
        qc.invalidateQueries({ queryKey: ["estoque-historico"] }),
        qc.invalidateQueries({ queryKey: ["aux-orcamento"] }),
        qc.invalidateQueries({ queryKey: ["auxiliares-orcamento"] }),
        qc.invalidateQueries({ queryKey: ["os-detalhe"] }),
      ]);
      if (fechar) setModal("");
      setAviso("Operação registrada com sucesso.");
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      setOcupado(false);
    }
  }
  function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void executar(() =>
      salvarProduto(a.demo, oficina, {
        id: produto?.id ?? chave,
        revisao: produto?.revisao ?? null,
        descricao: String(f.get("descricao")),
        codigo: String(f.get("codigo")),
        unidade: String(f.get("unidade")),
        preco_padrao_centavos: Math.round(Number(f.get("preco")) * 100),
        custo_centavos: Math.round(Number(f.get("custo")) * 100),
        minimo: Number(f.get("minimo")),
        fornecedor: String(f.get("fornecedor")),
        localizacao: String(f.get("localizacao")),
        saldo: produto?.saldo ?? 0,
        arquivado_em: produto?.arquivado_em ?? null,
      }),
    );
  }
  return (
    <>
      <div className="titulo-pagina">
        <div>
          <div className="sobretitulo">
            <span className="linha-verde" />A PEÇA CERTA, NA HORA CERTA
          </div>
          <h1>
            Estoque<span>.</span>
          </h1>
          <p>Saiba o que tem, o que falta e onde cada peça foi usada.</p>
        </div>
        <button className="botao-primario" onClick={() => abrir("produto")}>
          <Plus size={18} />
          Nova peça
        </button>
      </div>
      <div className="compra-acoes compra-links">
        <Link to="/fornecedores">Fornecedores</Link>
        {a.permite("finance") && a.oficina!.perfil !== "staff" && (
          <Link className="botao-secundario" to="/compras">
            Registrar compras →
          </Link>
        )}
      </div>
      {a.demo && (
        <p className="aviso-cliente">
          Demonstração · Estoque e movimentações salvos neste navegador.
        </p>
      )}
      {aviso && (
        <p role="status" className="aviso-cliente">
          {aviso}
        </p>
      )}
      <div className="estoque-indicadores">
        <article>
          <Package size={21} />
          <span>Peças controladas</span>
          <strong>{consulta.data?.resumo.produtos ?? 0}</strong>
        </article>
        <article className="estoque-alerta">
          <AlertTriangle size={21} />
          <span>No mínimo ou abaixo</span>
          <strong>{consulta.data?.resumo.baixos ?? 0}</strong>
        </article>
        <article>
          <ArrowDownUp size={21} />
          <span>Valor estimado a custo</span>
          <strong>{dinheiro(consulta.data?.resumo.valor_centavos ?? 0)}</strong>
        </article>
      </div>
      <section className="os-painel">
        <div className="os-filtros">
          <label>
            <Search size={17} />
            <input
              aria-label="Buscar peças"
              placeholder="Nome ou código da peça"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina(0);
              }}
            />
          </label>
          <label>
            Exibir
            <select
              value={filtro}
              onChange={(e) => {
                setFiltro(e.target.value);
                setPagina(0);
              }}
            >
              <option value="">Peças ativas</option>
              <option value="baixo">Estoque baixo</option>
              <option value="arquivados">Arquivadas</option>
            </select>
          </label>
        </div>
        <p className="texto-suave">
          A baixa das peças acontece ao marcar a OS como Entregue. O saldo não
          inclui reservas de OS em andamento.
        </p>
        {consulta.isPending ? (
          <p role="status">Carregando estoque…</p>
        ) : consulta.isError ? (
          <p role="alert">
            {erroPublico(consulta.error)}{" "}
            <button onClick={() => void consulta.refetch()}>
              Tentar novamente
            </button>
          </p>
        ) : !consulta.data.itens.length ? (
          <div className="estado-lista">
            <Package size={35} />
            <h2>Nenhuma peça encontrada</h2>
            <p>Cadastre a peça e registre a primeira entrada.</p>
          </div>
        ) : (
          <div className="os-grade estoque-grade">
            {consulta.data.itens.map((p) => (
              <article className="estoque-cartao" key={p.id}>
                <div className="os-linha">
                  <span>{p.codigo || "Sem código"}</span>
                  {p.saldo !== null && p.saldo <= p.minimo && (
                    <span className="os-parada">Repor estoque</span>
                  )}
                </div>
                <h2>{p.descricao}</h2>
                <p>{p.localizacao || "Localização não informada"}</p>
                <div className="estoque-saldo">
                  <strong>{numero(p.saldo)}</strong>
                  {p.saldo !== null && (
                    <span>
                      {p.unidade} · mínimo {numero(p.minimo)}
                    </span>
                  )}
                </div>
                <p>
                  Venda: {dinheiro(p.preco_padrao_centavos)}
                  {p.custo_centavos != null &&
                    ` · Custo: ${dinheiro(p.custo_centavos)}`}
                </p>
                <div className="estoque-acoes">
                  {!p.arquivado_em && (
                    <>
                      <button
                        className="botao-primario"
                        onClick={() =>
                          abrir(p.saldo === null ? "produto" : "movimento", p)
                        }
                      >
                        {p.saldo === null ? "Ativar controle" : "Movimentar"}
                      </button>
                      <button
                        className="botao-secundario"
                        onClick={() => abrir("produto", p)}
                      >
                        Editar
                      </button>
                    </>
                  )}
                  <button
                    className="botao-secundario"
                    onClick={() => abrir("historico", p)}
                  >
                    Histórico
                  </button>
                  {p.saldo !== null && (
                    <button
                      className="botao-secundario"
                      onClick={() => abrir("arquivar", p)}
                    >
                      {p.arquivado_em ? "Restaurar" : "Arquivar"}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
        <div className="os-paginacao">
          <span>
            {consulta.data?.total ?? 0} peças · Página {pagina + 1}
          </span>
          <button disabled={!pagina} onClick={() => setPagina((p) => p - 1)}>
            Anterior
          </button>
          <button
            disabled={(pagina + 1) * 24 >= (consulta.data?.total ?? 0)}
            onClick={() => setPagina((p) => p + 1)}
          >
            Próxima
          </button>
        </div>
      </section>
      <Dialogo
        aberto={!!modal}
        fechar={() => !ocupado && setModal("")}
        titulo={
          modal === "produto"
            ? produto
              ? "Editar peça"
              : "Nova peça"
            : modal === "movimento"
              ? "Movimentar estoque"
              : modal === "historico"
                ? "Histórico de movimentações"
                : produto?.arquivado_em
                  ? "Restaurar peça?"
                  : "Arquivar peça?"
        }
        classe="dialogo-orcamento"
      >
        {produto && (
          <p>
            <strong>{produto.descricao}</strong> · Saldo:{" "}
            {numero(
              consulta.data?.itens.find((p) => p.id === produto.id)?.saldo ??
                produto.saldo,
            )}{" "}
            {produto.unidade}
          </p>
        )}
        {erro && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        {modal === "produto" && (
          <form className="formulario-cliente" onSubmit={salvar}>
            <fieldset disabled={ocupado}>
              <label>
                Nome da peça
                <input
                  name="descricao"
                  required
                  maxLength={300}
                  defaultValue={produto?.descricao}
                />
              </label>
              <div className="dupla-campos">
                <label>
                  Código / SKU
                  <input
                    name="codigo"
                    maxLength={80}
                    defaultValue={produto?.codigo ?? ""}
                  />
                </label>
                <label>
                  Unidade
                  <input
                    name="unidade"
                    required
                    maxLength={15}
                    defaultValue={produto?.unidade ?? "un"}
                    readOnly={produto?.saldo != null}
                  />
                </label>
                <label>
                  Preço de venda (R$)
                  <input
                    name="preco"
                    type="number"
                    required
                    min="0"
                    max="1000000"
                    step="0.01"
                    defaultValue={(produto?.preco_padrao_centavos ?? 0) / 100}
                  />
                </label>
                <label>
                  Custo de referência (R$)
                  <input
                    name="custo"
                    type="number"
                    required
                    min="0"
                    max="1000000"
                    step="0.01"
                    defaultValue={(produto?.custo_centavos ?? 0) / 100}
                  />
                </label>
                <label>
                  Estoque mínimo
                  <input
                    name="minimo"
                    type="number"
                    required
                    min="0"
                    max="1000000"
                    step="0.001"
                    defaultValue={produto?.minimo ?? 0}
                  />
                </label>
                <label>
                  Localização
                  <input
                    name="localizacao"
                    maxLength={200}
                    placeholder="Ex.: Prateleira A, caixa 3"
                    defaultValue={produto?.localizacao ?? ""}
                  />
                </label>
              </div>
              <label>
                Fornecedor de referência
                <input
                  name="fornecedor"
                  maxLength={200}
                  defaultValue={produto?.fornecedor ?? ""}
                />
              </label>
              <p className="texto-suave">
                O saldo muda somente por movimentação. Após cadastrar, registre
                uma entrada para informar as peças disponíveis.
              </p>
              <button className="botao-primario">
                {ocupado ? "Salvando…" : "Salvar peça"}
              </button>
            </fieldset>
          </form>
        )}
        {modal === "movimento" && produto && (
          <form
            className="formulario-cliente"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void executar(() =>
                movimentar(
                  a.demo,
                  oficina,
                  produto,
                  tipo,
                  Number(f.get("quantidade")),
                  String(f.get("motivo")),
                  String(f.get("documento")),
                  chave,
                ),
              );
            }}
          >
            <fieldset disabled={ocupado}>
              <label>
                Operação
                <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  <option value="entrada">Entrada de peças</option>
                  <option value="saida">Saída avulsa / perda</option>
                  <option value="ajuste">Contagem física</option>
                </select>
              </label>
              <label>
                {tipo === "ajuste"
                  ? "Quantidade total encontrada na prateleira"
                  : "Quantidade a movimentar"}
                <input
                  name="quantidade"
                  type="number"
                  min={tipo === "ajuste" ? 0 : 0.001}
                  max="1000000"
                  step="0.001"
                  required
                />
              </label>
              {tipo === "ajuste" && (
                <p className="aviso-cliente">
                  Informe o total contado. O sistema registra a diferença em
                  relação ao saldo atual.
                </p>
              )}
              <label>
                Motivo
                <textarea
                  name="motivo"
                  minLength={3}
                  maxLength={1000}
                  required
                  placeholder="Ex.: Compra para reposição"
                />
              </label>
              <label>
                Documento / nota / referência (opcional)
                <input name="documento" maxLength={200} />
              </label>
              <button className="botao-primario">
                {ocupado ? "Registrando…" : "Confirmar movimentação"}
              </button>
            </fieldset>
          </form>
        )}
        {modal === "arquivar" && produto && (
          <>
            <p>
              {produto.arquivado_em
                ? "A peça voltará a aparecer entre as ativas."
                : "O histórico será preservado. É preciso saldo zero e nenhuma OS aberta vinculada."}
            </p>
            <button
              className="botao-primario"
              disabled={ocupado}
              onClick={() =>
                void executar(() => arquivarProduto(a.demo, oficina, produto))
              }
            >
              Confirmar
            </button>
          </>
        )}
        {modal === "historico" && (
          <>
            <p className="texto-suave">
              Movimentos não são apagados. Um estorno registra a operação
              inversa, com motivo.
            </p>
            {historico.isPending ? (
              <p>Carregando histórico…</p>
            ) : historico.isError ? (
              <p role="alert">{erroPublico(historico.error)}</p>
            ) : !historico.data.length ? (
              <p>Nenhuma movimentação registrada.</p>
            ) : (
              <ol className="os-historico">
                {historico.data.map((m) => (
                  <li key={m.id}>
                    <time>{new Date(m.criado_em).toLocaleString("pt-BR")}</time>
                    <div className="os-linha">
                      <strong>{tiposMovimento[m.tipo]}</strong>
                      <strong className={m.quantidade < 0 ? "os-atrasada" : ""}>
                        {m.quantidade > 0 ? "+" : ""}
                        {numero(m.quantidade)} {produto?.unidade}
                      </strong>
                    </div>
                    <p>{m.motivo}</p>
                    {m.compra_id &&
                      a.permite("finance") &&
                      a.oficina!.perfil !== "staff" && (
                        <Link to={"/compras?compra=" + m.compra_id}>
                          Abrir compra integrada →
                        </Link>
                      )}
                    <p>
                      Saldo após: {numero(m.saldo_apos)} · Custo:{" "}
                      {dinheiro(m.custo_centavos)}
                      {m.documento && ` · Ref.: ${m.documento}`}
                    </p>
                    {m.ordem_servico_id && (
                      <Link to={`/ordens-servico?os=${m.ordem_servico_id}`}>
                        Abrir OS #{m.numero_os}
                      </Link>
                    )}
                    {m.estornado ? (
                      <p>Movimentação estornada</p>
                    ) : (
                      m.tipo !== "estorno" &&
                      !m.compra_id &&
                      ["owner", "manager"].includes(a.oficina!.perfil) && (
                        <button
                          className="botao-secundario"
                          onClick={() => setEstorno(m)}
                        >
                          {m.tipo === "consumo_os"
                            ? "Registrar devolução integral"
                            : "Estornar"}
                        </button>
                      )
                    )}
                  </li>
                ))}
              </ol>
            )}
            <div className="os-paginacao">
              <button
                disabled={!paginaHistorico}
                onClick={() => setPaginaHistorico((p) => p - 1)}
              >
                Anteriores
              </button>
              <span>Página {paginaHistorico + 1}</span>
              <button
                disabled={(historico.data?.length ?? 0) < 30}
                onClick={() => setPaginaHistorico((p) => p + 1)}
              >
                Próximas
              </button>
            </div>
          </>
        )}
      </Dialogo>
      <Dialogo
        aberto={!!estorno}
        fechar={() => !ocupado && setEstorno(null)}
        titulo="Confirmar estorno"
      >
        <p>
          Será registrada a movimentação inversa integral. Confira se as peças
          realmente voltaram ou saíram da prateleira.
        </p>
        {erro && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        <form
          className="formulario-cliente"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void executar(async () => {
              await estornarEstoque(
                a.demo,
                oficina,
                estorno!,
                String(f.get("motivo")),
              );
              setEstorno(null);
            }, false);
          }}
        >
          <fieldset disabled={ocupado}>
            <label>
              Motivo do estorno
              <textarea name="motivo" required minLength={3} maxLength={1000} />
            </label>
            <button className="botao-primario">Confirmar estorno</button>
          </fieldset>
        </form>
      </Dialogo>
    </>
  );
}
