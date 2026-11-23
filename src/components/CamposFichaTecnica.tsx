import { useId } from "react";
import type { CampoTecnico, FichaEspecialidade } from "../lib/perfisAtendimento";
import { campoTecnicoVisivel } from "../lib/camposFicha";

export function CamposFichaTecnica({
  campos,
  valor,
  alterar,
}: {
  campos: CampoTecnico[];
  valor: FichaEspecialidade;
  alterar: (ficha: FichaEspecialidade) => void;
}) {
  const id = useId();
  return (
    <div className="ficha-tecnica-campos">
      {campos
        .filter((c) => campoTecnicoVisivel(c, valor))
        .map((c) => {
          const campoId = `${id}-${c.id}`;
          const mudar = (texto: string) =>
            alterar({ ...valor, campos: { ...valor.campos, [c.id]: texto } });
          const props = {
            id: campoId,
            "aria-labelledby": `${campoId}-rotulo`,
            value: valor.campos[c.id] || "",
            "aria-describedby": c.ajuda ? `${campoId}-ajuda` : undefined,
          };
          return (
            <label
              key={c.id}
              htmlFor={campoId}
              className={c.tipo === "area" ? "ficha-tecnica-largo" : undefined}
            >
              <span id={`${campoId}-rotulo`}>
                {c.nome}
                {c.unidade ? ` (${c.unidade})` : ""}
              </span>
              {c.tipo === "area" ? (
                <textarea
                  {...props}
                  rows={2}
                  maxLength={1500}
                  onChange={(e) => mudar(e.target.value)}
                />
              ) : c.opcoes ? (
                <select {...props} onChange={(e) => mudar(e.target.value)}>
                  <option value="">Não informado</option>
                  {c.opcoes.map((o) => (
                    <option key={o} value={o}>
                      {c.rotulosOpcoes?.[o] || o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  {...props}
                  type={
                    c.tipo === "numero" ? "number" : c.tipo === "data" ? "date" : "text"
                  }
                  min={c.tipo === "numero" ? (c.minimo ?? 0) : undefined}
                  max={c.tipo === "numero" ? 999999999.999 : undefined}
                  step={c.tipo === "numero" ? (c.passo ?? 0.001) : undefined}
                  maxLength={1500}
                  onChange={(e) => mudar(e.target.value)}
                />
              )}
              {c.ajuda && <small id={`${campoId}-ajuda`}>{c.ajuda}</small>}
            </label>
          );
        })}
    </div>
  );
}
