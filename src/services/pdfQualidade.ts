import { gerarPdfCliente } from "./pdfCliente.ts";
import { dataDocumento, type DocumentoCliente } from "../lib/documentoCliente.ts";
import {
  camposQualidade,
  etapasQualidade,
  titulosQualidade,
  textoAvisoRetirada,
  type AcompanhamentoQualidade,
} from "../lib/qualidadeAvancada.ts";
import { dinheiro } from "../lib/formatacao.ts";
export function documentoAcompanhamento(a: AcompanhamentoQualidade): DocumentoCliente {
  return {
    somenteRegistro: true,
    tipo: "os",
    titulo: titulosQualidade[a.tipo],
    numero: String(a.numero || a.documento.numero || ""),
    arquivo: `${a.tipo}-${a.id}.pdf`,
    identidade: { nome: a.documento.empresa },
    situacao: etapasQualidade[a.tipo][a.situacao],
    destaque: false,
    cliente: a.cliente || a.documento.cliente,
    veiculo: a.objeto || a.documento.objeto,
    placa: "",
    bem: {
      rotulo: "Identificação do atendimento",
      valor: a.objeto || a.documento.objeto,
    },
    informacoes: [
      { rotulo: "Registro", valor: dataDocumento(a.criado_em) },
      { rotulo: "Última atualização", valor: dataDocumento(a.atualizado_em) },
      { rotulo: "Versão do acompanhamento", valor: String(a.revisao) },
    ],
    itens: [],
    subtotal: 0,
    desconto: 0,
    total: 0,
    secoes: [
      ...camposQualidade[a.tipo]
        .filter((c) => String(a.dados[c.id] ?? "").trim())
        .map((c) => ({
          titulo: c.nome,
          texto:
            c.tipo === "dinheiro"
              ? dinheiro(Number(a.dados[c.id]))
              : String(a.dados[c.id]),
        })),
      {
        titulo: "Identificação do documento de origem (SHA-256)",
        texto: a.hash_documento,
      },
    ],
    assinatura: "",
    aviso:
      a.tipo === "assinatura"
        ? "Documento preparado. Aguarda integração com um provedor; não comprova assinatura eletrônica."
        : a.tipo === "custodia"
          ? "Registro de guarda e contatos. Não autoriza descarte, venda ou transferência de propriedade."
          : "Registro de acompanhamento. Valores informativos: não comprova nem registra pagamento.",
  };
}
export const gerarPdfQualidade = (a: AcompanhamentoQualidade) => {
  const documento = documentoAcompanhamento(a);
  gerarPdfCliente(documento).save(documento.arquivo);
};
export function gerarAvisoRetirada(a: AcompanhamentoQualidade) {
  const d = documentoAcompanhamento(a);
  d.titulo = "Aviso de retirada";
  d.arquivo = `aviso-retirada-${a.id}.pdf`;
  d.secoes = [{ titulo: "Comunicado ao cliente", texto: textoAvisoRetirada(a) }];
  d.aviso = "A emissão deste aviso não comprova o envio ou recebimento pelo cliente.";
  gerarPdfCliente(d).save(d.arquivo);
}
