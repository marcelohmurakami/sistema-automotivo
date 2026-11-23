import { useId } from "react";
import { dinheiro } from "../lib/formatacao";
import type { ControleDesconto } from "../lib/useDesconto";
import "./CampoDesconto.css";

export type PreferenciaDescontoNota = {
  mostrar: boolean;
  alterar: (mostrar: boolean) => void;
};
export function CampoDesconto({
  controle,
  nota,
}: {
  controle: ControleDesconto;
  nota?: PreferenciaDescontoNota;
}) {
  const id = useId();
  const percentual = controle.estado.tipo === "percentual";
  return (
    <div className="campo-desconto">
      <div className="campo-desconto-cabecalho">
        <label htmlFor={id}>Desconto (opcional)</label>
        <div
          className="campo-desconto-unidade"
          role="group"
          aria-label="Tipo de desconto"
        >
          <button
            type="button"
            aria-label="Desconto em porcentagem"
            aria-pressed={percentual}
            onClick={() => controle.alterarTipo("percentual")}
          >
            %
          </button>
          <button
            type="button"
            aria-label="Desconto em reais"
            aria-pressed={!percentual}
            onClick={() => controle.alterarTipo("valor")}
          >
            R$
          </button>
        </div>
      </div>
      <input
        id={id}
        aria-label={percentual ? "Desconto (%)" : "Desconto (R$)"}
        aria-describedby={`${id}-ajuda`}
        type="number"
        inputMode="decimal"
        min="0"
        max={percentual ? 100 : controle.subtotal / 100}
        step="0.01"
        value={controle.estado.valor}
        onChange={(e) =>
          controle.alterarValor(
            Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : "",
          )
        }
      />
      <small id={`${id}-ajuda`} className="campo-desconto-ajuda" aria-live="polite">
        {dinheiro(controle.centavos)} de desconto sobre {dinheiro(controle.subtotal)}
      </small>
      {nota && (
        <div className="campo-desconto-nota">
          <span id={`${id}-nota`}>
            Mostrar o desconto na nota final para o cliente?
          </span>
          <div
            className="campo-desconto-unidade"
            role="group"
            aria-labelledby={`${id}-nota`}
          >
            <button
              type="button"
              aria-pressed={!nota.mostrar}
              onClick={() => nota.alterar(false)}
            >
              Não
            </button>
            <button
              type="button"
              aria-pressed={nota.mostrar}
              onClick={() => nota.alterar(true)}
            >
              Sim
            </button>
          </div>
          <small>
            {nota.mostrar
              ? "A nota mostra o desconto e o total descontado."
              : "A nota mostra o total sem desconto. O financeiro mantém o desconto."}
          </small>
        </div>
      )}
    </div>
  );
}
