import { detalharManutencao } from "./detalhesManutencao.ts";
import { perfilCelulares, perfilInformatica } from "./perfilDispositivosDigitais.ts";
import { perfilEletronica } from "./perfilEletronica.ts";
import { perfilEletrodomesticos } from "./perfilEletrodomesticos.ts";
import type { PerfilAtendimento, CampoTecnico } from "./perfisAtendimento.ts";
import { texto, area, numero, data, opcao } from "./camposTecnicos.ts";

// Campos compartilhados são compostos, não copiados entre telas. IDs persistidos.
export const planejamentoServico = {
  nome: "Prazo e responsável",
  campos: [
    texto("responsavel", "Técnico / equipe responsável"),
    data("prazo_servico", "Data combinada para o serviço"),
    opcao("motivo_espera", "Pendência atual", [
      "Sem pendência",
      "Aprovação do cliente",
      "Peça / material",
      "Acesso ao local",
      "Condição de segurança",
      "Retorno do cliente",
      "Outro motivo",
    ]),
    area("pendencia", "Detalhe da pendência"),
    data("previsao_material", "Previsão de chegada da peça / material"),
  ],
};
const visita = {
  nome: "Planejamento da visita",
  campos: [
    texto("ativo", "Ativo / instalação / etiqueta"),
    opcao("natureza", "Tipo de manutenção", [
      "Preventiva",
      "Corretiva",
      "Instalação",
      "Inspeção",
    ]),
    texto("contato", "Responsável no local"),
    area("acesso", "Janela de acesso e condições do local"),
    area("escopo", "Escopo e exclusões combinados"),
    area("liberacao", "Liberação do local e referência da análise de riscos"),
  ],
};
const aceite = {
  nome: "Execução e próxima visita",
  campos: [
    area("materiais", "Materiais e componentes aplicados"),
    area("medicoes_saida", "Medições e testes finais (com unidades)"),
    numero("deslocamento", "Tempo de deslocamento", "min"),
    numero("horas_trabalho", "Horas de trabalho registradas", "h"),
    area("pendencias_finais", "Pendências e orientações ao cliente"),
    texto("aceite", "Nome de quem conferiu / referência do aceite"),
    data("proxima_data", "Próxima manutenção prevista"),
  ],
};
function manutencao(
  id: string,
  foco: string,
  campos: CampoTecnico[],
  checks: string[],
  etapas: string[],
): PerfilAtendimento {
  return detalharManutencao(id, {
    foco,
    grupos: [
      planejamentoServico,
      visita,
      { nome: "Inspeção e intervenção", campos },
      aceite,
    ],
    checklist: [
      "Ativo e acesso conferidos",
      "Liberação para execução registrada",
      ...checks,
      "Responsável orientado e pendências comunicadas",
    ],
    etapas,
    indicador: {
      nome: "Testes finais e aceite registrados",
      campos: ["medicoes_saida", "aceite"],
    },
  });
}
const local = {
  nome: "Local e contratação",
  campos: [
    numero("area", "Área contratada", "m²"),
    area("ambientes", "Ambientes incluídos e exclusões"),
    opcao("frequencia", "Frequência contratada", [
      "Avulsa",
      "Diária",
      "Semanal",
      "Quinzenal",
      "Mensal",
      "Personalizada",
    ]),
    texto("acesso", "Acesso / contato / janela de trabalho"),
    opcao("fornecimento", "Produtos e equipamentos fornecidos por", [
      "Prestador",
      "Cliente",
      "Compartilhado",
    ]),
    area("superficies", "Superfícies e restrições"),
  ],
};
const conclusaoLimpeza = {
  nome: "Execução e liberação",
  campos: [
    area(
      "produtos",
      "Produtos, diluições e lotes",
      "Registre a aplicação conforme o rótulo e a compatibilidade com a superfície.",
    ),
    area("equipamentos", "Equipamentos e materiais utilizados"),
    numero("horas_trabalho", "Horas de trabalho da equipe", "h"),
    area("resultado", "Áreas concluídas, resultado e pendências"),
    texto("aceite", "Nome de quem conferiu / referência do aceite"),
    data("proxima_data", "Próxima visita prevista"),
  ],
};
function limpeza(
  foco: string,
  campos: CampoTecnico[],
  checks: string[],
  etapas: string[],
): PerfilAtendimento {
  return {
    foco,
    grupos: [
      planejamentoServico,
      local,
      { nome: "Cuidados específicos", campos },
      conclusaoLimpeza,
    ],
    checklist: [
      "Escopo e exclusões conferidos",
      "Produtos e superfícies compatíveis",
      ...checks,
      "Resultado e orientações conferidos com o responsável",
    ],
    etapas,
    indicador: {
      nome: "Resultado e aceite registrados",
      campos: ["resultado", "aceite"],
    },
  };
}

export const perfisServicos: Record<string, PerfilAtendimento> = {
  assistencia_celulares: {
    ...perfilCelulares,
    grupos: [planejamentoServico, ...perfilCelulares.grupos],
  },
  assistencia_informatica: {
    ...perfilInformatica,
    grupos: [planejamentoServico, ...perfilInformatica.grupos],
  },
  assistencia_eletrodomesticos: {
    ...perfilEletrodomesticos,
    grupos: [planejamentoServico, ...perfilEletrodomesticos.grupos],
  },
  assistencia_eletronica: {
    ...perfilEletronica,
    grupos: [planejamentoServico, ...perfilEletronica.grupos],
  },
  manutencao_climatizacao: manutencao(
    "manutencao_climatizacao",
    "Equipamentos de climatização, plano de manutenção e desempenho",
    [
      texto("modelo", "Marca / modelo / série"),
      texto("capacidade", "Capacidade nominal (com unidade)"),
      texto("refrigerante", "Fluido refrigerante indicado"),
      texto("plano", "Referência do plano de manutenção / PMOC"),
      texto("responsavel_tecnico", "Responsável técnico / referência do documento"),
      area("filtros", "Filtros, serpentinas, bandeja e drenagem"),
      area(
        "medicoes_entrada",
        "Temperaturas, corrente e demais medições de entrada (com unidades)",
      ),
      area("intervencao", "Limpeza / ajustes / intervenção realizada"),
    ],
    [
      "Filtros, serpentinas e drenos inspecionados",
      "Intervenções registradas por equipamento",
      "Desempenho final conferido",
    ],
    ["Planejamento", "Inspeção", "Limpeza e manutenção", "Medições finais", "Aceite"],
  ),
  manutencao_eletrica: manutencao(
    "manutencao_eletrica",
    "Circuitos, quadros, intervenções autorizadas e medições",
    [
      texto("circuito", "Quadro / circuito / ponto atendido"),
      texto("alimentacao", "Alimentação nominal / fases"),
      area("sintoma", "Falha, carga afetada e condição de ocorrência"),
      area("medicoes_entrada", "Medições e evidências da inspeção (com unidades)"),
      area("protecao", "Proteções e identificação dos circuitos"),
      area("intervencao", "Intervenções e componentes substituídos"),
    ],
    [
      "Circuito identificado e liberação registrada",
      "Intervenções documentadas",
      "Testes e condição de retorno à operação registrados",
    ],
    [
      "Planejamento",
      "Liberação do local",
      "Diagnóstico",
      "Intervenção",
      "Testes e liberação",
      "Aceite",
    ],
  ),
  manutencao_hidraulica: manutencao(
    "manutencao_hidraulica",
    "Vazamentos, redes, conexões e teste após reparo",
    [
      opcao("rede", "Rede atendida", [
        "Água fria",
        "Água quente",
        "Esgoto",
        "Drenagem",
        "Bombeamento",
      ]),
      texto("trecho", "Trecho / ponto / registro de isolamento"),
      texto("tubulacao", "Material e diâmetro da tubulação"),
      area("medicoes_entrada", "Vazamento / obstrução e condição inicial"),
      area("intervencao", "Reparo, conexões e componentes"),
      area("estanqueidade", "Teste de estanqueidade / escoamento e resultado"),
    ],
    [
      "Rede e trecho identificados",
      "Materiais compatíveis conferidos",
      "Estanqueidade ou escoamento testado",
    ],
    [
      "Planejamento",
      "Inspeção",
      "Reparo / instalação",
      "Teste de estanqueidade",
      "Aceite",
    ],
  ),
  manutencao_equipamentos: manutencao(
    "manutencao_equipamentos",
    "Máquinas, bombas, motores e histórico de manutenção por ativo",
    [
      texto("modelo", "Modelo / série / potência"),
      numero("horimetro", "Horímetro atual", "h"),
      opcao("criticidade", "Impacto da indisponibilidade", ["Baixo", "Médio", "Alto"]),
      area(
        "medicoes_entrada",
        "Vibração, temperatura, ruído e outras medições (com unidades)",
      ),
      area("falha", "Falha identificada / causa investigada"),
      area("intervencao", "Ajustes, lubrificação e componentes substituídos"),
      numero("horas_parado", "Indisponibilidade registrada", "h"),
      numero("proximo_horimetro", "Próxima manutenção no horímetro", "h"),
    ],
    [
      "Ativo e condição operacional registrados",
      "Intervenções e componentes documentados",
      "Teste de funcionamento registrado",
    ],
    [
      "Planejamento",
      "Inspeção do ativo",
      "Manutenção",
      "Teste operacional",
      "Liberação e aceite",
    ],
  ),
  limpeza_residencial: limpeza(
    "Ambientes, prioridades do morador e cuidados com objetos e superfícies",
    [
      area("prioridades", "Prioridades e tarefas por cômodo"),
      area("cuidados", "Animais, objetos frágeis e restrições de acesso"),
      area("itens_extras", "Extras combinados: janelas, armários, eletrodomésticos"),
      texto(
        "chaves",
        "Referência da entrega / devolução de chaves",
        "Não registre códigos de alarme ou senhas de acesso.",
      ),
    ],
    [
      "Prioridades e objetos frágeis conferidos",
      "Cômodos contratados revisados",
      "Chaves e acesso devolvidos conforme combinado",
    ],
    ["Preparação", "Limpeza por cômodo", "Acabamento", "Conferência com o cliente"],
  ),
  limpeza_comercial: limpeza(
    "Rotina por área, turno, reposição e conferência do contrato",
    [
      texto("contrato", "Contrato / unidade / posto"),
      texto("turno", "Turno e janela sem interrupção da operação"),
      area("rotina", "Rotina por ambiente e frequência das tarefas"),
      area("reposicao", "Insumos e reposições previstos"),
      area("residuos", "Coleta de resíduos e pontos de descarte combinados"),
      area("ocorrencias", "Ocorrências da visita / áreas indisponíveis"),
    ],
    [
      "Rotina e turno conferidos",
      "Áreas de circulação e sanitários revisados",
      "Reposições e ocorrências registradas",
    ],
    [
      "Preparação do turno",
      "Execução por área",
      "Reposição e resíduos",
      "Inspeção do supervisor",
      "Aceite da visita",
    ],
  ),
  limpeza_pos_obra: limpeza(
    "Resíduos de obra, proteção dos acabamentos e vistoria de entrega",
    [
      opcao("fase_obra", "Condição da obra", [
        "Concluída e liberada",
        "Em execução parcial",
        "Aguardando liberação",
      ]),
      area("residuos", "Poeira, respingos, cimento, tinta e outros resíduos"),
      area("acabamentos", "Acabamentos novos, danos anteriores e áreas protegidas"),
      area("teste_superficie", "Teste de compatibilidade em área discreta"),
      area("descarte", "Responsável e destino dos resíduos"),
      area("retrabalho", "Áreas com nova intervenção de obra / necessidade de retorno"),
    ],
    [
      "Liberação e danos anteriores registrados",
      "Teste de compatibilidade registrado",
      "Acabamentos e vidros inspecionados na entrega",
    ],
    [
      "Vistoria e liberação",
      "Remoção de resíduos",
      "Limpeza fina",
      "Inspeção dos acabamentos",
      "Aceite",
    ],
  ),
  limpeza_estofados: limpeza(
    "Tecido, manchas, método de higienização e orientação de secagem",
    [
      area("pecas", "Peças, lugares e dimensões contratadas"),
      texto("tecido", "Tecido / etiqueta / composição identificada"),
      area("manchas", "Manchas, odores, avarias e limites combinados"),
      area("teste_cor", "Teste de solidez da cor / compatibilidade"),
      opcao("metodo", "Método definido", [
        "Extração",
        "Baixa umidade",
        "A seco",
        "Outro método",
      ]),
      texto("secagem", "Previsão e condições de secagem"),
      area("orientacoes", "Ventilação e liberação de uso informadas ao cliente"),
    ],
    [
      "Tecido, manchas e avarias registrados",
      "Compatibilidade do método testada",
      "Cuidados e prazo de secagem informados",
    ],
    [
      "Inspeção do tecido",
      "Pré-tratamento",
      "Higienização",
      "Secagem / orientação",
      "Conferência e aceite",
    ],
  ),
  limpeza_vidros: limpeza(
    "Vidros e fachadas: superfície, acesso, condições e acabamento",
    [
      texto("superficie", "Tipo de vidro / fachada / revestimento"),
      texto("altura", "Altura e meio de acesso previsto"),
      area("liberacao", "Responsável pela liberação / referência do plano de trabalho"),
      area("clima", "Condições do local e restrições climáticas"),
      area("teste_superficie", "Teste de método / produto em área discreta"),
      area("protecao", "Isolamento da área e proteção do entorno"),
      area("acabamento", "Conferência de manchas, riscos e vedação aparente"),
    ],
    [
      "Superfície e acesso avaliados",
      "Liberação do trabalho registrada",
      "Área e entorno protegidos",
      "Acabamento conferido",
    ],
    [
      "Vistoria de acesso",
      "Preparação e isolamento",
      "Limpeza",
      "Conferência do acabamento",
      "Liberação e aceite",
    ],
  ),
};
