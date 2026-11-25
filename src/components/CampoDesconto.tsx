import { useEffect, useId, useRef, useState } from "react";
import { dinheiro } from "../lib/formatacao";
import { lerEntradaDesconto, validarEntradaDesconto } from "../lib/entradaDesconto";
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
  const id = `desconto-${useId()}`;
  const percentual = controle.estado.tipo === "percentual";
  const input = useRef<HTMLInputElement>(null);
  const { tipo, valor } = controle.estado;
  const [digitacao, setDigitacao] = useState(() => ({
    tipo,
    valor,
    texto: String(valor).replace(".", ","),
  }));
  let texto = digitacao.texto;
  // Conserva a vírgula e os zeros enquanto a pessoa digita. Sincroniza somente
  // quando a unidade ou o valor muda por uma ação externa, como reabrir a tela.
  if (digitacao.tipo !== tipo || digitacao.valor !== valor) {
    texto = String(valor).replace(".", ",");
    setDigitacao({ tipo, valor, texto });
  }
  const erroEntrada = validarEntradaDesconto(
    texto,
    percentual ? 100 : controle.subtotal / 100,
  );
  useEffect(() => {
    input.current?.setCustomValidity(erroEntrada);
  }, [erroEntrada]);
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
        ref={input}
        id={id}
        name="desconto"
        aria-label={percentual ? "Desconto (%)" : "Desconto (R$)"}
        aria-describedby={`${id}-ajuda`}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        aria-invalid={!!erroEntrada}
        value={texto}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const texto = e.currentTarget.value;
          const valor = lerEntradaDesconto(texto) ?? "";
          setDigitacao({ tipo, valor, texto });
          controle.alterarValor(valor);
        }}
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
