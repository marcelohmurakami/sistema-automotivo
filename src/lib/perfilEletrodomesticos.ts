import type { CampoTecnico, PerfilAtendimento } from "./perfisAtendimento.ts";
import { texto, area, data, opcao } from "./camposTecnicos.ts";

const familia = (campo: CampoTecnico, valores: string[]): CampoTecnico => ({
  ...campo,
  quando: { campo: "familia", valores },
});
const domicilio = (campo: CampoTecnico): CampoTecnico => ({
  ...campo,
  quando: { campo: "modalidade", valores: ["Domicílio"] },
});

// As chaves e opções existentes continuam válidas para as fichas já salvas.
export const perfilEletrodomesticos: PerfilAtendimento = {
  foco: "Visita ou bancada, identificação do produto, instalação e testes por aparelho",
  recepcaoRapida: ["familia", "modalidade", "endereco_visita", "contato_visita"],
  grupos: [
    {
      nome: "Produto e recepção",
      campos: [
        opcao("familia", "Tipo de eletrodoméstico", [
          "Lavadora",
          "Lava e seca",
          "Secadora",
          "Lava-louças",
          "Geladeira / freezer",
          "Fogão / forno / cooktop",
          "Micro-ondas",
          "Portátil",
          "Outro",
        ]),
        texto("identificacao", "Número de série / etiqueta de controle"),
        texto(
          "codigo_produto",
          "Código completo do produto / PNC",
          "Identifique a versão da etiqueta para conferir peças e documentação do modelo.",
        ),
        texto(
          "tensao",
          "Alimentação indicada na etiqueta",
          "Ex.: 127 V, 220 V ou gás; copie a identificação do fabricante.",
        ),
        area("acessorios", "Acessórios recebidos e avarias de entrada"),
        area("defeito", "Defeito relatado pelo cliente"),
      ],
    },
    {
      nome: "Visita e instalação",
      campos: [
        opcao("modalidade", "Local do atendimento", ["Bancada", "Domicílio"]),
        domicilio(texto("endereco_visita", "Endereço e acesso da visita")),
        domicilio(texto("contato_visita", "Quem acompanha a visita / contato")),
        domicilio(
          texto(
            "janela_visita",
            "Disponibilidade para visita",
            "Ex.: manhã, portaria e restrições de acesso. O horário é reservado na Agenda.",
          ),
        ),
        opcao("cobertura", "Origem do atendimento", [
          "Particular",
          "Garantia do fabricante",
          "Garantia estendida",
          "Retorno de serviço",
        ]),
        texto(
          "protocolo",
          "Nota fiscal / protocolo / OS anterior",
          "Referência para consulta; não representa aprovação automática de garantia.",
        ),
        area(
          "instalacao",
          "Condição da instalação, alimentação e conexões",
          "Registre as condições encontradas e a referência do manual usado.",
        ),
      ],
    },
    {
      nome: "Diagnóstico",
      campos: [
        texto("codigo_erro", "Código de erro exibido"),
        area(
          "ocorrencia",
          "Quando a falha ocorre?",
          "Ex.: no início, ao aquecer, ao drenar ou depois de algum tempo de uso.",
        ),
        area("diagnostico", "Diagnóstico e medições (com unidades)"),
        texto("documentacao", "Manual / documentação técnica consultada"),
      ],
    },
    {
      nome: "Conferência do aparelho",
      campos: [
        familia(
          area(
            "lavagem",
            "Entrada de água, lavagem, drenagem e centrifugação",
            "Registre as funções aplicáveis e os resultados; indique as que não puderam ser testadas.",
          ),
          ["Lavadora", "Lava e seca", "Lava-louças"],
        ),
        familia(area("secagem", "Aquecimento, secagem e ventilação"), [
          "Secadora",
          "Lava e seca",
        ]),
        familia(
          area(
            "refrigeracao",
            "Temperaturas, estabilização e funcionamento",
            "Identifique compartimento, temperatura em °C, tempo observado e condições do teste.",
          ),
          ["Geladeira / freezer"],
        ),
        familia(
          area(
            "aquecimento",
            "Aquecimento, comandos e funcionamento",
            "Registre a verificação profissional conforme a documentação do modelo, incluindo limitações.",
          ),
          ["Fogão / forno / cooktop", "Micro-ondas"],
        ),
        familia(area("teste_portatil", "Funções do aparelho e condições do teste"), [
          "Portátil",
          "Outro",
        ]),
        area(
          "ciclo",
          "Ciclo / programa testado e resultado",
          "Informe programa ou função, duração e carga usada quando aplicável.",
        ),
        opcao("resultado_teste", "Resultado da validação", [
          "Aprovado nos testes",
          "Reprovado nos testes",
          "Teste parcial",
          "Não foi possível testar",
        ]),
        area("limitacoes_teste", "O que ficou sem testar e por quê?"),
      ],
    },
    {
      nome: "Reparo e conclusão",
      campos: [
        area("componentes", "Peças aplicadas / códigos / referências"),
        area("testes", "Resultado final após o reparo"),
        area("orientacoes", "Orientações e limitações informadas ao cliente"),
        data("garantia_data", "Garantia acordada até"),
        data("retirada_prevista", "Retirada / entrega combinada"),
        texto("recebedor", "Quem recebeu ou conferiu o serviço"),
      ],
    },
  ],
  checklist: [
    "Equipamento e acessórios identificados",
    "Condição de entrada registrada",
    "Alimentação e instalação verificadas",
    "Ciclo de funcionamento testado",
    "Conexões e ausência de vazamentos conferidas quando aplicável",
    "Reparo e limitações explicados na devolução",
  ],
  etapas: [
    "Triagem / visita",
    "Diagnóstico",
    "Reparo",
    "Teste de ciclo",
    "Pronto para entrega",
    "Entregue",
    "Serviço concluído no local",
    "Aceite registrado",
  ],
  indicador: {
    nome: "Diagnóstico e validação final registrados",
    campos: ["diagnostico", "testes", "resultado_teste"],
  },
};
