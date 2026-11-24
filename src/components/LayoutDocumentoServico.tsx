import { useRef, type ReactNode } from "react";
import { CampoDesconto, type PreferenciaDescontoNota } from "./CampoDesconto";
import type { ControleDesconto } from "../lib/useDesconto";
import { dinheiro } from "../lib/formatacao";
import "./LayoutDocumentoServico.css";

export function OpcoesDocumento({
  children,
  desconto,
  ativo = true,
  nota,
}: {
  children: ReactNode;
  desconto?: ControleDesconto;
  ativo?: boolean;
  nota?: PreferenciaDescontoNota;
}) {
  const painel = useRef<HTMLDetailsElement>(null);
  if (!ativo) return <>{children}</>;
  return (
    <details
      className="documento-mais-opcoes"
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
      <div className="documento-mais-opcoes-conteudo">
        {desconto && <CampoDesconto controle={desconto} nota={nota} />}
        {children}
      </div>
    </details>
  );
}

export function ResumoDocumento({
  subtotal,
  desconto,
  contexto = "orçamento",
  acao,
}: {
  subtotal: number;
  desconto: number;
  contexto?: "orçamento" | "OS";
  acao?: ReactNode;
}) {
  return (
    <div
      className={`documento-fechamento${acao ? " documento-fechamento--com-acao" : ""}`}
    >
      {acao}
      <section
        className="documento-resumo-simples"
        aria-label={contexto === "OS" ? "Valores da OS" : "Valores do orçamento"}
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
        <div className="documento-resumo-total">
          <span>{contexto === "OS" ? "Total da OS" : "Total do orçamento"}</span>
          <strong>{dinheiro(Math.max(0, subtotal - desconto))}</strong>
        </div>
      </section>
    </div>
  );
}
