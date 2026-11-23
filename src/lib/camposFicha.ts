import type { CampoTecnico, FichaEspecialidade } from "./perfisAtendimento.ts";

/** Nunca apaga nem esconde valores históricos ao trocar categoria ou modalidade. */
export function campoTecnicoVisivel(campo: CampoTecnico, ficha: FichaEspecialidade) {
  return (
    !campo.quando ||
    !!ficha.campos[campo.id]?.trim() ||
    campo.quando.valores.includes(ficha.campos[campo.quando.campo] || "")
  );
}
