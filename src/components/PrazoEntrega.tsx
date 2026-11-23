import { useId, useRef, useState } from "react";
import { CalendarClock, CircleCheck, Clock3, TriangleAlert } from "lucide-react";
import {
  classificarEntrega,
  entregaDoCampo,
  entregaParaCampo,
  type PrazoEntrega,
} from "../lib/entregaPrometida";
import { useAgora } from "../lib/useAgora";
import "./PrazoEntrega.css";

export function IndicadorEntrega({ prazo }: { prazo: PrazoEntrega }) {
  const Icone = prazo.atrasada
    ? TriangleAlert
    : prazo.tipo === "no-prazo" || prazo.tipo === "encerrada"
      ? CircleCheck
      : Clock3;
  return (
    <span className="entrega-indicador" data-prazo={prazo.tipo} title={prazo.aviso}>
      <Icone size={16} aria-hidden="true" />
      <span className="entrega-texto">
        <strong>{prazo.rotulo}</strong>
        <span>{prazo.data}</span>
      </span>
    </span>
  );
}

export function LegendaEntrega() {
  return (
    <details className="legenda-recolhida">
      <summary>Entenda as cores dos prazos</summary>
      <div className="entrega-legenda" aria-label="Cores da entrega prometida">
        <span data-prazo="atrasada">Prazo vencido</span>
        <span data-prazo="hoje">Entrega hoje</span>
        <span data-prazo="no-prazo">Dentro do prazo</span>
        <span data-prazo="sem-data">Sem data</span>
      </div>
    </details>
  );
}

export function CampoEntregaPrometida({
  inicial,
  situacao = "open",
  alterar,
}: {
  inicial?: string | null;
  situacao?: string;
  alterar?: (iso: string | null) => void;
}) {
  const [valor, setValor] = useState(() => entregaParaCampo(inicial));
  const id = useId();
  const campo = useRef<HTMLInputElement>(null);
  const agora = useAgora();
  let iso: string | null = null;
  let erro = "";
  try {
    iso = entregaDoCampo(valor);
  } catch (e) {
    erro = (e as Error).message;
  }
  const prazo = classificarEntrega(iso, situacao, agora);
  return (
    <div className="entrega-campo">
      <label htmlFor={id}>
        <CalendarClock size={18} aria-hidden="true" /> Entrega prometida ao cliente
        (opcional)
      </label>
      <input
        ref={campo}
        id={id}
        name="entrega_prevista_em"
        type="datetime-local"
        value={valor}
        step="60"
        min="1000-01-01T00:00"
        max="9999-12-31T23:59"
        aria-describedby={id + "-ajuda"}
        aria-invalid={!!erro}
        onChange={(e) => {
          setValor(e.target.value);
          try {
            const entrega = entregaDoCampo(e.target.value);
            e.target.setCustomValidity("");
            alterar?.(entrega);
          } catch (erro) {
            e.target.setCustomValidity((erro as Error).message);
          }
        }}
      />
      <small id={id + "-ajuda"}>
        Opcional · Horário de São Paulo. Aparece no mapa e na lista de OS.
      </small>
      {valor && !erro && (
        <p className="entrega-previa" data-prazo={prazo.tipo}>
          {prazo.rotulo} · {prazo.data}
        </p>
      )}
      {erro && (
        <p className="erro-formulario" role="alert">
          {erro}
        </p>
      )}
      {valor && (
        <button
          type="button"
          className="entrega-limpar"
          onClick={() => {
            setValor("");
            alterar?.(null);
            campo.current?.setCustomValidity("");
          }}
        >
          Deixar sem data definida
        </button>
      )}
    </div>
  );
}
