import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

export function Dialogo({
  aberto,
  fechar,
  titulo,
  children,
  classe = "",
}: {
  aberto: boolean;
  fechar: () => void;
  titulo: string;
  children: ReactNode;
  classe?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialogo = ref.current;
    if (aberto && !dialogo?.open) dialogo?.showModal();
    if (!aberto && dialogo?.open) dialogo.close();
    if (aberto) {
      const anterior = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = anterior;
        dialogo?.close();
      };
    }
  }, [aberto]);
  return (
    <dialog
      ref={ref}
      className={`dialogo ${classe}`}
      aria-label={titulo}
      onCancel={(e) => {
        e.preventDefault();
        fechar();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) fechar();
      }}
    >
      <div className="dialogo-interior">
        <div className="dialogo-cabecalho">
          <h2>{titulo}</h2>
          <button
            className="botao-icone"
            aria-label="Fechar janela"
            onClick={fechar}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
