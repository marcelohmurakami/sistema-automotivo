import type { Ramo } from "./ramos";

// IDs persistidos: renomear a apresentação sem mudar as chaves já cadastradas.
export const tiposServico = {
  motor: ["Motor completo", "motor"],
  cabecote: ["Cabeçote", "cabecote"],
  virabrequim: ["Virabrequim", "virabrequim"],
  pistao: ["Pistão e biela", "pistao"],
  bloco: ["Bloco do motor", "bloco"],
  injecao: ["Injeção eletrônica", "circuito"],
  revisao: ["Revisão preventiva", "check"],
  cambio: ["Câmbio e embreagem", "engrenagem"],
  freios: ["Freios", "disco"],
  suspensao: ["Suspensão e direção", "suspensao"],
  eletrica: ["Elétrica e diagnóstico", "raio"],
  bateria: ["Bateria e partida", "bateria"],
  iluminacao: ["Iluminação", "lampada"],
  pneus: ["Pneus e reparos", "pneu"],
  alinhamento: ["Alinhamento e balanceamento", "alvo"],
  oleo: ["Óleo e filtros", "gota"],
  lavagem: ["Lavagem", "agua"],
  polimento: ["Polimento e proteção", "brilho"],
  higienizacao: ["Higienização", "spray"],
  acessorios: ["Instalação de acessórios", "plugue"],
  funilaria: ["Funilaria", "martelo"],
  pintura: ["Pintura", "pincel"],
  celular: ["Celular e tablet", "celular"],
  computador: ["Computador e notebook", "computador"],
  eletrodomestico: ["Eletrodoméstico", "geladeira"],
  placa: ["Reparo de placa", "circuito"],
  software: ["Software e configuração", "codigo"],
  climatizacao: ["Ar-condicionado", "frio"],
  hidraulica: ["Hidráulica", "agua"],
  instalacao: ["Instalação", "ferramenta"],
  preventiva: ["Manutenção preventiva", "check"],
  corretiva: ["Manutenção corretiva", "engrenagem"],
  residencial: ["Limpeza residencial", "casa"],
  comercial: ["Limpeza comercial", "predio"],
  pos_obra: ["Limpeza pós-obra", "capacete"],
  estofados: ["Estofados e tapetes", "sofa"],
  vidros: ["Vidros e fachadas", "janela"],
  outros: ["Outros serviços", "ferramenta"],
} as const;
export type TipoServico = keyof typeof tiposServico;
type Especialidade = {
  nome: string;
  ramo: Ramo;
  tipos: TipoServico[];
  orientacao: string;
};
export const especialidades: Record<string, Especialidade> = {
  mecanica: {
    nome: "Oficina mecânica",
    ramo: "automotivo",
    tipos: [
      "motor",
      "injecao",
      "revisao",
      "cambio",
      "cabecote",
      "freios",
      "suspensao",
      "oleo",
    ],
    orientacao:
      "Registre o sintoma, a quilometragem e os testes de diagnóstico e de entrega.",
  },
  retifica: {
    nome: "Retífica",
    ramo: "automotivo",
    tipos: ["motor", "cabecote", "virabrequim", "pistao", "bloco"],
    orientacao:
      "Identifique o motor ou a peça, a numeração, as medidas de entrada e finais, as usinagens e os testes realizados.",
  },
  autoeletrica: {
    nome: "Autoelétrica",
    ramo: "automotivo",
    tipos: ["eletrica", "bateria", "injecao", "iluminacao"],
    orientacao:
      "Registre tensão, códigos de falha, componentes e testes elétricos antes e depois do reparo.",
  },
  autocenter: {
    nome: "Centro automotivo / autocenter",
    ramo: "automotivo",
    tipos: [
      "revisao",
      "pneus",
      "alinhamento",
      "freios",
      "suspensao",
      "oleo",
      "motor",
      "cambio",
    ],
    orientacao:
      "Registre o checklist de revisão, as medições e os itens aprovados pelo cliente.",
  },
  borracharia: {
    nome: "Borracharia",
    ramo: "automotivo",
    tipos: ["pneus", "alinhamento"],
    orientacao:
      "Informe medida, posição e condição do pneu, reparo e calibragem final.",
  },
  estetica: {
    nome: "Estética automotiva",
    ramo: "automotivo",
    tipos: ["polimento", "higienizacao", "lavagem", "pintura"],
    orientacao:
      "Registre condição da pintura, superfícies, produtos aplicados e cuidados após o serviço.",
  },
  lava_rapido: {
    nome: "Lava-rápido",
    ramo: "automotivo",
    tipos: ["lavagem", "higienizacao", "polimento"],
    orientacao:
      "Defina o pacote, áreas internas e externas, avarias existentes e horário combinado.",
  },
  troca_oleo: {
    nome: "Troca de óleo",
    ramo: "automotivo",
    tipos: ["oleo", "revisao"],
    orientacao:
      "Informe viscosidade e especificação, quantidade, filtros, quilometragem e próxima troca.",
  },
  acessorios: {
    nome: "Instalação de acessórios automotivos",
    ramo: "automotivo",
    tipos: ["acessorios", "iluminacao", "eletrica"],
    orientacao:
      "Identifique o acessório, número de série, instalação, compatibilidade e testes de funcionamento.",
  },
  funilaria: {
    nome: "Funilaria e pintura",
    ramo: "automotivo",
    tipos: ["funilaria", "pintura", "polimento"],
    orientacao:
      "Identifique painéis, avarias, código da cor e etapas de preparação, pintura e acabamento.",
  },
  assistencia_geral: {
    nome: "Assistência técnica",
    ramo: "assistencia_tecnica",
    tipos: ["celular", "computador", "eletrodomestico", "placa", "software"],
    orientacao:
      "Identifique modelo e série, defeito, acessórios recebidos, diagnóstico e testes de entrega.",
  },
  assistencia_celulares: {
    nome: "Celulares e tablets",
    ramo: "assistencia_tecnica",
    tipos: ["celular", "placa", "software"],
    orientacao:
      "Registre IMEI, condição de entrada, funções testadas, cuidados com os dados e retirada.",
  },
  assistencia_informatica: {
    nome: "Informática e notebooks",
    ramo: "assistencia_tecnica",
    tipos: ["computador", "software", "placa"],
    orientacao:
      "Registre configuração, diagnóstico, autorização para dados, componentes e teste de estabilidade.",
  },
  assistencia_eletrodomesticos: {
    nome: "Eletrodomésticos",
    ramo: "assistencia_tecnica",
    tipos: ["eletrodomestico", "placa", "instalacao"],
    orientacao:
      "Identifique modelo, alimentação, código de erro, condições da instalação e teste do ciclo.",
  },
  assistencia_eletronica: {
    nome: "Eletrônica e reparo de placas",
    ramo: "assistencia_tecnica",
    tipos: ["placa", "eletrica", "software"],
    orientacao:
      "Identifique placa, revisão, pontos medidos, componentes e resultado do ensaio.",
  },
  manutencao_climatizacao: {
    nome: "Climatização e refrigeração",
    ramo: "manutencao_campo",
    tipos: ["climatizacao", "preventiva", "corretiva", "instalacao"],
    orientacao:
      "Registre ativo, plano de manutenção, filtros, drenos, medições e próxima visita.",
  },
  manutencao_eletrica: {
    nome: "Elétrica predial e comercial",
    ramo: "manutencao_campo",
    tipos: ["eletrica", "instalacao", "preventiva", "corretiva"],
    orientacao:
      "Registre circuito, liberação, medições, proteções e teste final da instalação.",
  },
  manutencao_hidraulica: {
    nome: "Hidráulica e bombeamento",
    ramo: "manutencao_campo",
    tipos: ["hidraulica", "instalacao", "preventiva", "corretiva"],
    orientacao:
      "Registre rede, trecho, material, reparo e resultado do teste de estanqueidade ou escoamento.",
  },
  manutencao_equipamentos: {
    nome: "Máquinas e equipamentos",
    ramo: "manutencao_campo",
    tipos: ["preventiva", "corretiva", "instalacao", "eletrica"],
    orientacao:
      "Registre ativo, horímetro, criticidade, falha, intervenção e próxima manutenção.",
  },
  limpeza_residencial: {
    nome: "Limpeza residencial",
    ramo: "limpeza",
    tipos: ["residencial", "higienizacao", "vidros"],
    orientacao:
      "Combine cômodos, prioridades, exclusões, produtos e cuidados com objetos e acesso.",
  },
  limpeza_comercial: {
    nome: "Limpeza comercial e condomínios",
    ramo: "limpeza",
    tipos: ["comercial", "higienizacao", "vidros"],
    orientacao:
      "Registre unidade, turno, rotina por área, reposição de insumos e aceite da visita.",
  },
  limpeza_pos_obra: {
    nome: "Limpeza pós-obra",
    ramo: "limpeza",
    tipos: ["pos_obra", "vidros"],
    orientacao:
      "Registre liberação da obra, resíduos, proteção dos acabamentos, teste de produto e vistoria final.",
  },
  limpeza_estofados: {
    nome: "Higienização de estofados e tapetes",
    ramo: "limpeza",
    tipos: ["estofados", "higienizacao"],
    orientacao:
      "Identifique peças, tecido, manchas, método, teste de compatibilidade e previsão de secagem.",
  },
  limpeza_vidros: {
    nome: "Vidros e fachadas",
    ramo: "limpeza",
    tipos: ["vidros", "comercial"],
    orientacao:
      "Registre superfície, acesso, liberação, teste do método e conferência do acabamento.",
  },
  manutencao_geral: {
    nome: "Manutenção de campo",
    ramo: "manutencao_campo",
    tipos: [
      "climatizacao",
      "eletrica",
      "hidraulica",
      "instalacao",
      "preventiva",
      "corretiva",
    ],
    orientacao:
      "Registre local, equipamento, acesso, técnico responsável, materiais e conferência da visita.",
  },
  limpeza_geral: {
    nome: "Serviços de limpeza",
    ramo: "limpeza",
    tipos: [
      "residencial",
      "comercial",
      "pos_obra",
      "estofados",
      "vidros",
      "higienizacao",
    ],
    orientacao:
      "Defina área, superfícies, restrições, produtos, equipe e checklist de conclusão.",
  },
};
export function especialidadePadrao(ramo: Ramo = "automotivo") {
  return {
    automotivo: "mecanica",
    assistencia_tecnica: "assistencia_geral",
    manutencao_campo: "manutencao_geral",
    limpeza: "limpeza_geral",
  }[ramo];
}
export function tiposDaEspecialidade(id: string): TipoServico[] {
  return [...(especialidades[id]?.tipos || []), "outros"];
}
