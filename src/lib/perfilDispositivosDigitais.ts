import type { PerfilAtendimento } from "./perfisAtendimento.ts";
import { texto, area, data, opcao } from "./camposTecnicos.ts";

const funcionamento = () =>
  opcao("liga", "Condição de funcionamento na entrada", [
    "Liga normalmente",
    "Liga com falhas",
    "Não liga",
    "Não foi possível testar",
  ]);
const dadosCliente = {
  nome: "Dados e autorizações",
  campos: [
    opcao("backup", "Cópia dos dados pelo cliente", [
      "Confirmada pelo cliente",
      "Cliente orientado",
      "Não se aplica",
      "Não foi possível realizar",
      "Pendente de confirmação",
    ]),
    area(
      "backup_escopo",
      "Dados a preservar e escopo combinado",
      "Registre o combinado e eventuais limitações. Não copie arquivos pessoais, senhas ou chaves para esta ficha.",
    ),
    opcao("modo_manutencao", "Preparação para o reparo", [
      "Modo de manutenção ativado pelo cliente",
      "Acesso acompanhado pelo cliente",
      "Não disponível",
      "Não se aplica",
    ]),
    opcao("autorizacao_dados", "Autorização para restaurar / apagar dados", [
      "Não autorizada",
      "Autorização registrada",
      "Não se aplica",
    ]),
    texto(
      "referencia_autorizacao",
      "Referência da autorização sobre os dados",
      "Ex.: data, canal e escopo autorizado pelo cliente. Aprovar o orçamento não autoriza apagar dados.",
    ),
  ],
};
const devolucao = {
  nome: "Validação e devolução",
  campos: [
    area("componentes", "Componentes / referências substituídas"),
    area("testes", "Testes finais e resultados"),
    opcao("resultado_teste", "Resultado da validação", [
      "Aprovado nos testes",
      "Reprovado nos testes",
      "Teste parcial",
      "Não foi possível testar",
    ]),
    area(
      "limitacoes_teste",
      "Funções não testadas e limitações",
      "Ex.: aparelho bloqueado, ausência de acessório ou falha que não se repetiu. Concluir o atendimento não aprova os testes automaticamente.",
    ),
    area("orientacoes", "Orientações e limitações informadas"),
    data("garantia_data", "Garantia acordada até"),
    data("retirada_prevista", "Retirada combinada"),
    texto("recebedor", "Pessoa que recebeu o equipamento"),
  ],
};

export const perfilCelulares: PerfilAtendimento = {
  foco: "Condição do aparelho, proteção dos dados, reparo e comparação dos testes de entrada e saída",
  recepcaoRapida: ["tipo_aparelho", "liga", "backup", "autorizacao_dados"],
  grupos: [
    {
      nome: "Aparelho e recepção",
      campos: [
        opcao("tipo_aparelho", "Tipo de aparelho", ["Celular", "Tablet", "Outro"]),
        texto("identificacao", "IMEI / número de série / etiqueta de controle"),
        texto("imei_secundario", "Segundo IMEI (quando houver)"),
        area("acessorios", "Acessórios e condição de entrada"),
        opcao("sim_memoria", "Chip e cartão de memória", [
          "Retirados pelo cliente",
          "Recebidos e identificados",
          "Não possui",
          "Não conferido",
        ]),
        area("defeito", "Defeito relatado pelo cliente"),
        funcionamento(),
        area(
          "funcoes_entrada",
          "Tela, toque, câmeras, áudio, carga e conectividade na entrada",
        ),
        area("liquido", "Marcas de líquido / oxidação e evidências"),
      ],
    },
    dadosCliente,
    {
      nome: "Diagnóstico e reparo",
      campos: [
        area(
          "diagnostico",
          "Diagnóstico e testes de bancada",
          "Não registre senhas, códigos de desbloqueio ou credenciais do cliente.",
        ),
        area(
          "bateria",
          "Bateria, carga e comportamento observado",
          "Registre medições com unidade, alertas e condições do teste.",
        ),
        area(
          "funcoes_saida",
          "Tela, toque, câmeras, áudio, carga e conectividade após o reparo",
        ),
      ],
    },
    devolucao,
  ],
  checklist: [
    "Equipamento e acessórios identificados",
    "Condição de entrada registrada",
    "Cuidados com os dados combinados",
    "Tela, toque e funções afetadas testados",
    "Carga e conectividade verificadas",
    "Reparo e limitações explicados na devolução",
  ],
  etapas: [
    "Triagem",
    "Diagnóstico",
    "Reparo",
    "Testes funcionais",
    "Pronto para retirada",
    "Entregue",
  ],
  indicador: {
    nome: "Diagnóstico e testes registrados",
    campos: ["diagnostico", "testes"],
  },
};

export const perfilInformatica: PerfilAtendimento = {
  foco: "Hardware, software, preservação dos dados e estabilidade antes da devolução",
  recepcaoRapida: ["tipo_aparelho", "liga", "backup", "autorizacao_dados"],
  grupos: [
    {
      nome: "Equipamento e recepção",
      campos: [
        opcao("tipo_aparelho", "Tipo de equipamento", [
          "Notebook",
          "Desktop",
          "All-in-one",
          "Mini PC",
          "Outro",
        ]),
        texto("identificacao", "Número de série / etiqueta de serviço"),
        area("acessorios", "Acessórios e condição de entrada"),
        area("defeito", "Defeito relatado pelo cliente"),
        funcionamento(),
        area("configuracao", "Processador, memória, armazenamento e sistema"),
        area("falhas", "Erros, códigos e condições em que a falha ocorre"),
      ],
    },
    {
      ...dadosCliente,
      campos: [
        ...dadosCliente.campos,
        opcao("criptografia", "Criptografia do armazenamento", [
          "Não verificada",
          "Não ativada",
          "Ativada — acesso acompanhado pelo cliente",
          "Ativada — acesso indisponível",
          "Não se aplica",
        ]),
      ],
    },
    {
      nome: "Hardware, software e estabilidade",
      campos: [
        area("diagnostico", "Diagnóstico de hardware / software"),
        area("armazenamento", "Resultado dos testes de armazenamento e memória"),
        area(
          "software",
          "Software / licenças / configurações autorizadas",
          "Registre produtos e intervenções, sem senhas, chaves de ativação ou recuperação.",
        ),
        area("termico", "Temperaturas e comportamento sob carga (com unidades)"),
        area("perifericos", "Teclado, portas, rede, áudio e periféricos conferidos"),
        area("estabilidade", "Inicialização, estabilidade e duração do teste"),
      ],
    },
    devolucao,
  ],
  checklist: [
    "Equipamento e acessórios identificados",
    "Condição de entrada registrada",
    "Backup e autorização para dados registrados",
    "Inicialização e estabilidade testadas",
    "Periféricos e funções afetadas conferidos",
    "Reparo e limitações explicados na devolução",
  ],
  etapas: [
    "Triagem",
    "Diagnóstico",
    "Reparo de hardware",
    "Configuração de software",
    "Teste de estabilidade",
    "Pronto para retirada",
    "Entregue",
  ],
  indicador: {
    nome: "Diagnóstico e testes registrados",
    campos: ["diagnostico", "testes"],
  },
};
