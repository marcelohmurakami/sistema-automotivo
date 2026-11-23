import { Plus, Repeat2 } from "lucide-react";
import "./AgendamentoRecorrente.css";

export function AcoesAgendamento({
  novo,
  recorrente,
}: {
  novo: () => void;
  recorrente?: () => void;
}) {
  return (
    <div className="agenda-acoes-criacao">
      <button type="button" className="botao-primario" onClick={novo}>
        <Plus size={18} aria-hidden="true" />
        Novo agendamento
      </button>
      {recorrente && (
        <button type="button" className="botao-secundario" onClick={recorrente}>
          <Repeat2 size={18} aria-hidden="true" />
          Agendamento recorrente
        </button>
      )}
    </div>
  );
}
