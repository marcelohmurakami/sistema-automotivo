import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, ChevronDown } from "lucide-react";
import { buscarOpcoesRapidas } from "../lib/buscaSelecaoRapida";
import "./SelecaoRapida.css";
export type OpcaoRapida = {
  id: string;
  nome: string;
  detalhe?: string;
  busca?: string;
};
export function SelecaoRapida({
  rotulo,
  valor,
  opcoes,
  selecionar,
  obrigatorio = false,
  autoFocus = false,
  placeholder = "Digite para buscar…",
  aoBuscar,
  carregando = false,
  erro,
  aoAbrir,
  tentarNovamente,
}: {
  rotulo: string;
  valor: string;
  opcoes: OpcaoRapida[];
  selecionar: (id: string) => void;
  obrigatorio?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  aoBuscar?: (busca: string) => void;
  carregando?: boolean;
  erro?: string;
  aoAbrir?: () => void;
  tentarNovamente?: () => void;
}) {
  const id = useId(),
    input = useRef<HTMLInputElement>(null),
    lista = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false),
    [busca, setBusca] = useState(""),
    [ativo, setAtivo] = useState(0);
  const selecionada = useMemo(
    () => (valor ? opcoes.find((o) => o.id === valor) : undefined),
    [opcoes, valor],
  );
  const remota = !!aoBuscar;
  const resultados = useMemo(
    () => (aberto ? buscarOpcoesRapidas(opcoes, busca, remota) : []),
    [aberto, opcoes, busca, remota],
  );
  const indice = Math.min(ativo, Math.max(0, resultados.length - 1));
  useEffect(() => {
    input.current?.setCustomValidity(
      obrigatorio && !valor ? "Selecione uma opção da lista." : "",
    );
  }, [obrigatorio, valor]);
  useEffect(() => {
    if (aberto)
      lista.current
        ?.querySelector('[aria-selected="true"]')
        ?.scrollIntoView({ block: "nearest" });
  }, [indice, aberto]);
  function escolher(idOpcao: string) {
    selecionar(idOpcao);
    setAberto(false);
    setBusca("");
    aoBuscar?.("");
    setAtivo(0);
  }
  return (
    <div
      className="selecao-rapida"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setAberto(false);
      }}
    >
      <label htmlFor={id}>{rotulo}</label>
      <div className="selecao-rapida-campo">
        <Search size={16} aria-hidden="true" />
        <input
          id={id}
          ref={input}
          role="combobox"
          autoComplete="off"
          autoFocus={autoFocus}
          required={obrigatorio && !valor}
          aria-required={obrigatorio}
          aria-autocomplete="list"
          aria-expanded={aberto}
          aria-controls={`${id}-lista`}
          aria-activedescendant={
            aberto && !carregando && !erro && resultados.length
              ? `${id}-${indice}`
              : undefined
          }
          placeholder={selecionada?.nome || placeholder}
          value={aberto ? busca : selecionada?.nome || busca}
          onFocus={() => {
            setAberto(true);
            aoAbrir?.();
          }}
          onChange={(e) => {
            setBusca(e.target.value);
            aoBuscar?.(e.target.value);
            setAtivo(0);
            setAberto(true);
            if (valor) selecionar("");
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setAberto(true);
              setAtivo(
                Math.max(
                  0,
                  Math.min(
                    resultados.length - 1,
                    indice + (e.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
              );
            }
            if (e.key === "Enter" && aberto) {
              e.preventDefault();
              e.stopPropagation();
              if (!carregando && !erro && resultados[indice])
                escolher(resultados[indice].id);
            }
            if (e.key === "Escape" && aberto) {
              e.preventDefault();
              e.stopPropagation();
              setAberto(false);
            }
          }}
        />
        <ChevronDown size={15} aria-hidden="true" />
      </div>
      {aberto && (
        <div
          ref={lista}
          id={`${id}-lista`}
          role={carregando || erro ? undefined : "listbox"}
          aria-label={rotulo}
          className="selecao-rapida-opcoes"
        >
          {carregando ? (
            <p role="status">Buscando…</p>
          ) : erro ? (
            <>
              <p role="alert">{erro}</p>
              {tentarNovamente && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    input.current?.focus();
                    tentarNovamente();
                  }}
                >
                  Tentar novamente
                </button>
              )}
            </>
          ) : (
            resultados.map((o, i) => (
              <button
                type="button"
                role="option"
                tabIndex={-1}
                id={`${id}-${i}`}
                key={o.id}
                aria-selected={i === indice}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher(o.id)}
              >
                <strong>{o.nome}</strong>
                {o.detalhe && <small>{o.detalhe}</small>}
              </button>
            ))
          )}
          {!carregando && !erro && !resultados.length && (
            <p>Nenhum resultado. Confira o nome ou cadastre abaixo.</p>
          )}
        </div>
      )}
    </div>
  );
}
