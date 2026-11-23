import { RefreshCw, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { AtalhoLocalizacao } from "./AtalhoLocalizacao";
import { AtalhoExecucaoOffline } from "./AtalhoExecucaoOffline";
import "./FerramentasAtendimento.css";

/** Ações auxiliares não disputam espaço com identificação e impressão. */
export function FerramentasAtendimento({
  tipo,
  id,
  atualizar,
}: {
  tipo: "os" | "atendimento";
  id: string;
  atualizar?: () => void;
}) {
  return (
    <details className="ferramentas-atendimento">
      <summary>
        {tipo === "os" ? "Mais ações da OS" : "Mais ações do atendimento"}
      </summary>
      <div className="ferramentas-atendimento-acoes">
        <Link
          className="botao-secundario"
          to={`/laudos?tipo=${tipo}&origem=${id}&novo=1`}
        >
          <FileText size={16} /> Criar laudo técnico
        </Link>
        <Link className="botao-secundario" to={`/laudos?tipo=${tipo}&origem=${id}`}>
          Ver laudos
        </Link>
        <AtalhoLocalizacao tipo={tipo} id={id} />
        <AtalhoExecucaoOffline documento={id} />
        {atualizar && (
          <button type="button" className="botao-secundario" onClick={atualizar}>
            <RefreshCw size={16} aria-hidden="true" /> Atualizar OS
          </button>
        )}
      </div>
    </details>
  );
}
