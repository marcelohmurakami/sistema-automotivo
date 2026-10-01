import { useSyncExternalStore } from "react";
export type Tema = "claro" | "escuro" | "sistema";
const chave = "patio_tema";
function ler(): Tema {
  try {
    const t = localStorage.getItem(chave);
    return t === "claro" || t === "escuro" ? t : "sistema";
  } catch {
    return "sistema";
  }
}
const preferencia = window.matchMedia("(prefers-color-scheme: dark)");
export function aplicarTema() {
  const t = ler();
  document.documentElement.dataset.tema =
    t === "sistema" ? (preferencia.matches ? "escuro" : "claro") : t;
}
export function definirTema(t: Tema) {
  try {
    localStorage.setItem(chave, t);
  } catch {
    /* Aparência ainda pode ser usada sem armazenamento. */
  }
  document.documentElement.dataset.tema =
    t === "sistema" ? (preferencia.matches ? "escuro" : "claro") : t;
  window.dispatchEvent(new Event("tema-alterado"));
}
function assinar(fn: () => void) {
  window.addEventListener("tema-alterado", fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener("tema-alterado", fn);
    window.removeEventListener("storage", fn);
  };
}
preferencia.addEventListener("change", aplicarTema);
window.addEventListener("storage", aplicarTema);
aplicarTema();
export function useTema() {
  return useSyncExternalStore(assinar, ler, () => "sistema" as Tema);
}
