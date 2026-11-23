import { componenteSobDemanda } from "../lib/componenteSobDemanda";
const UnidadesProduto = componenteSobDemanda(async () => ({
  default: (await import("../components/suprimentos/Unidades")).UnidadesProduto,
}));
const ConsultaUnidades = componenteSobDemanda(async () => ({
  default: (await import("../components/suprimentos/Unidades")).ConsultaUnidades,
}));
const PlanejarEstoque = componenteSobDemanda(async () => ({
  default: (await import("../components/suprimentos/PlanejarEstoque")).PlanejarEstoque,
}));
const DepositosEstoque = componenteSobDemanda(async () => ({
  default: (await import("../components/suprimentos/Depositos")).DepositosEstoque,
}));
const EscolherDeposito = componenteSobDemanda(async () => ({
  default: (await import("../components/suprimentos/Depositos")).EscolherDeposito,
}));
const LerProduto = componenteSobDemanda(async () => ({
  default: (await import("../components/suprimentos/EtiquetasEstoque")).LerProduto,
}));
const ImprimirEtiquetasEstoque = componenteSobDemanda(async () => ({
  default: (await import("../components/suprimentos/EtiquetasEstoque"))
    .ImprimirEtiquetasEstoque,
}));
import { CustoMargemCadastro } from "../components/CustoMargemItem";
import { AtalhoLocalizacao } from "../components/AtalhoLocalizacao";

import { suprimentos } from "../services/suprimentos";
import { novoId } from "../lib/uuid.ts";
import { dinheiro } from "../lib/formatacao";
import { interfaceRamo, vocabularioEstoque } from "../lib/interfaceRamo";
import "./Compras.css";
import "./Estoque.css";
import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Package,
  Plus,
  Search,
  AlertTriangle,
  Pencil,
  History,
  Archive,
  RotateCcw,
  MoreHorizontal,
  Warehouse,
  Truck,
  ClipboardList,
  ScanLine,
} from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { Dialogo } from "../components/Dialogo";
import { erroPublico } from "../lib/supabase";

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
import { LinhaEstoque } from "../components/estoque/LinhaEstoque";
import { numeroEstoque as numero } from "../lib/formatoEstoque";
import { SecaoRecolhivel } from "../components/SecaoRecolhivel";
import { useBuscaDebounced } from "../lib/useBuscaDebounced";
import { atualizarConsultas } from "../lib/atualizarConsultas";
export function Estoque() {
  const a = useAcesso(),
    oficina = a.oficina!.id,
    qc = useQueryClient();
  const linguagem = interfaceRamo(a.oficina?.ramo);
  const termos = vocabularioEstoque(a.oficina?.ramo);
  const [busca, setBusca] = useState(""),
    [filtro, setFiltro] = useState(""),
    [pagina, setPagina] = useState(0);
  const [produto, setProduto] = useState<ProdutoEstoque | null>(null),
    [modal, setModal] = useState(""),
    [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [tipo, setTipo] = useState("entrada"),
    [chave, setChave] = useState(() => novoId()),
    [paginaHistorico, setPaginaHistorico] = useState(0),
    [estorno, setEstorno] = useState<MovimentoEstoque | null>(null);
  const [unidades, setUnidades] = useState<ProdutoEstoque | null>(null);
  const [unidadeLida, setUnidadeLida] = useState<string | undefined>();
  const [buscaUnidade, setBuscaUnidade] = useState(false);
  const [depositos, setDepositos] = useState(false),
    [deposito, setDeposito] = useState<string | null>(null);
  const [planejamento, setPlanejamento] = useState<ProdutoEstoque | null>(null);
  const buscaConsulta = useBuscaDebounced(busca);
  const trava = useRef(false);
  const consulta = useQuery({
    queryKey: ["estoque", a.demo, oficina, buscaConsulta, filtro, pagina],
    queryFn: ({ signal }) =>
      listarEstoque(a.demo, oficina, buscaConsulta, filtro, pagina, signal),
    refetchInterval: 30000,
  });
  const historico = useQuery({
    queryKey: ["estoque-historico", a.demo, oficina, produto?.id, paginaHistorico],
    queryFn: ({ signal }) =>
      historicoEstoque(a.demo, oficina, produto!.id, paginaHistorico, signal),
    enabled: modal === "historico" && !!produto,
    refetchInterval: 30000,
  });
  function abrir(m: string, p?: ProdutoEstoque) {
    setProduto(p ?? null);
    setModal(m);
    setErro("");
    setChave(novoId());
    setPaginaHistorico(0);
    setEstorno(null);
    setTipo("entrada");
    setDeposito(null);
  }
  async function executar(
    fn: () => Promise<unknown>,
    fechar = true,
    concluido?: () => void,
  ) {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      await fn();
      await atualizarConsultas(
        qc,
        [
          ["catalogo"],
          ["estoque"],
          ["estoque-historico"],
          ["suprimentos"],
          ["aux-orcamento"],
          ["auxiliares-orcamento"],
          ["os-detalhe"],
          ["selecao-operacao"],
        ],
        [["estoque"], ["estoque-historico"]],
      );
      if (fechar) setModal("");
      concluido?.();
      setAviso("Operação registrada com sucesso.");
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      setOcupado(false);
      trava.current = false;
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
        unidade: String(f.get("unidade") ?? "").trim() || produto?.unidade || "un",
        preco_padrao_centavos: Math.round(Number(f.get("preco")) * 100),
        custo_centavos: Math.round(Number(f.get("custo") || 0) * 100),
        minimo: Number(f.get("minimo") || 0),
        fornecedor: String(f.get("fornecedor")),
        localizacao: String(f.get("localizacao")),
        saldo: produto?.saldo ?? 0,
        arquivado_em: produto?.arquivado_em ?? null,
      }),
    );
  }
  return (
    <>
      <div className="titulo-pagina estoque-titulo">
        <div>
          <h1>
            Estoque<span>.</span>
          </h1>
          <p>Encontre um item, confira a quantidade e registre entradas ou saídas.</p>
        </div>
        <div className="estoque-titulo-acoes">
          <button className="botao-primario" onClick={() => abrir("produto")}>
            <Plus size={18} />
            {termos.novo}
          </button>
          <button className="botao-secundario" onClick={() => abrir("ferramentas")}>
            <MoreHorizontal size={18} /> Mais opções
          </button>
        </div>
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
      <div className="estoque-resumo" aria-label="Resumo do estoque">
        {(
          [
            [
              "controlados",
              termos.controlados,
              consulta.data?.resumo.produtos,
              Package,
            ],
            [
              "baixo",
              "Precisam de reposição",
              consulta.data?.resumo.baixos,
              AlertTriangle,
            ],
            ["zerado", "Estoque zerado", consulta.data?.resumo.zerados, Package],
          ] as const
        ).map(([valor, rotulo, total, Icone]) => (
          <button
            key={valor}
            type="button"
            aria-pressed={filtro === valor}
            onClick={() => {
              setFiltro(filtro === valor ? "" : valor);
              setPagina(0);
              setBusca("");
            }}
          >
            <span>
              <Icone size={18} aria-hidden />
              {rotulo}
            </span>
            <strong>{total ?? "—"}</strong>
          </button>
        ))}
        <div className="estoque-resumo-valor">
          <span>Custo total em estoque</span>
          <strong>
            {consulta.data ? dinheiro(consulta.data.resumo.valor_centavos) : "—"}
          </strong>
        </div>
      </div>
      <section className="os-painel painel-lista-estoque">
        <div className="estoque-filtros">
          <label className="estoque-busca">
            Buscar {termos.plural}
            <span className="estoque-busca-campo">
              <Search size={17} aria-hidden="true" />
              <input
                aria-label={`Buscar ${termos.plural}`}
                placeholder={`Nome ou código ${termos.doItem}`}
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setPagina(0);
                }}
              />
            </span>
          </label>
          <label>
            Exibir
            <select
              aria-label="Exibir"
              value={filtro}
              onChange={(e) => {
                setFiltro(e.target.value);
                setPagina(0);
              }}
            >
              <option value="">{termos.ativos}</option>
              <option value="controlados">Com saldo controlado</option>
              <option value="baixo">Estoque baixo</option>
              <option value="zerado">Estoque zerado</option>
              <option value="arquivados">{termos.arquivados}</option>
            </select>
          </label>
          {!a.demo && (
            <div className="estoque-leitor">
              <LerProduto
                selecionar={(p, c) => {
                  if (c.unidade_id) {
                    setUnidadeLida(c.unidade_id);
                    setUnidades(p);
                  } else {
                    setBusca(p.descricao);
                    setFiltro("");
                    setPagina(0);
                  }
                }}
              />
            </div>
          )}
        </div>
        {consulta.isPending ? (
          <p role="status">Carregando estoque…</p>
        ) : consulta.isError ? (
          <p role="alert">
            {erroPublico(consulta.error)}{" "}
            <button onClick={() => void consulta.refetch()}>Tentar novamente</button>
          </p>
        ) : !consulta.data.itens.length ? (
          <div className="estado-lista">
            <Package size={35} />
            <h2>{busca || filtro ? "Nenhum item encontrado" : termos.nenhum}</h2>
            <p>
              {busca || filtro
                ? "Tente outro nome, código ou filtro."
                : termos.cadastro}
            </p>
            {busca || filtro ? (
              <button
                className="botao-secundario"
                onClick={() => {
                  setBusca("");
                  setFiltro("");
                  setPagina(0);
                }}
              >
                Limpar filtros
              </button>
            ) : (
              <button className="botao-primario" onClick={() => abrir("produto")}>
                {termos.novo}
              </button>
            )}
          </div>
        ) : (
          <ul className="lista-estoque" aria-label={`${termos.plural} do estoque`}>
            {consulta.data.itens.map((p) => (
              <LinhaEstoque
                key={p.id}
                produto={p}
                opcoes={() => abrir("opcoes", p)}
                editar={() => abrir("produto", p)}
                movimentar={() =>
                  p.rastreado
                    ? setUnidades(p)
                    : abrir(p.saldo === null ? "produto" : "movimento", p)
                }
              />
            ))}
          </ul>
        )}
        <div className="os-paginacao">
          <span>
            {consulta.data?.total ?? 0} {termos.plural} · Página {pagina + 1}
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
        <details className="estoque-ajuda">
          <summary>Como funciona a quantidade disponível?</summary>
          <p>
            Disponível é a quantidade em estoque menos o que já está reservado para
            serviços. Consulte as opções do item para ver o saldo total, as reservas e o
            histórico.
          </p>
          <p>
            {linguagem.automotivo
              ? "As peças são baixadas ao entregar a OS."
              : linguagem.limpeza
                ? "Os produtos usados são baixados ao concluir a limpeza."
                : linguagem.manutencao
                  ? "Os materiais são baixados ao concluir o serviço."
                  : "As peças são baixadas ao concluir o reparo. A retirada pelo cliente não desconta o estoque novamente."}
          </p>
        </details>
      </section>
      <Dialogo
        aberto={!!modal}
        fechar={() => !ocupado && setModal("")}
        titulo={
          modal === "ferramentas"
            ? "Mais opções do estoque"
            : modal === "opcoes"
              ? "Detalhes do item"
              : modal === "produto"
                ? produto
                  ? `Editar ${termos.singular}`
                  : termos.novo
                : modal === "movimento"
                  ? "Movimentar estoque"
                  : modal === "historico"
                    ? "Histórico de movimentações"
                    : produto?.arquivado_em
                      ? `Restaurar ${termos.singular}?`
                      : `Arquivar ${termos.singular}?`
        }
        classe="dialogo-estoque"
      >
        {produto && modal !== "opcoes" && (
          <p>
            <strong>{produto.descricao}</strong> · Saldo:{" "}
            {numero(
              consulta.data?.itens.find((p) => p.id === produto.id)?.saldo ??
                produto.saldo,
            )}{" "}
            {produto.unidade}
          </p>
        )}
        {erro && !estorno && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        {modal === "ferramentas" && (
          <div className="estoque-opcoes">
            {a.permite("finance") && a.oficina!.perfil !== "staff" && (
              <>
                <Link className="botao-secundario" to="/compras">
                  <ClipboardList size={18} /> Compras
                </Link>
              </>
            )}
            <Link className="botao-secundario" to="/fornecedores">
              <Truck size={18} /> Fornecedores
            </Link>
            {!a.demo && (
              <>
                <button
                  className="botao-secundario"
                  onClick={() => {
                    setModal("");
                    setDepositos(true);
                  }}
                >
                  <Warehouse size={18} /> Locais de estoque e transferências
                </button>
                <button
                  className="botao-secundario"
                  onClick={() => {
                    setModal("");
                    setBuscaUnidade(true);
                  }}
                >
                  <ScanLine size={18} /> Buscar série / IMEI
                </button>
              </>
            )}
          </div>
        )}
        {modal === "opcoes" && produto && (
          <>
            <div className="estoque-item-resumo">
              <h3>{produto.descricao}</h3>
              <p>
                {produto.codigo || "Sem código"}
                {produto.localizacao && " · " + produto.localizacao}
              </p>
              <dl>
                <div>
                  <dt>Disponível</dt>
                  <dd>
                    {numero(produto.disponivel ?? produto.saldo)}
                    {produto.saldo !== null && " " + produto.unidade}
                  </dd>
                </div>
                <div>
                  <dt>Reservado</dt>
                  <dd>
                    {numero(produto.reservado ?? 0)} {produto.unidade}
                  </dd>
                </div>
                <div>
                  <dt>Total em estoque</dt>
                  <dd>{numero(produto.saldo)}</dd>
                </div>
                <div>
                  <dt>Estoque mínimo</dt>
                  <dd>{produto.saldo === null ? "—" : numero(produto.minimo)}</dd>
                </div>
                <div>
                  <dt>Preço de venda</dt>
                  <dd>{dinheiro(produto.preco_padrao_centavos)}</dd>
                </div>
                <div>
                  <dt>Custo por unidade</dt>
                  <dd>
                    {produto.custo_centavos == null
                      ? "Não informado"
                      : dinheiro(produto.custo_centavos)}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="estoque-opcoes">
              {!produto.arquivado_em && (
                <button
                  className="botao-secundario"
                  onClick={() => abrir("produto", produto)}
                >
                  <Pencil size={18} /> Editar cadastro
                </button>
              )}
              <button
                className="botao-secundario"
                onClick={() => abrir("historico", produto)}
              >
                <History size={18} /> Histórico de movimentações
              </button>
              {!a.demo && produto.saldo !== null && (
                <ImprimirEtiquetasEstoque
                  produto={produto.id}
                  descricao={produto.descricao}
                />
              )}
              {produto.saldo !== null && (
                <AtalhoLocalizacao tipo="estoque" id={produto.id} />
              )}
              {!a.demo && produto.saldo !== null && !produto.arquivado_em && (
                <button
                  className="botao-secundario"
                  onClick={() => {
                    setModal("");
                    setPlanejamento(produto);
                  }}
                >
                  <ClipboardList size={18} /> Planejar reposição
                </button>
              )}
              {!a.demo && produto.rastreado && (
                <button
                  className="botao-secundario"
                  onClick={() => {
                    setModal("");
                    setUnidades(produto);
                  }}
                >
                  <ScanLine size={18} /> Séries / IMEI
                </button>
              )}
              {produto.saldo !== null && (
                <button
                  className="botao-secundario"
                  onClick={() => abrir("arquivar", produto)}
                >
                  {produto.arquivado_em ? (
                    <RotateCcw size={18} />
                  ) : (
                    <Archive size={18} />
                  )}
                  {produto.arquivado_em ? "Restaurar item" : "Arquivar item"}
                </button>
              )}
            </div>
          </>
        )}
        {modal === "produto" && (
          <form className="formulario-cliente" onSubmit={salvar}>
            <p className="texto-suave">Só nome e preço de venda são obrigatórios.</p>
            <fieldset disabled={ocupado}>
              <label>
                Nome {termos.doItem}
                <input
                  name="descricao"
                  autoFocus
                  required
                  maxLength={300}
                  defaultValue={produto?.descricao}
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
                  defaultValue={produto ? produto.preco_padrao_centavos / 100 : ""}
                />
              </label>
              <p className="texto-suave">
                Depois de salvar, use Movimentar para informar a quantidade inicial.
              </p>
              <SecaoRecolhivel titulo="Código, unidade e reposição (opcional)">
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
                      maxLength={15}
                      defaultValue={produto?.unidade ?? "un"}
                      readOnly={produto?.saldo != null}
                    />
                  </label>

                  <label>
                    Estoque mínimo
                    <input
                      name="minimo"
                      type="number"
                      min="0"
                      max="1000000"
                      step="0.001"
                      placeholder="Opcional"
                      defaultValue={produto?.minimo ?? ""}
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
              </SecaoRecolhivel>
              <CustoMargemCadastro
                custoInicial={produto?.custo_centavos}
                precoInicial={produto?.preco_padrao_centavos || 0}
                estoque
              />
              <button className="botao-primario">
                {ocupado ? "Salvando…" : `Salvar ${termos.singular}`}
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
                a.demo
                  ? movimentar(
                      a.demo,
                      oficina,
                      produto,
                      tipo,
                      Number(f.get("quantidade")),
                      String(f.get("motivo")),
                      String(f.get("documento")),
                      chave,
                    )
                  : suprimentos.executar(oficina, "movimentar_estoque_deposito", {
                      p_produto: produto.id,
                      p_deposito: deposito,
                      p_chave: chave,
                      p_revisao: produto.revisao,
                      p_tipo: tipo,
                      p_quantidade: Number(f.get("quantidade")),
                      p_motivo: String(f.get("motivo")),
                      p_documento: String(f.get("documento")),
                    }),
              );
            }}
          >
            <fieldset disabled={ocupado}>
              <div className="estoque-operacoes" role="group" aria-label="Operação">
                {[
                  ["entrada", "Adicionar"],
                  ["saida", "Retirar"],
                  ["ajuste", "Conferir quantidade"],
                ].map(([valor, texto]) => (
                  <button
                    type="button"
                    key={valor}
                    aria-pressed={tipo === valor}
                    onClick={() => setTipo(valor)}
                  >
                    {texto}
                  </button>
                ))}
              </div>
              {!a.demo && (
                <EscolherDeposito
                  valor={deposito}
                  alterar={setDeposito}
                  produto={produto.id}
                  rotulo="Onde o estoque será alterado"
                />
              )}
              <label>
                {tipo === "ajuste"
                  ? "Quantidade total contada neste local"
                  : tipo === "entrada"
                    ? "Quantidade a adicionar"
                    : "Quantidade a retirar"}
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
                  Informe o total contado. O sistema registra a diferença em relação ao
                  saldo atual.
                </p>
              )}
              <label>
                Por que o estoque mudou?
                <textarea
                  name="motivo"
                  minLength={3}
                  maxLength={1000}
                  required
                  placeholder={
                    tipo === "entrada"
                      ? "Ex.: reposição recebida"
                      : tipo === "saida"
                        ? "Ex.: perda por avaria"
                        : "Ex.: conferência da prateleira"
                  }
                />
              </label>
              <SecaoRecolhivel titulo="Documento de referência (opcional)">
                <label>
                  Nota ou referência
                  <input name="documento" maxLength={200} />
                </label>
              </SecaoRecolhivel>
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
                ? termos.restaurado
                : "O histórico será preservado. É preciso saldo zero e nenhum atendimento aberto vinculado."}
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
              Movimentos não são apagados. Um estorno registra a operação inversa, com
              motivo.
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
                      <strong>
                        {m.atendimento_id && m.tipo === "consumo_os"
                          ? linguagem.assistencia
                            ? "Consumo no reparo"
                            : "Consumo no atendimento"
                          : tiposMovimento[m.tipo]}
                      </strong>
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
                    {m.atendimento_id && (
                      <Link to={`/atendimentos?atendimento=${m.atendimento_id}`}>
                        Abrir {linguagem.ordem.toLowerCase()}
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
          Será registrada a movimentação inversa integral. Confira se os itens realmente
          voltaram ou saíram da prateleira.
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
            void executar(
              () => estornarEstoque(a.demo, oficina, estorno!, String(f.get("motivo"))),
              false,
              () => setEstorno(null),
            );
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
      {unidades && (
        <UnidadesProduto
          produto={unidades}
          unidadeInicial={unidadeLida}
          fechar={() => {
            setUnidades(null);
            setUnidadeLida(undefined);
          }}
        />
      )}
      {buscaUnidade && <ConsultaUnidades fechar={() => setBuscaUnidade(false)} />}
      {depositos && <DepositosEstoque fechar={() => setDepositos(false)} />}
      {planejamento && (
        <PlanejarEstoque produto={planejamento} fechar={() => setPlanejamento(null)} />
      )}
    </>
  );
}
