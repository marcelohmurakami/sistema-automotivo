import { useRef, type ReactNode } from "react";
import { CampoDesconto } from "../CampoDesconto";
import type { ControleDesconto } from "../../lib/useDesconto";
import { dinheiro } from "../../lib/formatacao";
import "./LayoutOrcamento.css";

export function OpcoesOrcamento({
  children,
  desconto,
  ativo = true,
}: {
  children: ReactNode;
  desconto?: ControleDesconto;
  ativo?: boolean;
}) {
  const painel = useRef<HTMLDetailsElement>(null);
  if (!ativo) return <>{children}</>;
  return (
    <details
      className="orcamento-mais-opcoes"
      ref={painel}
      onInvalidCapture={(event) => {
        let elemento = (event.target as HTMLElement).parentElement;
        while (elemento && painel.current?.contains(elemento)) {
          if (elemento instanceof HTMLDetailsElement) elemento.open = true;
          elemento = elemento.parentElement;
        }
      }}
    >
      <summary>
        <strong>Mais opções</strong>
        <span>Desconto, pagamento e detalhes</span>
      </summary>
      <div className="orcamento-mais-opcoes-conteudo">
        {desconto && <CampoDesconto controle={desconto} />}
        {children}
      </div>
    </details>
  );
}

export function ResumoOrcamento({
  subtotal,
  desconto,
}: {
  subtotal: number;
  desconto: number;
}) {
  return (
    <section
      className="orcamento-resumo-simples"
      aria-label="Valores do orçamento"
      aria-live="polite"
    >
      {desconto > 0 && (
        <>
          <div>
            <span>Subtotal</span>
            <strong>{dinheiro(subtotal)}</strong>
          </div>
          <div>
            <span>Desconto</span>
            <strong>− {dinheiro(desconto)}</strong>
          </div>
        </>
      )}
      <div className="orcamento-resumo-total">
        <span>Total do orçamento</span>
        <strong>{dinheiro(Math.max(0, subtotal - desconto))}</strong>
      </div>
    </section>
  );
}
