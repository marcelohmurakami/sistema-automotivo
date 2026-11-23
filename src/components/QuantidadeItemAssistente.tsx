import { Minus, Plus, RotateCcw, Trash2 } from "lucide-react";

export function QuantidadeItemAssistente({
  nome,
  valor,
  original,
  bloqueado,
  alterar,
}: {
  nome: string;
  valor: string | null;
  original: number;
  bloqueado: boolean;
  alterar: (valor: string | null) => void;
}) {
  const quantidade = Number(valor),
    valido =
      valor !== null && /^\d+$/.test(valor) && quantidade >= 1 && quantidade <= 10000;
  return (
    <div className="assistente-quantidade">
      {valor === null ? (
        <>
          <small>Será removido</small>
          <button
            type="button"
            disabled={bloqueado}
            onClick={() => alterar(String(original))}
            aria-label={`Manter ${nome}`}
          >
            <RotateCcw size={15} /> Desfazer
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            disabled={bloqueado || !valido || quantidade <= 1}
            onClick={() => alterar(String(quantidade - 1))}
            aria-label={`Diminuir quantidade de ${nome}`}
          >
            <Minus size={15} />
          </button>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label={`Quantidade de ${nome}`}
            aria-invalid={!valido}
            value={valor}
            disabled={bloqueado}
            onFocus={(e) => e.target.select()}
            onChange={(e) => alterar(e.target.value)}
          />
          <button
            type="button"
            disabled={bloqueado || !valido || quantidade >= 10000}
            onClick={() => alterar(String(quantidade + 1))}
            aria-label={`Aumentar quantidade de ${nome}`}
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            disabled={bloqueado}
            onClick={() => alterar(null)}
            aria-label={`Remover ${nome}`}
          >
            <Trash2 size={15} />
          </button>
        </>
      )}
    </div>
  );
}
