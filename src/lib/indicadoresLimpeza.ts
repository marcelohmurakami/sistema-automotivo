import type { DetalhesAtendimento } from "../types/servicosCompletos";
import { aceiteServicoPendente, ehLimpeza } from "./aceiteServico.ts";
import { resultadoAtendimento } from "./calculosAtendimento.ts";
import type { CusteioRelatorio } from "../types/custeioRelatorio";

export function indicadoresLimpeza(
  detalhes: DetalhesAtendimento[],
  custeios?: Record<string, CusteioRelatorio>,
) {
  const concluidos = detalhes.filter(
    (d) => ehLimpeza(d.atendimento) && d.atendimento.situacao === "concluido",
  );
  const area = (d: DetalhesAtendimento) =>
    Number(d.atendimento.ficha_especialidade?.campos.area || 0);
  // Evita dividir áreas de serviços sem apontamentos pelas horas de outros serviços.
  const medidos = concluidos
    .map((d) => ({
      area: area(d),
      horas: custeios?.[d.atendimento.id]
        ? custeios[d.atendimento.id].minutos / 60
        : resultadoAtendimento(d).horas,
    }))
    .filter((d) => d.area > 0 && d.horas > 0);
  const horas = medidos.reduce((s, d) => s + d.horas, 0);
  return {
    area: concluidos.reduce((s, d) => s + area(d), 0),
    comArea: concluidos.filter((d) => area(d) > 0).length,
    produtividade: horas ? medidos.reduce((s, d) => s + d.area, 0) / horas : null,
    medidos: medidos.length,
    pendentes: concluidos.filter((d) => aceiteServicoPendente(d.atendimento)).length,
    ressalvas: concluidos.filter(
      (d) =>
        d.atendimento.ficha_especialidade?.campos.situacao_aceite ===
        "Aceito com ressalvas",
    ).length,
  };
}
