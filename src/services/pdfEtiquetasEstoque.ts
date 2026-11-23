import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import type { EtiquetaEstoque } from "./logisticaEstoque";
export function barrasEtiqueta(codigo: string) {
  if (!/^PTE-\d{10}$/.test(codigo))
    throw new Error("Use a etiqueta interna do produto ou da unidade.");
  const dados: { encodings?: { data: string }[] } = {};
  JsBarcode(dados, codigo, { format: "CODE128", displayValue: false });
  return dados.encodings!.map((e) => e.data).join("");
}
export function gerarEtiquetasEstoque(
  itens: EtiquetaEstoque[],
  empresa: string,
  formato: "a4" | "termica" = "a4",
) {
  if (!itens.length || itens.length > 50)
    throw new Error("Selecione de 1 a 50 etiquetas.");
  const termica = formato === "termica",
    w = termica ? 80 : 92,
    h = 50,
    porPagina = termica ? 1 : 10;
  const pdf = new jsPDF({
    unit: "mm",
    format: termica ? [80, 50] : "a4",
    orientation: termica ? "landscape" : "portrait",
    compress: true,
  });
  const escrever = (
    txt: string,
    x: number,
    y: number,
    largura: number,
    tamanho = 9,
    negrito = false,
    linhas = 1,
  ) => {
    pdf.setFont("helvetica", negrito ? "bold" : "normal");
    pdf.setFontSize(tamanho);
    const l = pdf.splitTextToSize(txt.replace(/[\r\n\t]+/g, " "), largura) as string[];
    if (l.length > linhas) l[linhas - 1] = l[linhas - 1].slice(0, -3) + "...";
    pdf.text(l.slice(0, linhas), x, y);
  };
  itens.forEach((i, n) => {
    if (n && n % porPagina === 0) pdf.addPage();
    const k = n % porPagina,
      x = termica ? 0 : 10 + (k % 2) * 98,
      y = termica ? 0 : 12 + Math.floor(k / 2) * 54;
    if (!termica) {
      pdf.setDrawColor(190);
      pdf.roundedRect(x, y, w, h, 2, 2);
    }
    pdf.setTextColor(20);
    escrever(empresa, x + 4, y + 5, w - 8, 8, true);
    escrever(i.descricao, x + 4, y + 11, w - 30, 10, true, 2);
    escrever(i.serie ? "Série " + i.serie : "PRODUTO", x + 4, y + 21, w - 30, 8);
    if (i.imei) escrever("IMEI " + i.imei, x + 4, y + 25, w - 30, 8);
    const qr = QRCode.create(i.codigo, { errorCorrectionLevel: "M" }),
      passo = 20 / (qr.modules.size + 8);
    pdf.setFillColor("#ffffff");
    pdf.rect(x + w - 25, y + 6, 21, 21, "F");
    pdf.setFillColor("#000000");
    for (let r = 0; r < qr.modules.size; r++)
      for (let c = 0; c < qr.modules.size; c++)
        if (qr.modules.get(r, c))
          pdf.rect(
            x + w - 25 + (c + 4) * passo,
            y + 6 + (r + 4) * passo,
            passo,
            passo,
            "F",
          );
    const barras = barrasEtiqueta(i.codigo),
      unidade = (w - 12) / (barras.length + 20);
    for (let z = 0; z < barras.length; z++)
      if (barras[z] === "1")
        pdf.rect(x + 6 + (z + 10) * unidade, y + 30, unidade, 10, "F");
    escrever(i.codigo, x + 4, y + 45, w - 8, 9, true);
  });
  return pdf;
}
