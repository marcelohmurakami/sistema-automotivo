import { atualizarIntegracoes } from "../lib/atualizarIntegracoes";
import { useState, useRef, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Truck, ShoppingBag, Search } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { Dialogo } from "../components/Dialogo";
import { PagamentosIntegrados } from "../components/PagamentosIntegrados";
import { erroPublico } from "../lib/supabase";
import { dinheiro } from "../services/orcamentos";
import { normalizarTelefone } from "../services/clientes";
import { hoje, contas, formas } from "../services/financeiro";
import { listarEstoque } from "../services/estoque";
import {
  listarFornecedores,
  salvarFornecedor,
  arquivarFornecedor,
  novoFornecedor,
  listarCompras,
  consultarCompra,
  registrarCompra,
  cancelarCompra,
  type Fornecedor,
  type ItemCompra,
} from "../services/compras";
import "./Compras.css";
function FormFornecedor({
  valor,
  ocupado,
  salvar,
}: {
  valor: Fornecedor;
  ocupado: boolean;
  salvar: (f: Fornecedor) => void;
}) {
  return (
    <form
      className="formulario-cliente"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        salvar({
          ...valor,
          nome: String(f.get("nome")).trim(),
          documento: String(f.get("documento")).replace(/\D/g, ""),
          telefone: String(f.get("telefone")),
          email: String(f.get("email")).trim(),
          endereco: String(f.get("endereco")),
          observacoes: String(f.get("observacoes")),
        });
      }}
    >
      <fieldset disabled={ocupado}>
        <label>
          Nome do fornecedor
          <input
            name="nome"
            defaultValue={valor.nome}
            minLength={2}
            maxLength={160}
            required
            autoFocus
          />
        </label>
        <div className="dupla-campos">
          <label>
            CNPJ ou CPF
            <input
              name="documento"
              inputMode="numeric"
              defaultValue={valor.documento}
              maxLength={25}
            />
          </label>
          <label>
            Telefone / WhatsApp
            <input
              type="tel"
              name="telefone"
              defaultValue={valor.telefone}
              placeholder="(16) 99999-9999"
            />
          </label>
        </div>
        <label>
          E-mail
          <input
            type="email"
            name="email"
            defaultValue={valor.email}
            maxLength={254}
          />
        </label>
        <label>
          Endereço
          <input
            name="endereco"
            defaultValue={valor.endereco}
            maxLength={500}
          />
        </label>
        <label>
          Observações
          <textarea
            name="observacoes"
            defaultValue={valor.observacoes}
            maxLength={2000}
            placeholder="Contato comercial, prazo habitual, informações úteis…"
          />
        </label>
        <button className="botao-primario" disabled={ocupado}>
          {ocupado ? "Salvando…" : "Salvar fornecedor"}
        </button>
      </fieldset>
    </form>
  );
}
function Paginacao({
  pagina,
  total,
  mudar,
}: {
  pagina: number;
  total: number;
  mudar: (p: number) => void;
}) {
  return (
    <div className="compra-paginacao">
      <span>
        {total} registro(s) · Página {pagina + 1}
      </span>
      <button
        className="botao-secundario"
        disabled={!pagina}
        onClick={() => mudar(pagina - 1)}
      >
        Anterior
      </button>
      <button
        className="botao-secundario"
        disabled={(pagina + 1) * 30 >= total}
        onClick={() => mudar(pagina + 1)}
      >
        Próxima
      </button>
    </div>
  );
}
export function Fornecedores() {
  const a = useAcesso(),
    qc = useQueryClient(),
    oficina = a.oficina!.id;
  const [busca, setBusca] = useState(""),
    [arquivados, setArquivados] = useState(false),
    [pagina, setPagina] = useState(0),
    [form, setForm] = useState<Fornecedor | null>(null),
    [arquivo, setArquivo] = useState<Fornecedor | null>(null),
    [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState("");
  const trava = useRef(false);
  const q = useQuery({
    queryKey: ["fornecedores", a.demo, oficina, busca, arquivados, pagina],
    queryFn: () =>
      listarFornecedores(a.demo, oficina, busca, arquivados, pagina),
  });
  async function executar(fn: () => Promise<unknown>) {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["fornecedores"] });
      setForm(null);
      setArquivo(null);
      setAviso("Fornecedor atualizado.");
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      setOcupado(false);
      trava.current = false;
    }
  }
  return (
    <>
      <div className="titulo-pagina">
        <div>
          <div className="sobretitulo">
            <span className="linha-verde" />
            QUEM ABASTECE SUA OFICINA
          </div>
          <h1>
            Fornecedores<span>.</span>
          </h1>
          <p>
            Contatos e informações em um só lugar, prontos para a próxima
            compra.
          </p>
        </div>
        <button
          className="botao-primario"
          onClick={() => {
            setErro("");
            setForm(novoFornecedor());
          }}
        >
          <Plus size={18} />
          Novo fornecedor
        </button>
      </div>
      {a.demo && (
        <p className="aviso-cliente">
          Demonstração · Dados salvos neste navegador.
        </p>
      )}
      {aviso && (
        <p role="status" className="aviso-cliente">
          {aviso}
        </p>
      )}
      <section className="os-painel">
        <div className="compra-filtros">
          <label>
            <Search size={18} />
            <input
              aria-label="Buscar fornecedores"
              placeholder="Nome, CNPJ ou CPF"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina(0);
              }}
            />
          </label>
          <select
            aria-label="Situação dos fornecedores"
            value={arquivados ? "arquivados" : "ativos"}
            onChange={(e) => {
              setArquivados(e.target.value === "arquivados");
              setPagina(0);
            }}
          >
            <option value="ativos">Ativos</option>
            <option value="arquivados">Arquivados</option>
          </select>
          <Link to="/compras">Ver compras →</Link>
        </div>
        {q.isPending ? (
          <p>Carregando fornecedores…</p>
        ) : q.isError ? (
          <p role="alert">{erroPublico(q.error)}</p>
        ) : (
          <>
            {!q.data.itens.length && (
              <div className="compra-vazio">
                <Truck size={34} />
                <h3>
                  {busca
                    ? "Nenhum fornecedor encontrado"
                    : "Cadastre quem fornece suas peças"}
                </h3>
                <p>
                  Nome é obrigatório. Você pode completar os outros dados
                  depois.
                </p>
              </div>
            )}
            <div className="fornecedor-grade">
              {q.data.itens.map((f) => (
                <article className="fornecedor-card" key={f.id}>
                  <Truck size={22} />
                  <h3>{f.nome}</h3>
                  <p>{f.documento || "Documento não informado"}</p>
                  {f.telefone && <a href={"tel:" + f.telefone}>{f.telefone}</a>}
                  {f.email && <p>{f.email}</p>}
                  {f.endereco && <p>{f.endereco}</p>}
                  {f.observacoes && (
                    <p className="texto-suave">{f.observacoes}</p>
                  )}
                  <div className="compra-acoes">
                    {!f.arquivado_em && (
                      <button
                        className="botao-secundario"
                        onClick={() => {
                          setErro("");
                          setForm(f);
                        }}
                      >
                        Editar
                      </button>
                    )}
                    <button
                      className="botao-secundario"
                      onClick={() => {
                        setErro("");
                        setArquivo(f);
                      }}
                    >
                      {f.arquivado_em ? "Restaurar" : "Arquivar"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <Paginacao pagina={pagina} total={q.data.total} mudar={setPagina} />
          </>
        )}
      </section>
      <Dialogo
        aberto={!!form || !!arquivo}
        fechar={() => {
          if (!ocupado) {
            setForm(null);
            setArquivo(null);
          }
        }}
        titulo={
          arquivo
            ? arquivo.arquivado_em
              ? "Restaurar fornecedor"
              : "Arquivar fornecedor"
            : form?.revisao
              ? "Editar fornecedor"
              : "Novo fornecedor"
        }
      >
        {erro && (
          <p className="erro-formulario" role="alert">
            {erro}
          </p>
        )}
        {form && (
          <FormFornecedor
            key={form.id}
            valor={form}
            ocupado={ocupado}
            salvar={(f) =>
              void executar(() =>
                salvarFornecedor(a.demo, oficina, {
                  ...f,
                  telefone: normalizarTelefone(f.telefone),
                }),
              )
            }
          />
        )}{" "}
        {arquivo && (
          <>
            <p>
              {arquivo.nome}:{" "}
              {arquivo.arquivado_em
                ? "voltará a aparecer para novas compras."
                : "será ocultado de novas compras. O histórico das compras será preservado."}
            </p>
            <button
              className="botao-primario"
              disabled={ocupado}
              onClick={() =>
                void executar(() =>
                  arquivarFornecedor(a.demo, oficina, arquivo),
                )
              }
            >
              Confirmar
            </button>
          </>
        )}
      </Dialogo>
    </>
  );
}
export function Compras() {
  const a = useAcesso(),
    qc = useQueryClient(),
    oficina = a.oficina!.id,
    [params, setParams] = useSearchParams(),
    gerente = a.oficina!.perfil !== "staff" && a.permite("finance");
  const [busca, setBusca] = useState(""),
    [pagina, setPagina] = useState(0),
    [nova, setNova] = useState(false),
    [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [itens, setItens] = useState<ItemCompra[]>([]),
    [produto, setProduto] = useState(""),
    [buscaPeca, setBuscaPeca] = useState(""),
    [fornecedor, setFornecedor] = useState(""),
    [buscaFornecedor, setBuscaFornecedor] = useState(""),
    [rapido, setRapido] = useState<Fornecedor | null>(null),
    [pagamento, setPagamento] = useState("depois"),
    [cancelando, setCancelando] = useState(false),
    [chave, setChave] = useState(() => crypto.randomUUID());
  const trava = useRef(false),
    id = params.get("compra");
  const q = useQuery({
    queryKey: ["compras", a.demo, oficina, busca, pagina],
    queryFn: () => listarCompras(a.demo, oficina, busca, pagina),
    enabled: gerente,
    refetchInterval: 30000,
  });
  const detalhe = useQuery({
    queryKey: ["compra", a.demo, oficina, id],
    queryFn: () => consultarCompra(a.demo, oficina, id!),
    enabled: gerente && !!id,
    refetchInterval: 30000,
  });
  const fs = useQuery({
    queryKey: ["fornecedores", a.demo, oficina, "opcoes", buscaFornecedor],
    queryFn: () => listarFornecedores(a.demo, oficina, buscaFornecedor),
    enabled: nova && gerente,
  });
  const ps = useQuery({
    queryKey: ["estoque", a.demo, oficina, "compra", buscaPeca],
    queryFn: () => listarEstoque(a.demo, oficina, buscaPeca, "", 0),
    enabled: nova && gerente,
  });
  const total = itens.reduce(
    (s, i) => s + Math.round(i.quantidade * i.custo_centavos),
    0,
  );
  async function executar(fn: () => Promise<unknown>, fechar = true) {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      await fn();
      await atualizarIntegracoes(qc);
      if (fechar) {
        setNova(false);
        setCancelando(false);
      }
      setAviso("Registrado. Estoque e financeiro atualizados juntos.");
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      setOcupado(false);
      trava.current = false;
    }
  }
  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void executar(() =>
      registrarCompra(a.demo, oficina, {
        id: chave,
        fornecedor_id: fornecedor,
        documento: String(f.get("documento")).trim(),
        data: String(f.get("data")),
        vencimento: String(f.get("vencimento")),
        observacoes: String(f.get("observacoes")),
        itens,
        pago:
          pagamento === "depois"
            ? 0
            : pagamento === "total"
              ? total
              : Math.round(Number(f.get("pago")) * 100),
        conta: String(f.get("conta") || "banco"),
        forma: String(f.get("forma") || "pix"),
      }),
    );
  }
  if (!gerente)
    return (
      <section className="os-painel">
        <h1>Compras reservadas à gerência</h1>
        <p>
          O proprietário ou gerente pode registrar compras com acesso ao estoque
          e ao financeiro.
        </p>
        <Link to="/estoque">Voltar ao estoque</Link>
      </section>
    );
  return (
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
          <p>
            Registre uma vez. As peças entram no estoque e o valor vai para o
            financeiro.
          </p>
        </div>
        <button
          className="botao-primario"
          onClick={() => {
            setNova(true);
            setChave(crypto.randomUUID());
            setItens([]);
            setFornecedor("");
            setBuscaFornecedor("");
            setBuscaPeca("");
            setProduto("");
            setPagamento("depois");
            setErro("");
          }}
        >
          <Plus size={18} />
          Registrar compra
        </button>
      </div>
      {a.demo && (
        <p className="aviso-cliente">
          Demonstração · Dados salvos neste navegador.
        </p>
      )}
      {aviso && (
        <p role="status" className="aviso-cliente">
          {aviso}
        </p>
      )}
      <div className="compra-acoes compra-links">
        <Link to="/estoque">← Estoque</Link>
        <Link to="/fornecedores">Fornecedores</Link>
        <Link to="/financeiro">Financeiro →</Link>
      </div>
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
                <p>
                  Cadastre o fornecedor e registre as peças que chegaram à
                  oficina.
                </p>
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
                      {new Date(c.data + "T12:00:00").toLocaleDateString(
                        "pt-BR",
                      )}{" "}
                      ·{" "}
                      {c.documento
                        ? `Documento ${c.documento}`
                        : "Sem documento informado"}
                    </span>
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
              Use esta tela quando as peças chegarem. A confirmação dá entrada
              no estoque e gera a conta do fornecedor.
            </p>
            <label>
              Buscar fornecedor
              <input
                value={buscaFornecedor}
                onChange={(e) => setBuscaFornecedor(e.target.value)}
                placeholder="Nome ou documento"
              />
            </label>
            <label>
              Fornecedor
              <select
                value={fornecedor}
                onChange={(e) => setFornecedor(e.target.value)}
                required
              >
                <option value="">Selecione o fornecedor</option>
                {fs.data?.itens.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </label>
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
                <input
                  name="documento"
                  maxLength={100}
                  placeholder="Opcional"
                />
              </label>
            </div>
            <h3>Peças recebidas</h3>
            <label>
              Buscar peça no estoque
              <input
                value={buscaPeca}
                onChange={(e) => setBuscaPeca(e.target.value)}
                placeholder="Nome ou código"
              />
            </label>
            <div className="compra-acoes">
              <select
                aria-label="Peça para adicionar"
                value={produto}
                onChange={(e) => setProduto(e.target.value)}
              >
                <option value="">Selecione uma peça</option>
                {ps.data?.itens
                  .filter(
                    (p) =>
                      p.saldo !== null &&
                      !itens.some((i) => i.produto_id === p.id),
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.descricao} · {p.unidade}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                className="botao-secundario"
                disabled={!produto}
                onClick={() => {
                  const p = ps.data!.itens.find((p) => p.id === produto)!;
                  setItens([
                    ...itens,
                    {
                      produto_id: p.id,
                      descricao: p.descricao,
                      quantidade: 1,
                      custo_centavos: p.custo_centavos,
                    },
                  ]);
                  setProduto("");
                }}
              >
                Adicionar peça
              </button>
            </div>
            {ps.isError && <p role="alert">{erroPublico(ps.error)}</p>}
            <p className="texto-suave">
              Só aparecem peças com estoque controlado. Cadastre novas peças na
              tela de estoque.
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
                      min="0.001"
                      max="1000000"
                      step="0.001"
                      required
                      value={i.quantidade || ""}
                      onChange={(e) =>
                        setItens(
                          itens.map((x, n) =>
                            n === k
                              ? { ...x, quantidade: Number(e.target.value) }
                              : x,
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
            <h3>Como ficou o pagamento?</h3>
            <label>
              Situação do pagamento
              <select
                value={pagamento}
                onChange={(e) => setPagamento(e.target.value)}
              >
                <option value="depois">Vou pagar depois</option>
                <option value="parcial">Paguei uma parte</option>
                <option value="total">Paguei tudo</option>
              </select>
            </label>
            <label>
              {pagamento === "total"
                ? "Vencimento da conta"
                : "Vencimento combinado para pagar"}
              <input
                type="date"
                name="vencimento"
                defaultValue={hoje()}
                required
              />
            </label>
            {pagamento === "parcial" && (
              <label>
                Valor já pago (R$)
                <input
                  name="pago"
                  type="number"
                  min="0.01"
                  max={Math.max(0, total - 1) / 100}
                  step="0.01"
                  required
                />
              </label>
            )}
            {pagamento !== "depois" && (
              <>
                <p>O pagamento será registrado na data da compra.</p>
                <div className="dupla-campos">
                  <label>
                    Conta
                    <select name="conta" defaultValue="banco">
                      {Object.entries(contas).map(([v, n]) => (
                        <option value={v} key={v}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Forma
                    <select name="forma">
                      {Object.entries(formas).map(([v, n]) => (
                        <option value={v} key={v}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </>
            )}
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
                : "Confirmar compra e entrada das peças"}
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
              void executar(async () => {
                await salvarFornecedor(a.demo, oficina, {
                  ...f,
                  telefone: normalizarTelefone(f.telefone),
                });
                setBuscaFornecedor(f.nome);
                setFornecedor(f.id);
                await qc.invalidateQueries({ queryKey: ["fornecedores"] });
                setRapido(null);
              }, false)
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
                {new Date(detalhe.data.data + "T12:00:00").toLocaleDateString(
                  "pt-BR",
                )}
              </p>
              <p>{detalhe.data.observacoes}</p>
              {detalhe.data.itens.map((i) => (
                <div className="compra-item" key={i.produto_id}>
                  <strong>{i.descricao}</strong>
                  <p>
                    {i.quantidade} × {dinheiro(i.custo_centavos)} ={" "}
                    {dinheiro(
                      i.total_centavos ??
                        Math.round(i.quantidade * i.custo_centavos),
                    )}
                  </p>
                </div>
              ))}
              <PagamentosIntegrados titulo={detalhe.data.titulo} />
              {detalhe.data.cancelado_em ? (
                <p className="aviso-cliente">
                  Compra cancelada: {detalhe.data.motivo_cancelamento}
                </p>
              ) : (
                <button
                  className="botao-secundario"
                  onClick={() => setCancelando(!cancelando)}
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
                      cancelarCompra(
                        a.demo,
                        oficina,
                        id!,
                        String(f.get("motivo")),
                      ),
                    );
                  }}
                >
                  <p>
                    Os pagamentos precisam estar estornados e as peças não podem
                    ter alterações posteriores. O cancelamento reverte o estoque
                    e a conta juntos.
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
