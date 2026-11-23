import type { Identidade } from "../services/documentos.ts";
import type { OrdemServico } from "../services/ordensServico.ts";
import type { ItemProposta, Proposta } from "../services/orcamentos.ts";
import { dinheiro } from "./formatacao.ts";

const quantidadeFormatada = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 3,
});
const formatoDiaDocumento = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
});
const formatoHorarioDocumento = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

export const temInformacaoDocumento = (v?: string | null) =>
  !!v?.trim() &&
  !/^(não informad[oa]|documento não informado|sem placa|ainda não finalizado|[-—])$/i.test(
    v.trim(),
  );
export function telefoneDocumento(valor?: string | null) {
  if (!valor) return "";
  let n = valor.replace(/\D/g, "");
  if ((n.length === 12 || n.length === 13) && n.startsWith("55")) n = n.slice(2);
  return n.length === 11
    ? "(" + n.slice(0, 2) + ") " + n.slice(2, 7) + "-" + n.slice(7)
    : n.length === 10
      ? "(" + n.slice(0, 2) + ") " + n.slice(2, 6) + "-" + n.slice(6)
      : valor;
}
export const moedaDocumento = dinheiro;
export const quantidadeDocumento = (valor: number) => quantidadeFormatada.format(valor);
export const dataDocumento = (valor?: string | null, horario = true) => {
  if (!valor || !Number.isFinite(Date.parse(valor))) return "Não informada";
  return (horario ? formatoHorarioDocumento : formatoDiaDocumento).format(
    new Date(valor.length === 10 ? valor + "T12:00:00-03:00" : valor),
  );
};
export const corDocumento = (cor?: string) =>
  /^#[0-9a-f]{6}$/i.test(cor || "") ? cor! : "#244336";
export const logoDocumento = (logo?: string) =>
  /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(logo || "") ? logo : undefined;
export type DocumentoCliente = {
  comprovante?: boolean;
  mostrarDesconto?: boolean;
  somenteRegistro?: boolean;
  tipo: "os" | "orcamento";
  titulo: string;
  numero: string;
  versao?: number;
  arquivo: string;
  identidade: Identidade;
  situacao: string;
  destaque: boolean;
  cliente: string;
  telefoneCliente?: string | null;
  documentoCliente?: string;
  enderecoCliente?: string;
  veiculo: string;
  motor?: string;
  retifica?: boolean;
  vencimento?: string;
  formaPagamento?: string;
  pixCopiaCola?: string;
  placa: string;
  bem?: { rotulo: string; valor: string };
  rotuloMateriais?: string;
  tituloItens?: string;
  informacoes: { rotulo: string; valor: string }[];
  itens: (ItemProposta & { total: number; cancelado: boolean })[];
  subtotal: number;
  desconto: number;
  total: number;
  secoes: { titulo: string; texto: string }[];
  confirmacao?: string;
  assinatura: string;
  aviso: string;
};
function itensDocumento(itens: (ItemProposta & { situacao?: string })[]) {
  return itens.map((i) => ({
    descricao: i.descricao,
    tipo: i.tipo,
    unidade: i.unidade,
    quantidade: i.quantidade,
    preco_unitario_centavos: i.preco_unitario_centavos,
    total:
      i.total_item_centavos ?? Math.round(i.quantidade * i.preco_unitario_centavos),
    cancelado: i.situacao === "cancelled",
  }));
}
const statusOS: Record<string, string> = {
  open: "Recebida",
  in_progress: "Em execução",
  quality_check: "Conferência",
  ready: "Pronta para entrega",
  delivered: "Entregue",
  cancelled: "Cancelada",
};
const statusProposta: Record<string, string> = {
  draft: "Rascunho - não emitido",
  awaiting_approval: "Aguardando aprovação",
  approved: "Aprovado",
  declined: "Recusado",
  expired: "Validade encerrada",
  cancelled: "Cancelado",
  converted: "Convertido em OS",
};
export function documentoDaOS(
  o: OrdemServico,
  identidade: Identidade,
): DocumentoCliente {
  const itens = itensDocumento(o.itens);
  const subtotal = o.subtotal_centavos ?? itens.reduce((s, i) => s + i.total, 0);
  return {
    tipo: "os",
    titulo: "Ordem de serviço",
    numero: String(o.numero).padStart(4, "0"),
    arquivo: `ordem-servico-${o.numero}.pdf`,
    identidade,
    situacao:
      o.situacao === "cancelled"
        ? "Cancelada"
        : o.orcamento_aguardando_id
          ? "Aguardando aprovação"
          : statusOS[o.situacao] || o.situacao,
    destaque: o.situacao === "cancelled" || !!o.orcamento_aguardando_id,
    cliente: o.dados_cliente.nome,
    telefoneCliente: telefoneDocumento(o.dados_cliente.telefone_e164),
    documentoCliente: o.dados_cliente.documento,
    enderecoCliente: o.dados_cliente.endereco,
    vencimento: o.vencimento_pagamento || undefined,
    formaPagamento: o.forma_pagamento || "Carteira",
    veiculo: o.dados_veiculo.modelo,
    motor: o.dados_veiculo.motor,
    retifica:
      identidade.especialidade === "retifica" ||
      o.dados_veiculo.especialidade === "retifica",
    placa: o.dados_veiculo.placa || "Não informada",
    informacoes: [
      {
        rotulo: "Data do serviço",
        valor: dataDocumento(o.data_servico || o.concluido_em || o.criado_em, false),
      },

      ...(o.quilometragem_entrada != null
        ? [
            {
              rotulo: "Quilometragem de entrada",
              valor: `${quantidadeDocumento(o.quilometragem_entrada)} km`,
            },
          ]
        : []),
      ...(o.quilometragem_saida != null
        ? [
            {
              rotulo: "Quilometragem de saída",
              valor: `${quantidadeDocumento(o.quilometragem_saida)} km`,
            },
          ]
        : []),
    ],
    itens,
    subtotal,
    mostrarDesconto: o.mostrar_desconto_nota === true,
    desconto:
      o.mostrar_desconto_nota === true
        ? (o.desconto_centavos ?? Math.max(0, subtotal - o.total_centavos))
        : 0,
    total: o.mostrar_desconto_nota === true ? o.total_centavos : subtotal,
    // Somente informações destinadas ao cliente. Diagnóstico interno, custos e anotações não são impressos.
    secoes: [
      {
        titulo: "Observações",
        texto: o.resumo_cliente || "",
      },

      ...(o.orcamento_aguardando_id
        ? [
            {
              titulo: "Autorização pendente",
              texto:
                "Serviços e valores serão incorporados a esta ordem após a autorização do orçamento. O valor atual da OS não representa o valor da proposta pendente.",
            },
          ]
        : []),
      { titulo: "Relato do cliente", texto: o.queixa_cliente || "" },
      {
        titulo: "Garantia",
        texto: [
          o.condicoes_garantia,
          o.garantia_ate ? `Garantia até ${dataDocumento(o.garantia_ate, false)}.` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ].filter((s) => s.texto),
    confirmacao: o.autorizacao_oficina_em
      ? `Serviço autorizado pela oficina em ${dataDocumento(o.autorizacao_oficina_em)}.`
      : undefined,
    assinatura: `Reconheço todos os serviços prestados e iremos realizar o pagamento referente à OS Nº ${o.numero} prestado a nós.`,
    aviso: "Sem valor fiscal. Este documento não comprova pagamento.",
  };
}
export function documentoDoOrcamento(
  q: Proposta,
  agora = new Date(),
): DocumentoCliente {
  const v = q.versao;
  // A consulta pública não expõe os IDs internos e sempre serve a versão atual.
  const antiga = !!v.id && !!q.versao_atual_id && v.id !== q.versao_atual_id;
  const expirado =
    q.situacao === "awaiting_approval" &&
    !!v.expira_em &&
    Date.parse(v.expira_em) < +agora;
  const situacao =
    q.situacao === "cancelled"
      ? "Cancelado"
      : !v.publicado_em
        ? "Rascunho - não emitido"
        : antiga
          ? "Versão anterior"
          : expirado
            ? "Validade encerrada"
            : statusProposta[q.situacao] || q.situacao;
  return {
    tipo: "orcamento",
    titulo: "Orçamento",
    numero: String(q.numero).padStart(4, "0"),
    versao: v.numero_versao,
    arquivo: `orcamento-${q.numero}-v${v.numero_versao}.pdf`,
    identidade: v.dados_oficina,
    situacao,
    destaque: !v.publicado_em || q.situacao === "cancelled" || antiga || expirado,
    cliente: v.dados_cliente.nome,
    telefoneCliente: v.dados_cliente.telefone_e164,
    veiculo: [v.dados_veiculo.marca, v.dados_veiculo.modelo, v.dados_veiculo.ano_modelo]
      .filter(Boolean)
      .join(" "),
    placa: v.dados_veiculo.placa || "Não informada",
    retifica: v.dados_veiculo.especialidade === "retifica",
    motor: v.dados_veiculo.motor,
    informacoes: [
      {
        rotulo: "Emitido em",
        valor: v.publicado_em ? dataDocumento(v.publicado_em) : "Ainda não emitido",
      },
      { rotulo: "Válido até", valor: dataDocumento(v.expira_em) },
      ...(v.data_servico
        ? [{ rotulo: "Data do serviço", valor: dataDocumento(v.data_servico, false) }]
        : []),
      { rotulo: "Forma de pagamento", valor: v.forma_pagamento || "Carteira" },
      ...(v.vencimento_pagamento
        ? [
            {
              rotulo: "Vencimento do pagamento",
              valor: dataDocumento(v.vencimento_pagamento, false),
            },
          ]
        : []),
    ],
    itens: itensDocumento(q.itens).map((i, n) => ({
      ...i,
      descricao: `${q.itens[n].grupo_servico ? "[" + q.itens[n].grupo_servico + "] " : ""}${i.descricao}${q.itens[n].explicacao_cliente ? " — " + q.itens[n].explicacao_cliente : ""}${q.aprovacao?.grupos_aprovados && !q.aprovacao.grupos_aprovados.includes(q.itens[n].grupo_servico || "Atendimento") ? " (NÃO AUTORIZADO)" : ""}`,
    })),
    subtotal: v.subtotal_centavos,
    desconto: v.desconto_centavos,
    total: v.total_centavos,
    secoes: [
      ...(v.taxa_diagnostico?.valor_centavos
        ? [
            {
              titulo: "Taxa de diagnóstico",
              texto: `Cobrança separada: ${moedaDocumento(v.taxa_diagnostico.valor_centavos)}. ${v.taxa_diagnostico.abater_na_aprovacao ? "Será abatida dos serviços autorizados, limitada ao valor aprovado, inclusive na aprovação parcial." : "Não será abatida dos serviços."} Em caso de recusa, a taxa continua devida. O total da proposta preserva o valor dos serviços antes desse abatimento.`,
            },
          ]
        : []),
      ...(q.aprovacao?.total_aprovado_centavos != null
        ? [
            {
              titulo: "Autorização registrada",
              texto: `Valor autorizado: ${moedaDocumento(q.aprovacao.total_aprovado_centavos)}. Grupos autorizados: ${q.aprovacao.grupos_aprovados?.join(", ") || "nenhum"}. O total do orçamento preserva a proposta original; a OS inclui somente os grupos autorizados.`,
            },
          ]
        : []),
      {
        titulo: "Relação de peças a trocar (lista informativa)",
        texto: v.pecas_a_trocar || "",
      },
      { titulo: "Relato do cliente", texto: v.queixa_cliente || "" },
      { titulo: "Detalhes do serviço", texto: v.detalhes_especialidade || "" },
      { titulo: "Diagnóstico técnico", texto: v.diagnostico || "" },
      { titulo: "Códigos de falha / testes", texto: v.codigos_falha || "" },
      { titulo: "Observações", texto: v.observacoes },
      { titulo: "Condições de pagamento e execução", texto: v.condicoes },
    ].filter((s) => s.texto),
    confirmacao: q.aprovacao
      ? `${q.aprovacao.decisao === "approved" ? "Aprovado" : "Recusado"} por ${q.aprovacao.nome_informado} em ${dataDocumento(q.aprovacao.confirmado_em)}.`
      : undefined,
    assinatura: "Ciência do orçamento pelo cliente",
    aviso: "Documento de orçamento. Sem valor fiscal. Não comprova pagamento.",
  };
}

export function camposGradeOS(d: DocumentoCliente) {
  const valor = (v: string | undefined) => (temInformacaoDocumento(v) ? v! : "-");
  return [
    {
      rotulo: "Cliente / CPF/CNPJ",
      valor:
        "Nome: " +
        valor(d.cliente) +
        (temInformacaoDocumento(d.documentoCliente)
          ? "\nCPF/CNPJ: " + d.documentoCliente
          : ""),
    },
    { rotulo: "Telefone", valor: valor(telefoneDocumento(d.telefoneCliente)) },
    { rotulo: "Endereço", valor: valor(d.enderecoCliente) },
    {
      rotulo: d.bem?.rotulo || "Veículo / motor",
      valor:
        d.bem?.valor ||
        [
          "Veículo: " + valor(d.veiculo),
          (d.retifica ? "Motor: " : "Placa / motor: ") +
            valor(
              d.retifica
                ? d.motor
                : [d.placa, d.motor].filter(temInformacaoDocumento).join(" / "),
            ),
          ...d.informacoes
            .filter(
              (i) => i.rotulo !== "Data do serviço" && temInformacaoDocumento(i.valor),
            )
            .map((i) => i.rotulo + ": " + i.valor),
        ].join("\n"),
    },
    {
      rotulo: "Data do serviço",
      valor: valor(d.informacoes.find((i) => i.rotulo === "Data do serviço")?.valor),
    },
    { rotulo: "Forma de pagamento", valor: valor(d.formaPagamento) },
  ];
}
