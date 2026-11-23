import { lazy, Suspense, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { abrirAssistente } from "../lib/contextoAssistente";
import type { ContextoAssistente } from "../lib/assistente";
import "./AssistenteOperacional.css";

export type SolicitacaoAssistente = { pedido?: string; contexto?: ContextoAssistente };
const Assistente = lazy(() =>
  import("./AssistenteOperacional").then((m) => ({ default: m.AssistenteOperacional })),
);

/** O acesso permanece imediato; conversa, áudio e consultas só carregam ao abrir. */
export function AcessoAssistente() {
  const [solicitacao, setSolicitacao] = useState<SolicitacaoAssistente | null>(null);
  useEffect(() => {
    const abrir = (e: Event) =>
      setSolicitacao({ ...((e as CustomEvent<SolicitacaoAssistente>).detail || {}) });
    window.addEventListener("patio:abrir-assistente", abrir);
    return () => window.removeEventListener("patio:abrir-assistente", abrir);
  }, []);
  const botao = (
    <button
      className="assistente-flutuante"
      onClick={() => abrirAssistente()}
      disabled={!!solicitacao}
      aria-label="Abrir assistente por voz ou texto"
    >
      <Sparkles size={20} />
      <span>{solicitacao ? "Carregando…" : "Assistente"}</span>
    </button>
  );
  return solicitacao ? (
    <Suspense fallback={botao}>
      <Assistente solicitacao={solicitacao} />
    </Suspense>
  ) : (
    botao
  );
}
