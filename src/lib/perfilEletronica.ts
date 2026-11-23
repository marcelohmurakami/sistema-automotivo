import type { PerfilAtendimento } from "./perfisAtendimento.ts";
import { texto, area, numero, data, opcao } from "./camposTecnicos.ts";

export const perfilEletronica: PerfilAtendimento = {
  foco: "Rastreabilidade da placa, diagnóstico por ponto e validação do reparo em bancada",
  recepcaoRapida: ["objeto_recebido", "placa", "revisao_placa", "equipamento_origem"],
  grupos: [
    {
      nome: "Identificação e rastreabilidade",
      campos: [
        opcao("objeto_recebido", "O que foi recebido?", [
          "Equipamento completo",
          "Placa avulsa",
          "Módulo / fonte",
        ]),
        texto("placa", "Placa / referência / código"),
        texto("revisao_placa", "Revisão da placa"),
        texto("equipamento_origem", "Equipamento de origem / marca / modelo"),
        texto("identificacao", "Número de série / etiqueta de bancada"),
        area("acessorios", "Cabos, fontes, módulos e condição de entrada"),
        area("defeito", "Defeito relatado pelo cliente"),
      ],
    },
    {
      nome: "Inspeção e diagnóstico",
      campos: [
        opcao("ocorrencia", "Comportamento da falha", [
          "Permanente",
          "Intermitente",
          "Após aquecimento",
          "Sob carga",
          "Não reproduzida",
        ]),
        area("intervencoes_anteriores", "Reparos anteriores / alterações encontradas"),
        area("inspecao", "Inspeção: oxidação, danos, trilhas e conectores"),
        texto("fonte", "Fonte / alimentação nominal"),
        area("esquema", "Referência do esquema / documentação técnica"),
        area(
          "medicoes_entrada",
          "Medições antes do reparo",
          "Identifique ponto ou componente, referência do instrumento, valor esperado, valor medido e unidade.",
        ),
        area("diagnostico", "Diagnóstico, pontos medidos e resultados"),
      ],
    },
    {
      nome: "Intervenção na placa",
      campos: [
        area(
          "componentes",
          "Componentes substituídos e rastreabilidade",
          "Registre posição (ex.: U3 ou C12), código original e aplicado, origem / lote e motivo da substituição.",
        ),
        area("trilhas", "Trilhas, pads, conectores e soldas reparados"),
        area(
          "firmware",
          "Firmware / configuração autorizada",
          "Versões antes e depois, referência da autorização e resultado. Não registre senhas ou credenciais.",
        ),
        area("inspecao_saida", "Inspeção após o retrabalho / reparo"),
      ],
    },
    {
      nome: "Ensaio e validação",
      campos: [
        opcao("condicao_ensaio", "Condição disponível para testar", [
          "Equipamento original completo",
          "Somente placa / módulo",
          "Simulador / carga de teste",
        ]),
        area(
          "medicoes_saida",
          "Medições após o reparo",
          "Use a mesma identificação dos pontos de entrada para permitir comparação.",
        ),
        numero("duracao_ensaio", "Duração do ensaio", "min"),
        area(
          "ensaio",
          "Condições e duração do ensaio de bancada",
          "Informe carga, instrumentos, comportamento térmico e repetições quando aplicáveis.",
        ),
        opcao("resultado_teste", "Resultado da validação", [
          "Aprovado nos testes",
          "Reprovado nos testes",
          "Teste parcial",
          "Não foi possível testar",
        ]),
        area(
          "limitacoes_teste",
          "Funções não testadas / dependências do equipamento",
          "Teste de placa isolada não comprova o funcionamento do equipamento completo. Registre o alcance do ensaio.",
        ),
        area("testes", "Resultado final e funções verificadas"),
      ],
    },
    {
      nome: "Proteção e devolução",
      campos: [
        opcao("protecao_esd", "Registro de proteção ESD / acondicionamento", [
          "Conferido e registrado",
          "Pendente",
          "Não se aplica",
        ]),
        area("embalagem", "Embalagem, identificação e acessórios devolvidos"),
        area("orientacoes", "Orientações e limitações informadas ao cliente"),
        data("garantia_data", "Garantia acordada até"),
        data("retirada_prevista", "Retirada combinada"),
        texto("recebedor", "Pessoa que recebeu o equipamento ou placa"),
      ],
    },
  ],
  checklist: [
    "Equipamento e acessórios identificados",
    "Condição de entrada registrada",
    "Placa e revisão identificadas",
    "Componentes substituídos rastreados",
    "Ensaio de funcionamento concluído",
    "Reparo e limitações explicados na devolução",
  ],
  etapas: [
    "Triagem",
    "Diagnóstico de bancada",
    "Reparo de placa",
    "Ensaio",
    "Pronto para retirada",
    "Entregue",
    "Aguardando equipamento para teste",
  ],
  indicador: {
    nome: "Diagnóstico, medições finais e validação registrados",
    campos: ["diagnostico", "medicoes_saida", "resultado_teste"],
  },
};
