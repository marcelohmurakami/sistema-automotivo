import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

/** Mantém os campos montados para preservar preenchimento e validação do formulário. */
export function SecaoRecolhivel({
  titulo,
  descricao,
  children,
  aberta = false,
  classe = "",
  aoAlternar,
}: {
  titulo: string;
  descricao?: string;
  children: ReactNode;
  aberta?: boolean;
  classe?: string;
  aoAlternar?: (aberta: boolean) => void;
}) {
  return (
    <details
      className={`secao-recolhivel ${classe}`}
      open={aberta || undefined}
      onToggle={aoAlternar ? (e) => aoAlternar(e.currentTarget.open) : undefined}
      onInvalidCapture={(e) => {
        e.currentTarget.open = true;
      }}
    >
      <summary>
        <ChevronRight size={16} aria-hidden="true" />
        <span>
          <strong>{titulo}</strong>
          {descricao && <small>{descricao}</small>}
        </span>
      </summary>
      <div className="secao-recolhivel-conteudo">{children}</div>
    </details>
  );
}
