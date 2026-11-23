export const ramos = {
  automotivo: {
    nome: "Automotivo",
    objeto: "Veículo",
    plural: "Veículos",
    atendimento: "Ordem de serviço",
    equipe: "Profissional",
  },
  assistencia_tecnica: {
    nome: "Assistência técnica",
    objeto: "Equipamento",
    plural: "Equipamentos",
    atendimento: "Ordem de reparo",
    equipe: "Técnico",
  },
  manutencao_campo: {
    nome: "Manutenção de campo",
    objeto: "Local / equipamento",
    plural: "Locais e equipamentos",
    atendimento: "Visita técnica",
    equipe: "Técnico / equipe",
  },
  limpeza: {
    nome: "Limpeza",
    objeto: "Local",
    plural: "Locais de atendimento",
    atendimento: "Serviço de limpeza",
    equipe: "Equipe",
  },
} as const;
export type Ramo = keyof typeof ramos;
export function ramoValido(valor: unknown): valor is Ramo {
  return typeof valor === "string" && Object.hasOwn(ramos, valor);
}
