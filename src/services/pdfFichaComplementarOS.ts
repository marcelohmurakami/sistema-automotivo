import { jsPDF } from "jspdf";
import type { OrdemServico } from "./ordensServico.ts";
import type { Identidade } from "./documentos.ts";
import { camposFichaComplementar } from "../lib/fichaComplementarOS.ts";
import { dataDocumento, telefoneDocumento } from "../lib/documentoCliente.ts";

export function gerarPdfFichaComplementarOS(o: OrdemServico, identidade: Identidade) {
  const pdf = new jsPDF({ compress: true });
  const x = 16,
    largura = 178,
    limite = 276;
  let y = 16;
  const limpar = (s: string) =>
    s.replace(/[\u2011\u2013\u2014]/g, "-").replace(/\u00a0/g, " ");
  function fonte(tamanho: number, negrito = false) {
    pdf.setFont("helvetica", negrito ? "bold" : "normal");
    pdf.setFontSize(tamanho);
    pdf.setTextColor(30);
  }
  function texto(s: string, tamanho = 10, negrito = false) {
    fonte(tamanho, negrito);
    const linhas = pdf.splitTextToSize(limpar(s), largura) as string[];
    for (const linha of linhas) {
      if (y > limite - 6) {
        pdf.addPage();
        cabecalho(true);
      }
      fonte(tamanho, negrito);
      pdf.text(linha, x, y);
      y += 5;
    }
  }
  function cabecalho(continua = false) {
    y = 17;
    texto(identidade.nome, 14, true);
    texto(
      `FICHA COMPLEMENTAR - OS Nº ${o.numero}${continua ? " - continuação" : ""}`,
      11,
      true,
    );
    pdf.setLineWidth(0.4);
    pdf.setDrawColor(90);
    pdf.line(x, y, x + largura, y);
    y += 8;
  }
  cabecalho();
  if (identidade.telefone)
    texto(`Telefone da empresa: ${telefoneDocumento(identidade.telefone)}`, 9);
  texto(`Cliente: ${o.dados_cliente?.nome || "Não informado"}`, 11, true);
  const motor = o.dados_veiculo?.motor;
  texto(
    `Veículo: ${o.dados_veiculo?.modelo || "Não informado"}${motor ? ` | Motor: ${motor}` : o.dados_veiculo?.placa ? ` | Placa: ${o.dados_veiculo.placa}` : ""}`,
  );
  texto(
    `Data do serviço: ${dataDocumento(o.data_servico || o.concluido_em || o.criado_em, false)}`,
    9,
  );
  y += 5;
  for (const grupo of camposFichaComplementar(o)) {
    if (y + 24 > limite) {
      pdf.addPage();
      cabecalho(true);
    }
    pdf.setFillColor("#ececec");
    pdf.rect(x, y - 4, largura, 8, "F");
    texto(grupo.titulo, 11, true);
    y += 3;
    for (const campo of grupo.campos) {
      if (y + 16 > limite) {
        pdf.addPage();
        cabecalho(true);
      }
      if (grupo.titulo === "Checklist de conferência") {
        texto(`${campo.valor} - ${campo.rotulo}`, 9.5);
        y += 2;
        continue;
      }
      fonte(9, true);
      const rotulo = pdf.splitTextToSize(limpar(campo.rotulo), 45) as string[];
      fonte(10);
      const valor = pdf.splitTextToSize(limpar(campo.valor), largura - 50) as string[];
      for (let linha = 0; linha < Math.max(rotulo.length, valor.length); linha++) {
        if (y > limite - 6) {
          pdf.addPage();
          cabecalho(true);
        }
        if (rotulo[linha]) {
          fonte(9, true);
          pdf.text(rotulo[linha], x, y);
        }
        if (valor[linha]) {
          fonte(10);
          pdf.text(valor[linha], x + 50, y);
        }
        y += 4.7;
      }
      y += 3;
    }
    y += 1;
  }
  const paginas = pdf.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    pdf.setPage(p);
    fonte(8);
    pdf.setLineWidth(0.2);
    pdf.line(x, 281, x + largura, 281);
    pdf.text(`Ficha complementar da OS Nº ${o.numero} - Sem valor fiscal`, x, 286);
    pdf.text(`${p} / ${paginas}`, x + largura, 286, { align: "right" });
  }
  pdf.setProperties({
    title: `Ficha complementar da OS ${o.numero}`,
    author: identidade.nome,
  });
  return pdf;
}
