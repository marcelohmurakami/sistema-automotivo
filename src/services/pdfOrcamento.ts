import type { Proposta } from "./orcamentos";
import { documentoDoOrcamento } from "../lib/documentoCliente";
import { gerarPdfCliente } from "./pdfCliente";
export function gerarPdf(q: Proposta, link = "") {
  return gerarPdfCliente(documentoDoOrcamento(q), link);
}
export function arquivoPdf(q: Proposta, link = "") {
  const pdf = gerarPdf(q, link);
  return new File(
    [pdf.output("blob")],
    `orcamento-${q.numero}-v${q.versao.numero_versao}.pdf`,
    { type: "application/pdf" },
  );
}
