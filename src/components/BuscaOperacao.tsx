import { Search, X } from "lucide-react";
import { useRef } from "react";
import "./BuscaOperacao.css";

export function BuscaOperacao({
  valor,
  alterar,
  rotulo,
  exemplo,
}: {
  valor: string;
  alterar: (valor: string) => void;
  rotulo: string;
  exemplo: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="busca-operacao" role="search" aria-label={rotulo}>
      <Search size={18} aria-hidden="true" />
      <input
        ref={input}
        type="search"
        autoComplete="off"
        aria-label={rotulo}
        placeholder={exemplo}
        value={valor}
        onChange={(e) => alterar(e.target.value)}
      />
      {valor && (
        <button
          type="button"
          aria-label="Limpar busca"
          onClick={() => {
            alterar("");
            input.current?.focus();
          }}
        >
          <X size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
