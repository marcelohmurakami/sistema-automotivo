import type { DetalhesAtendimento } from "../types/servicosCompletos";
import type { Identidade } from "../services/documentos";
import { especialidades } from "./especialidades.ts";
import {
  dataDocumento,
  moedaDocumento,
  type DocumentoCliente,
} from "./documentoCliente.ts";

/** Conteúdo público do atendimento no mesmo modelo impresso usado pelas OS. */
export function documentoAtendimento(
  d: DetalhesAtendimento,
  empresa: Identidade,
  modo: "atendimento" | "orcamento" = "atendimento",
): DocumentoCliente {
  const a = d.atendimento,
    ficha = a.ficha_especialidade,
    c = ficha?.campos || {};
  const especialidade =
    ficha?.especialidade || empresa.especialidade || "assistencia_geral";
  const ramo = especialidades[especialidade]?.ramo;
  const assistencia = ramo === "assistencia_tecnica",
    limpeza = ramo === "limpeza";
  const orcamento = modo === "orcamento";
  const mostrarDesconto = orcamento || a.mostrar_desconto_nota === true;
  const descontoReal =
    (d.comercial.desconto_centavos || 0) +
    (d.comercial.abatimento_diagnostico_centavos || 0);
  const numero = String(a.numero || a.id.slice(0, 8)).padStart(4, "0");
  const dadosBem = [
    `${assistencia ? "Equipamento" : limpeza ? "Local do serviço" : "Equipamento / local"}: ${d.objeto.nome}`,
    d.objeto.dados.marca && `Marca: ${d.objeto.dados.marca}`,
    d.objeto.dados.modelo && `Modelo: ${d.objeto.dados.modelo}`,
  ].filter((v): v is string => !!v);
  const identificar = (nome: string, valor?: string) => {
    if (valor) dadosBem.push(`${nome}: ${valor}`);
  };
  if (assistencia) {
    identificar(
      especialidade === "assistencia_celulares"
        ? "IMEI / série"
        : "Série / identificação",
      c.identificacao || d.objeto.dados.serie,
    );
    if (especialidade === "assistencia_celulares")
      identificar("Segundo IMEI", c.imei_secundario);
    if (especialidade === "assistencia_eletrodomesticos") {
      identificar("Código do produto / PNC", c.codigo_produto);
      if (c.modalidade === "Domicílio") {
        identificar("Modalidade", "atendimento no domicílio");
        identificar("Endereço da visita", c.endereco_visita || d.objeto.dados.endereco);
      }
    }
    if (especialidade === "assistencia_eletronica") {
      identificar("Placa", c.placa);
      identificar("Revisão", c.revisao_placa);
    }
  } else {
    identificar("Local do serviço", c.endereco_visita || d.objeto.dados.endereco);
    if (!limpeza) identificar("Ativo / identificação", c.ativo || d.objeto.dados.serie);
  }
  const secoes: DocumentoCliente["secoes"] = [];
  const secao = (titulo: string, texto?: string) => {
    if (texto?.trim()) secoes.push({ titulo, texto });
  };
  secao("Descrição do serviço", a.dados.descricao_servico);
  if (d.taxa_diagnostico?.valor_centavos)
    secao(
      "Taxa de diagnóstico",
      `Cobrança separada: ${moedaDocumento(d.taxa_diagnostico.valor_centavos)}. ${orcamento ? (d.taxa_diagnostico.abater_na_aprovacao ? "Será abatida dos serviços autorizados, limitada ao valor aprovado. Em caso de recusa, a taxa continua devida." : "Sem abatimento nos serviços, inclusive se o orçamento for recusado.") : mostrarDesconto ? `Abatimento incluído neste documento: ${moedaDocumento(d.comercial.abatimento_diagnostico_centavos || 0)}.` : ""} Não comprova recebimento.`,
    );
  if (limpeza) {
    secao("Escopo", a.dados.solicitacao);
    for (const [id, nome] of [
      ["area", "Área contratada (m²)"],
      ["ambientes", "Ambientes incluídos"],
      ["frequencia", "Frequência"],
      ["base_cobranca", "Contratação"],
      ["exclusoes", "Não incluído"],
      ["pecas", "Bens a higienizar"],
      ["tipo_bem", "Bem a higienizar"],
      ["quantidade_lugares", "Lugares / unidades"],
      ["modalidade", "Local da higienização"],
    ])
      secao(nome, c[id]);
  }
  for (const [id, titulo] of [
    ["execucao", "Serviços realizados"],
    ["observacoes_cliente", "Observações"],
    ["condicoes", "Condições"],
    ["orientacoes", "Orientações"],
    ["garantia", "Condições de garantia"],
  ]) {
    if (orcamento && id === "execucao") continue;
    secao(
      titulo,
      [
        ...new Set(
          [a.dados[id], ...(id === "orientacoes" ? [c.orientacoes] : [])].filter(
            Boolean,
          ),
        ),
      ].join("\n"),
    );
  }
  if (!orcamento) {
    const camposPublicos = assistencia
      ? [
          ["condicao_ensaio", "Condição do ensaio"],
          ["resultado_teste", "Resultado registrado"],
          ["limitacoes_teste", "Limitações"],
        ]
      : [
          ...(limpeza
            ? [
                ["resultado", "Serviço realizado"],
                ["resultado_vistoria", "Vistoria"],
                ["resultado_manchas", "Resultado nas manchas"],
                ["liberacao_uso", "Liberação de uso"],
                ["secagem_horas", "Secagem estimada (h)"],
                ["condicoes_secagem", "Condições da secagem"],
              ]
            : [
                ["intervencao", "Intervenção realizada"],
                ["resultado_teste", "Resultado dos testes"],
                ["limitacoes_teste", "Limitações dos testes"],
                ["condicao_uso", "Condição de uso"],
              ]),
          ["restricoes_uso", "Restrições de uso"],
          ["pendencias_finais", "Pendências e orientações"],
          ["situacao_aceite", "Conferência do cliente"],
          ["aceite", "Conferido por"],
          ["ressalvas_aceite", "Ressalvas"],
        ];
    for (const [id, rotulo] of camposPublicos) secao(rotulo, c[id]);
    if (!assistencia) {
      if (c.data_aceite)
        secao("Data da conferência", dataDocumento(c.data_aceite, false));
      if (c.proxima_data)
        secao(
          limpeza ? "Próxima visita prevista" : "Próxima manutenção prevista",
          dataDocumento(c.proxima_data, false),
        );
    }
  }
  if (c.garantia_data)
    secao("Garantia acordada até", dataDocumento(c.garantia_data, false));
  const itens = d.itens.length
    ? d.itens.map((i) => ({
        descricao: i.descricao,
        tipo: i.tipo === "material" ? ("part" as const) : ("service" as const),
        quantidade: i.quantidade,
        unidade: i.unidade,
        preco_unitario_centavos: i.preco_centavos,
        total: Math.round(i.quantidade * i.preco_centavos),
        cancelado: false,
      }))
    : [
        {
          descricao: a.titulo,
          tipo: "service" as const,
          quantidade: 1,
          unidade: "serv",
          preco_unitario_centavos: a.valor_centavos + descontoReal,
          total: a.valor_centavos + descontoReal,
          cancelado: false,
        },
      ];
  return {
    tipo: orcamento ? "orcamento" : "os",
    titulo: orcamento ? "Orçamento" : "Ordem de serviço",
    numero,
    arquivo: `${modo}-${numero}.pdf`,
    identidade: empresa,
    situacao: a.situacao,
    destaque: a.situacao === "cancelado",
    cliente: d.cliente.nome,
    telefoneCliente: d.cliente.telefone,
    veiculo: "",
    placa: "",
    bem: {
      rotulo: assistencia
        ? "Equipamento / marca"
        : limpeza
          ? "Local e identificação"
          : "Equipamento / instalação",
      valor: dadosBem.join("\n"),
    },
    tituloItens: assistencia ? "SERVIÇOS E PEÇAS" : "SERVIÇOS E MATERIAIS",
    rotuloMateriais: assistencia ? "Peça" : "Material",
    informacoes: [
      {
        rotulo: "Data do serviço",
        valor: dataDocumento(a.data_servico || a.vencimento, false),
      },
      ...(a.dados.entrega_prevista_em
        ? [
            {
              rotulo: "Entrega prometida",
              valor: dataDocumento(a.dados.entrega_prevista_em),
            },
          ]
        : []),
    ],
    formaPagamento: a.dados.forma_pagamento,
    vencimento: a.vencimento,
    itens,
    subtotal: itens.reduce((s, i) => s + i.total, 0),
    mostrarDesconto,
    desconto: mostrarDesconto ? descontoReal : 0,
    total: mostrarDesconto ? a.valor_centavos : itens.reduce((s, i) => s + i.total, 0),
    secoes,
    assinatura: orcamento
      ? "Ciência do orçamento pelo cliente"
      : "Conferência dos serviços e materiais relacionados nesta ordem de serviço.",
    aviso: orcamento
      ? "Proposta sujeita à aprovação do cliente. Sem valor fiscal."
      : "Sem valor fiscal. Este documento não comprova pagamento.",
  };
}
