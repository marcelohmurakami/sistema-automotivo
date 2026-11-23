import { FormFornecedor } from "../components/compras/FormFornecedor";
import { Paginacao } from "../components/compras/PaginacaoCompras";
import { useBuscaDebounced } from "../lib/useBuscaDebounced";
import { componenteSobDemanda } from "../lib/componenteSobDemanda";
const ImportarNfe = componenteSobDemanda(async () => ({
  default: (await import("../components/ImportarNfe")).ImportarNfe,
}));
const PagamentosIntegrados = componenteSobDemanda(async () => ({
  default: (await import("../components/PagamentosIntegrados")).PagamentosIntegrados,
}));
const PagamentoCompra = componenteSobDemanda(async () => ({
  default: (await import("../components/PagamentoCompra")).PagamentoCompra,
}));
import { novoId } from "../lib/uuid.ts";
import { EscolherDeposito } from "../components/suprimentos/Depositos";
import { passoProduto } from "../components/suprimentos/helpers";
import { dinheiro } from "../lib/formatacao";
import { vocabularioEstoque } from "../lib/interfaceRamo";

import { BuscaCompra } from "../components/BuscaCompra";
import { atualizarIntegracoes } from "../lib/atualizarIntegracoes";
import { useState, useRef, type FormEvent } from "react";
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, ShoppingBag, Search } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { Dialogo } from "../components/Dialogo";

import { erroPublico } from "../lib/supabase";

import { normalizarTelefone } from "../services/clientes";
import { hoje } from "../services/financeiro";

import { lerPagamentoCompra } from "../lib/pagamentoCompra";
import { listarEstoque } from "../services/estoque";
import {
  listarFornecedores,
  salvarFornecedor,
  novoFornecedor,
  listarCompras,
  consultarCompra,
  registrarCompra,
  cancelarCompra,
  type Fornecedor,
  type ItemCompra,
} from "../services/compras";
import "./Compras.css";
export function Compras({ integrada = false }: { integrada?: boolean }) {
  const a = useAcesso(),
    qc = useQueryClient(),
    oficina = a.oficina!.id,
    [params, setParams] = useSearchParams(),
    gerente = a.oficina!.perfil !== "staff" && a.permite("finance");
  const termos = vocabularioEstoque(a.oficina?.ramo);
  const [busca, setBusca] = useState(""),
    [pagina, setPagina] = useState(0),
    [nova, setNova] = useState(false),
    [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [itens, setItens] = useState<ItemCompra[]>([]),
    [buscaPeca, setBuscaPeca] = useState(""),
    [precisaSeries, setPrecisaSeries] = useState(false),
    [deposito, setDeposito] = useState<string | null>(null),
    [fornecedor, setFornecedor] = useState(""),
    [buscaFornecedor, setBuscaFornecedor] = useState(""),
    [rapido, setRapido] = useState<Fornecedor | null>(null),
    [cancelando, setCancelando] = useState(false),
    [chave, setChave] = useState(() => novoId());
  const trava = useRef(false),
    id = params.get("compra");
  const termoConsulta2 = useBuscaDebounced(busca);
  const q = useQuery({
    queryKey: ["compras", a.demo, oficina, termoConsulta2, pagina],
    queryFn: ({ signal }) =>
      listarCompras(a.demo, oficina, termoConsulta2, pagina, signal),
    enabled: gerente,
    refetchInterval: 30000,
  });
  const detalhe = useQuery({
    queryKey: ["compra", a.demo, oficina, id],
    queryFn: ({ signal }) => consultarCompra(a.demo, oficina, id!, signal),
    enabled: gerente && !!id,
    refetchInterval: 30000,
  });
  const termoConsulta3 = useBuscaDebounced(buscaFornecedor);
  const fs = useQuery({
    queryKey: ["fornecedores", a.demo, oficina, "opcoes", termoConsulta3],
    queryFn: ({ signal }) =>
      listarFornecedores(a.demo, oficina, termoConsulta3, false, 0, signal),
    enabled: nova && gerente,
  });
  const termoConsulta4 = useBuscaDebounced(buscaPeca);
  const ps = useQuery({
    queryKey: ["estoque", a.demo, oficina, "compra", termoConsulta4],
    queryFn: ({ signal }) =>
      listarEstoque(a.demo, oficina, termoConsulta4, "controlados", 0, signal),
    enabled: nova && gerente,
  });
  const total = itens.reduce(
    (s, i) => s + Math.round(i.quantidade * i.custo_centavos),
    0,
  );
  async function executar(
    fn: (confirmadas: QueryKey[]) => Promise<unknown>,
    fechar = true,
    atualizaCompra = true,
  ) {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      const confirmadas: QueryKey[] = [];
      await fn(confirmadas);
      if (atualizaCompra) {
        await qc.cancelQueries({ queryKey: ["compras", a.demo, oficina] });
        await atualizarIntegracoes(qc, ["compras", "compra"], confirmadas);
      }
      if (fechar) {
        setNova(false);
        setCancelando(false);
      }
      setAviso(
        atualizaCompra
          ? "Registrado. Estoque e financeiro atualizados juntos."
          : "Fornecedor cadastrado.",
      );
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      setOcupado(false);
      trava.current = false;
    }
  }
  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!fornecedor) {
      setErro("Selecione um fornecedor nos resultados da busca.");
      return;
    }
    const f = new FormData(e.currentTarget);
    void executar(async (confirmadas) => {
      await registrarCompra(a.demo, oficina, {
        deposito_id: deposito,
        id: chave,
        fornecedor_id: fornecedor,
        documento: String(f.get("documento")).trim(),
        data: String(f.get("data")),
        vencimento: hoje(),
        observacoes: String(f.get("observacoes")),
        itens,
        pago: 0,
        conta: "banco",
        forma: "pix",
        pagamento: lerPagamentoCompra(f, total),
      });
      // Abrir os detalhes já confirmados evita duas leituras concorrentes da compra.
      const queryKey = ["compra", a.demo, oficina, chave];
      await qc.fetchQuery({
        queryKey,
        queryFn: ({ signal }) => consultarCompra(a.demo, oficina, chave, signal),
        staleTime: 0,
      });
      confirmadas.push(queryKey);
      setNova(false);
      setParams({ compra: chave });
    });
  }
  if (!gerente)
    return (
      <section className="os-painel">
        <h1>Compras reservadas à gerência</h1>
        <p>
          O proprietário ou gerente pode registrar compras com acesso ao estoque e ao
          financeiro.
        </p>
        <Link to="/estoque">Voltar ao estoque</Link>
      </section>
    );
  return (
    <>
      {integrada ? (
        <div className="central-compras-recebidas-barra">
          <div>
            <h2>Compras recebidas</h2>
          </div>
          <button
            className="botao-primario"
            onClick={() => {
              if (trava.current) return;
              setNova(true);
              setChave(novoId());
              setItens([]);
              setFornecedor("");
              setBuscaFornecedor("");
              setBuscaPeca("");
              setErro("");
            }}
          >
            <Plus size={18} />
            Registrar compra
          </button>
          <ImportarNfe />
        </div>
      ) : (
        <>
          <div className="titulo-pagina">
            <div>
              <div className="sobretitulo">
                <span className="linha-verde" />
                PEÇAS RECEBIDAS, CONTAS ORGANIZADAS
              </div>
              <h1>
                Compras<span>.</span>
              </h1>
              <p>Itens no estoque e conta no financeiro.</p>
            </div>
            <button
              className="botao-primario"
              onClick={() => {
                if (trava.current) return;
                setNova(true);
                setChave(novoId());
                setItens([]);
                setFornecedor("");
                setBuscaFornecedor("");
                setBuscaPeca("");
                setErro("");
              }}
            >
              <Plus size={18} />
              Registrar compra
            </button>
          </div>
          <div className="agil-acoes" style={{ marginBottom: 16 }}>
            <ImportarNfe />
          </div>
        </>
      )}
      {a.demo && (
        <p className="aviso-cliente">Demonstração · Dados salvos neste navegador.</p>
      )}
      {aviso && (
        <p role="status" className="aviso-cliente">
          {aviso}
        </p>
      )}
      {!integrada && (
        <div className="compra-acoes compra-links">
          <Link to="/estoque">← Estoque</Link>
          <Link className="botao-secundario" to="/compras?aba=pedidos">
            Pedidos, cotações e reposição →
          </Link>
          <Link to="/fornecedores">Fornecedores</Link>
          <Link to="/financeiro">Financeiro →</Link>
        </div>
      )}
      <section className="os-painel">
        <div className="compra-filtros">
          <label>
            <Search size={18} />
            <input
              aria-label="Buscar compras"
              placeholder="Fornecedor ou número da nota"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina(0);
              }}
            />
          </label>
        </div>
        {q.isPending ? (
          <p>Carregando compras…</p>
        ) : q.isError ? (
          <p role="alert">{erroPublico(q.error)}</p>
        ) : (
          <>
            {!q.data.itens.length && (
              <div className="compra-vazio">
                <ShoppingBag size={34} />
                <h3>Nenhuma compra por aqui</h3>
                <p>Cadastre o fornecedor e registre os itens recebidos.</p>
              </div>
            )}
            <div className="compra-lista">
              {q.data.itens.map((c) => (
                <button
                  className="compra-registro"
                  key={c.id}
                  onClick={() => {
                    setErro("");
                    setCancelando(false);
                    setParams({ compra: c.id });
                  }}
                >
                  <div>
                    <strong>{c.nome_fornecedor}</strong>
                    <span>
                      {c.documento
                        ? `Documento ${c.documento}`
                        : "Sem documento informado"}
                    </span>
                  </div>
                  <div className="compra-data">
                    <span>Data da compra</span>
                    <strong>
                      {new Date(c.data + "T12:00:00").toLocaleDateString("pt-BR")}
                    </strong>
                  </div>
                  <div>
                    <strong>{dinheiro(c.total_centavos)}</strong>
                    <span>
                      {c.cancelado_em
                        ? "Cancelada"
                        : c.aberto_centavos === 0
                          ? "Quitada"
                          : c.baixado_centavos > 0
                            ? `Parcial · falta ${dinheiro(c.aberto_centavos)}`
                            : `A pagar · ${new Date(c.vencimento + "T12:00:00").toLocaleDateString("pt-BR")}`}
                    </span>
                  </div>
                  <span className="compra-abrir">Ver compra →</span>
                </button>
              ))}
            </div>
            <Paginacao pagina={pagina} total={q.data.total} mudar={setPagina} />
          </>
        )}
      </section>
      <Dialogo
        aberto={nova}
        fechar={() => !ocupado && setNova(false)}
        titulo="Registrar compra recebida"
        classe="dialogo-compra"
      >
        {erro && (
          <p className="erro-formulario" role="alert">
            {erro}
          </p>
        )}
        <form className="formulario-cliente" onSubmit={enviar}>
          <fieldset disabled={ocupado}>
            <p className="aviso-cliente">
              Confirme quando os itens chegarem: registra o estoque e a conta do
              fornecedor.
            </p>
            {!a.demo && (
              <EscolherDeposito
                rotulo="Receber em qual local de estoque?"
                valor={deposito}
                alterar={setDeposito}
              />
            )}
            <BuscaCompra
              rotulo="Fornecedor"
              valor={buscaFornecedor}
              alterar={(v) => {
                setBuscaFornecedor(v);
                setFornecedor("");
              }}
              obrigatorio
              carregando={fs.isFetching || buscaFornecedor !== termoConsulta3}
              opcoes={(fs.data?.itens ?? []).map((f) => ({
                id: f.id,
                nome: f.nome,
                detalhe: f.documento || f.telefone || undefined,
              }))}
              selecionar={(f) => {
                setFornecedor(f.id);
                setBuscaFornecedor(f.nome);
              }}
            />
            {fs.isError && <p role="alert">{erroPublico(fs.error)}</p>}
            <button
              type="button"
              className="botao-secundario"
              onClick={() => setRapido(novoFornecedor())}
            >
              + Cadastrar fornecedor rapidamente
            </button>
            <div className="dupla-campos">
              <label>
                Data da compra
                <input
                  name="data"
                  type="date"
                  defaultValue={hoje()}
                  max={hoje()}
                  required
                />
              </label>
              <label>
                Nota / documento
                <input name="documento" maxLength={100} placeholder="Opcional" />
              </label>
            </div>
            <h3>{termos.recebidos}</h3>
            <BuscaCompra
              rotulo={termos.itemEstoque}
              valor={buscaPeca}
              alterar={setBuscaPeca}
              carregando={ps.isFetching || buscaPeca !== termoConsulta4}
              opcoes={(ps.data?.itens ?? [])
                .filter(
                  (p) => p.saldo !== null && !itens.some((i) => i.produto_id === p.id),
                )
                .map((p) => ({
                  id: p.id,
                  nome: p.descricao,
                  detalhe: [
                    p.codigo || "Sem código",
                    "Saldo: " + p.saldo + " " + p.unidade,
                    "Custo: " + dinheiro(p.custo_centavos),
                  ].join(" · "),
                }))}
              selecionar={(o) => {
                const p = ps.data?.itens.find((p) => p.id === o.id);
                if (!p || p.saldo === null) return;
                setPrecisaSeries(!!p.rastreado);
                if (p.rastreado) return;
                setItens((atuais) =>
                  atuais.some((i) => i.produto_id === p.id)
                    ? atuais
                    : [
                        ...atuais,
                        {
                          produto_id: p.id,
                          descricao: p.descricao,
                          unidade: p.unidade,
                          quantidade: 1,
                          custo_centavos: p.custo_centavos,
                        },
                      ],
                );
                setBuscaPeca("");
              }}
            />
            {ps.isError && <p role="alert">{erroPublico(ps.error)}</p>}
            {precisaSeries && (
              <p className="aviso-cliente">
                Este produto é controlado por série ou IMEI.{" "}
                <Link to="/compras?aba=pedidos">
                  Abra um pedido para identificar as unidades ao receber →
                </Link>
              </p>
            )}
            <p className="texto-suave">
              Somente itens com estoque controlado. Novos itens são cadastrados no
              Estoque.
            </p>
            {itens.map((i, k) => (
              <article className="compra-item" key={i.produto_id}>
                <div className="os-linha">
                  <strong>{i.descricao}</strong>
                  <button
                    type="button"
                    className="botao-secundario"
                    aria-label={"Remover " + i.descricao}
                    onClick={() => setItens(itens.filter((_, n) => n !== k))}
                  >
                    Remover
                  </button>
                </div>
                <div className="dupla-campos">
                  <label>
                    Quantidade
                    <input
                      type="number"
                      min={passoProduto(i.unidade || "un")}
                      max="1000000"
                      step={passoProduto(i.unidade || "un")}
                      required
                      value={i.quantidade || ""}
                      onChange={(e) =>
                        setItens(
                          itens.map((x, n) =>
                            n === k ? { ...x, quantidade: Number(e.target.value) } : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Custo unitário (R$)
                    <input
                      type="number"
                      min="0"
                      max="1000000"
                      step="0.01"
                      required
                      defaultValue={(i.custo_centavos / 100).toFixed(2)}
                      onChange={(e) =>
                        setItens(
                          itens.map((x, n) =>
                            n === k
                              ? {
                                  ...x,
                                  custo_centavos: Math.round(
                                    Number(e.target.value) * 100,
                                  ),
                                }
                              : x,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
                <p>
                  Subtotal:{" "}
                  <strong>
                    {dinheiro(Math.round(i.quantidade * i.custo_centavos))}
                  </strong>
                </p>
              </article>
            ))}
            <div className="compra-total">
              <span>Total da compra</span>
              <strong>{dinheiro(total)}</strong>
            </div>
            <PagamentoCompra key={chave} total={total} />
            <label>
              Observações
              <textarea name="observacoes" maxLength={2000} />
            </label>
            <button
              className="botao-primario"
              disabled={ocupado || !itens.length || total <= 0}
            >
              {ocupado
                ? "Registrando…"
                : `Confirmar compra e entrada ${termos.dosItens}`}
            </button>
          </fieldset>
        </form>
      </Dialogo>
      <Dialogo
        aberto={!!rapido}
        fechar={() => !ocupado && setRapido(null)}
        titulo="Novo fornecedor"
      >
        {erro && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        {rapido && (
          <FormFornecedor
            key={rapido.id}
            valor={rapido}
            ocupado={ocupado}
            salvar={(f) =>
              void executar(
                async () => {
                  await salvarFornecedor(a.demo, oficina, {
                    ...f,
                    telefone: normalizarTelefone(f.telefone),
                  });
                  setBuscaFornecedor(f.nome);
                  setFornecedor(f.id);
                  await qc.invalidateQueries({ queryKey: ["fornecedores"] });
                  setRapido(null);
                },
                false,
                false,
              )
            }
          />
        )}
      </Dialogo>
      <Dialogo
        aberto={!!id}
        fechar={() => !ocupado && setParams({})}
        titulo="Detalhes da compra"
        classe="dialogo-compra"
      >
        {detalhe.isPending ? (
          <p>Carregando compra…</p>
        ) : detalhe.isError ? (
          <p role="alert">{erroPublico(detalhe.error)}</p>
        ) : (
          detalhe.data && (
            <>
              <h3>{detalhe.data.nome_fornecedor}</h3>
              <p>
                {detalhe.data.documento
                  ? `Documento: ${detalhe.data.documento}`
                  : "Documento não informado"}{" "}
                ·{" "}
                {new Date(detalhe.data.data + "T12:00:00").toLocaleDateString("pt-BR")}
              </p>
              <p>{detalhe.data.observacoes}</p>
              {detalhe.data.itens.map((i) => (
                <div className="compra-item" key={i.produto_id}>
                  <strong>{i.descricao}</strong>
                  <p>
                    {i.quantidade} × {dinheiro(i.custo_centavos)} ={" "}
                    {dinheiro(
                      i.total_centavos ?? Math.round(i.quantidade * i.custo_centavos),
                    )}
                  </p>
                </div>
              ))}
              {(detalhe.data.titulos || [detalhe.data.titulo]).map((t, i, lista) => (
                <PagamentosIntegrados
                  key={t.id}
                  titulo={t}
                  rotulo={
                    lista.length > 1 ? `Parcela ${i + 1} de ${lista.length}` : undefined
                  }
                />
              ))}
              {detalhe.data.cancelado_em ? (
                <p className="aviso-cliente">
                  Compra cancelada: {detalhe.data.motivo_cancelamento}
                </p>
              ) : (
                <button
                  className="botao-secundario"
                  disabled={ocupado || detalhe.isFetching}
                  onClick={() => {
                    if (trava.current) return;
                    setCancelando((valor) => !valor);
                  }}
                >
                  Cancelar esta compra
                </button>
              )}
              {cancelando && (
                <form
                  className="formulario-cliente"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void executar(() =>
                      cancelarCompra(a.demo, oficina, id!, String(f.get("motivo"))),
                    );
                  }}
                >
                  <p>
                    Os pagamentos precisam estar estornados e os itens não podem ter
                    alterações posteriores. O cancelamento reverte o estoque e a conta
                    juntos.
                  </p>
                  {erro && (
                    <p role="alert" className="erro-formulario">
                      {erro}
                    </p>
                  )}
                  <label>
                    Motivo
                    <input
                      name="motivo"
                      minLength={3}
                      maxLength={1000}
                      required
                      disabled={ocupado}
                    />
                  </label>
                  <button className="botao-primario" disabled={ocupado}>
                    Confirmar cancelamento da compra
                  </button>
                </form>
              )}
            </>
          )
        )}
      </Dialogo>
    </>
  );
}
