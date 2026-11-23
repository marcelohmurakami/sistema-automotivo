import { useId, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { QUANTIDADE_MAXIMA_ITEM, quantidadeItemValida } from "../lib/quantidadeItem";

export function QuantidadeItem({
  quantidade,
  descricao,
  desabilitado,
  alterar,
}: {
  quantidade: number;
  descricao: string;
  desabilitado: boolean;
  alterar: (quantidade: number) => void;
}) {
  const id = useId();
  // Mantém a digitação incompleta no campo sem alterar os valores do atendimento.
  const [digitado, setDigitado] = useState<{ texto: string; base: number } | null>(
    null,
  );
  const valida = quantidadeItemValida(quantidade);
  function ajustar(valor: number) {
    setDigitado(null);
    alterar(valor);
  }
  return (
    <div className="os-editor-quantidade">
      <label className="sr-only" htmlFor={id}>
        Quantidade de {descricao}
      </label>
      <button
        type="button"
        aria-label={`Diminuir quantidade de ${descricao}`}
        disabled={desabilitado || !valida || quantidade <= 1}
        onClick={() => ajustar(quantidade - 1)}
      >
        <Minus size={16} aria-hidden="true" />
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={QUANTIDADE_MAXIMA_ITEM}
        step={1}
        required
        disabled={desabilitado}
        value={
          digitado?.base === quantidade
            ? digitado.texto
            : Number.isFinite(quantidade)
              ? quantidade
              : ""
        }
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const nova = e.target.valueAsNumber;
          const valida = quantidadeItemValida(nova);
          setDigitado({ texto: e.target.value, base: valida ? nova : quantidade });
          if (valida) alterar(nova);
        }}
        onBlur={(e) => {
          if (e.target.validity.valid) setDigitado(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.reportValidity();
          }
        }}
      />
      <button
        type="button"
        aria-label={`Aumentar quantidade de ${descricao}`}
        disabled={desabilitado || !valida || quantidade >= QUANTIDADE_MAXIMA_ITEM}
        onClick={() => ajustar(quantidade + 1)}
      >
        <Plus size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
