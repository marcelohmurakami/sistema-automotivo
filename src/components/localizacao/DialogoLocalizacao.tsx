import type { ComponentProps } from "react";
import { createPortal } from "react-dom";
import { Dialogo } from "../Dialogo";

/** Formulários de locais/leitura não submetem o atendimento que abriu o painel. */
export function DialogoLocalizacao(props: ComponentProps<typeof Dialogo>) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div onSubmit={(e) => e.stopPropagation()}>
      <Dialogo {...props} />
    </div>,
    document.body,
  );
}
