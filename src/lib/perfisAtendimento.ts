import { detalharManutencao } from "./detalhesManutencao.ts";
import { detalharLimpeza } from "./detalhesLimpeza.ts";
import { especialidades, especialidadePadrao } from "./especialidades.ts";
import type { Ramo } from "./ramos.ts";
import { texto, area, numero, data, opcao } from "./camposTecnicos.ts";
import { perfisServicos, planejamentoServico } from "./perfisServicos.ts";

export type CampoTecnico = {
  id: string;
  nome: string;
  tipo?: "texto" | "area" | "numero" | "data" | "opcao";
  ajuda?: string;
  unidade?: string;
  opcoes?: string[];
  rotulosOpcoes?: Record<string, string>;
  passo?: number;
  minimo?: number;
  quando?: { campo: string; valores: string[] };
};
export type PerfilAtendimento = {
  foco: string;
  grupos: { nome: string; campos: CampoTecnico[] }[];
  checklist: string[];
  etapas: string[];
  indicador: { nome: string; campos: string[] };
  recepcaoRapida?: string[];
};
export type FichaEspecialidade = {
  versao: 1;
  especialidade: string;
  campos: Record<string, string>;
  checklist: Record<string, boolean>;
  etapa: string;
};
const proximaRevisao = [
  data("proxima_data", "Próxima revisão em"),
  numero("proxima_km", "Próxima revisão aos", "km"),
];

// Modelos de registro; medidas, tolerâncias e intervalos são informados pelo técnico.
// IDs fazem parte do histórico persistido. Não renomear nem reutilizar.
export const perfisAtendimento: Record<string, PerfilAtendimento> = {
  ...perfisServicos,
  mecanica: {
    foco: "Diagnóstico, reparo e manutenção preventiva",
    grupos: [
      {
        nome: "Diagnóstico",
        campos: [
          opcao("natureza", "Tipo de atendimento", [
            "Preventivo",
            "Corretivo",
            "Diagnóstico",
          ]),
          area(
            "sintoma",
            "Quando o defeito acontece?",
            "Motor frio/quente, velocidade, ruído ou condição de uso.",
          ),
          texto("sistema", "Sistema / conjunto afetado"),
          area("testes_entrada", "Testes e medições iniciais"),
        ],
      },
      {
        nome: "Reparo e entrega",
        campos: [
          area("reparo", "Reparo executado"),
          area("testes_saida", "Resultado dos testes finais"),
          ...proximaRevisao,
        ],
      },
    ],
    checklist: [
      "Sintoma e condição de uso registrados",
      "Inspeção inicial realizada",
      "Reparo autorizado pelo cliente",
      "Teste final do sistema realizado",
      "Orientações de manutenção entregues",
    ],
    etapas: [
      "Diagnóstico",
      "Reparo",
      "Teste de funcionamento",
      "Conferência para entrega",
    ],
    indicador: {
      nome: "Diagnóstico e teste final registrados",
      campos: ["testes_entrada", "testes_saida"],
    },
  },
  retifica: {
    foco: "Rastreabilidade da peça, metrologia e usinagem",
    grupos: [
      {
        nome: "Peça recebida",
        campos: [
          texto("identificacao", "Número / identificação do motor ou peça"),
          texto("aplicacao", "Aplicação / código do motor"),
          area("componentes", "Componentes recebidos"),
          area("inspecao", "Trincas, desgaste e condição inicial"),
        ],
      },
      {
        nome: "Metrologia e usinagem",
        campos: [
          area(
            "medidas_entrada",
            "Medidas de entrada (mm)",
            "Identifique cada ponto, cilindro ou mancal; não misture medições.",
          ),
          area(
            "referencia",
            "Especificação / tolerâncias de referência",
            "Informe a fonte e os limites da aplicação.",
          ),
          area("usinagens", "Usinagens realizadas"),
          area("medidas_saida", "Medidas finais (mm)"),
          area("teste_final", "Estanqueidade / teste final"),
          texto("pecas_cliente", "Peças fornecidas pelo cliente"),
        ],
      },
    ],
    checklist: [
      "Peça identificada e componentes conferidos",
      "Inspeção e medições iniciais registradas",
      "Usinagem conferida com a especificação",
      "Medidas finais registradas",
      "Limpeza e proteção para transporte conferidas",
    ],
    etapas: [
      "Desmontagem e limpeza",
      "Inspeção e metrologia",
      "Usinagem",
      "Montagem e testes",
      "Conferência e embalagem",
    ],
    indicador: {
      nome: "Medições antes e depois registradas",
      campos: ["medidas_entrada", "medidas_saida"],
    },
  },
  autoeletrica: {
    foco: "Diagnóstico elétrico com comparação antes e depois",
    grupos: [
      {
        nome: "Diagnóstico elétrico",
        campos: [
          texto("circuito", "Circuito / componente"),
          opcao("sistema_tensao", "Sistema nominal", ["6 V", "12 V", "24 V", "Outro"]),
          texto("bateria", "Bateria: modelo / tecnologia / capacidade"),
          area("codigos", "Códigos de falha e condição de ocorrência"),
          area(
            "medicoes_entrada",
            "Medições iniciais",
            "Identifique tensão (V), corrente (A/mA), condição do teste e equipamento utilizado.",
          ),
        ],
      },
      {
        nome: "Reparo e validação",
        campos: [
          area("reparo", "Circuitos, conexões ou componentes reparados"),
          area("medicoes_saida", "Medições finais / partida e carga"),
          area("consumo_repouso", "Consumo em repouso e condição do teste"),
          area("configuracao", "Codificação / configuração e teste funcional"),
        ],
      },
    ],
    checklist: [
      "Bateria e conexões inspecionadas",
      "Defeito e medições iniciais registrados",
      "Circuito reparado e fixações conferidas",
      "Partida / carga ou função reparada testada",
      "Varredura final e orientações registradas",
    ],
    etapas: [
      "Testes elétricos",
      "Localização da falha",
      "Reparo / substituição",
      "Teste de carga e funcionamento",
    ],
    indicador: {
      nome: "Medições elétricas antes e depois",
      campos: ["medicoes_entrada", "medicoes_saida"],
    },
  },
  autocenter: {
    foco: "Mecânica geral, pneus, geometria, freios e suspensão",
    grupos: [
      {
        nome: "Mecânica geral (opcional)",
        campos: [
          area("mecanica_solicitacao", "Sintomas e serviços solicitados"),
          area("mecanica_diagnostico", "Diagnóstico mecânico / testes e medições"),
          area("mecanica_reparo", "Reparos realizados / componentes substituídos"),
          area(
            "mecanica_conferencia",
            "Teste de funcionamento / rodagem e orientações",
          ),
        ],
      },
      {
        nome: "Inspeção",
        campos: [
          texto("pneus", "Pneus: medida, marca e posições"),
          area("desgaste", "Sulcos (mm) e desgaste por posição"),
          area("freios_suspensao", "Inspeção de freios, direção e suspensão"),
          area("geometria_antes", "Geometria inicial / referência do laudo"),
        ],
      },
      {
        nome: "Execução e retorno",
        campos: [
          area("geometria_depois", "Geometria final / referência do laudo"),
          area("pressao", "Pressão final por eixo / posição (psi ou bar)"),
          texto("rodizio", "Rodízio realizado / posições alteradas"),
          ...proximaRevisao,
        ],
      },
    ],
    checklist: [
      "Desgaste e condição dos pneus conferidos",
      "Freios e suspensão inspecionados",
      "Geometria / balanceamento conferidos quando aplicáveis",
      "Torque e pressão conforme aplicação conferidos",
      "Teste final e orientação de retorno realizados",
    ],
    etapas: [
      "Inspeção",
      "Peças e reparos",
      "Alinhamento / balanceamento",
      "Teste e conferência",
    ],
    indicador: {
      nome: "Geometria antes e depois registrada",
      campos: ["geometria_antes", "geometria_depois"],
    },
  },
  borracharia: {
    foco: "Identificação do pneu, posição e reparabilidade",
    grupos: [
      {
        nome: "Pneu e diagnóstico",
        campos: [
          texto("medida", "Medida / índice de carga e velocidade"),
          texto("marca_dot", "Marca / modelo / DOT"),
          opcao("posicao", "Posição", [
            "Dianteiro esquerdo",
            "Dianteiro direito",
            "Traseiro esquerdo",
            "Traseiro direito",
            "Estepe",
            "Outras / múltiplas",
          ]),
          area("avaria", "Local da avaria e inspeção interna"),
          opcao("avaliacao", "Avaliação do pneu", [
            "Reparável",
            "Substituição recomendada",
            "Aguardando avaliação",
          ]),
        ],
      },
      {
        nome: "Reparo e entrega",
        campos: [
          texto("reparo", "Reparo / substituição realizados"),
          texto("valvula", "Válvula / sensor TPMS"),
          texto("pressao", "Pressão final e unidade (psi/bar)"),
          texto("teste_final", "Resultado do teste de estanqueidade"),
        ],
      },
    ],
    checklist: [
      "Medida e posição identificadas",
      "Dano inspecionado antes do reparo",
      "Válvula e roda conferidas",
      "Estanqueidade testada",
      "Pressão e fixação final conferidas",
    ],
    etapas: [
      "Inspeção do pneu",
      "Reparo ou substituição",
      "Estanqueidade e balanceamento",
      "Montagem e calibragem",
    ],
    indicador: {
      nome: "Pressão e estanqueidade registradas",
      campos: ["pressao", "teste_final"],
    },
  },
  estetica: {
    foco: "Estado inicial, áreas tratadas e proteção aplicada",
    grupos: [
      {
        nome: "Avaliação e escopo",
        campos: [
          texto("pacote", "Pacote / tratamento contratado"),
          area("areas", "Áreas e superfícies incluídas"),
          area("condicao", "Riscos, manchas e avarias anteriores"),
          area("medicao", "Inspeção / medição da pintura por painel"),
        ],
      },
      {
        nome: "Tratamento e entrega",
        campos: [
          area("produtos", "Produtos, lotes e proteção aplicados"),
          texto("cura", "Tempo / condições de cura do produto"),
          area("cuidados", "Cuidados após a entrega"),
          data("proxima_data", "Revisão da proteção em"),
        ],
      },
    ],
    checklist: [
      "Condição inicial e áreas combinadas registradas",
      "Compatibilidade e teste localizado conferidos",
      "Tratamento executado nas áreas contratadas",
      "Acabamento inspecionado sob iluminação",
      "Cuidados e prazo de cura informados",
    ],
    etapas: [
      "Avaliação e lavagem",
      "Descontaminação / preparação",
      "Correção e tratamento",
      "Proteção / cura",
      "Inspeção final",
    ],
    indicador: {
      nome: "Produtos e cuidados registrados",
      campos: ["produtos", "cuidados"],
    },
  },
  lava_rapido: {
    foco: "Fila rápida, pacote contratado e conferência de saída",
    grupos: [
      {
        nome: "Entrada rápida",
        campos: [
          opcao("pacote", "Pacote", [
            "Externa",
            "Interna e externa",
            "Completa",
            "Higienização",
            "Personalizado",
          ]),
          texto("vaga", "Box / posição na fila"),
          area("avarias", "Avarias e pertences recebidos"),
          area("adicionais", "Áreas extras / cuidados combinados"),
        ],
      },
      {
        nome: "Lavagem e saída",
        campos: [
          texto("produtos", "Produtos / diluições utilizadas"),
          area("conferencia", "Conferência de limpeza e acabamento"),
          area("orientacoes", "Cuidados / observações de entrega"),
        ],
      },
    ],
    checklist: [
      "Pacote e avarias conferidos na entrada",
      "Pertences protegidos",
      "Áreas contratadas lavadas",
      "Secagem e acabamento conferidos",
      "Chaves e pertences devolvidos",
    ],
    etapas: ["Preparação", "Lavagem", "Secagem e acabamento", "Conferência de saída"],
    indicador: {
      nome: "Pacote e conferência registrados",
      campos: ["pacote", "conferencia"],
    },
  },
  troca_oleo: {
    foco: "Aplicação correta, filtros e próxima manutenção",
    grupos: [
      {
        nome: "Lubrificante e filtros",
        campos: [
          texto("viscosidade", "Viscosidade SAE"),
          texto("especificacao", "Especificação / aprovação do fabricante"),
          texto("produto", "Marca, produto e lote"),
          numero("volume", "Volume aplicado", "L"),
          area("filtros", "Filtros substituídos e referências"),
        ],
      },
      {
        nome: "Conferência e retorno",
        campos: [
          texto("km_atual", "Quilometragem na troca"),
          texto("conferencia", "Nível e teste de vazamento"),
          ...proximaRevisao,
          {
            ...numero("km_por_dia", "Média de uso informada pelo cliente", "km/dia"),
            ajuda:
              "Opcional. Ajuda a estimar a data do próximo contato; não altera o intervalo recomendado pelo técnico.",
          },
          texto(
            "referencia_intervalo",
            "Referência do intervalo",
            "Manual / plano de manutenção e condição de uso.",
          ),
        ],
      },
    ],
    checklist: [
      "Aplicação e especificação conferidas",
      "Óleo e filtros identificados",
      "Vedação e fechamento conferidos",
      "Nível e ausência de vazamento conferidos",
      "Próxima troca orientada por tempo e quilometragem",
    ],
    etapas: [
      "Conferência da aplicação",
      "Troca de óleo e filtros",
      "Nível e vazamentos",
      "Registro da próxima troca",
    ],
    indicador: {
      nome: "Especificação e próxima troca registradas",
      campos: ["especificacao", "proxima_data"],
    },
  },
  acessorios: {
    foco: "Compatibilidade, instalação e entrega orientada",
    grupos: [
      {
        nome: "Produto e instalação",
        campos: [
          texto("produto", "Acessório / marca / modelo"),
          texto("serie", "Número de série / lote"),
          opcao("fornecimento", "Fornecido por", ["Empresa", "Cliente"]),
          area("compatibilidade", "Compatibilidade e adaptações autorizadas"),
          area("instalacao", "Pontos de instalação / ligações / fixações"),
        ],
      },
      {
        nome: "Teste e entrega",
        campos: [
          area("testes", "Testes de funcionamento e interferência"),
          area("configuracao", "Configurações e acessórios entregues"),
          area("orientacoes", "Orientações de uso, conservação e garantia"),
        ],
      },
    ],
    checklist: [
      "Produto e compatibilidade conferidos",
      "Alterações autorizadas registradas",
      "Fixação e conexões inspecionadas",
      "Funções originais e acessório testados",
      "Cliente orientado sobre o uso",
    ],
    etapas: [
      "Compatibilidade e preparação",
      "Instalação",
      "Configuração e testes",
      "Demonstração ao cliente",
    ],
    indicador: {
      nome: "Compatibilidade e testes registrados",
      campos: ["compatibilidade", "testes"],
    },
  },
  funilaria: {
    foco: "Avarias, autorização, painéis e processo de pintura",
    grupos: [
      {
        nome: "Avarias e autorização",
        campos: [
          area("paineis", "Painéis / peças a reparar ou substituir"),
          texto("seguradora", "Seguradora / responsável pela autorização"),
          texto("sinistro", "Sinistro / referência de autorização"),
          opcao("autorizacao", "Autorização do reparo", [
            "Aguardando vistoria",
            "Aguardando autorização",
            "Autorizado",
            "Particular",
          ]),
          area("adicionais", "Danos ocultos / complementos a aprovar"),
        ],
      },
      {
        nome: "Preparação e pintura",
        campos: [
          texto("cor", "Código da cor / variante"),
          texto("tinta", "Sistema de pintura / lote"),
          area("preparacao", "Preparação e reparos executados"),
          texto("cabine", "Cabine / recurso utilizado"),
          texto("cura", "Condição e tempo de cura"),
          area("conferencia", "Conferência de cor, montagem e acabamento"),
        ],
      },
    ],
    checklist: [
      "Avarias e painéis registrados",
      "Escopo e complementos autorizados",
      "Preparação e cor conferidas",
      "Montagem e funções verificadas",
      "Acabamento e limpeza final conferidos",
    ],
    etapas: [
      "Desmontagem e vistoria",
      "Funilaria",
      "Preparação",
      "Pintura e cura",
      "Montagem e acabamento",
      "Conferência final",
    ],
    indicador: {
      nome: "Cor e conferência final registradas",
      campos: ["cor", "conferencia"],
    },
  },
  assistencia_geral: {
    foco: "Equipamento, diagnóstico, proteção dos dados e teste final",
    grupos: [
      planejamentoServico,
      {
        nome: "Recepção e diagnóstico",
        campos: [
          texto("identificacao", "Série / IMEI / etiqueta de controle"),
          area("acessorios", "Acessórios e condição de entrada"),
          area("defeito", "Defeito relatado pelo cliente"),
          opcao("backup", "Cópia dos dados pelo cliente", [
            "Confirmada pelo cliente",
            "Cliente orientado",
            "Não se aplica",
          ]),
          opcao("modo_manutencao", "Modo de manutenção / reparo", [
            "Ativado pelo cliente",
            "Não disponível",
            "Não se aplica",
          ]),
          area(
            "diagnostico",
            "Diagnóstico e medições",
            "Registre resultados técnicos; não registre senhas do cliente.",
          ),
        ],
      },
      {
        nome: "Reparo e devolução",
        campos: [
          area("componentes", "Componentes / referências substituídas"),
          area("testes", "Testes finais e funções verificadas"),
          area("orientacoes", "Orientações e limitações informadas"),
          data("garantia_data", "Garantia acordada até"),
          data("retirada_prevista", "Retirada combinada"),
          texto("recebedor", "Pessoa que recebeu o equipamento"),
        ],
      },
    ],
    checklist: [
      "Equipamento e acessórios identificados",
      "Condição e defeito de entrada registrados",
      "Cuidados com os dados combinados",
      "Funções reparadas testadas",
      "Equipamento e acessórios conferidos na devolução",
    ],
    etapas: [
      "Triagem",
      "Diagnóstico",
      "Reparo",
      "Testes finais",
      "Disponível para retirada",
      "Entregue",
    ],
    indicador: {
      nome: "Diagnóstico e testes registrados",
      campos: ["diagnostico", "testes"],
    },
  },
  manutencao_geral: detalharManutencao("manutencao_geral", {
    foco: "Visita técnica, acesso ao local e histórico do ativo",
    grupos: [
      planejamentoServico,
      {
        nome: "Planejamento da visita",
        campos: [
          texto("ativo", "Etiqueta / identificação do ativo"),
          opcao("natureza", "Tipo de manutenção", [
            "Preventiva",
            "Corretiva",
            "Instalação",
            "Inspeção",
          ]),
          texto("contato", "Responsável no local"),
          area("acesso", "Janela de acesso e condições do local"),
          area("escopo", "Escopo / pontos de inspeção"),
        ],
      },
      {
        nome: "Execução e aceite",
        campos: [
          area("medicoes_entrada", "Medições e condição inicial"),
          area("materiais", "Materiais e componentes aplicados"),
          area("medicoes_saida", "Medições e testes finais"),
          numero("deslocamento", "Tempo de deslocamento", "min"),
          texto("aceite", "Nome de quem conferiu / referência do aceite"),
          data("proxima_data", "Próxima manutenção prevista"),
        ],
      },
    ],
    checklist: [
      "Acesso e ativo conferidos",
      "Condições de execução verificadas",
      "Serviço e materiais registrados",
      "Funcionamento após manutenção testado",
      "Responsável no local orientado",
    ],
    etapas: [
      "Planejamento",
      "Deslocamento",
      "Inspeção no local",
      "Execução",
      "Teste e aceite",
    ],
    indicador: {
      nome: "Medições finais e aceite registrados",
      campos: ["medicoes_saida", "aceite"],
    },
  }),
  limpeza_geral: {
    foco: "Escopo por ambiente, superfícies, produtos e aceite",
    grupos: [
      planejamentoServico,
      {
        nome: "Planejamento",
        campos: [
          numero("area", "Área contratada", "m²"),
          area("ambientes", "Ambientes incluídos e exclusões"),
          area("superficies", "Superfícies e restrições"),
          opcao("frequencia", "Frequência contratada", [
            "Avulsa",
            "Diária",
            "Semanal",
            "Quinzenal",
            "Mensal",
            "Personalizada",
          ]),
          texto("acesso", "Janela de acesso / responsável"),
        ],
      },
      {
        nome: "Execução e conferência",
        campos: [
          area(
            "produtos",
            "Produtos e diluições",
            "Use a diluição e compatibilidade indicadas pelo fabricante.",
          ),
          area("equipamentos", "Equipamentos / materiais utilizados"),
          area("resultado", "Ambientes concluídos e pendências"),
          texto("aceite", "Nome de quem conferiu / referência do aceite"),
          data("proxima_data", "Próxima visita prevista"),
        ],
      },
    ],
    checklist: [
      "Ambientes e exclusões combinados",
      "Superfícies e compatibilidade dos produtos conferidas",
      "Produtos preparados conforme orientação do fabricante",
      "Ambientes contratados conferidos",
      "Local liberado e responsável orientado",
    ],
    etapas: [
      "Preparação do local",
      "Limpeza por ambiente",
      "Acabamento",
      "Inspeção e aceite",
    ],
    indicador: {
      nome: "Produtos e aceite registrados",
      campos: ["produtos", "aceite"],
    },
  },
};

// Usa os mesmos campos persistidos na ficha, sem duplicar a digitação no formulário.
const recepcaoAutomotiva: Record<string, string[]> = {
  retifica: ["identificacao", "aplicacao"],
  mecanica: ["natureza", "sistema"],
  autoeletrica: ["circuito", "sistema_tensao"],
  autocenter: ["pneus"],
  borracharia: ["medida", "posicao", "avaliacao"],
  estetica: ["pacote", "areas"],
  lava_rapido: ["pacote", "vaga"],
  troca_oleo: [
    "viscosidade",
    "especificacao",
    "volume",
    "km_atual",
    "proxima_km",
    "km_por_dia",
  ],
  acessorios: ["produto", "fornecimento"],
  funilaria: ["autorizacao", "sinistro", "cor"],
};
for (const [id, perfil] of Object.entries(perfisAtendimento)) {
  if (id.startsWith("limpeza_")) perfisAtendimento[id] = detalharLimpeza(id, perfil);
  else if (recepcaoAutomotiva[id])
    perfisAtendimento[id] = { ...perfil, recepcaoRapida: recepcaoAutomotiva[id] };
}

export function perfilAtendimento(especialidade?: string | null, ramo?: Ramo) {
  const id =
    especialidade && Object.hasOwn(perfisAtendimento, especialidade)
      ? especialidade
      : especialidadePadrao(ramo);
  return { id, nome: especialidades[id].nome, ...perfisAtendimento[id] };
}
export function novaFichaEspecialidade(especialidade: string): FichaEspecialidade {
  return {
    versao: 1,
    especialidade: perfilAtendimento(especialidade).id,
    campos: {},
    checklist: {},
    etapa: "",
  };
}
export function validarFichaEspecialidade(
  valor: unknown,
): asserts valor is FichaEspecialidade {
  const objeto = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v);
  if (
    !objeto(valor) ||
    valor.versao !== 1 ||
    typeof valor.especialidade !== "string" ||
    !Object.hasOwn(perfisAtendimento, valor.especialidade) ||
    !objeto(valor.campos) ||
    !objeto(valor.checklist) ||
    typeof valor.etapa !== "string" ||
    Object.keys(valor).some(
      (k) => !["versao", "especialidade", "campos", "checklist", "etapa"].includes(k),
    )
  )
    throw new Error("Ficha técnica inválida.");
  const p = perfisAtendimento[valor.especialidade];
  if (new TextEncoder().encode(JSON.stringify(valor)).length > 44000)
    throw new Error(
      "A ficha técnica está muito extensa. Resuma as anotações antes de salvar.",
    );
  const campos = new Map(p.grupos.flatMap((g) => g.campos).map((c) => [c.id, c]));
  for (const [k, v] of Object.entries(valor.campos)) {
    const c = campos.get(k);
    if (!c || typeof v !== "string" || v.length > 1500)
      throw new Error("Campo técnico inválido.");
    if (!v) continue;
    if (c.tipo === "numero" && (!/^\d{1,9}(\.\d{1,3})?$/.test(v) || Number(v) < 0))
      throw new Error(`Informe um número válido em ${c.nome}.`);
    if (
      c.tipo === "data" &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(v) ||
        v.startsWith("0000-") ||
        !Number.isFinite(Date.parse(v)) ||
        new Date(v).toISOString().slice(0, 10) !== v)
    )
      throw new Error(`Informe uma data válida em ${c.nome}.`);
    if (c.opcoes && !c.opcoes.includes(v))
      throw new Error(`Opção inválida em ${c.nome}.`);
  }
  if (
    Object.entries(valor.checklist).some(
      ([k, v]) => !p.checklist.includes(k) || typeof v !== "boolean",
    ) ||
    (valor.etapa && !p.etapas.includes(valor.etapa))
  )
    throw new Error("Conferência ou etapa inválida.");
}
export function temFichaEspecialidade(f?: FichaEspecialidade | null) {
  return (
    !!f &&
    (Object.values(f.campos).some((v) => v.trim()) ||
      Object.values(f.checklist).some(Boolean) ||
      !!f.etapa)
  );
}
export function gruposFichaEspecialidade(f?: FichaEspecialidade | null) {
  if (!f || !temFichaEspecialidade(f)) return [];
  const p = perfilAtendimento(f.especialidade);
  const grupos = p.grupos
    .map((g) => ({
      titulo: `${p.nome} · ${g.nome}`,
      campos: g.campos
        .filter((c) => f.campos[c.id]?.trim())
        .map((c) => ({
          rotulo: c.nome,
          valor:
            (c.tipo === "data"
              ? f.campos[c.id].split("-").reverse().join("/")
              : c.rotulosOpcoes?.[f.campos[c.id]] || f.campos[c.id]) +
            (c.unidade ? ` ${c.unidade}` : ""),
        })),
    }))
    .filter((g) => g.campos.length);
  if (f.etapa)
    grupos.push({
      titulo: "Etapa técnica",
      campos: [{ rotulo: p.nome, valor: f.etapa }],
    });
  if (Object.values(f.checklist).some(Boolean))
    grupos.push({
      titulo: `Conferência · ${p.nome}`,
      campos: p.checklist.map((c) => ({
        rotulo: c,
        valor: f.checklist[c] ? "Conferido" : "Não marcado",
      })),
    });
  return grupos;
}
