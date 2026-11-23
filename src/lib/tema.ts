import { useSyncExternalStore } from "react";
export type Tema = "claro" | "escuro" | "sistema";
const chave = "patio_tema";
let temaSemArmazenamento: Tema | undefined;
function ler(): Tema {
  if (temaSemArmazenamento) return temaSemArmazenamento;
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
    temaSemArmazenamento = undefined;
  } catch {
    temaSemArmazenamento = t;
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
window.addEventListener("storage", (evento) => {
  if (evento.key !== null && evento.key !== chave) return;
  temaSemArmazenamento = undefined;
  aplicarTema();
});
aplicarTema();
export function useTema() {
  return useSyncExternalStore(assinar, ler, () => "sistema" as Tema);
}
