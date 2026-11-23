import type { CampoTecnico, PerfilAtendimento } from "./perfisAtendimento.ts";
import { texto, area, numero, data, opcao } from "./camposTecnicos.ts";

const contratacao: CampoTecnico[] = [
  texto(
    "endereco_visita",
    "Endereço deste serviço",
    "Inclua unidade e complemento. O endereço fica preservado neste atendimento.",
  ),
  texto("contato_local", "Responsável no local"),
  texto("telefone_local", "Telefone do responsável"),
  opcao("base_cobranca", "Forma de contratação", [
    "Por serviço",
    "Por diária",
    "Por hora",
    "Por m²",
    "Por peça / lugar",
    "Contrato periódico",
  ]),
  numero("horas_previstas", "Duração prevista da visita", "h"),
  {
    ...numero("pessoas_previstas", "Pessoas previstas na equipe", "pessoas"),
    passo: 1,
    minimo: 1,
  },
  area("exclusoes", "O que não está incluído"),
  area("condicoes_local", "Água, energia, acesso e condições do local"),
  area("danos_anteriores", "Danos e condições encontrados antes do serviço"),
];
const conferencia: CampoTecnico[] = [
  opcao("resultado_vistoria", "Resultado da vistoria", [
    "Conforme o escopo",
    "Com pendências",
    "Não foi possível vistoriar",
  ]),
  area("pendencias_finais", "Áreas pendentes / necessidade de retorno"),
  opcao("liberacao_uso", "Liberação do local / bem", [
    "Liberado",
    "Aguardando secagem",
    "Uso com restrições",
    "Não liberado",
  ]),
  area("restricoes_uso", "Orientações e restrições de uso"),
  opcao("situacao_aceite", "Situação do aceite", [
    "Pendente",
    "Aceito",
    "Aceito com ressalvas",
    "Não aceito",
  ]),
  data("data_aceite", "Data da conferência com o cliente"),
  area("ressalvas_aceite", "Ressalvas / motivo da recusa"),
];
const especificos: Record<string, CampoTecnico[]> = {
  limpeza_residencial: [
    opcao("ocupacao", "Situação do imóvel", ["Ocupado", "Vazio", "Mudança / entrega"]),
    area("restricoes_produtos", "Restrições de produtos informadas pelo cliente"),
    area("organizacao", "Objetos a preservar e limites de organização"),
  ],
  limpeza_comercial: [
    area("areas_criticas", "Áreas de maior circulação e prioridades do turno"),
    texto("supervisor", "Supervisor / fiscal do contrato"),
    area("cobertura", "Cobertura da equipe, ausências e substituições"),
    area("periodicidades", "Tarefas diárias, semanais e periódicas"),
  ],
  limpeza_pos_obra: [
    opcao("tipo_limpeza", "Etapa contratada", [
      "Limpeza grossa",
      "Limpeza fina",
      "Limpeza completa",
      "Revisão após obra",
    ]),
    area("interferencias", "Frentes de obra em andamento e risco de nova sujeira"),
    area("entulho", "Entulho: retirada incluída e responsável"),
    area(
      "superficies_sensiveis",
      "Pedras, metais, esquadrias e revestimentos sensíveis",
    ),
  ],
  limpeza_estofados: [
    opcao("tipo_bem", "Bem a higienizar", [
      "Sofá",
      "Poltrona / cadeira",
      "Colchão",
      "Tapete / carpete",
      "Outro",
    ]),
    {
      ...numero("quantidade_lugares", "Quantidade de lugares / unidades", "un"),
      passo: 1,
      minimo: 1,
    },
    opcao("modalidade", "Local da higienização", [
      "No cliente",
      "Retirado para higienização",
    ]),
    texto("identificacao_bem", "Identificação / etiqueta do bem"),
    area("coleta_devolucao", "Coleta e devolução combinadas"),
    area("resultado_manchas", "Manchas removidas e marcas remanescentes"),
    numero("secagem_horas", "Estimativa de secagem informada", "h"),
    area("condicoes_secagem", "Ventilação e condições da estimativa de secagem"),
  ],
  limpeza_vidros: [
    opcao("tipo_acesso", "Meio de acesso previsto", [
      "A partir do piso",
      "Escada",
      "Andaime",
      "Plataforma",
      "Acesso por cordas",
      "Outro",
    ]),
    area(
      "restricoes_vidro",
      "Películas, tratamentos, vedação e restrições do fabricante",
    ),
    area(
      "referencia_seguranca",
      "Referência da análise de riscos e autorização de trabalho",
      "Registre a referência e o responsável; esta ficha não aprova nem substitui o planejamento de segurança.",
    ),
    texto("responsavel_liberacao", "Responsável pela liberação do trabalho"),
    opcao("condicao_execucao", "Condição de execução registrada", [
      "Liberada pelo responsável",
      "Suspensa",
      "Aguardando avaliação",
    ]),
    area("motivo_suspensao", "Motivo da suspensão / condição para retomar"),
  ],
  limpeza_geral: [
    area("prioridades", "Prioridades por ambiente"),
    opcao("fornecimento", "Produtos e equipamentos fornecidos por", [
      "Prestador",
      "Cliente",
      "Compartilhado",
    ]),
    numero("horas_trabalho", "Horas de trabalho da equipe", "h"),
  ],
};

/** Amplia os perfis sem renomear IDs, opções ou conferências já persistidas. */
export function detalharLimpeza(
  id: string,
  perfil: PerfilAtendimento,
): PerfilAtendimento {
  const usados = new Set(perfil.grupos.flatMap((g) => g.campos.map((c) => c.id)));
  const novos = (campos: CampoTecnico[]) => campos.filter((c) => !usados.has(c.id));
  return {
    ...perfil,
    recepcaoRapida:
      id === "limpeza_estofados"
        ? ["tipo_bem", "quantidade_lugares", "modalidade"]
        : id === "limpeza_vidros"
          ? ["superficie", "area", "tipo_acesso"]
          : id === "limpeza_pos_obra"
            ? ["area", "tipo_limpeza", "fase_obra"]
            : id === "limpeza_comercial"
              ? ["area", "frequencia", "turno"]
              : ["area", "frequencia", "fornecimento"],
    grupos: [
      ...perfil.grupos.map((g) => ({
        ...g,
        campos: g.campos.map((c) =>
          c.id === "responsavel"
            ? { ...c, nome: "Equipe / encarregado responsável" }
            : c.id === "previsao_material"
              ? { ...c, nome: "Previsão de chegada dos produtos / materiais" }
              : c.id === "motivo_espera"
                ? { ...c, rotulosOpcoes: { "Peça / material": "Produtos / materiais" } }
                : c,
        ),
      })),
      { nome: "Contratação e condições da visita", campos: novos(contratacao) },
      { nome: "Detalhes do serviço de limpeza", campos: novos(especificos[id] || []) },
      { nome: "Vistoria e aceite", campos: novos(conferencia) },
    ],
  };
}
