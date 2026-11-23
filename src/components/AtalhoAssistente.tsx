import { Sparkles } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { abrirAssistente } from "../lib/contextoAssistente";
import type { ContextoAssistente } from "../lib/assistente";
import "./AssistenteOperacional.css";
export function AssistenteContextual({ contexto }: { contexto: ContextoAssistente }) {
  const a = useAcesso();
  if (!a.permite("ai")) return null;
  return (
    <button
      type="button"
      className="botao-secundario assistente-contextual"
      aria-label="Assistente"
      title="Assistente"
      onClick={() => abrirAssistente("", contexto)}
    >
      <Sparkles size={16} /> <span>Assistente</span>
    </button>
  );
}
