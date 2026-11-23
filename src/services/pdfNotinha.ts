import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import type { Notinha } from "./documentos";

const moeda = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(v / 100)
    .replace(/\u00a0/g, " ");
const data = (v?: string) =>
  !v
    ? "Não informado"
    : new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
      }).format(new Date(v.length === 10 ? v + "T12:00:00-03:00" : v));
export function gerarPdfNotinha(n: Notinha) {
  const pdf = new jsPDF();
  const d = n.detalhes || {},
    empresa = n.dados_oficina;
  const numero = String(n.numero).padStart(4, "0");
  let y = 16;
  const tinta = () => pdf.setTextColor(30, 38, 34);
  const fonte = (tamanho = 10, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(tamanho);
    tinta();
  };
  const novaPagina = () => {
    pdf.addPage();
    y = 17;
    fonte(9, true);
    pdf.text(
      `NOTA #${numero}${n.situacao === "cancelled" ? " - CANCELADA" : ""} | Continuação`,
      15,
      y,
    );
    y += 8;
  };
  const reservar = (altura: number) => {
    if (y + altura > 269) novaPagina();
  };
  const texto = (s: string, width = 180, size = 10, bold = false) => {
    fonte(size, bold);
    const linhas = pdf.splitTextToSize(s, width) as string[];
    for (const l of linhas) {
      reservar(size * 0.43 + 2);
      fonte(size, bold);
      pdf.text(l, 15, y);
      y += size * 0.43 + 1;
    }
  };
  const linha = () => {
    pdf.setDrawColor(195, 202, 198);
    pdf.setLineWidth(0.25);
    pdf.line(15, y, 195, y);
    y += 6;
  };
  const secao = (titulo: string) => {
    reservar(17);
    y += 2;
    fonte(10, true);
    pdf.text(titulo, 15, y);
    y += 4;
    linha();
  };
  // O QR representa somente o código fornecido na emissão; não gera cobrança.
  const pix = n.situacao !== "cancelled" && d.pix_copia_cola;
  let xNome = 15,
    larguraNome = pix ? 125 : 180;
  if (/^data:image\/(png|jpeg);base64,/.test(empresa.logo || "")) {
    try {
      const p = pdf.getImageProperties(empresa.logo!);
      const escala = Math.min(32 / p.width, 23 / p.height);
      pdf.addImage(empresa.logo!, 15, 12, p.width * escala, p.height * escala);
      xNome = 52;
      larguraNome -= 37;
    } catch {
      /* Logo antiga inválida: mantém a identificação textual. */
    }
  }
  fonte(17, true);
  const nomeLinhas = pdf.splitTextToSize(empresa.nome, larguraNome) as string[];
  for (const l of nomeLinhas) {
    pdf.text(l, xNome, y);
    y += 7;
  }
  fonte(9);
  const endereco = Object.values(empresa.endereco || {})
    .filter(Boolean)
    .join(", ");
  for (const valor of [
    empresa.documento ? `CNPJ/CPF: ${empresa.documento}` : "",
    endereco,
    empresa.telefone || empresa.telefone_e164 || "",
  ]) {
    if (!valor) continue;
    for (const l of pdf.splitTextToSize(valor, larguraNome) as string[]) {
      pdf.text(l, xNome, y);
      y += 4.5;
    }
  }
  if (pix) {
    const qr = QRCode.create(pix, { errorCorrectionLevel: "M" });
    const margem = 4,
      tamanho = 38,
      celula = tamanho / (qr.modules.size + margem * 2);
    fonte(9, true);
    pdf.text("PAGUE VIA PIX", 176, 14, { align: "center" });
    pdf.setFillColor(0, 0, 0);
    for (let r = 0; r < qr.modules.size; r++)
      for (let c = 0; c < qr.modules.size; c++)
        if (qr.modules.get(r, c))
          pdf.rect(
            157 + (c + margem) * celula,
            17 + (r + margem) * celula,
            celula,
            celula,
            "F",
          );
    y = Math.max(y, 59);
  } else y = Math.max(y, 38);
  y += 4;
  linha();
  fonte(13, true);
  pdf.text(`NOTA DE ATENDIMENTO #${numero}`, 15, y);
  fonte(9);
  pdf.text(`Emissão: ${data(n.emitido_em)}`, 195, y, { align: "right" });
  y += 9;
  if (n.situacao === "cancelled") {
    pdf.setTextColor(165, 30, 30);
    pdf.setFontSize(15);
    pdf.text("CANCELADA - NÃO UTILIZAR PARA COBRANÇA", 15, y);
    y += 10;
  }
  const par = (
    a: string,
    av: string | undefined,
    b: string,
    bv: string | undefined,
  ) => {
    fonte(9);
    const esquerda = pdf.splitTextToSize(
      `${a}: ${av || "Não informado"}`,
      87,
    ) as string[];
    const direita = pdf.splitTextToSize(
      `${b}: ${bv || "Não informado"}`,
      87,
    ) as string[];
    for (let i = 0; i < Math.max(esquerda.length, direita.length); i++) {
      reservar(6);
      fonte(9);
      if (esquerda[i]) pdf.text(esquerda[i], 15, y);
      if (direita[i]) pdf.text(direita[i], 108, y);
      y += 4.5;
    }
    y += 2;
  };
  par("Cliente", n.dados_cliente.nome, "Telefone", n.dados_cliente.telefone_e164 || "");
  if (d.empresa_cliente || d.documento_cliente)
    par("Empresa", d.empresa_cliente, "CPF/CNPJ", d.documento_cliente);
  if (n.dados_cliente.endereco) texto(`Endereço: ${n.dados_cliente.endereco}`, 180, 9);
  par(
    "Data do serviço",
    data(d.data_servico || n.emitido_em),
    "Forma combinada",
    d.forma_pagamento,
  );
  if (d.veiculo || d.motor) {
    secao("IDENTIFICAÇÃO DO SERVIÇO");
    par("Veículo / equipamento", d.veiculo, "Motor / componente", d.motor);
  }
  const cabecalho = (nome: string) => {
    reservar(25);
    fonte(10, true);
    pdf.text(nome, 15, y);
    y += 4;
    pdf.setFillColor(239, 242, 240);
    pdf.rect(15, y, 180, 8, "F");
    fonte(8, true);
    pdf.text("QTD.", 18, y + 5);
    pdf.text("DESCRIÇÃO", 36, y + 5);
    pdf.text("UNITÁRIO", 160, y + 5, { align: "right" });
    pdf.text("TOTAL", 192, y + 5, { align: "right" });
    y += 13;
  };
  for (const [tipo, titulo] of [
    ["service", "SERVIÇOS REALIZADOS"],
    ["part", "PEÇAS E MATERIAIS"],
  ]) {
    const itens = n.itens.filter((i) => i.tipo === tipo);
    if (!itens.length) continue;
    y += 3;
    cabecalho(titulo);
    for (const item of itens) {
      fonte(9);
      const linhas = pdf.splitTextToSize(item.descricao, 91) as string[];
      const altura = Math.max(8, linhas.length * 4.5 + 3);
      if (y + altura > 269) {
        novaPagina();
        cabecalho(`${titulo} (continuação)`);
      }
      fonte(9);
      pdf.text(
        new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(
          item.quantidade,
        ),
        18,
        y,
      );
      pdf.text(linhas, 36, y, { lineHeightFactor: 1.42 });
      pdf.text(moeda(item.preco_unitario_centavos), 160, y, { align: "right" });
      pdf.text(
        moeda(
          item.total_item_centavos ??
            Math.round(item.quantidade * item.preco_unitario_centavos),
        ),
        192,
        y,
        { align: "right" },
      );
      y += altura;
      pdf.setDrawColor(222);
      pdf.line(15, y - 3, 195, y - 3);
    }
  }
  reservar(33);
  y += 3;
  fonte(9);
  pdf.text(`Subtotal: ${moeda(n.subtotal_centavos)}`, 195, y, {
    align: "right",
  });
  y += 6;
  pdf.text(`Desconto: ${moeda(n.desconto_centavos)}`, 195, y, {
    align: "right",
  });
  y += 4;
  pdf.setFillColor(239, 242, 240);
  pdf.rect(15, y, 180, 15, "F");
  fonte(10, true);
  pdf.text(
    `VENCIMENTO: ${d.vencimento ? data(d.vencimento) : "Não informado"}`,
    19,
    y + 9,
  );
  fonte(14, true);
  pdf.text(`TOTAL  ${moeda(n.total_centavos)}`, 191, y + 9, { align: "right" });
  y += 24;
  if (n.observacoes?.trim()) {
    secao("OBSERVAÇÕES");
    texto(n.observacoes, 180, 9);
    y += 3;
  }
  if (empresa.rodape?.trim()) {
    texto(empresa.rodape, 180, 9);
    y += 3;
  }
  if (n.situacao !== "cancelled") {
    reservar(36);
    y += 5;
    texto(
      d.assinatura === "pendente"
        ? "Confirmo o recebimento dos serviços e peças descritos nesta nota. O pagamento permanece pendente, conforme as condições combinadas."
        : "Confirmo o recebimento e a conferência dos serviços e peças descritos nesta nota. Esta assinatura não comprova pagamento.",
      180,
      9,
    );
    y += 13;
    pdf.setDrawColor(80);
    pdf.line(58, y, 152, y);
    y += 5;
    fonte(9);
    pdf.text("Assinatura do cliente", 105, y, { align: "center" });
  }
  for (let p = 1; p <= pdf.getNumberOfPages(); p++) {
    pdf.setPage(p);
    fonte(8);
    pdf.setTextColor(105);
    pdf.text("Sem valor fiscal. Não comprova pagamento.", 15, 286);
    pdf.text(`Nota #${numero} | ${p}/${pdf.getNumberOfPages()}`, 195, 286, {
      align: "right",
    });
  }
  return pdf;
}
