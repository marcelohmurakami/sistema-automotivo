import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { filtrarAtalhos } from "../lib/atalhosOficina";
import { Dialogo } from "./Dialogo";
import "./AcessoRapido.css";
export function AcessoRapido() {
  const a = useAcesso(),
    navegar = useNavigate();
  const [aberto, setAberto] = useState(false),
    [busca, setBusca] = useState(""),
    [ativo, setAtivo] = useState(0);
  const input = useRef<HTMLInputElement>(null),
    lista = useRef<HTMLDivElement>(null);
  const gerente = a.oficina?.perfil === "owner" || a.oficina?.perfil === "manager";
  const opcoes = filtrarAtalhos(busca, a.permite, gerente);
  const escolhido = Math.min(ativo, Math.max(0, opcoes.length - 1));
  function ir(rota: string) {
    setAberto(false);
    navegar(rota);
  }
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && !e.altKey) {
        if (document.querySelector("dialog[open]")) return;
        e.preventDefault();
        setBusca("");
        setAtivo(0);
        setAberto(true);
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);
  useEffect(() => {
    if (aberto) input.current?.focus();
  }, [aberto]);
  useEffect(() => {
    lista.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [escolhido]);
  return (
    <>
      <Dialogo
        aberto={aberto}
        fechar={() => setAberto(false)}
        titulo="Acesso rápido"
        classe="dialogo-acesso-rapido"
      >
        <label className="acesso-campo">
          O que você quer fazer?
          <input
            ref={input}
            autoComplete="off"
            value={busca}
            placeholder="Ex.: nova OS, despesa, relatório…"
            role="combobox"
            aria-expanded="true"
            aria-controls="acesso-opcoes"
            aria-autocomplete="list"
            aria-activedescendant={
              opcoes.length ? `acesso-opcao-${escolhido}` : undefined
            }
            onChange={(e) => {
              setBusca(e.target.value);
              setAtivo(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setAtivo(
                  Math.max(
                    0,
                    Math.min(
                      opcoes.length - 1,
                      escolhido + (e.key === "ArrowDown" ? 1 : -1),
                    ),
                  ),
                );
              }
              if (e.key === "Enter" && opcoes[escolhido]) {
                e.preventDefault();
                ir(opcoes[escolhido].rota);
              }
            }}
          />
        </label>
        <div
          ref={lista}
          id="acesso-opcoes"
          role="listbox"
          aria-label="Ações e consultas"
          className="acesso-opcoes"
        >
          {opcoes.map((o, i) => (
            <button
              key={o.rota}
              id={`acesso-opcao-${i}`}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={i === escolhido}
              onClick={() => ir(o.rota)}
            >
              <span>{o.nome}</span>
              <ArrowUpRight size={16} />
            </button>
          ))}
          {!opcoes.length && <p>Nenhuma ação encontrada. Tente outra palavra.</p>}
        </div>
        <small className="acesso-ajuda">
          ↑ ↓ para escolher · Enter para abrir · Esc para fechar
        </small>
      </Dialogo>
    </>
  );
}
