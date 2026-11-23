import { useState } from "react";
import { formas, hoje } from "../services/financeiro";
import { useContasBancarias } from "../lib/useContasBancarias";
import { dinheiro } from "../lib/formatacao";
import { parcelasCompra } from "../lib/pagamentoCompra";
import type { ParcelaFinanceira } from "../lib/parcelasFinanceiras";
import "./PagamentoCompra.css";
export function PagamentoCompra({ total }: { total: number }) {
  const { ativas } = useContasBancarias();
  const [modo, setModo] = useState("prazo"),
    [n, setN] = useState(1),
    [primeira, setPrimeira] = useState(hoje),
    [datas, setDatas] = useState<Record<number, string>>({});
  let parcelas: ParcelaFinanceira[] = [];
  try {
    parcelas = parcelasCompra(total, n, primeira);
  } catch {
    /* Valores incompletos continuam editáveis. */
  }
  return (
    <section className="compra-pagamento" aria-label="Pagamento da compra">
      <h3>Pagamento</h3>
      <div className="compra-pagamento-campos">
        <label>
          Esta compra
          <select
            name="compra_pagamento"
            aria-label="Esta compra"
            value={modo}
            onChange={(e) => setModo(e.target.value)}
          >
            <option value="prazo">Vou pagar a prazo</option>
            <option value="pago">Já paguei</option>
          </select>
        </label>
        <label>
          Forma de pagamento
          <select
            name="compra_forma"
            aria-label="Forma de pagamento"
            defaultValue="pix"
          >
            {Object.entries(formas).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        {modo === "pago" ? (
          <>
            <label>
              Conta do pagamento
              <select
                name="compra_conta"
                aria-label="Conta do pagamento"
                defaultValue="banco"
                required
              >
                {Object.entries(ativas).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Pago em
              <input
                type="date"
                name="compra_data"
                defaultValue={hoje()}
                max={hoje()}
                required
              />
            </label>
          </>
        ) : (
          <>
            <label>
              Quantidade de parcelas
              <input
                type="number"
                min="1"
                max={Math.max(1, Math.min(60, total))}
                step="1"
                value={n || ""}
                onChange={(e) => {
                  setN(Math.min(60, Math.max(0, Number(e.target.value))));
                  setDatas({});
                }}
                required
              />
            </label>
            <label>
              {n === 1 ? "Vencimento" : "Primeiro vencimento"}
              <input
                type="date"
                name="compra_vencimento"
                value={primeira}
                onChange={(e) => {
                  setPrimeira(e.target.value);
                  setDatas({});
                }}
                required
              />
              {n > 1 && parcelas[0] && (
                <small>
                  1/{n} · {dinheiro(parcelas[0].valor_centavos)}
                </small>
              )}
            </label>
          </>
        )}
      </div>
      {modo === "prazo" && (
        <div className="compra-parcelas">
          {parcelas.map((p, i) =>
            i === 0 ? null : (
              <label key={i}>
                <span>
                  {i + 1}/{n} · <strong>{dinheiro(p.valor_centavos)}</strong>
                </span>
                <input
                  type="date"
                  name="compra_vencimento"
                  aria-label={`Vencimento da parcela ${i + 1}`}
                  required
                  value={datas[i] ?? p.vencimento}
                  onChange={(e) => setDatas({ ...datas, [i]: e.target.value })}
                />
              </label>
            ),
          )}
        </div>
      )}
      <p>
        {modo === "pago"
          ? `Ao confirmar, ${dinheiro(total)} será registrado como pago na conta escolhida.`
          : "As parcelas serão agendadas nas contas a pagar, sem saída de dinheiro agora."}
      </p>
    </section>
  );
}
