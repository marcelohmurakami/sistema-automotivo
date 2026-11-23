import type { ReactNode } from "react";
import "./AjudaContextual.css";

/** Explicações secundárias; avisos de erro e consequências da ação ficam fora. */
export function AjudaContextual({
  titulo = "Como funciona",
  children,
}: {
  titulo?: string;
  children: ReactNode;
}) {
  return (
    <details className="ajuda-contextual">
      <summary>{titulo}</summary>
      <div className="ajuda-contextual-conteudo">{children}</div>
    </details>
  );
}
