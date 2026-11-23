import { useState } from "react";
import { CamposFichaTecnica } from "./CamposFichaTecnica";
import { campoTecnicoVisivel } from "../lib/camposFicha";
import {
  gruposFichaEspecialidade,
  perfilAtendimento,
  type FichaEspecialidade,
} from "../lib/perfisAtendimento";
import "./FichaEspecialidade.css";

export function EditorFichaEspecialidade({
  valor,
  alterar,
  mostrarEtapa = false,
  mostrarChecklist = true,
  gruposRecolhiveis = false,
  ocultarCampos = [],
  etapasPermitidas,
  etapaBloqueada = false,
}: {
  valor: FichaEspecialidade;
  alterar: (f: FichaEspecialidade) => void;
  mostrarEtapa?: boolean;
  mostrarChecklist?: boolean;
  gruposRecolhiveis?: boolean;
  ocultarCampos?: string[];
  etapasPermitidas?: string[];
  etapaBloqueada?: boolean;
}) {
  const [carregado, setCarregado] = useState(false);
  const perfil = perfilAtendimento(valor.especialidade);
  const Grupo = gruposRecolhiveis ? "details" : "fieldset";
  const preenchidos = Object.values(valor.campos).filter((v) => v.trim()).length;
  return (
    <details
      className="os-detalhes ficha-especialidade"
      onToggle={(e) => {
        // Depois da primeira abertura, conserva os campos e seu estado ao recolher.
        if (e.currentTarget.open) setCarregado(true);
      }}
    >
      <summary>
        <span>Ficha técnica · {perfil.nome} (opcional)</span>
        {preenchidos > 0 && (
          <small>
            {preenchidos}{" "}
            {preenchidos === 1 ? "campo preenchido" : "campos preenchidos"}
          </small>
        )}
      </summary>
      {carregado && (
        <>
          <p className="texto-suave">{perfil.foco}</p>
          {mostrarEtapa && (
            <label>
              Etapa técnica
              <select
                value={valor.etapa}
                disabled={etapaBloqueada}
                onChange={(e) => alterar({ ...valor, etapa: e.target.value })}
              >
                <option value="">Selecione quando precisar</option>
                {(etapasPermitidas || perfil.etapas).map((etapa) => (
                  <option key={etapa}>{etapa}</option>
                ))}
              </select>
            </label>
          )}
          {perfil.grupos
            .filter((g) =>
              g.campos.some(
                (c) => !ocultarCampos.includes(c.id) && campoTecnicoVisivel(c, valor),
              ),
            )
            .map((grupo) => (
              <Grupo className="ficha-tecnica-grupo" key={grupo.nome}>
                {gruposRecolhiveis ? (
                  <summary>{grupo.nome}</summary>
                ) : (
                  <legend>{grupo.nome}</legend>
                )}
                <CamposFichaTecnica
                  campos={grupo.campos.filter((c) => !ocultarCampos.includes(c.id))}
                  valor={valor}
                  alterar={alterar}
                />
              </Grupo>
            ))}
          {mostrarChecklist && (
            <fieldset className="ficha-tecnica-grupo">
              <legend>
                Conferência · {Object.values(valor.checklist).filter(Boolean).length}/
                {perfil.checklist.length}
              </legend>
              <div className="ficha-tecnica-checks">
                {perfil.checklist.map((c) => (
                  <label key={c}>
                    <input
                      type="checkbox"
                      checked={valor.checklist[c] || false}
                      onChange={(e) =>
                        alterar({
                          ...valor,
                          checklist: { ...valor.checklist, [c]: e.target.checked },
                        })
                      }
                    />
                    <span>{c}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </>
      )}
    </details>
  );
}

export function ResumoFichaEspecialidade({
  ficha,
}: {
  ficha?: FichaEspecialidade | null;
}) {
  const grupos = gruposFichaEspecialidade(ficha);
  if (!grupos.length) return null;
  return (
    <section className="ficha-tecnica-resumo" aria-label="Ficha técnica do atendimento">
      {grupos.map((g) => (
        <div key={g.titulo}>
          <h3>{g.titulo}</h3>
          <dl>
            {g.campos.map((c) => (
              <div key={c.rotulo}>
                <dt>{c.rotulo}</dt>
                <dd>{c.valor}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </section>
  );
}
