import { dinheiro } from "../lib/formatacao";
import { useState } from "react";
import {
  gerarParcelasFinanceiras,
  type ParcelaFinanceira,
} from "../lib/parcelasFinanceiras";

export function ParcelasFinanceiras({
  total,
  primeira,
  parcelas,
  alterar,
}: {
  total: number;
  primeira: string;
  parcelas: ParcelaFinanceira[];
  alterar: (p: ParcelaFinanceira[]) => void;
}) {
  const [quantidade, setQuantidade] = useState(2),
    [erro, setErro] = useState("");
  const soma = parcelas.reduce((s, p) => s + p.valor_centavos, 0);
  return (
    <section className="fin-parcelas">
      <div className="dupla-campos">
        <label>
          Quantidade de parcelas
          <input
            type="number"
            min={2}
            max={60}
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.valueAsNumber)}
          />
        </label>
        <button
          type="button"
          className="botao-secundario"
          onClick={() => {
            try {
              alterar(gerarParcelasFinanceiras(total, quantidade, primeira));
              setErro("");
            } catch (e) {
              setErro((e as Error).message);
            }
          }}
        >
          Gerar parcelas mensais
        </button>
      </div>
      <p className="texto-suave">
        Use o valor total e o primeiro vencimento acima. Depois, ajuste as datas e os
        valores combinados, inclusive entrada e parcelas diferentes. Nenhum pagamento é
        registrado agora.
      </p>
      {erro && (
        <p role="alert" className="erro-formulario">
          {erro}
        </p>
      )}
      {parcelas.map((p, i) => (
        <div className="fin-parcela" key={i}>
          <strong>
            {i + 1}/{parcelas.length}
          </strong>
          <label>
            Vencimento
            <input
              type="date"
              required
              value={p.vencimento}
              onChange={(e) =>
                alterar(
                  parcelas.map((x, n) =>
                    n === i ? { ...x, vencimento: e.target.value } : x,
                  ),
                )
              }
            />
          </label>
          <label>
            Valor (R$)
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={Number.isFinite(p.valor_centavos) ? p.valor_centavos / 100 : ""}
              onChange={(e) =>
                alterar(
                  parcelas.map((x, n) =>
                    n === i
                      ? {
                          ...x,
                          valor_centavos: Math.round(e.target.valueAsNumber * 100),
                        }
                      : x,
                  ),
                )
              }
            />
          </label>
        </div>
      ))}
      {!!parcelas.length && (
        <p className={soma === total ? "texto-suave" : "erro-formulario"}>
          Soma das parcelas: {dinheiro(soma || 0)} · Total da conta:{" "}
          {dinheiro(total || 0)}
          {soma !== total ? ". Ajuste os valores para fechar o total." : ""}
        </p>
      )}
    </section>
  );
}
