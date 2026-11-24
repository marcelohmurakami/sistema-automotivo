import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { bloquearRolagem } from "../lib/bloqueioRolagem";

export function Dialogo({
  aberto,
  fechar,
  titulo,
  acoesCabecalho,
  complementoCabecalho,
  children,
  classe = "",
}: {
  aberto: boolean;
  fechar: () => void;
  titulo: string;
  acoesCabecalho?: ReactNode;
  complementoCabecalho?: ReactNode;
  children: ReactNode;
  classe?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [jaAberto, setJaAberto] = useState(aberto);
  // Memoriza a primeira abertura sem desmontar o formulário ao fechar.
  if (aberto && !jaAberto) setJaAberto(true);
  useEffect(() => {
    const dialogo = ref.current;
    if (aberto && !dialogo?.open) dialogo?.showModal();
    if (!aberto && dialogo?.open) dialogo.close();
    if (aberto) {
      const liberarRolagem = bloquearRolagem(document.body);
      return () => {
        liberarRolagem();
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
        e.stopPropagation();
        fechar();
      }}
    >
      {(aberto || jaAberto) && (
        <div className="dialogo-interior">
          <div className="dialogo-cabecalho">
            <h2>{titulo}</h2>
            {acoesCabecalho}
            <button
              type="button"
              className="botao-icone"
              aria-label="Fechar janela"
              onClick={fechar}
            >
              <X size={20} />
            </button>
            {complementoCabecalho && (
              <div className="dialogo-complemento-cabecalho">
                {complementoCabecalho}
              </div>
            )}
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
