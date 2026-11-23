import { Suspense, useDeferredValue, type ReactNode } from "react";

/** Mantém a indicação inicial enquanto o código da página é preparado em segundo plano. */
export function CarregamentoPagina({ children }: { children: ReactNode }) {
  // Um fallback novo do Suspense pode adiar o commit e as consultas da página.
  // Primeiro confirmamos a indicação de carregamento; a renderização adiada pode
  // aguardar o módulo sem trocar de fallback. Não adia dados nem regras de acesso.
  const preparar = useDeferredValue(true, false);
  const carregando = (
    <p className="estado-lista" role="status">
      Carregando…
    </p>
  );
  return <Suspense fallback={carregando}>{preparar ? children : carregando}</Suspense>;
}
