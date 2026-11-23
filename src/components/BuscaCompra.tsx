import { useId, useState } from "react";
type Opcao = { id: string; nome: string; detalhe?: string };
export function BuscaCompra({
  rotulo,
  valor,
  alterar,
  opcoes,
  selecionar,
  carregando,
  obrigatorio = false,
}: {
  rotulo: string;
  valor: string;
  alterar: (v: string) => void;
  opcoes: Opcao[];
  selecionar: (o: Opcao) => void;
  carregando: boolean;
  obrigatorio?: boolean;
}) {
  const id = useId(),
    [aberto, setAberto] = useState(false),
    [ativo, setAtivo] = useState(-1);
  function escolher(o: Opcao) {
    selecionar(o);
    setAberto(false);
    setAtivo(-1);
  }
  return (
    <div
      className="compra-busca-unica"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setAberto(false);
      }}
    >
      <label htmlFor={id}>{rotulo}</label>
      <input
        id={id}
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={aberto}
        aria-controls={`${id}-opcoes`}
        aria-activedescendant={
          aberto && ativo >= 0 && opcoes[ativo] ? `${id}-${ativo}` : undefined
        }
        value={valor}
        required={obrigatorio}
        placeholder="Digite para buscar e selecionar…"
        onFocus={() => setAberto(true)}
        onChange={(e) => {
          alterar(e.target.value);
          setAberto(true);
          setAtivo(-1);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAberto(true);
            setAtivo(Math.min(ativo + 1, opcoes.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setAtivo(Math.max(0, ativo - 1));
          }
          if (e.key === "Escape" && aberto) {
            e.stopPropagation();
            setAberto(false);
          }
          if (e.key === "Enter" && aberto) {
            e.preventDefault();
            const opcao =
              opcoes[ativo] ?? (opcoes.length === 1 ? opcoes[0] : undefined);
            if (!carregando && opcao) escolher(opcao);
          }
        }}
      />
      {aberto && (
        <div
          className="compra-busca-opcoes"
          id={`${id}-opcoes`}
          role="listbox"
          aria-label={rotulo}
        >
          {carregando ? (
            <p role="status">Buscando…</p>
          ) : !opcoes.length ? (
            <p>Nenhum resultado. Tente outro nome ou código.</p>
          ) : (
            opcoes.map((o, i) => (
              <button
                type="button"
                role="option"
                aria-selected={ativo === i}
                id={`${id}-${i}`}
                key={o.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher(o)}
              >
                <strong>{o.nome}</strong>
                {o.detalhe && <small>{o.detalhe}</small>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
