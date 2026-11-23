import { Link, useLocation } from "react-router-dom";
import { useLembretesFinanceiros } from "./contextoLembretes";
export function FaixaLembretesFinanceiros() {
  const l = useLembretesFinanceiros(),
    local = useLocation();
  if (!l?.permitido || !l.dados) return null;
  const p = l.dados.preferencias;
  const entrada =
    local.pathname === "/" &&
    p.mostrar_entrada &&
    l.dados.total > 0 &&
    !(p.adiado_ate && Date.parse(p.adiado_ate) > l.agora.getTime());
  if (!entrada && !l.conferencia) return null;
  return (
    <section className="lembrete-faixa" aria-label="Lembretes financeiros">
      <div>
        <strong>
          {l.conferencia ? "Conferiu o dinheiro de hoje?" : "Contas para conferir"}
        </strong>
        <p>
          {l.conferencia
            ? "Entrou ou saiu algum dinheiro que você ainda não registrou?"
            : `${l.dados.receber} a receber · ${l.dados.pagar} a pagar. Vencidas ou com vencimento hoje.`}
        </p>
      </div>
      <div className="lembrete-acoes">
        {l.conferencia && (
          <>
            <Link className="botao-secundario" to="/financeiro?novo=receber">
              Recebi
            </Link>
            <Link className="botao-secundario" to="/financeiro?novo=pagar">
              Paguei
            </Link>
          </>
        )}
        {l.dados.total > 0 && (
          <button className="botao-secundario" onClick={() => l.abrir("pendencias")}>
            Conferir contas ({l.dados.total})
          </button>
        )}
        {l.conferencia && (
          <button
            className="botao-secundario"
            disabled={l.ocupado}
            onClick={l.conferir}
          >
            Já conferi hoje
          </button>
        )}
        <button className="botao-texto" onClick={() => l.adiar()}>
          Lembrar depois
        </button>
        <button className="botao-texto" onClick={() => l.abrir("configurar")}>
          Configurar lembretes
        </button>
      </div>
    </section>
  );
}
