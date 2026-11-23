import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAcesso } from "../../auth/contexto";
import { useBuscaDebounced } from "../../lib/useBuscaDebounced";
import { dinheiro } from "../../lib/formatacao";
import { erroPublico } from "../../lib/supabase";
import { novoId } from "../../lib/uuid";
import { hoje } from "../../services/financeiro";
import { motivosQualidade } from "../../services/qualidade";
import {
  buscarDespesasCusteio,
  desvincularCusto,
  categoriasCusto,
  listarCusteio,
  consultarCusteio,
  conferirCusteio,
  registrarCusto,
  type CusteioServico,
  type RevisaoCusto,
  type FonteCusto,
} from "../../services/custeio";
import { Dialogo } from "../Dialogo";
function descricaoFonte(fonte: FonteCusto) {
  return fonte.categoria === "garantia"
    ? motivosQualidade[fonte.descricao as keyof typeof motivosQualidade] ||
        fonte.descricao
    : fonte.descricao;
}
export function CustosServicos({
  inicio,
  fim,
  abrirParametros,
}: {
  inicio: string;
  fim: string;
  abrirParametros: (mes?: string) => void;
}) {
  const a = useAcesso(),
    [busca, setBusca] = useState(""),
    [pagina, setPagina] = useState(0),
    [id, setId] = useState<string | null>(null);
  const termo = useBuscaDebounced(busca);
  const q = useQuery({
    queryKey: ["custeio", a.oficina!.id, inicio, fim, termo, pagina],
    queryFn: ({ signal }) =>
      listarCusteio(a.oficina!.id, inicio, fim, termo, pagina, signal),
    enabled: !a.demo,
  });
  return (
    <section className="plano-op fin-ampliado">
      <header className="plano-cabecalho">
        <div>
          <h2>Custos e margem por serviço</h2>
          <p>Confira o que o serviço consumiu antes de confiar na margem.</p>
        </div>
        <button className="botao-secundario" onClick={() => abrirParametros()}>
          Configurar hora e rateio
        </button>
      </header>
      <label>
        Buscar serviço ou cliente
        <input
          type="search"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setPagina(0);
          }}
          placeholder="Nome do cliente ou número da OS"
        />
      </label>
      {a.demo ? (
        <p className="aviso-cliente">
          Esta conferência usa as OS da empresa conectada. Na demonstração, você pode
          experimentar a formação de preço e as contas bancárias.
        </p>
      ) : q.isPending ? (
        <p role="status">Consultando custos…</p>
      ) : q.isError ? (
        <p role="alert">{erroPublico(q.error)}</p>
      ) : (
        <>
          <div className="plano-lista">
            {q.data.itens.map((d) => (
              <button className="custo-linha" key={d.id} onClick={() => setId(d.id)}>
                <span>
                  <strong>{d.titulo}</strong>
                  <small>
                    {d.cliente} · {d.data.split("-").reverse().join("/")}
                  </small>
                </span>
                <span>
                  <small>Venda</small>
                  {dinheiro(d.receita)}
                </span>
                <span>
                  <small>Custo com apropriações</small>
                  {dinheiro(d.custo)}
                </span>
                <span data-negativo={d.margem < 0}>
                  <small>Margem estimada</small>
                  <strong>{dinheiro(d.margem)}</strong>
                  {d.receita > 0 && (
                    <small>
                      {((d.margem / d.receita) * 100).toLocaleString("pt-BR", {
                        maximumFractionDigits: 1,
                      })}
                      %
                    </small>
                  )}
                </span>
                <span className={d.conferido ? "custo-conferido" : "custo-pendente"}>
                  {d.conferido ? "Conferido" : "Conferir custos"}
                </span>
              </button>
            ))}
          </div>
          {q.data.total === 0 && (
            <p>
              Nenhum serviço neste período. Orçamentos ainda não aprovados não entram
              nesta lista.
            </p>
          )}
          <div className="plano-acoes">
            <button
              className="botao-secundario"
              disabled={pagina === 0}
              onClick={() => setPagina(pagina - 1)}
            >
              Anterior
            </button>
            <span>
              {q.data.total} serviços · página {pagina + 1}
            </span>
            <button
              className="botao-secundario"
              disabled={(pagina + 1) * 30 >= q.data.total}
              onClick={() => setPagina(pagina + 1)}
            >
              Próxima
            </button>
          </div>
        </>
      )}
      {id && (
        <DetalheCusto
          key={id}
          id={id}
          fechar={() => setId(null)}
          abrirParametros={abrirParametros}
        />
      )}
    </section>
  );
}
export function DetalheCusto({
  id,
  fechar,
  abrirParametros,
}: {
  id: string;
  fechar: () => void;
  abrirParametros: (mes?: string) => void;
}) {
  const operacaoRef = useRef(false);
  const a = useAcesso(),
    q = useQuery({
      queryKey: ["custeio-detalhe", a.oficina!.id, id],
      queryFn: ({ signal }) => consultarCusteio(a.oficina!.id, id, signal),
      refetchOnWindowFocus: false,
    });
  return (
    <Dialogo
      aberto
      titulo={q.data?.titulo || "Conferir custos"}
      fechar={() => {
        if (!operacaoRef.current) fechar();
      }}
    >
      {q.isPending ? (
        <p>Consultando fontes de custo…</p>
      ) : q.isError && !q.data ? (
        <p role="alert">{erroPublico(q.error)}</p>
      ) : (
        <>
          {q.isError && (
            <div>
              <p role="alert">{erroPublico(q.error)} Seus campos foram preservados.</p>
              <button
                type="button"
                className="botao-secundario"
                disabled={q.isFetching}
                onClick={() => {
                  if (!operacaoRef.current) void q.refetch();
                }}
              >
                Tentar novamente
              </button>
            </div>
          )}
          <EditorCusto
            key={q.data!.assinatura + ":" + q.data!.conferencia?.revisao}
            doc={q.data!}
            operacaoRef={operacaoRef}
            abrirParametros={() => {
              if (operacaoRef.current) return;
              fechar();
              abrirParametros(q.data!.data.slice(0, 7));
            }}
          />
        </>
      )}
    </Dialogo>
  );
}
function EditorCusto({
  doc,
  abrirParametros,
  operacaoRef,
}: {
  doc: CusteioServico;
  abrirParametros: (mes?: string) => void;
  operacaoRef: { current: boolean };
}) {
  const a = useAcesso(),
    qc = useQueryClient(),
    [revisao, setRevisao] = useState<RevisaoCusto>(
      doc.conferencia?.dados
        ? {
            ...doc.conferencia.dados,
            desconsideradas: Object.fromEntries(
              Object.entries(doc.conferencia.dados.desconsideradas || {}).filter(
                ([k]) => doc.fontes.some((f) => f.chave === k),
              ),
            ),
          }
        : {
            minutos: doc.minutos,
            categorias: {},
            desconsideradas: {},
          },
    ),
    [novo, setNovo] = useState(false),
    [fonte, setFonte] = useState<FonteCusto | null>(null),
    [desvincular, setDesvincular] = useState<string | null>(null),
    [erro, setErro] = useState(""),
    [busy, setBusy] = useState(false),
    [aviso, setAviso] = useState("");
  const travaRef = operacaoRef;
  async function desfazer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (travaRef.current) return;
    travaRef.current = true;
    setBusy(true);
    setErro("");
    const f = new FormData(e.currentTarget);
    try {
      await desvincularCusto(a.oficina!.id, desvincular!, String(f.get("motivo")));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["custeio"] }),
        qc.invalidateQueries({ queryKey: ["custeio-detalhe"] }),
        qc.invalidateQueries({ queryKey: ["lucro-documento"] }),
        qc.invalidateQueries({ queryKey: ["lucro-cliente"] }),
        qc.invalidateQueries({ queryKey: ["apuracao"] }),
        qc.invalidateQueries({ queryKey: ["despesas-custeio"] }),
      ]);
      setDesvincular(null);
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      travaRef.current = false;
      setBusy(false);
    }
  }
  async function conferir(e: FormEvent) {
    e.preventDefault();
    if (travaRef.current) return;
    travaRef.current = true;
    setBusy(true);
    setErro("");
    try {
      await conferirCusteio(a.oficina!.id, doc, revisao);
      setAviso("Conferência salva. Novas alterações nos valores reabrem a revisão.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["custeio"] }),
        qc.invalidateQueries({ queryKey: ["custeio-detalhe"] }),
        qc.invalidateQueries({ queryKey: ["lucro-documento"] }),
        qc.invalidateQueries({ queryKey: ["lucro-cliente"] }),
        qc.invalidateQueries({ queryKey: ["apuracao"] }),
      ]);
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      travaRef.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="plano-op fin-ampliado">
      <p>
        <strong>{doc.cliente}</strong> · Margem após custos e apropriações:{" "}
        <strong>{dinheiro(doc.margem)}</strong>
      </p>
      {!doc.parametros && (
        <p className="aviso-cliente">
          Falta configurar a hora produtiva e o rateio do mês do serviço.{" "}
          <button className="botao-secundario" onClick={() => abrirParametros()}>
            Configurar
          </button>
        </p>
      )}
      <div className="plano-acoes">
        <button
          className="botao-primario"
          disabled={busy}
          onClick={() => {
            setFonte(null);
            setNovo(true);
          }}
        >
          Adicionar custo que faltou
        </button>
        <Link
          className="botao-secundario"
          to={
            doc.automotivo ? `/ordens-servico?os=${doc.id}` : `/?atendimento=${doc.id}`
          }
        >
          Abrir serviço
        </Link>
      </div>
      <form onSubmit={conferir} className="plano-op fin-ampliado">
        <fieldset disabled={busy}>
          <h3>De onde vieram os custos</h3>
          <p>
            Valores do estoque, financeiro, equipe e retrabalhos. Se um valor já estiver
            contado em outra linha, indique abaixo para não duplicar.
          </p>
          <div className="plano-lista">
            {doc.fontes.map((f) => (
              <div className="plano-card" key={f.chave}>
                <div className="plano-cabecalho">
                  <strong>{descricaoFonte(f)}</strong>
                  <b>{f.valor === null ? "Sem custo calculado" : dinheiro(f.valor)}</b>
                </div>
                <small>
                  {categoriasCusto[f.categoria]} ·{" "}
                  {f.financeiro
                    ? "Já registrado no financeiro"
                    : "Registro operacional / apropriação"}
                  {f.pendente ? " · Precisa conferir o custo" : ""}
                </small>
                {f.chave.startsWith("apropriacao:") && (
                  <button
                    type="button"
                    className="botao-secundario"
                    onClick={() => setDesvincular(f.chave.slice(12))}
                  >
                    Desvincular deste serviço
                  </button>
                )}
                {!f.financeiro &&
                  !f.pendente &&
                  (f.valor || 0) > 0 &&
                  !/^(estoque|hora):/.test(f.chave) && (
                    <button
                      type="button"
                      className="botao-secundario"
                      onClick={() => {
                        setFonte(f);
                        setNovo(true);
                      }}
                    >
                      Vincular ao financeiro sem duplicar
                    </button>
                  )}
                <label>
                  Como considerar esta linha?
                  <select
                    value={revisao.desconsideradas[f.chave] || ""}
                    onChange={(e) => {
                      const desconsideradas = { ...revisao.desconsideradas };
                      if (e.target.value) desconsideradas[f.chave] = e.target.value;
                      else delete desconsideradas[f.chave];
                      setRevisao({ ...revisao, desconsideradas });
                    }}
                  >
                    <option value="">Incluir no custo</option>
                    <option value="Já incluído em outra fonte acima">
                      Já incluído em outra fonte acima
                    </option>
                    <option value="Não gera custo adicional para a empresa">
                      Não gera custo adicional para a empresa
                    </option>
                    <option value="Custo suportado pelo cliente ou fornecedor">
                      Custo suportado pelo cliente ou fornecedor
                    </option>
                    {revisao.desconsideradas[f.chave] &&
                      ![
                        "Já incluído em outra fonte acima",
                        "Não gera custo adicional para a empresa",
                        "Custo suportado pelo cliente ou fornecedor",
                      ].includes(revisao.desconsideradas[f.chave]) && (
                        <option>{revisao.desconsideradas[f.chave]}</option>
                      )}
                  </select>
                </label>
              </div>
            ))}
          </div>
          {doc.fontes.length === 0 && (
            <p>
              Nenhuma fonte de custo registrada. Adicione os gastos ou justifique as
              categorias abaixo.
            </p>
          )}
          <label>
            Tempo produtivo do serviço (minutos)
            <input
              type="number"
              min={0}
              max={1000000}
              step="0.1"
              required
              value={Number.isFinite(revisao.minutos) ? revisao.minutos : ""}
              onChange={(e) =>
                setRevisao({ ...revisao, minutos: e.target.valueAsNumber })
              }
            />
            <small>
              Os apontamentos encerrados da equipe têm prioridade. Este tempo
              complementa serviços sem apontamentos.
            </small>
          </label>
          <div className="custo-resumo">
            <span>
              Mão de obra apropriada <b>{dinheiro(doc.mao_obra_apropriada)}</b>
            </span>
            <span>
              Despesas indiretas apropriadas <b>{dinheiro(doc.indiretos)}</b>
            </span>
          </div>
          <small>
            Apropriações distribuem custos para analisar a margem. Elas não criam outra
            despesa nem movimentam o caixa.
          </small>
          <h3>Conferência final</h3>
          <div className="plano-campos">
            {Object.entries(categoriasCusto).map(([k, n]) => (
              <label key={k}>
                {n}
                <select
                  required
                  value={revisao.categorias[k] || ""}
                  onChange={(e) =>
                    setRevisao({
                      ...revisao,
                      categorias: { ...revisao.categorias, [k]: e.target.value },
                    })
                  }
                >
                  <option value="">Escolha a situação</option>
                  <option value="Custos registrados e conferidos">
                    Custos registrados e conferidos
                  </option>
                  <option value="Não houve custo nesta categoria">
                    Não houve custo nesta categoria
                  </option>
                  <option value="Coberto pela hora ou pelo rateio configurado">
                    Coberto pela hora ou pelo rateio
                  </option>
                  {revisao.categorias[k] &&
                    ![
                      "Custos registrados e conferidos",
                      "Não houve custo nesta categoria",
                      "Coberto pela hora ou pelo rateio configurado",
                    ].includes(revisao.categorias[k]) && (
                      <option>{revisao.categorias[k]}</option>
                    )}
                </select>
              </label>
            ))}
          </div>
          <button className="botao-primario" disabled={!doc.parametros}>
            {busy ? "Salvando…" : "Confirmar custos conferidos"}
          </button>
          {erro && <p role="alert">{erro}</p>}
          {aviso && <p role="status">{aviso}</p>}
        </fieldset>
      </form>
      {novo && (
        <NovoCusto
          doc={doc}
          fonte={fonte}
          operacaoRef={operacaoRef}
          fechar={() => setNovo(false)}
        />
      )}
      <Dialogo
        aberto={!!desvincular}
        titulo="Desvincular custo"
        fechar={() => !busy && setDesvincular(null)}
      >
        <form onSubmit={desfazer} className="formulario-cliente">
          <fieldset disabled={busy}>
            <p>
              A despesa continuará no financeiro. Somente sua atribuição a este serviço
              será desfeita, preservando o histórico.
            </p>
            <label>
              Motivo
              <input name="motivo" required minLength={3} maxLength={1000} />
            </label>
            <button className="botao-primario">Confirmar desvinculação</button>
            {erro && <p role="alert">{erro}</p>}
          </fieldset>
        </form>
      </Dialogo>
    </div>
  );
}
function NovoCusto({
  doc,
  fonte,
  fechar,
  operacaoRef,
}: {
  doc: CusteioServico;
  fonte: FonteCusto | null;
  fechar: () => void;
  operacaoRef: { current: boolean };
}) {
  const a = useAcesso(),
    qc = useQueryClient(),
    [origem, setOrigem] = useState("novo"),
    [busca, setBusca] = useState(""),
    [titulo, setTitulo] = useState(""),
    [busy, setBusy] = useState(false),
    [erro, setErro] = useState("");
  const chave = useRef(novoId()),
    travaRef = operacaoRef,
    termo = useBuscaDebounced(busca);
  const q = useQuery({
    queryKey: ["despesas-custeio", a.oficina!.id, termo],
    queryFn: ({ signal }) => buscarDespesasCusteio(a.oficina!.id, termo, signal),
    enabled: origem === "existente",
  });
  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (travaRef.current) return;
    travaRef.current = true;
    setBusy(true);
    setErro("");
    const f = new FormData(e.currentTarget);
    try {
      await registrarCusto(a.oficina!.id, doc.id, chave.current, {
        categoria: String(f.get("categoria")),
        descricao: String(f.get("descricao") || "Custo já registrado"),
        valor: Math.round(Number(f.get("valor")) * 100),
        data: String(f.get("data") || doc.data),
        vencimento: String(f.get("vencimento") || hoje()),
        ...(origem === "existente" ? { titulo_id: titulo } : {}),
        ...(fonte ? { fonte_origem: fonte.chave } : {}),
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["custeio"] }),
        qc.invalidateQueries({ queryKey: ["custeio-detalhe"] }),
        qc.invalidateQueries({ queryKey: ["lucro-documento"] }),
        qc.invalidateQueries({ queryKey: ["lucro-cliente"] }),
        qc.invalidateQueries({ queryKey: ["apuracao"] }),
        qc.invalidateQueries({ queryKey: ["financeiro"] }),
      ]);
      fechar();
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      travaRef.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialogo
      aberto
      titulo="Adicionar custo do serviço"
      fechar={() => !busy && fechar()}
    >
      <form className="formulario-cliente" onSubmit={salvar}>
        <fieldset disabled={busy}>
          <label>
            Este gasto já está no financeiro?
            <select value={origem} onChange={(e) => setOrigem(e.target.value)}>
              <option value="novo">Não — registrar uma nova despesa</option>
              <option value="existente">Sim — usar uma despesa existente</option>
            </select>
          </label>
          {origem === "existente" ? (
            <>
              <label>
                Buscar despesa (paga ou em aberto)
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Descrição ou fornecedor"
                />
              </label>
              <label>
                Despesa
                <select
                  required
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                >
                  <option value="">Selecione</option>
                  {q.data
                    ?.filter(
                      (t) =>
                        t.disponivel > 0 &&
                        (!t.ordem_servico_id || t.ordem_servico_id === doc.id),
                    )
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.descricao} · {dinheiro(t.disponivel)} disponíveis
                      </option>
                    ))}
                </select>
              </label>
              {q.isError && <p role="alert">{erroPublico(q.error)}</p>}
            </>
          ) : (
            <>
              <label>
                Descrição
                <input
                  name="descricao"
                  defaultValue={fonte ? descricaoFonte(fonte) : undefined}
                  required
                  minLength={3}
                  maxLength={200}
                  placeholder="O que foi gasto neste serviço"
                />
              </label>
              <div className="dupla-campos">
                <label>
                  Data do gasto
                  <input name="data" type="date" required defaultValue={doc.data} />
                </label>
                <label>
                  Vencimento
                  <input name="vencimento" type="date" required defaultValue={hoje()} />
                </label>
              </div>
            </>
          )}
          <div className="dupla-campos">
            <label>
              Categoria
              <select name="categoria" defaultValue={fonte?.categoria || "materiais"}>
                {Object.entries(categoriasCusto).map(([k, n]) => (
                  <option value={k} key={k}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Valor deste serviço (R$)
              <input
                name="valor"
                defaultValue={fonte?.valor ? fonte.valor / 100 : undefined}
                readOnly={!!fonte}
                type="number"
                min="0.01"
                max="100000000"
                step="0.01"
                required
              />
            </label>
          </div>
          <p>
            {fonte &&
              "O custo operacional será substituído pelo vínculo financeiro na margem, sem somar duas vezes. "}
            {origem === "novo"
              ? "Será criada uma conta a pagar vinculada a este custo. O pagamento é registrado separadamente."
              : "A despesa não será criada novamente. O valor será atribuído a este serviço."}
          </p>
          {erro && <p role="alert">{erro}</p>}
          <button className="botao-primario">Salvar custo</button>
        </fieldset>
      </form>
    </Dialogo>
  );
}
