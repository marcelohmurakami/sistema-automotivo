import { useSyncExternalStore } from "react";

let agora = new Date();
const ouvintes = new Set<() => void>();

function atualizar() {
  if (document.visibilityState === "hidden") return;
  const instante = new Date();
  if (instante.getTime() === agora.getTime()) return;
  agora = instante;
  ouvintes.forEach((notificar) => notificar());
}

let intervalo: number | undefined;
function observar(notificar: () => void) {
  ouvintes.add(notificar);
  if (ouvintes.size === 1) {
    atualizar();
    intervalo = window.setInterval(atualizar, 30000);
    window.addEventListener("focus", atualizar);
    document.addEventListener("visibilitychange", atualizar);
  }
  return () => {
    ouvintes.delete(notificar);
    if (!ouvintes.size) {
      window.clearInterval(intervalo);
      intervalo = undefined;
      window.removeEventListener("focus", atualizar);
      document.removeEventListener("visibilitychange", atualizar);
    }
  };
}

const lerAgora = () => agora;

/** Atualiza prazos mesmo sem alterações no banco e ao voltar para a aba. */
export function useAgora() {
  return useSyncExternalStore(observar, lerAgora, lerAgora);
}
