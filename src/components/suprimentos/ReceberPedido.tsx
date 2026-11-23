import { useState } from "react";
import {
  suprimentos,
  type Pedido,
  type EntradaPedido,
} from "../../services/suprimentos";
import { hoje } from "../../services/financeiro";
import { novoId } from "../../lib/uuid";
import { dinheiro } from "../../lib/formatacao";
import {
  calcularQuantidadesEntrega,
  limiteRecebimento,
} from "../../lib/recebimentoPedido";
import { numero, type useSuprimentos, lerSeries, passoProduto } from "./helpers";
import { SeletorUnidades } from "./Unidades";
import { EscolherDeposito } from "./Depositos";
import { PagamentoCompra } from "../PagamentoCompra";
import { lerPagamentoCompra } from "../../lib/pagamentoCompra";

type Linha = {
  marcada: boolean;
  entregue: number;
  recusado: number;
  custo: number;
  series: string;
  ids: string[];
};
export function ReceberPedido({
  p,
  tipo,
  fechar,
  operacao,
}: {
  p: Pedido;
  tipo: EntradaPedido["tipo"];
  fechar: () => void;
  operacao: ReturnType<typeof useSuprimentos>;
}) {
  const { w, erro, ocupado, executar } = operacao;
  const [chave] = useState(novoId),
    [revisao] = useState(p.revisao);
  const [deposito, setDeposito] = useState<string | null>(null);
  const devolucao = tipo === "devolucao";
  const disponiveis = p.itens.filter((i) => limiteRecebimento(i, tipo) > 0);
  const [linhas, setLinhas] = useState<Record<string, Linha>>(() =>
    Object.fromEntries(
      p.itens.map((i) => [
        i.id,
        {
          marcada: devolucao || disponiveis.length === 1,
          entregue: devolucao ? 0 : limiteRecebimento(i, tipo),
          recusado: 0,
          custo: i.custo_centavos,
          series: "",
          ids: [],
        },
      ]),
    ),
  );
  function alterar(id: string, dados: Partial<Linha>) {
    setLinhas((v) => ({ ...v, [id]: { ...v[id], ...dados } }));
  }
  const aceitas = (l: Linha) =>
    l.marcada ? Math.round((l.entregue - l.recusado) * 1000) / 1000 : 0;
  const selecionadas = disponiveis.filter(
    (i) => linhas[i.id]?.marcada && linhas[i.id].entregue > 0,
  );
  const total = selecionadas.reduce(
    (s, i) => s + Math.round(aceitas(linhas[i.id]) * linhas[i.id].custo),
    0,
  );
  const temRecusa = selecionadas.some((i) => linhas[i.id].recusado > 0);
  return (
    <form
      className="supr-painel supr-recebimento"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (
          await executar(async () => {
            if (!selecionadas.length)
              throw new Error(
                "Marque os produtos e informe o que chegou nesta entrega.",
              );
            const itens = selecionadas.map((i) => {
              const l = linhas[i.id];
              const { aceito } = calcularQuantidadesEntrega(
                l.entregue,
                devolucao ? 0 : l.recusado,
                limiteRecebimento(i, tipo),
                i.unidade,
              );
              if (!Number.isSafeInteger(l.custo) || l.custo < 0 || l.custo > 100000000)
                throw new Error("Confira o custo por unidade.");
              const unidades =
                i.rastreado && aceito > 0
                  ? devolucao
                    ? l.ids
                    : lerSeries(l.series)
                  : [];
              if (i.rastreado && unidades.length !== aceito)
                throw new Error(
                  `Informe ${numero(aceito)} séries ou IMEIs para ${i.descricao}, somente das unidades aceitas.`,
                );
              return {
                item_id: i.id,
                quantidade: aceito,
                recusado: devolucao ? 0 : l.recusado,
                custo_centavos: l.custo,
                unidades,
              };
            });
            const pagamento =
              tipo === "compra" && total > 0 ? lerPagamentoCompra(f, total) : null;
            return suprimentos.executar(w, "receber_pedido_com_pagamento", {
              p_pagamento: pagamento,
              p_deposito: deposito,
              p_pedido: p.id,
              p_chave: chave,
              p_revisao: revisao,
              p_tipo: tipo,
              p_data: f.get("data"),
              p_vencimento: pagamento?.parcelas[0].vencimento || f.get("data"),
              p_documento: f.get("documento"),
              p_motivo: f.get("motivo") || "",
              p_itens: itens,
            });
          })
        )
          fechar();
      }}
    >
      <fieldset disabled={ocupado}>
        <div className="supr-barra">
          <h3>
            {devolucao
              ? "Devolução para reposição"
              : tipo === "reposicao"
                ? "Receber reposição"
                : "Receber entrega"}
          </h3>
          <button type="button" onClick={fechar}>
            Cancelar
          </button>
        </div>
        {!devolucao && (
          <p>Marque o que chegou. Aceitas = recebidas menos rejeitadas.</p>
        )}
        <EscolherDeposito
          valor={deposito}
          alterar={(v) => {
            setDeposito(v);
            setLinhas((ls) =>
              Object.fromEntries(
                Object.entries(ls).map(([k, l]) => [k, { ...l, ids: [] }]),
              ),
            );
          }}
        />
        <div className="supr-campos">
          <label>
            Data
            <input
              type="date"
              name="data"
              defaultValue={hoje()}
              min="2000-01-01"
              max={hoje()}
              required
            />
          </label>
          <label>
            Documento (opcional)
            <input name="documento" maxLength={100} />
          </label>
        </div>
        {!devolucao && (
          <div className="supr-barra">
            <span>
              {selecionadas.length} de {disponiveis.length} produtos nesta entrega
            </span>
            <div className="supr-recebimento-acoes">
              <button
                type="button"
                onClick={() =>
                  setLinhas((ls) =>
                    Object.fromEntries(
                      Object.entries(ls).map(([k, l]) => [k, { ...l, marcada: true }]),
                    ),
                  )
                }
              >
                Todos chegaram
              </button>
              <button
                type="button"
                onClick={() =>
                  setLinhas((ls) =>
                    Object.fromEntries(
                      Object.entries(ls).map(([k, l]) => [k, { ...l, marcada: false }]),
                    ),
                  )
                }
              >
                Limpar seleção
              </button>
            </div>
          </div>
        )}
        {disponiveis.map((i) => {
          const l = linhas[i.id],
            max = limiteRecebimento(i, tipo),
            aceita = aceitas(l);
          const limitar = (v: number, teto: number) =>
            Number.isFinite(v) ? Math.min(teto, Math.max(0, v)) : 0;
          return (
            <section
              className="supr-painel supr-recebimento-item"
              aria-label={i.descricao}
              key={i.id}
            >
              {devolucao ? (
                <strong>{i.descricao}</strong>
              ) : (
                <label className="supr-recebimento-selecao">
                  <input
                    type="checkbox"
                    checked={l.marcada}
                    onChange={(e) => alterar(i.id, { marcada: e.target.checked })}
                  />
                  <span>
                    <strong>{i.descricao}</strong>
                    <small>
                      {l.marcada ? "Chegou nesta entrega" : "Não chegou nesta entrega"}
                    </small>
                  </span>
                </label>
              )}
              <small>
                {devolucao ? "Disponível para devolver" : "Saldo a receber"}:{" "}
                {numero(max)} {i.unidade}
              </small>
              {l.marcada && (
                <>
                  <div className="supr-campos">
                    <label>
                      {devolucao ? "Devolver" : "Entregues agora"}
                      <input
                        type="number"
                        required
                        min="0"
                        max={max}
                        step={passoProduto(i.unidade)}
                        value={l.entregue}
                        onChange={(e) => {
                          const entregue = limitar(e.target.valueAsNumber, max);
                          alterar(i.id, {
                            entregue,
                            recusado: Math.min(l.recusado, entregue),
                          });
                        }}
                      />
                    </label>
                    {!devolucao && (
                      <>
                        <label>
                          Rejeitadas
                          <input
                            type="number"
                            required
                            min="0"
                            max={l.entregue}
                            step={passoProduto(i.unidade)}
                            value={l.recusado}
                            onChange={(e) =>
                              alterar(i.id, {
                                recusado: limitar(e.target.valueAsNumber, l.entregue),
                              })
                            }
                          />
                        </label>
                        <label>
                          Aceitas (automático)
                          <input type="number" readOnly value={aceita} tabIndex={-1} />
                        </label>
                      </>
                    )}
                    {tipo === "compra" && (
                      <label>
                        Custo unitário (R$)
                        <input
                          type="number"
                          required
                          min="0"
                          step="0.01"
                          max="1000000"
                          value={l.custo / 100}
                          onChange={(e) =>
                            alterar(i.id, {
                              custo: Math.round(Number(e.target.value) * 100),
                            })
                          }
                        />
                      </label>
                    )}
                  </div>
                  {!devolucao && (
                    <div className="supr-recebimento-saldo">
                      <span>
                        Não chegaram: <b>{numero(Math.max(0, max - l.entregue))}</b>
                      </span>
                      <span>
                        Rejeitadas: <b>{numero(l.recusado)}</b>
                      </span>
                      <strong>
                        Continuam pendentes: {numero(Math.max(0, max - aceita))}{" "}
                        {i.unidade}
                      </strong>
                    </div>
                  )}
                  {i.rastreado &&
                    aceita > 0 &&
                    (devolucao ? (
                      <SeletorUnidades
                        produto={i.produto_id}
                        deposito={deposito}
                        selecionados={l.ids}
                        alterar={(ids) => alterar(i.id, { ids })}
                      />
                    ) : (
                      <label>
                        Séries / IMEIs das unidades aceitas · uma por linha
                        <textarea
                          required
                          value={l.series}
                          onChange={(e) => alterar(i.id, { series: e.target.value })}
                          placeholder={"Série ABC123\nSérie ABC124; 123456789012345"}
                        />
                        <small>
                          {lerSeries(l.series).length} de {numero(aceita)} identificadas
                        </small>
                      </label>
                    ))}
                </>
              )}
            </section>
          );
        })}
        {(devolucao || temRecusa) && (
          <label>
            Motivo da devolução ou recusa
            <input name="motivo" required minLength={3} maxLength={1000} />
          </label>
        )}
        <p className="supr-aviso">
          {tipo === "compra"
            ? `Conta a pagar desta entrega: ${dinheiro(total)}. Só as unidades aceitas entram no estoque e na cobrança. O que não chegou ou foi rejeitado continua pendente.`
            : tipo === "reposicao"
              ? "A reposição aceita entra no estoque sem gerar outra conta a pagar. O restante continua pendente."
              : "Devolução para troca. O fornecedor deverá repor essas unidades; este registro não gera reembolso."}
        </p>
        {tipo === "compra" && total > 0 && <PagamentoCompra total={total} />}
        {erro && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        <button className="botao-primario" disabled={!selecionadas.length || ocupado}>
          {ocupado ? "Registrando…" : "Confirmar registro"}
        </button>
      </fieldset>
    </form>
  );
}
