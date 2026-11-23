import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { suprimentos, type EntradaPedido } from "../../services/suprimentos";
import { Dialogo } from "../Dialogo";
import { dinheiro } from "../../lib/formatacao";
import { EstadoConsulta, Paginacao } from "./Comum";
import { dataCurta, numero, useSuprimentos } from "./helpers";
import { ReceberPedido } from "./ReceberPedido";
const nomes = {
  compra: "Entrega",
  devolucao: "Devolução para reposição",
  reposicao: "Reposição sem cobrança",
};
export function DetalhePedido({ id, fechar }: { id: string; fechar: () => void }) {
  const operacao = useSuprimentos();
  const { w, erro, ocupado, executar } = operacao,
    [pagina, setPagina] = useState(0),
    [tipo, setTipo] = useState<EntradaPedido["tipo"] | null>(null),
    [encerrar, setEncerrar] = useState(false);
  const q = useQuery({
      queryKey: ["suprimentos", "pedido", w, id, pagina],
      queryFn: ({ signal }) => suprimentos.pedido(w, id, pagina, signal),
    }),
    p = q.data;
  const produtos = useMemo(
    () => new Map(p?.itens.map((i) => [i.id, i.descricao])),
    [p?.itens],
  );
  return (
    <Dialogo
      aberto
      fechar={() => !ocupado && fechar()}
      titulo={p?.referencia ?? "Pedido de compra"}
    >
      <div className="supr">
        <EstadoConsulta loading={q.isPending} error={q.error} />
        {erro && !tipo && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        {p && (
          <>
            <div className="supr-barra">
              <div>
                <strong>{p.fornecedor}</strong>
                <small>
                  {p.condicoes || "Condição não informada"} · {dataCurta(p.previsao)}
                </small>
              </div>
              <span className="supr-selo">
                {p.cancelado
                  ? "Encerrado"
                  : p.itens.some((i) => i.pendente > 0)
                    ? p.itens.some((i) => i.recebido > 0)
                      ? "Recebido parcialmente"
                      : "Aguardando entrega"
                    : "Recebido"}
              </span>
            </div>
            <div className="supr-metrica">
              <span>
                <small>Itens no pedido</small>
                <b>{p.itens.length}</b>
              </span>
              <span>
                <small>Entregas e devoluções</small>
                <b>{p.total_entregas}</b>
              </span>
              <span>
                <small>{p.cancelado ? "Itens encerrados" : "Itens pendentes"}</small>
                <b>{p.itens.filter((i) => i.pendente > 0).length}</b>
              </span>
            </div>
            {!p.cancelado && !tipo && (
              <div className="supr-barra">
                <button
                  className="botao-primario"
                  disabled={!p.itens.some((i) => i.recebido < i.quantidade)}
                  onClick={() => setTipo("compra")}
                >
                  Receber entrega
                </button>
                <button
                  disabled={
                    !p.itens.some(
                      (i) =>
                        i.devolvido >
                        i.reposto + (i.creditado ?? 0) + (i.sem_reposicao ?? 0),
                    )
                  }
                  onClick={() => setTipo("reposicao")}
                >
                  Receber reposição
                </button>
                <button
                  disabled={
                    !p.itens.some((i) => i.recebido - i.devolvido + i.reposto > 0)
                  }
                  onClick={() => setTipo("devolucao")}
                >
                  Devolver para reposição
                </button>
              </div>
            )}
            {tipo ? (
              <ReceberPedido
                key={tipo}
                p={p}
                operacao={operacao}
                tipo={tipo}
                fechar={() => setTipo(null)}
              />
            ) : (
              <>
                {p.itens.map((i) => (
                  <div className="supr-linha" key={i.id}>
                    <div>
                      <strong>{i.descricao}</strong>
                      <small>
                        {numero(i.quantidade)} {i.unidade} ×{" "}
                        {dinheiro(i.custo_centavos)}
                      </small>
                    </div>
                    <span>
                      <strong>{numero(i.pendente)} pendentes</strong>
                      <small>
                        {numero(i.recebido)} recebidos ·{" "}
                        {numero(
                          i.devolvido -
                            i.reposto -
                            (i.creditado ?? 0) -
                            (i.sem_reposicao ?? 0),
                        )}{" "}
                        para repor
                      </small>
                    </span>
                  </div>
                ))}
              </>
            )}
            <details>
              <summary>Entregas e devoluções · {p.total_entregas}</summary>
              {p.entregas.map((e) => (
                <div className="supr-linha" key={e.id}>
                  <div>
                    <strong>
                      {nomes[e.tipo]} · {dataCurta(e.data)}
                    </strong>
                    <small>
                      {e.documento || "Sem documento"}
                      {e.cancelado ? " · Cancelada" : ""}
                    </small>
                    {e.motivo && <small>{e.motivo}</small>}
                    {e.itens.map((l) => (
                      <small key={l.item_id}>
                        {produtos.get(l.item_id)}: {numero(l.quantidade)}{" "}
                        {e.tipo === "devolucao" ? "devolvidos" : "aceitos"}
                        {l.recusado ? ` · ${numero(l.recusado)} recusados` : ""}
                      </small>
                    ))}
                  </div>
                  {e.compra_id && (
                    <Link to={`/compras?compra=${e.compra_id}`}>
                      Ver compra e cobrança →
                    </Link>
                  )}
                </div>
              ))}
              <Paginacao pagina={pagina} total={p.total_entregas} alterar={setPagina} />
            </details>
            <details>
              <summary>Observações e encerramento (opcional)</summary>
              {p.observacoes && <p>{p.observacoes}</p>}
              {p.cancelado ? (
                <p>Encerrado: {p.motivo_cancelamento}</p>
              ) : encerrar ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const motivo = new FormData(e.currentTarget).get("motivo");
                    if (
                      await executar(() =>
                        suprimentos.executar(w, "encerrar_pedido_compra", {
                          p_pedido: p.id,
                          p_revisao: p.revisao,
                          p_motivo: motivo,
                        }),
                      )
                    )
                      setEncerrar(false);
                  }}
                >
                  <label>
                    Motivo
                    <input name="motivo" required minLength={3} maxLength={1000} />
                  </label>
                  <p>O histórico recebido e as contas existentes serão preservados.</p>
                  <button disabled={ocupado}>Encerrar saldo pendente</button>
                </form>
              ) : (
                <button disabled={ocupado} onClick={() => setEncerrar(true)}>
                  Não receber o restante
                </button>
              )}
            </details>
          </>
        )}
      </div>
    </Dialogo>
  );
}
