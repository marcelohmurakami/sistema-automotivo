import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DialogoLocalizacao as Dialogo } from "../localizacao/DialogoLocalizacao";
import { logisticaEstoque, type Deposito } from "../../services/logisticaEstoque";
import { suprimentos } from "../../services/suprimentos";
import type { ProdutoEstoque } from "../../services/estoque";
import { novoId } from "../../lib/uuid";
import { EstadoConsulta, Paginacao, EscolherProduto } from "./Comum";
import { useBusca, useSuprimentos, numero, passoProduto } from "./helpers";
import { SeletorUnidades } from "./Unidades";
import "./Suprimentos.css";
export function EscolherDeposito({
  valor,
  alterar,
  produto,
  rotulo = "Local de estoque",
}: {
  valor: string | null;
  alterar: (id: string) => void;
  produto?: string;
  rotulo?: string;
}) {
  const { w } = useSuprimentos(),
    [busca, setBusca] = useState(""),
    [pag, setPag] = useState(0),
    v = useBusca(busca);
  const q = useQuery({
    queryKey: ["suprimentos", "depositos", w, produto, v, pag],
    queryFn: ({ signal }) =>
      logisticaEstoque.depositos(w, produto ?? null, v, pag, null, signal),
  });
  const selecionado = valor ?? q.data?.padrao ?? "";
  return (
    <div className="supr-seletor-deposito">
      <label>
        {rotulo}
        <select
          value={selecionado}
          onChange={(e) => alterar(e.target.value)}
          disabled={q.isPending}
          required
        >
          <option value="" disabled>
            Selecione
          </option>
          {selecionado && !q.data?.itens.some((d) => d.id === selecionado) && (
            <option value={selecionado}>
              {valor ? "Local selecionado" : "Local padrão"}
            </option>
          )}
          {q.data?.itens
            .filter((d) => d.ativo)
            .map((d) => (
              <option value={d.id} key={d.id}>
                {d.nome}
                {produto ? ` · ${numero(d.disponivel)} livres` : ""}
              </option>
            ))}
        </select>
      </label>
      {(!!busca || pag > 0 || (q.data?.total ?? 0) > 30) && (
        <>
          <label>
            Encontrar local de estoque
            <input
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPag(0);
              }}
            />
          </label>
          <Paginacao pagina={pag} total={q.data?.total ?? 0} alterar={setPag} />
        </>
      )}
      <EstadoConsulta loading={false} error={q.error} />
    </div>
  );
}
export function DepositosEstoque({
  fechar,
  produtoInicial,
}: {
  fechar: () => void;
  produtoInicial?: ProdutoEstoque;
}) {
  const operacao = useSuprimentos();
  const { w, erro, ocupado, executar } = operacao,
    [busca, setBusca] = useState(""),
    [pag, setPag] = useState(0),
    [local, setLocal] = useState<Deposito | null>(null),
    [editar, setEditar] = useState<Deposito | "novo" | null>(null),
    [transferir, setTransferir] = useState(!!produtoInicial),
    [produto, setProduto] = useState<ProdutoEstoque | null>(produtoInicial ?? null),
    [historico, setHistorico] = useState(false),
    v = useBusca(busca);
  const q = useQuery({
    queryKey: ["suprimentos", "depositos-tela", w, v, pag, local?.id],
    queryFn: ({ signal }) =>
      logisticaEstoque.depositos(w, null, v, pag, local?.id ?? null, signal),
    enabled: !historico,
  });
  const h = useQuery({
    queryKey: ["suprimentos", "transferencias", w, pag],
    queryFn: ({ signal }) => logisticaEstoque.transferencias(w, null, pag, signal),
    enabled: historico,
  });
  return (
    <Dialogo aberto titulo="Locais de estoque" fechar={() => !ocupado && fechar()}>
      <div className="supr">
        <div className="supr-barra">
          <button
            className={!historico ? "botao-primario" : ""}
            onClick={() => {
              setHistorico(false);
              setPag(0);
            }}
          >
            Saldos por local
          </button>
          <button
            onClick={() => {
              setHistorico(true);
              setPag(0);
            }}
          >
            Transferências
          </button>
          <button onClick={() => setEditar("novo")}>+ Novo local</button>
          <button onClick={() => setTransferir(true)}>Transferir produtos</button>
        </div>
        {erro && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        {historico ? (
          <>
            <EstadoConsulta loading={h.isPending} error={h.error} />
            {h.data?.itens.map((t) => (
              <div className="supr-linha" key={t.id}>
                <span>
                  <strong>
                    {t.descricao} · {numero(t.quantidade)} {t.unidade}
                  </strong>
                  <small>
                    {t.origem_nome} → {t.destino_nome}
                  </small>
                  <small>
                    {t.motivo} · {new Date(t.criado_em).toLocaleString("pt-BR")}
                  </small>
                </span>
              </div>
            ))}
            <Paginacao pagina={pag} total={h.data?.total ?? 0} alterar={setPag} />
          </>
        ) : (
          <>
            <div className="supr-barra">
              {local && (
                <button
                  onClick={() => {
                    setLocal(null);
                    setPag(0);
                    setBusca("");
                  }}
                >
                  ← Todos os locais
                </button>
              )}
              <label>
                {local ? "Buscar produto neste local" : "Buscar local de estoque"}
                <input
                  value={busca}
                  onChange={(e) => {
                    setBusca(e.target.value);
                    setPag(0);
                  }}
                />
              </label>
            </div>
            <EstadoConsulta loading={q.isPending} error={q.error} />
            {local ? (
              <>
                <h3>{local.nome}</h3>
                {q.data?.produtos?.map((p) => (
                  <div className="supr-linha" key={p.id}>
                    <span>
                      <strong>{p.descricao}</strong>
                      <small>{numero(p.reservado)} reservados</small>
                    </span>
                    <strong>
                      {numero(p.disponivel)} {p.unidade} livres
                    </strong>
                    <button
                      onClick={() =>
                        void executar(async () => {
                          setProduto(await suprimentos.produto(w, p.id));
                          setTransferir(true);
                        }, false)
                      }
                    >
                      Transferir
                    </button>
                  </div>
                ))}
                {q.data?.total_produtos === 0 && (
                  <p className="supr-vazio">Nenhum produto neste local.</p>
                )}
              </>
            ) : (
              q.data?.itens.map((d) => (
                <div className="supr-linha supr-local" key={d.id}>
                  <button
                    className="supr-clicavel"
                    disabled={!d.ativo}
                    onClick={() => {
                      setLocal(d);
                      setBusca("");
                      setPag(0);
                    }}
                  >
                    <span>
                      <strong>{d.nome}</strong>
                      <small>
                        {d.tipo === "veiculo" ? "Estoque móvel" : "Depósito"}
                        {d.identificacao ? ` · ${d.identificacao}` : ""} ·{" "}
                        {d.ativo ? "Ativo" : "Inativo"}
                      </small>
                    </span>
                    <span>Ver saldo →</span>
                  </button>
                  <button onClick={() => setEditar(d)}>Editar local</button>
                </div>
              ))
            )}
            <Paginacao
              pagina={pag}
              total={local ? (q.data?.total_produtos ?? 0) : (q.data?.total ?? 0)}
              alterar={setPag}
            />
          </>
        )}
        {editar && (
          <Dialogo
            aberto
            titulo={editar === "novo" ? "Novo local de estoque" : "Editar local"}
            fechar={() => !ocupado && setEditar(null)}
          >
            <form
              className="supr"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                if (
                  await executar(() =>
                    suprimentos.executar(w, "salvar_deposito_estoque", {
                      p_id: editar === "novo" ? novoId() : editar.id,
                      p_revisao: editar === "novo" ? null : editar.revisao,
                      p_dados: {
                        nome: f.get("nome"),
                        tipo: f.get("tipo"),
                        identificacao: f.get("identificacao"),
                        ativo: f.get("ativo") === "on",
                      },
                    }),
                  )
                )
                  setEditar(null);
              }}
            >
              <fieldset disabled={ocupado}>
                <label>
                  Nome do local
                  <input
                    name="nome"
                    required
                    minLength={2}
                    maxLength={100}
                    defaultValue={editar === "novo" ? "" : editar.nome}
                  />
                </label>
                <label>
                  Tipo
                  <select
                    name="tipo"
                    defaultValue={editar === "novo" ? "deposito" : editar.tipo}
                  >
                    <option value="deposito">Depósito</option>
                    <option value="veiculo">Estoque móvel</option>
                  </select>
                </label>
                <label>
                  Identificação (opcional)
                  <input
                    name="identificacao"
                    maxLength={100}
                    defaultValue={editar === "novo" ? "" : editar.identificacao}
                  />
                </label>
                <label className="supr-check">
                  <input
                    name="ativo"
                    type="checkbox"
                    defaultChecked={editar === "novo" || editar.ativo}
                  />{" "}
                  Ativo
                </label>
                {erro && <p role="alert">{erro}</p>}
                <button className="botao-primario">Salvar local</button>
              </fieldset>
            </form>
          </Dialogo>
        )}
        {transferir && (
          <Dialogo
            aberto
            titulo="Transferir produtos"
            fechar={() => !ocupado && setTransferir(false)}
          >
            <div className="supr">
              {!produto ? (
                <EscolherProduto selecionar={setProduto} />
              ) : (
                <TransferirProduto
                  key={produto.id}
                  produto={produto}
                  operacao={operacao}
                  origemInicial={local?.id}
                  fechar={() => {
                    setTransferir(false);
                    setProduto(null);
                  }}
                />
              )}
            </div>
          </Dialogo>
        )}
      </div>
    </Dialogo>
  );
}
function TransferirProduto({
  produto,
  origemInicial,
  fechar,
  operacao,
}: {
  produto: ProdutoEstoque;
  origemInicial?: string;
  fechar: () => void;
  operacao: ReturnType<typeof useSuprimentos>;
}) {
  const { w, erro, ocupado, executar } = operacao,
    [origem, setOrigem] = useState<string | null>(origemInicial ?? null),
    [destino, setDestino] = useState<string | null>(null),
    [ids, setIds] = useState<string[]>([]),
    [quantidade, setQuantidade] = useState(1),
    [chave] = useState(novoId);
  const q = useQuery({
      queryKey: ["suprimentos", "transferir-produto", w, produto.id],
      queryFn: ({ signal }) => suprimentos.produto(w, produto.id, signal),
    }),
    deps = useQuery({
      queryKey: ["suprimentos", "transferir-origem", w, produto.id],
      queryFn: ({ signal }) =>
        logisticaEstoque.depositos(w, produto.id, "", 0, null, signal),
    });
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (
          await executar(() =>
            suprimentos.executar(w, "transferir_estoque", {
              p_id: chave,
              p_produto: produto.id,
              p_origem: origem ?? deps.data?.padrao,
              p_destino: destino ?? deps.data?.padrao,
              p_quantidade: produto.rastreado ? ids.length : quantidade,
              p_revisao: q.data?.revisao,
              p_unidades: ids,
              p_motivo: f.get("motivo"),
            }),
          )
        )
          fechar();
      }}
    >
      <fieldset disabled={ocupado || q.isPending || deps.isPending}>
        <h3>{produto.descricao}</h3>
        <EscolherDeposito
          produto={produto.id}
          rotulo="Origem"
          valor={origem}
          alterar={(v) => {
            setOrigem(v);
            setIds([]);
          }}
        />
        <EscolherDeposito rotulo="Destino" valor={destino} alterar={setDestino} />
        {produto.rastreado ? (
          <SeletorUnidades
            produto={produto.id}
            deposito={origem}
            selecionados={ids}
            alterar={setIds}
          />
        ) : (
          <label>
            Quantidade a transferir
            <input
              type="number"
              min={passoProduto(produto.unidade)}
              step={passoProduto(produto.unidade)}
              value={quantidade}
              onChange={(e) => setQuantidade(Number(e.target.value))}
              required
            />
          </label>
        )}
        <label>
          Motivo
          <input
            name="motivo"
            required
            minLength={3}
            maxLength={1000}
            placeholder="Ex.: abastecer a equipe da visita"
          />
        </label>
        <EstadoConsulta loading={false} error={q.error || deps.error} />
        {erro && (
          <p className="erro-formulario" role="alert">
            {erro}
          </p>
        )}
        <button
          className="botao-primario"
          disabled={
            !!q.error ||
            !!deps.error ||
            (origem ?? deps.data?.padrao) === (destino ?? deps.data?.padrao)
          }
        >
          {ocupado ? "Transferindo…" : "Confirmar transferência"}
        </button>
      </fieldset>
    </form>
  );
}
