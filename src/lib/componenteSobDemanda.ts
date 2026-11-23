import { createElement, lazy, type ComponentType } from "react";
import { CarregamentoPagina } from "../components/CarregamentoPagina";

/** Adia módulos de abas/diálogos sem esconder a navegação nem remontar o formulário. */
export function componenteSobDemanda<P extends object>(
  carregar: () => Promise<{ default: ComponentType<P> }>,
) {
  const Componente = lazy(carregar);
  return function SobDemanda(props: P) {
    return createElement(CarregamentoPagina, {
      children: createElement(Componente as ComponentType<P>, props),
    });
  };
}
