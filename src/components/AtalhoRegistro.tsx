import type { ReactNode } from "react";
import "./AtalhoRegistro.css";

/** Atalhos irmãos do botão de consulta: nunca há botões dentro de botões. */
export function AtalhoRegistro({
  nome,
  alterar,
  children,
  classe = "",
  desabilitado = false,
}: {
  nome: string;
  alterar?: () => void;
  children: ReactNode;
  classe?: string;
  desabilitado?: boolean;
}) {
  return alterar ? (
    <button
      type="button"
      className={`atalho-registro ${classe}`}
      title={nome}
      aria-label={nome}
      disabled={desabilitado}
      onClick={alterar}
    >
      {children}
    </button>
  ) : (
    <span className={`atalho-registro-estatico ${classe}`}>{children}</span>
  );
}
