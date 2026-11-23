import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { enderecoEtiqueta } from "../lib/localizacaoFisica.ts";
export type EtiquetaFisica = {
  codigo: string;
  descricao: string;
  complemento?: string;
};
/** QR vetorial com margem branca de quatro módulos; sem dados do cliente no link. */
export function gerarPdfEtiquetas(
  itens: EtiquetaFisica[],
  empresa: string,
  origem: string,
  formato: "a4" | "termica" = "a4",
) {
  if (!itens.length || itens.length > 50)
    throw new Error("Selecione de 1 a 50 etiquetas.");
  const termica = formato === "termica";
  const pdf = new jsPDF({
    unit: "mm",
    format: termica ? [80, 50] : "a4",
    orientation: termica ? "landscape" : "portrait",
    compress: true,
  });
  const cols = termica ? 1 : 2,
    porPagina = termica ? 1 : 10,
    largura = termica ? 80 : 92,
    altura = termica ? 50 : 51;
  function texto(
    s: string,
    x: number,
    y: number,
    w: number,
    n: number,
    size: number,
    bold = false,
  ) {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(25);
    const ls = pdf.splitTextToSize(
      s.replace(/[\r\n]+/g, " ").replace(/[\u2011\u2013\u2014]/g, "-"),
      w,
    ) as string[];
    const linhas = ls.slice(0, n);
    if (ls.length > n) linhas[n - 1] = linhas[n - 1].slice(0, -3) + "...";
    pdf.text(linhas, x, y);
  }
  itens.forEach((i, pos) => {
    if (pos && pos % porPagina === 0) pdf.addPage();
    const indice = pos % porPagina,
      x = termica ? 0 : 10 + (indice % cols) * (largura + 6),
      y = termica ? 0 : 13 + Math.floor(indice / cols) * (altura + 3);
    if (!termica) {
      pdf.setDrawColor(180);
      pdf.setLineWidth(0.15);
      pdf.roundedRect(x, y, largura, altura, 2, 2);
    }
    texto(empresa, x + 4, y + 6, largura - 8, 1, 8, true);
    const qr = QRCode.create(enderecoEtiqueta(i.codigo, origem), {
        errorCorrectionLevel: "M",
      }),
      tamanho = 29,
      passo = tamanho / (qr.modules.size + 8);
    pdf.setFillColor("#ffffff");
    pdf.rect(x + 2, y + 10, tamanho, tamanho, "F");
    pdf.setFillColor("#000000");
    for (let r = 0; r < qr.modules.size; r++)
      for (let c = 0; c < qr.modules.size; c++)
        if (qr.modules.get(r, c))
          pdf.rect(
            x + 2 + (c + 4) * passo,
            y + 10 + (r + 4) * passo,
            passo,
            passo,
            "F",
          );
    texto(i.descricao, x + 33, y + 15, largura - 37, 3, 10, true);
    texto(
      i.complemento || (i.codigo.startsWith("PTL-") ? "LOCAL" : "ITEM"),
      x + 33,
      y + 32,
      largura - 37,
      2,
      8,
    );
    texto(i.codigo, x + 4, y + 44, largura - 8, 1, 9, true);
    if (!termica && pos % porPagina === 0)
      texto(
        "Imprimir em tamanho real (100%). Recortar nas bordas.",
        10,
        290,
        190,
        1,
        8,
      );
  });
  return pdf;
}
