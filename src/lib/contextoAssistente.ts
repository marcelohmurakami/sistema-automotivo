import { useEffect, useSyncExternalStore } from "react";
import type { ContextoAssistente } from "./assistente";

const contextos = new Map<symbol, ContextoAssistente>();
const ouvintes = new Set<() => void>();
const vazio: ContextoAssistente = {};
let atual = vazio;
const notificar = () => {
  atual = [...contextos.values()].at(-1) || vazio;
  ouvintes.forEach((fn) => fn());
};
export function usePublicarContextoAssistente(contexto: ContextoAssistente) {
  const serializado = JSON.stringify(contexto);
  useEffect(() => {
    const chave = Symbol();
    contextos.set(chave, JSON.parse(serializado));
    notificar();
    return () => {
      contextos.delete(chave);
      notificar();
    };
  }, [serializado]);
}
export function useContextoAssistente() {
  return useSyncExternalStore(
    (fn) => {
      ouvintes.add(fn);
      return () => {
        ouvintes.delete(fn);
      };
    },
    () => atual,
    () => vazio,
  );
}
export function abrirAssistente(pedido = "", contexto?: ContextoAssistente) {
  window.dispatchEvent(
    new CustomEvent("patio:abrir-assistente", { detail: { pedido, contexto } }),
  );
}
