import { jsPDF } from "jspdf";
import type { ContaOS } from "../lib/contasClientes";
import { totaisConta } from "../lib/contasClientes";
import type { Identidade } from "./documentos";
import {
  corDocumento,
  dataDocumento,
  logoDocumento,
  moedaDocumento,
  telefoneDocumento,
} from "../lib/documentoCliente";

export function gerarPdfContaCliente(
  ordens: ContaOS[],
  identidade: Identidade,
  consultadoEm: string,
  hoje: string,
) {
  if (
    !ordens.length ||
    ordens.some(
      (o) => o.chave_cliente !== ordens[0].chave_cliente || o.aberto_centavos <= 0,
    ) ||
    new Set(ordens.map((o) => o.id)).size !== ordens.length
  )
    throw new Error("Selecione as OS em aberto de um único cliente.");
  const pdf = new jsPDF({ compress: true });
  const esquerda = 16,
    direita = 194,
    limite = 274,
    largura = direita - esquerda;
  const cor = corDocumento(identidade.cor),
    cliente = ordens[0];
  let y = 23;
  let osEmCurso: number | null = null;
  const limpar = (v: string) =>
    v.replace(/[\u2011\u2013\u2014]/g, "-").replace(/\u00a0/g, " ");
  function fonte(tamanho = 10, bold = false) {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(tamanho);
    pdf.setTextColor(35, 45, 43);
  }
  function novaPagina() {
    pdf.addPage();
    pdf.setFillColor(cor);
    pdf.rect(esquerda, 12, largura, 1.2, "F");
    fonte(9, true);
    pdf.text("CONTA DO CLIENTE", esquerda, 21);
    fonte(8);
    pdf.text(pdf.splitTextToSize(limpar(cliente.cliente), 90)[0], direita, 21, {
      align: "right",
    });
    y = 33;
    if (osEmCurso !== null) {
      fonte(10, true);
      pdf.text(`OS #${osEmCurso} - continuação`, esquerda, y);
      y += 8;
    }
  }
  function reservar(h: number) {
    if (y + h > limite) novaPagina();
  }
  function texto(s: string, tamanho = 10, bold = false, x = esquerda, w = largura) {
    fonte(tamanho, bold);
    const linhas = pdf.splitTextToSize(limpar(s), w) as string[];
    for (const linha of linhas) {
      reservar(6);
      fonte(tamanho, bold);
      pdf.text(linha, x, y);
      y += 5;
    }
  }
  pdf.setProperties({
    title: `Conta de ${cliente.cliente}`,
    author: identidade.nome,
    subject: "Saldo em aberto das ordens de serviço selecionadas",
  });
  pdf.setFillColor(cor);
  pdf.rect(esquerda, 12, largura, 1.5, "F");
  const logo = logoDocumento(identidade.logo);
  let marcaX = esquerda;
  if (logo) {
    try {
      const p = pdf.getImageProperties(logo),
        s = Math.min(26 / p.width, 23 / p.height);
      pdf.addImage(logo, esquerda, 20, p.width * s, p.height * s);
      marcaX += 33;
    } catch {
      /* Identidade textual preservada. */
    }
  }
  texto(identidade.nome, 15, true, marcaX, direita - marcaX);
  y += 2;
  texto(
    [
      identidade.documento,
      telefoneDocumento(identidade.telefone || identidade.telefone_e164),
    ]
      .filter(Boolean)
      .join(" | "),
    9,
    false,
    marcaX,
    direita - marcaX,
  );
  const endereco = Object.values(identidade.endereco || {})
    .filter(Boolean)
    .join(", ");
  if (endereco) texto(endereco, 9, false, marcaX, direita - marcaX);
  y = Math.max(54, y + 10);
  texto("CONTA DO CLIENTE", 19, true);
  y += 6;
  texto(cliente.cliente, 13, true);
  if (cliente.telefone) texto(telefoneDocumento(cliente.telefone), 10);
  y += 3;
  texto(
    `Posição em ${dataDocumento(consultadoEm)} | ${ordens.length} OS selecionada(s)`,
    9,
  );
  y += 7;
  const totais = totaisConta(ordens);
  reservar(27);
  pdf.setFillColor(239, 244, 241);
  pdf.roundedRect(esquerda, y - 3, largura, 24, 2, 2, "F");
  fonte(9);
  pdf.text("SALDO A PAGAR", esquerda + 5, y + 4);
  fonte(19, true);
  pdf.text(moedaDocumento(totais.aberto), esquerda + 5, y + 14);
  fonte(9);
  pdf.text(`Vencido: ${moedaDocumento(totais.vencido)}`, direita - 5, y + 5, {
    align: "right",
  });
  pdf.text(
    `A vencer / hoje: ${moedaDocumento(totais.aberto - totais.vencido)}`,
    direita - 5,
    y + 13,
    { align: "right" },
  );
  y += 33;
  for (const o of ordens) {
    reservar(51);
    osEmCurso = o.numero;
    fonte(11, true);
    pdf.text(`OS #${o.numero}`, esquerda, y);
    fonte(9);
    pdf.text(`Data do serviço: ${dataDocumento(o.data, false)}`, direita, y, {
      align: "right",
    });
    y += 7;
    texto(
      [o.veiculo, o.placa].filter(Boolean).join(" | ") ||
        "Bem / serviço sem identificação",
      10,
      true,
    );
    if (o.servicos) texto(o.servicos, 9);
    y += 3;
    reservar(18);
    fonte(9);
    pdf.text(`Valor: ${moedaDocumento(o.total_centavos)}`, esquerda, y);
    pdf.text(`Recebido: ${moedaDocumento(o.pago_centavos)}`, 85, y);
    fonte(10, true);
    pdf.text(`Saldo: ${moedaDocumento(o.aberto_centavos)}`, direita, y, {
      align: "right",
    });
    y += 8;
    for (const t of o.titulos.filter((t) => t.aberto_centavos > 0)) {
      reservar(13);
      const rotulo = o.titulos.length > 1 ? `${t.descricao} - ` : "";
      texto(
        `${rotulo}Vencimento: ${dataDocumento(t.vencimento, false)} (${t.vencimento < hoje ? "vencido" : t.vencimento === hoje ? "vence hoje" : "a vencer"})`,
        8,
        false,
        esquerda,
        130,
      );
      fonte(9);
      pdf.text(moedaDocumento(t.aberto_centavos), direita, y - 5, {
        align: "right",
      });
      y += 2;
    }
    pdf.setDrawColor(221, 229, 224);
    pdf.line(esquerda, y, direita, y);
    y += 10;
    osEmCurso = null;
  }
  reservar(40);
  fonte(10);
  pdf.text("Valor das OS selecionadas", esquerda, y);
  pdf.text(moedaDocumento(totais.total), direita, y, { align: "right" });
  y += 7;
  pdf.text("Recebimentos já descontados", esquerda, y);
  pdf.text(moedaDocumento(totais.pago), direita, y, { align: "right" });
  y += 9;
  fonte(13, true);
  pdf.text("TOTAL A PAGAR", esquerda, y);
  pdf.text(moedaDocumento(totais.aberto), direita, y, { align: "right" });
  y += 12;
  texto(
    "Este extrato inclui somente as OS selecionadas. Valores sujeitos a pagamentos registrados após a emissão. Não é recibo de quitação nem documento fiscal.",
    8,
  );
  const paginas = pdf.getNumberOfPages();
  for (let n = 1; n <= paginas; n++) {
    pdf.setPage(n);
    fonte(8);
    pdf.setTextColor(100, 112, 104);
    pdf.text(
      `Conta do cliente | Emitida em ${dataDocumento(consultadoEm)}`,
      esquerda,
      286,
    );
    pdf.text(`${n} / ${paginas}`, direita, 286, { align: "right" });
  }
  return pdf;
}
