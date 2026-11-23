import { documentoDaOS } from "../lib/documentoCliente";
import { gerarPdfCliente } from "./pdfCliente";
import { jsPDF } from "jspdf";
import type { Identidade } from "./documentos";
import type { OrdemServico } from "./ordensServico";
export function documentoBase(titulo: string, identidade: Identidade) {
  const pdf = new jsPDF();
  let y = 22;
  const linha = (s: string, size = 11, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    for (const l of pdf.splitTextToSize(s || "—", 170) as string[]) {
      if (y > 272) {
        pdf.addPage();
        y = 22;
      }
      pdf.text(l, 20, y);
      y += size > 15 ? 10 : 6;
    }
  };
  pdf.setFillColor(
    /^#[0-9a-f]{6}$/i.test(identidade.cor || "") ? identidade.cor! : "#244336",
  );
  pdf.rect(0, 0, 210, 9, "F");
  if (identidade.logo) {
    try {
      const props = pdf.getImageProperties(identidade.logo);
      const scale = Math.min(40 / props.width, 22 / props.height);
      pdf.addImage(identidade.logo, 20, y, props.width * scale, props.height * scale);
      y += 26;
    } catch {
      /* Documentos antigos continuam disponíveis se o logo estiver corrompido. */
    }
  }
  linha(identidade.nome, 19, true);
  linha(titulo, 13, true);
  linha(identidade.telefone || identidade.telefone_e164 || "");
  if (identidade.endereco) {
    const endereco = Object.values(identidade.endereco)
      .filter((x) => typeof x === "string" && x)
      .join(" · ");
    if (endereco) linha(endereco, 9);
  }
  y += 6;
  const finalizar = (aviso: string) => {
    if (identidade.rodape) {
      y += 5;
      linha(identidade.rodape, 10);
    }
    for (let i = 1; i <= pdf.getNumberOfPages(); i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(110);
      pdf.text(aviso, 20, 289);
      pdf.text(`${i}/${pdf.getNumberOfPages()}`, 181, 289);
    }
    return pdf;
  };
  return { pdf, linha, finalizar };
}
export { gerarPdfNotinha } from "./pdfNotinha";
export function gerarPdfOS(o: OrdemServico, identidade: Identidade) {
  return gerarPdfCliente(documentoDaOS(o, identidade));
}
