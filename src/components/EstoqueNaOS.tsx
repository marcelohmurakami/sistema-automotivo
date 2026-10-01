import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAcesso } from "../auth/contexto";
import { listarEstoque, type ProdutoEstoque } from "../services/estoque";
import type { OrdemServico } from "../services/ordensServico";
import { erroPublico } from "../lib/supabase";
import { Dialogo } from "./Dialogo";
export function EstoqueNaOS({
  os,
  ocupado,
  executar,
  operar,
}: {
  os: OrdemServico;
  ocupado: boolean;
  executar: (fn: () => Promise<unknown>) => Promise<void>;
  operar: (acao: string, dados: Record<string, unknown>) => Promise<void>;
}) {
  const a = useAcesso(),
    [alvo, setAlvo] = useState<string | null>(null),
    [origem, setOrigem] = useState("estoque"),
    [produto, setProduto] = useState(""),
    [busca, setBusca] = useState(""),
    [quantidade, setQuantidade] = useState(1);
  const [erroLocal, setErroLocal] = useState("");
  const q = useQuery({
    queryKey: ["estoque", "opcoes-os", a.demo, a.oficina!.id],
    queryFn: async () => {
      const itens: ProdutoEstoque[] = [];
      for (let p = 0; ; p++) {
        const r = await listarEstoque(a.demo, a.oficina!.id, "", "", p);
        itens.push(...r.itens.filter((i) => i.saldo !== null));
        if ((p + 1) * 24 >= r.total) return itens;
      }
    },
    enabled: a.permite("inventory"),
  });
  if (!a.permite("inventory"))
    return (
      <p className="aviso-cliente">
        O controle de estoque requer um plano com este recurso habilitado.
      </p>
    );
  const encerrada = ["delivered", "cancelled"].includes(os.situacao),
    item = os.itens.find((i) => i.id === alvo);
  return (
    <section className="estoque-os">
      <div className="os-linha">
        <h3>Peças e estoque</h3>
        <Link to="/estoque">Abrir estoque</Link>
      </div>
      <p>
        A baixa acontece na entrega. Peças do cliente ou de compra externa não
        reduzem o saldo.
      </p>
      {q.isError && <p role="alert">{erroPublico(q.error)}</p>}
      {os.itens
        .filter((i) => i.tipo === "part")
        .map((i) => {
          const p = q.data?.find(
            (p) => p.id === (i.produto_estoque_id ?? i.item_catalogo_id),
          );
          const origemAtual = i.origem_peca ?? (p ? "estoque" : "");
          return (
            <div className="estoque-vinculo" key={i.id}>
              <div>
                <strong>{i.descricao}</strong>
                <small>
                  {origemAtual === "cliente"
                    ? "Peça do cliente"
                    : origemAtual === "externa"
                      ? "Compra externa, fora do estoque"
                      : p
                        ? `${p.descricao} · saldo ${p.saldo} ${p.unidade}`
                        : "Origem ainda não definida"}
                </small>
              </div>
              {!encerrada && (
                <button
                  className="botao-secundario"
                  disabled={ocupado}
                  onClick={() => {
                    setErroLocal("");
                    setAlvo(i.id);
                    setOrigem(origemAtual || "estoque");
                    setProduto(p?.id ?? "");
                    setBusca("");
                  }}
                >
                  Definir origem
                </button>
              )}
            </div>
          );
        })}
      {!encerrada && os.situacao !== "ready" && !os.orcamento_origem_id && (
        <button
          className="botao-secundario"
          disabled={ocupado}
          onClick={() => {
            setErroLocal("");
            setAlvo("novo");
            setOrigem("estoque");
            setProduto("");
            setBusca("");
            setQuantidade(1);
          }}
        >
          Adicionar peça do estoque
        </button>
      )}
      <Dialogo
        aberto={!!alvo}
        fechar={() => !ocupado && setAlvo(null)}
        titulo={
          alvo === "novo" ? "Adicionar peça do estoque" : "Origem da peça"
        }
      >
        {erroLocal && (
          <p role="alert" className="erro-formulario">
            {erroLocal}
          </p>
        )}
        <form
          className="formulario-cliente"
          onSubmit={(e) => {
            e.preventDefault();
            void executar(async () => {
              setErroLocal("");
              try {
                await operar(
                  alvo === "novo"
                    ? "adicionar_peca_estoque_os"
                    : "vincular_estoque_item_os",
                  alvo === "novo"
                    ? {
                        p_produto: produto,
                        p_quantidade: quantidade,
                        p_revisao: os.revisao,
                      }
                    : {
                        p_item: alvo,
                        p_origem: origem,
                        p_produto: origem === "estoque" ? produto : null,
                        p_revisao: os.revisao,
                      },
                );
                setAlvo(null);
              } catch (e) {
                setErroLocal(erroPublico(e));
                throw e;
              }
            });
          }}
        >
          <fieldset disabled={ocupado}>
            {alvo !== "novo" && (
              <label>
                De onde veio a peça?
                <select
                  value={origem}
                  onChange={(e) => setOrigem(e.target.value)}
                >
                  <option value="estoque">Estoque da oficina</option>
                  <option value="cliente">Trazida pelo cliente</option>
                  <option value="externa">
                    Compra externa não registrada no estoque
                  </option>
                </select>
              </label>
            )}
            {origem === "estoque" && (
              <>
                <label>
                  Buscar peça
                  <input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Nome ou código"
                  />
                </label>
                <label>
                  Produto
                  <select
                    required
                    value={produto}
                    onChange={(e) => setProduto(e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {q.data
                      ?.filter(
                        (p) =>
                          (alvo === "novo" ||
                            p.unidade === (item?.unidade ?? "un")) &&
                          (`${p.descricao} ${p.codigo}`
                            .toLowerCase()
                            .includes(busca.toLowerCase()) ||
                            p.id === produto),
                      )
                      .map((p) => (
                        <option value={p.id} key={p.id}>
                          {p.descricao} · saldo {p.saldo} {p.unidade}
                        </option>
                      ))}
                  </select>
                </label>
                {q.isPending && <p>Carregando peças…</p>}
                {alvo !== "novo" && (
                  <small>
                    Mostrando peças na unidade {item?.unidade}. O vínculo não
                    altera o preço aprovado.
                  </small>
                )}
              </>
            )}
            {alvo === "novo" && (
              <label>
                Quantidade
                <input
                  required
                  type="number"
                  min="0.001"
                  max="100000"
                  step="0.001"
                  value={quantidade}
                  onChange={(e) => setQuantidade(Number(e.target.value))}
                />
              </label>
            )}
            <button className="botao-primario">
              {ocupado ? "Salvando…" : "Confirmar"}
            </button>
          </fieldset>
        </form>
      </Dialogo>
    </section>
  );
}
