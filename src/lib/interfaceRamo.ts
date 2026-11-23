import type { Ramo } from "./ramos";

export function vocabularioEstoque(ramo?: Ramo) {
  const feminino = !ramo || ramo === "automotivo" || ramo === "assistencia_tecnica";
  const singular = feminino ? "peça" : ramo === "limpeza" ? "produto" : "material";
  const plural = feminino ? "peças" : ramo === "limpeza" ? "produtos" : "materiais";
  const artigo = feminino ? "a" : "o";
  return {
    singular,
    plural,
    doItem: `d${artigo} ${singular}`,
    dosItens: `d${artigo}s ${plural}`,
    osItens: `${artigo}s ${plural}`,
    controlados: `${plural[0].toUpperCase()}${plural.slice(1)} controlad${artigo}s`,
    ativos: `${plural[0].toUpperCase()}${plural.slice(1)} ativ${artigo}s`,
    arquivados: `Arquivad${artigo}s`,
    novo: `Nov${artigo} ${singular}`,
    nenhum: `Nenhum${feminino ? "a" : ""} ${singular} encontrad${artigo}`,
    recebidos: `${plural[0].toUpperCase()}${plural.slice(1)} recebid${artigo}s`,
    itemEstoque: `${singular[0].toUpperCase()}${singular.slice(1)} do estoque`,
    cadastro: `Cadastre ${artigo} ${singular} e registre a primeira entrada.`,
    restaurado: `${artigo.toUpperCase()} ${singular} voltará a aparecer entre ${artigo}s ativ${artigo}s.`,
  };
}

const exemplosAssistencia: Record<
  string,
  { servico: string; equipamento: string; identificacao: string; acessorios: string }
> = {
  assistencia_geral: {
    servico: "Diagnóstico e reparo do equipamento",
    equipamento: "Impressora Epson L3250",
    identificacao: "Número de série / etiqueta de controle",
    acessorios: "Fonte, cabos e acessórios entregues",
  },
  assistencia_celulares: {
    servico: "Troca de tela e teste de toque",
    equipamento: "Samsung Galaxy A54",
    identificacao: "IMEI / número de série",
    acessorios: "Capa, carregador, cabo e cartão de memória",
  },
  assistencia_informatica: {
    servico: "Substituição de SSD e instalação do sistema",
    equipamento: "Notebook Dell Inspiron 15",
    identificacao: "Número de série / etiqueta de serviço",
    acessorios: "Fonte, cabo de energia, mouse e adaptadores",
  },
  assistencia_eletrodomesticos: {
    servico: "Reparo da placa e teste do ciclo de lavagem",
    equipamento: "Lavadora Brastemp 12 kg",
    identificacao: "Número de série / código do produto",
    acessorios: "Mangueiras, bandejas, controles e peças removíveis",
  },
  assistencia_eletronica: {
    servico: "Reparo da fonte e ensaio de bancada",
    equipamento: "Placa da fonte da TV LG",
    identificacao: "Série / referência da placa / revisão",
    acessorios: "Fonte, controle, cabos e módulos recebidos",
  },
};

const exemplosAutomotivos: Record<string, string> = {
  mecanica: "Revisão de freios e suspensão",
  retifica: "Retífica de cabeçote e teste de estanqueidade",
  autoeletrica: "Diagnóstico do alternador e sistema de carga",
  autocenter: "Alinhamento e balanceamento",
  borracharia: "Reparo de pneu e calibragem",
  estetica: "Polimento e proteção da pintura",
  lava_rapido: "Lavagem interna e externa",
  troca_oleo: "Troca de óleo e filtro",
  acessorios: "Instalação e teste de câmera de ré",
  funilaria: "Reparo e pintura do para-lama",
};
const exemplosLimpeza: Record<string, string> = {
  limpeza_residencial: "Limpeza de cozinha, banheiros e quartos",
  limpeza_comercial: "Limpeza de áreas comuns e sanitários",
  limpeza_pos_obra: "Limpeza pós-obra e remoção de resíduos",
  limpeza_estofados: "Higienização de sofá e tapete",
  limpeza_vidros: "Limpeza de vidros e fachada",
  limpeza_geral: "Limpeza dos ambientes conforme escopo combinado",
};

/** Vocabulário de apresentação; nomes persistidos e contratos da API não mudam. */
export function interfaceRamo(ramo?: Ramo, especialidade?: string) {
  const assistencia = ramo === "assistencia_tecnica";
  const manutencao = ramo === "manutencao_campo";
  const limpeza = ramo === "limpeza";
  const automotivo = !ramo || ramo === "automotivo";
  const exemplo =
    exemplosAssistencia[especialidade || ""] || exemplosAssistencia.assistencia_geral;
  return {
    assistencia,
    manutencao,
    limpeza,
    automotivo,
    empresa: assistencia ? "assistência técnica" : automotivo ? "oficina" : "empresa",
    minhaEmpresa: assistencia
      ? "Minha assistência"
      : automotivo
        ? "Minha oficina"
        : "Minha empresa",
    ordem: assistencia
      ? "Ordem de reparo"
      : manutencao
        ? "Ordem de serviço"
        : "Atendimento",
    ordens: assistencia
      ? "Ordens de reparo"
      : manutencao
        ? "Ordens de serviço"
        : "Atendimentos",
    agendaDescricao: manutencao
      ? "Organize visitas, equipes e retornos, reservando também o deslocamento. Horário de Brasília."
      : limpeza
        ? "Organize serviços de limpeza, equipes e retornos. Horário de Brasília."
        : especialidade === "assistencia_eletrodomesticos"
          ? "Agende visitas, retornos ao endereço do cliente e entregas. Horário de Brasília."
          : especialidade === "assistencia_eletronica"
            ? "Reserve diagnóstico, ensaios de bancada e retirada de equipamentos ou placas. Horário de Brasília."
            : "Agende diagnósticos, reparos de bancada e retiradas. Horário de Brasília.",
    operacaoDescricao: manutencao
      ? "Do orçamento à visita, com materiais, testes, liberação e aceite do cliente."
      : limpeza
        ? "Do escopo combinado à execução, conferência e recebimento."
        : especialidade === "assistencia_eletrodomesticos"
          ? "Acompanhe reparos na bancada e no domicílio, da avaliação à entrega ou aceite."
          : especialidade === "assistencia_eletronica"
            ? "Acompanhe equipamentos e placas: identificação, diagnóstico, reparo e ensaio."
            : "Da entrada do equipamento ao diagnóstico, reparo e retirada pelo cliente.",
    exemploServico: assistencia
      ? exemplo.servico
      : automotivo
        ? exemplosAutomotivos[especialidade || ""] || "Alinhamento da direção"
        : ramo === "limpeza"
          ? exemplosLimpeza[especialidade || ""] || exemplosLimpeza.limpeza_geral
          : (
              {
                manutencao_climatizacao:
                  "Manutenção de split e verificação de drenagem",
                manutencao_eletrica: "Diagnóstico do circuito de iluminação",
                manutencao_hidraulica: "Reparo de vazamento e teste de estanqueidade",
                manutencao_equipamentos: "Manutenção preventiva da bomba",
                manutencao_geral: "Reparo residencial e conferência com o cliente",
              } as Record<string, string>
            )[especialidade || ""] || "Manutenção preventiva do equipamento",
    exemploEquipamento: exemplo.equipamento,
    identificacao: exemplo.identificacao,
    acessorios: exemplo.acessorios,
    slug: assistencia
      ? "minha-assistencia"
      : automotivo
        ? "oficina-do-marcelo"
        : "minha-empresa",
  };
}
