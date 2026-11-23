import { gerarPdfCliente } from "./pdfCliente.ts";
import {
  dataDocumento,
  moedaDocumento,
  type DocumentoCliente,
} from "../lib/documentoCliente.ts";
import type { ComprovanteAutorizacao } from "../lib/diagnosticoOrcamento";

export function documentoDaAutorizacao(p: ComprovanteAutorizacao): DocumentoCliente {
  const d = p.documento;
  const aprovado = ["approved", "aprovado"].includes(p.decisao);
  const selecionados = aprovado
    ? d.itens.filter((i) => p.grupos.includes(i.grupo_servico || "Atendimento"))
    : [];
  const subtotal = selecionados.reduce(
    (s, i) => s + Math.round(i.quantidade * i.preco_centavos),
    0,
  );
  return {
    comprovante: true,
    tipo: "orcamento",
    titulo: aprovado ? "Comprovante de autorização" : "Comprovante de recusa",
    numero: String(d.numero),
    versao: d.versao,
    arquivo: `autorizacao-${d.numero}.pdf`,
    identidade: { nome: typeof d.empresa === "string" ? d.empresa : d.empresa.nome },
    situacao: aprovado ? "Autorizado" : "Recusado",
    destaque: !aprovado,
    cliente: d.cliente,
    veiculo: d.objeto,
    placa: "",
    bem: {
      rotulo:
        typeof d.empresa === "string"
          ? "Veículo / motor"
          : d.empresa.ramo === "assistencia_tecnica"
            ? "Equipamento"
            : d.empresa.ramo === "limpeza"
              ? "Local do serviço"
              : "Equipamento / local",
      valor: d.objeto || "Não informado",
    },
    informacoes: [
      { rotulo: "Resposta registrada", valor: dataDocumento(p.confirmado_em) },
      { rotulo: "Nome informado", valor: p.nome },
    ],
    itens: selecionados.map((i) => ({
      ...i,
      tipo:
        i.tipo === "part" || i.tipo === "material"
          ? ("part" as const)
          : ("service" as const),
      preco_unitario_centavos: i.preco_centavos,
      total: Math.round(i.quantidade * i.preco_centavos),
      cancelado: false,
    })),
    subtotal,
    desconto: subtotal - p.total_centavos,
    total: p.total_centavos,
    secoes: [
      { titulo: "Manifestação", texto: p.declaracao },
      {
        titulo: "Origem",
        texto:
          p.origem === "equipe"
            ? `Registrado pela equipe. ${p.registro_equipe || "Autorização informada à empresa."}`
            : p.origem === "portal"
              ? "Área autenticada do cliente"
              : "Link pessoal do orçamento; nome autodeclarado",
      },
      {
        titulo: "Proposta original",
        texto: `Valor: ${moedaDocumento(d.total_centavos)}. Versão: ${d.versao ?? p.versao_id}.\n${d.itens
          .filter((i) => !p.grupos.includes(i.grupo_servico || "Atendimento"))
          .map((i) => `Não autorizado: ${i.descricao} (${i.quantidade} ${i.unidade})`)
          .join("\n")}`,
      },
      ...(p.taxa_diagnostico?.valor_centavos
        ? [
            {
              titulo: "Diagnóstico",
              texto: `Taxa cobrada separadamente: ${moedaDocumento(p.taxa_diagnostico.valor_centavos)}. Abatimento nesta autorização: ${moedaDocumento(p.taxa_diagnostico.abatimento_centavos || 0)}. Este comprovante não registra recebimento.`,
            },
          ]
        : []),
      { titulo: "Condições da versão", texto: d.condicoes || d.resumo || "" },
      { titulo: "Identificação do conteúdo (SHA-256)", texto: p.hash_sha256 },
    ].filter((s) => s.texto),
    assinatura: "",
    aviso:
      "Sem valor fiscal. Não comprova pagamento nem assinatura digital certificada.",
  };
}
export const gerarComprovanteAutorizacao = (p: ComprovanteAutorizacao) =>
  gerarPdfCliente(documentoDaAutorizacao(p));
