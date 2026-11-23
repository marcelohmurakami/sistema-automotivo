import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import {
  indicadoresEspecialidade,
  type RegistroTecnico,
} from "../lib/indicadoresEspecialidade";
import "./FichaEspecialidade.css";

export function IndicadoresEspecialidade({
  registros,
  nota,
  destino,
}: {
  registros: RegistroTecnico[];
  nota: string;
  destino: "os" | "atendimentos";
}) {
  const resumo = useMemo(() => indicadoresEspecialidade(registros), [registros]);
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({});
  return (
    <details className="ficha-indicadores">
      <summary>
        <ClipboardCheck size={19} />
        <span>Conferências por especialidade</span>
        <small>
          {registros.length} {registros.length === 1 ? "atendimento" : "atendimentos"}
        </small>
      </summary>
      <div className="ficha-indicadores-conteudo">
        <p>{nota} Os indicadores mostram preenchimento e conferência registrados.</p>
        {!!resumo.semFicha && (
          <p className="ficha-indicadores-pendente">
            {resumo.semFicha} sem ficha técnica preenchida.
          </p>
        )}
        {!resumo.grupos.length && (
          <p>
            Preencha a ficha técnica de um atendimento para acompanhar suas conferências
            aqui.
          </p>
        )}
        {resumo.grupos.map((g) => (
          <article key={g.perfil.id}>
            <h3>{g.perfil.nome}</h3>
            <div className="ficha-indicadores-medidas">
              <div>
                <strong>
                  {g.completos}
                  <small> / {g.total}</small>
                </strong>
                <span>{g.perfil.indicador.nome}</span>
                <progress
                  value={g.completos}
                  max={g.total}
                  aria-label={g.perfil.indicador.nome}
                />
              </div>
              <div>
                <strong>
                  {g.conferidos}
                  <small> / {g.total}</small>
                </strong>
                <span>Checklist totalmente conferido</span>
                <progress
                  value={g.conferidos}
                  max={g.total}
                  aria-label={`Checklists conferidos de ${g.perfil.nome}`}
                />
              </div>
            </div>
            {!!g.pendentes.length && (
              <details>
                <summary>Ver {g.pendentes.length} com registros pendentes</summary>
                <ul>
                  {(expandidos[g.perfil.id]
                    ? g.pendentes
                    : g.pendentes.slice(0, 20)
                  ).map((r) => (
                    <li key={r.id}>
                      <Link
                        to={
                          destino === "os"
                            ? `/ordens-servico?os=${encodeURIComponent(r.id)}`
                            : `/atendimentos?atendimento=${encodeURIComponent(r.id)}`
                        }
                      >
                        {r.nome}
                      </Link>
                      <small>Falta registrar: {r.faltam.join(" · ")}</small>
                    </li>
                  ))}
                </ul>
                {g.pendentes.length > 20 && (
                  <button
                    type="button"
                    className="botao-secundario"
                    onClick={() =>
                      setExpandidos({
                        ...expandidos,
                        [g.perfil.id]: !expandidos[g.perfil.id],
                      })
                    }
                  >
                    {expandidos[g.perfil.id]
                      ? "Mostrar menos"
                      : `Mostrar todos (${g.pendentes.length})`}
                  </button>
                )}
              </details>
            )}
          </article>
        ))}
      </div>
    </details>
  );
}
