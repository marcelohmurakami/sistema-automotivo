import {
  perfilAtendimento,
  temFichaEspecialidade,
  type FichaEspecialidade,
} from "./perfisAtendimento.ts";

export type RegistroTecnico = {
  id: string;
  nome: string;
  ficha?: FichaEspecialidade | null;
};

/** Cobertura dos registros, não uma avaliação automática da qualidade do reparo. */
export function indicadoresEspecialidade(registros: RegistroTecnico[]) {
  const grupos = new Map<string, RegistroTecnico[]>();
  for (const r of registros) {
    if (!r.ficha) continue;
    const id = r.ficha.especialidade;
    const itens = grupos.get(id);
    if (itens) itens.push(r);
    else grupos.set(id, [r]);
  }
  return {
    semFicha: registros.filter((r) => !temFichaEspecialidade(r.ficha)).length,
    grupos: [...grupos].map(([id, itens]) => {
      const perfil = perfilAtendimento(id);
      const completos = itens.filter((r) =>
        perfil.indicador.campos.every((c) => r.ficha!.campos[c]?.trim()),
      );
      const completosSet = new Set(completos);
      const conferidos = itens.filter((r) =>
        perfil.checklist.every((c) => r.ficha!.checklist[c] === true),
      );
      return {
        perfil,
        total: itens.length,
        completos: completos.length,
        conferidos: conferidos.length,
        pendentes: itens
          .filter((r) => !completosSet.has(r))
          .map((r) => ({
            id: r.id,
            nome: r.nome,
            faltam: perfil.grupos
              .flatMap((g) => g.campos)
              .filter(
                (c) =>
                  perfil.indicador.campos.includes(c.id) &&
                  !r.ficha!.campos[c.id]?.trim(),
              )
              .map((c) => c.nome),
          })),
      };
    }),
  };
}
