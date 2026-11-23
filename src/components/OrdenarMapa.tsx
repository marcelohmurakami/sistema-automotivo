import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ArrowDownUp, Check } from "lucide-react";
import { opcoesOrdenacaoMapa, type OrdenacaoMapa } from "../lib/ordenacaoMapa";
import "./OrdenarMapa.css";

export function OrdenarMapa({
  secao,
  valor,
  mudar,
}: {
  secao: string;
  valor: OrdenacaoMapa;
  mudar: (ordem: OrdenacaoMapa) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  const gatilho = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const selecionado = opcoesOrdenacaoMapa.find((o) => o.valor === valor)?.rotulo;

  const posicionar = useCallback(() => {
    if (!menu.current || !gatilho.current) return;
    const ancora = gatilho.current.getBoundingClientRect();
    const painel = menu.current;
    const largura = document.documentElement.clientWidth;
    const altura = window.innerHeight;
    if (ancora.bottom < 0 || ancora.top > altura) {
      setAberto(false);
      return;
    }
    painel.style.left = `${Math.max(8, Math.min(ancora.right - painel.offsetWidth, largura - painel.offsetWidth - 8))}px`;
    painel.style.top = `${
      ancora.bottom + 6 + painel.offsetHeight <= altura - 8
        ? ancora.bottom + 6
        : Math.max(8, ancora.top - painel.offsetHeight - 6)
    }px`;
  }, []);

  useLayoutEffect(() => {
    if (!aberto) return;
    posicionar();
    menu.current
      ?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
      ?.focus({ preventScroll: true });
  }, [aberto, posicionar]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (evento: PointerEvent) => {
      const alvo = evento.target as Node;
      if (!menu.current?.contains(alvo) && !gatilho.current?.contains(alvo))
        setAberto(false);
    };
    const escapar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        setAberto(false);
        gatilho.current?.focus({ preventScroll: true });
      }
    };
    let quadro = 0;
    const acompanharRolagem = (evento: Event) => {
      if (evento.target instanceof Node && menu.current?.contains(evento.target))
        return;
      // O foco/rolagem residual do toque não deve fechar o menu recém-aberto.
      // Reposiciona uma vez por quadro enquanto o botão continua na tela.
      if (!quadro)
        quadro = requestAnimationFrame(() => {
          quadro = 0;
          posicionar();
        });
    };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", escapar);
    window.addEventListener("resize", acompanharRolagem);
    window.addEventListener("scroll", acompanharRolagem, true);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", escapar);
      window.removeEventListener("resize", acompanharRolagem);
      window.removeEventListener("scroll", acompanharRolagem, true);
      cancelAnimationFrame(quadro);
    };
  }, [aberto, posicionar]);

  return (
    <>
      <button
        ref={gatilho}
        type="button"
        className="mapa-ordenacao"
        title={`Ordenar ${secao}: ${selecionado}`}
        aria-label={`Ordenar ${secao}`}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? id : undefined}
        onClick={() => setAberto(!aberto)}
        onKeyDown={(evento) => {
          if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
            evento.preventDefault();
            setAberto(true);
          }
        }}
      >
        <ArrowDownUp size={15} aria-hidden="true" />
        <span className="mapa-ordenacao-texto" aria-hidden="true">
          Ordenar
        </span>
      </button>
      {aberto &&
        createPortal(
          <div
            ref={menu}
            id={id}
            className="menu-ordenacao-mapa"
            role="menu"
            aria-label={`Ordenar ${secao}`}
            onBlur={(evento) => {
              if (
                !evento.currentTarget.contains(evento.relatedTarget) &&
                evento.relatedTarget !== gatilho.current
              )
                setAberto(false);
            }}
            onKeyDown={(evento) => {
              if (evento.key === "Tab") {
                setAberto(false);
                gatilho.current?.focus({ preventScroll: true });
                return;
              }
              const botoes = Array.from(
                evento.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
              );
              const atual = botoes.indexOf(document.activeElement as HTMLButtonElement);
              const destino =
                evento.key === "ArrowDown"
                  ? (atual + 1) % botoes.length
                  : evento.key === "ArrowUp"
                    ? (atual - 1 + botoes.length) % botoes.length
                    : evento.key === "Home"
                      ? 0
                      : evento.key === "End"
                        ? botoes.length - 1
                        : null;
              if (destino !== null) {
                evento.preventDefault();
                botoes[destino]?.focus();
              }
            }}
          >
            {opcoesOrdenacaoMapa.map((opcao) => (
              <button
                key={opcao.valor}
                type="button"
                role="menuitemradio"
                aria-checked={opcao.valor === valor}
                tabIndex={-1}
                onClick={() => {
                  mudar(opcao.valor);
                  setAberto(false);
                  gatilho.current?.focus({ preventScroll: true });
                }}
              >
                <span>{opcao.rotulo}</span>
                {opcao.valor === valor && <Check size={16} aria-hidden="true" />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
