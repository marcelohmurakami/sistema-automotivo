import type { CampoTecnico, PerfilAtendimento } from "./perfisAtendimento.ts";
import { texto, area, data, opcao } from "./camposTecnicos.ts";

// Acrescenta registros sem alterar IDs, opções ou checklists de fichas existentes.
const visita: CampoTecnico[] = [
  opcao("ambiente", "Tipo de local", [
    "Residencial",
    "Condomínio",
    "Comercial",
    "Industrial",
    "Outro",
  ]),
  texto(
    "endereco_visita",
    "Endereço desta visita",
    "Informe complemento, unidade e ponto de referência. O endereço fica registrado neste atendimento.",
  ),
  texto("telefone_local", "Telefone do contato no local"),
  area("solicitacao", "Problema relatado / objetivo da visita"),
  texto("referencia_contrato", "Contrato / solicitação do cliente"),
];
const validacao: CampoTecnico[] = [
  opcao("resultado_teste", "Resultado dos testes", [
    "Aprovado nos testes",
    "Reprovado nos testes",
    "Teste parcial",
    "Não foi possível testar",
  ]),
  area(
    "limitacoes_teste",
    "Limitações dos testes",
    "Registre as condições e o que não foi testado.",
  ),
  opcao("condicao_uso", "Condição de uso informada pelo técnico", [
    "Liberado para uso",
    "Uso com restrições",
    "Não liberado",
    "Não avaliado",
  ]),
  area("restricoes_uso", "Restrições de uso e orientações ao cliente"),
  opcao("situacao_aceite", "Situação do aceite", [
    "Pendente",
    "Aceito",
    "Aceito com ressalvas",
    "Não aceito",
  ]),
  data("data_aceite", "Data da conferência com o cliente"),
  area("ressalvas_aceite", "Ressalvas / motivo da recusa"),
  texto(
    "referencia_plano",
    "Plano / manual e periodicidade combinada",
    "A data da próxima manutenção é definida conforme o equipamento e o contrato; não é calculada automaticamente.",
  ),
];
const especificos: Record<string, CampoTecnico[]> = {
  manutencao_climatizacao: [
    opcao("tipo_sistema", "Sistema de climatização", [
      "Split",
      "Multi-split / VRF",
      "Janela",
      "Central / chiller",
      "Refrigeração comercial",
      "Outro",
    ]),
    texto("unidades", "Identificação das unidades interna e externa"),
    texto("codigo_erro", "Código de falha apresentado"),
    area(
      "circuito_refrigerante",
      "Circuito frigorífico: verificações e intervenção",
      "Registre fluido, quantidades e unidades quando aplicáveis; inclua a referência do procedimento e o resultado.",
    ),
    area(
      "condicoes_medicao",
      "Condições e instrumentos das medições",
      "Identifique pontos, unidades, modo de operação e condições do ambiente.",
    ),
    area(
      "registro_pmoc",
      "Rotinas do plano executadas e pendentes",
      "Referência do plano e do registro técnico. Esta ficha não substitui o PMOC.",
    ),
  ],
  manutencao_eletrica: [
    texto("referencia_procedimento", "Referência da ordem / procedimento de trabalho"),
    texto("responsavel_liberacao", "Responsável pela autorização da intervenção"),
    opcao("condicao_instalacao", "Condição da instalação na visita", [
      "Em operação",
      "Desligada",
      "Interditada / isolada",
      "Não verificada",
    ]),
    area("impacto_desligamento", "Áreas afetadas e interrupção combinada"),
    area("instrumentos", "Instrumentos e condições dos ensaios"),
    area(
      "testes_protecao",
      "Verificações de proteção e resultados",
      "Identifique circuitos, dispositivos, referência técnica e limitações. Não há aprovação automática de conformidade.",
    ),
  ],
  manutencao_hidraulica: [
    area("areas_afetadas", "Ambientes afetados e danos anteriores"),
    area("interrupcao", "Interrupção de abastecimento e acesso combinados"),
    area(
      "condicoes_teste",
      "Condições do teste: pressão, duração e pontos",
      "Informe unidades, instrumento e referência aplicável à instalação.",
    ),
    area(
      "recomposicao",
      "Recomposição de paredes, pisos e acabamentos",
      "Registre o que está incluído e quem fará a recomposição.",
    ),
    area("restabelecimento", "Restabelecimento de água, escoamento ou bombeamento"),
  ],
  manutencao_equipamentos: [
    texto("localizacao_ativo", "Setor / posição do equipamento"),
    area("condicoes_operacao", "Condições de operação, carga e ciclo"),
    area("bloqueios", "Liberação e bloqueios registrados pelo responsável"),
    area("lubrificacao", "Lubrificante, pontos e referência do plano"),
    area("teste_operacional", "Ensaio operacional: condição, carga e resultado"),
    texto("responsavel_operacao", "Responsável pela retomada da operação"),
  ],
  manutencao_geral: [
    area("danos_anteriores", "Condições do imóvel e danos anteriores"),
    area("intervencao", "Reparos e instalações executados"),
    area("recomposicao", "Acabamentos e recomposição combinados"),
    area("pendencias_finais", "Pendências e orientações ao cliente"),
  ],
};

export function detalharManutencao(
  id: string,
  perfil: PerfilAtendimento,
): PerfilAtendimento {
  const existentes = new Set(perfil.grupos.flatMap((g) => g.campos.map((c) => c.id)));
  return {
    ...perfil,
    recepcaoRapida: ["natureza", "ambiente", "ativo", "endereco_visita", "solicitacao"],
    grupos: [
      ...perfil.grupos.map((g) => ({
        ...g,
        campos: [
          ...g.campos,
          ...(g.nome === "Planejamento da visita" ? visita : []),
          ...(g.nome === "Inspeção e intervenção" ? especificos[id] || [] : []),
        ],
      })),
      ...(id === "manutencao_geral"
        ? [
            {
              nome: "Serviços residenciais e prediais",
              campos: especificos[id].filter((c) => !existentes.has(c.id)),
            },
          ]
        : []),
      { nome: "Validação, liberação e aceite", campos: validacao },
    ],
  };
}
